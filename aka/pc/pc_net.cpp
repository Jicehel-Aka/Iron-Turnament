/*
  pc_net.cpp — Liaison reseau de la version PC : UDP sur le reseau local (Wi-Fi ou Ethernet) et port serie
  (cable USB vers la console AKA, qui apparait comme un port COM / ttyACM).

  Reglages : options de la ligne de commande (--serial PORT, --peer IP, --port N) ou fichier `net.txt`
  dans le dossier du jeu (une ligne `cle=valeur`, `#` = commentaire) :
      serial=COM5            (Windows)   ou   serial=/dev/ttyACM0   (Linux, valeur par defaut)
      peer=192.168.4.1       (invite Wi-Fi : adresse de l'hote ; vide = recherche automatique sur le reseau)
      port=7777
*/
#include "../main/net/net_link.h"
#include "../main/net/net_udp.h"
#include "pc_platform.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#ifdef _WIN32
  #include <windows.h>
#else
  #include <errno.h>
  #include <fcntl.h>
  #include <sys/ioctl.h>
  #include <termios.h>
  #include <unistd.h>
#endif

using fight::net::ByteStream;
using fight::net::Transport;

static std::string g_serial, g_peer;
static int g_port = fight::net::DEFAULT_PORT;
static bool g_cfg_read = false;

void pc_net_set_serial(const char* p) { g_serial = p ? p : ""; }
void pc_net_set_peer(const char* p)   { g_peer = p ? p : ""; }
void pc_net_set_port(int p)           { if (p > 0 && p < 65536) g_port = p; }

static void read_cfg() {
    if (g_cfg_read) return;
    g_cfg_read = true;
    const std::string path = std::string(pc_data_dir()) + "/net.txt";
    FILE* f = std::fopen(path.c_str(), "r");
    if (!f) return;
    char line[160];
    while (std::fgets(line, sizeof line, f)) {
        char* nl = std::strpbrk(line, "\r\n"); if (nl) *nl = 0;
        if (line[0] == '#' || !line[0]) continue;
        char* eq = std::strchr(line, '='); if (!eq) continue;
        *eq = 0; const char* k = line; const char* v = eq + 1;
        if (!std::strcmp(k, "serial") && g_serial.empty()) g_serial = v;
        else if (!std::strcmp(k, "peer") && g_peer.empty()) g_peer = v;
        else if (!std::strcmp(k, "port")) pc_net_set_port(std::atoi(v));
    }
    std::fclose(f);
}

// --- port serie ----------------------------------------------------------------------------------------
class SerialPort : public ByteStream {
public:
    ~SerialPort() override { close(); }
    bool open(const std::string& name, char* err, size_t errn);
    void close();
    int read(uint8_t* buf, size_t max) override;
    int write(const uint8_t* d, size_t n) override;
    bool alive() override { return ok_; }
private:
    bool ok_ = false;
#ifdef _WIN32
    HANDLE h_ = INVALID_HANDLE_VALUE;
#else
    int fd_ = -1;
#endif
};

#ifdef _WIN32
bool SerialPort::open(const std::string& name, char* err, size_t errn) {
    const std::string full = (name.rfind("\\\\.\\", 0) == 0) ? name : "\\\\.\\" + name;
    h_ = CreateFileA(full.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
    if (h_ == INVALID_HANDLE_VALUE) { std::snprintf(err, errn, "cannot open %s", name.c_str()); return false; }
    DCB dcb; std::memset(&dcb, 0, sizeof dcb); dcb.DCBlength = sizeof dcb;
    GetCommState(h_, &dcb);
    dcb.BaudRate = CBR_115200; dcb.ByteSize = 8; dcb.Parity = NOPARITY; dcb.StopBits = ONESTOPBIT;
    dcb.fBinary = TRUE; dcb.fParity = FALSE; dcb.fOutxCtsFlow = FALSE; dcb.fOutxDsrFlow = FALSE;
    dcb.fDtrControl = DTR_CONTROL_DISABLE;      // DTR/RTS : eviter tout reset de la carte a l'ouverture
    dcb.fRtsControl = RTS_CONTROL_DISABLE;
    dcb.fOutX = FALSE; dcb.fInX = FALSE;
    SetCommState(h_, &dcb);
    COMMTIMEOUTS to; std::memset(&to, 0, sizeof to);
    to.ReadIntervalTimeout = MAXDWORD;          // lecture immediate (non bloquante)
    to.WriteTotalTimeoutConstant = 20;
    SetCommTimeouts(h_, &to);
    EscapeCommFunction(h_, CLRDTR); EscapeCommFunction(h_, CLRRTS);
    PurgeComm(h_, PURGE_RXCLEAR | PURGE_TXCLEAR);
    ok_ = true;
    return true;
}
void SerialPort::close() { if (h_ != INVALID_HANDLE_VALUE) { CloseHandle(h_); h_ = INVALID_HANDLE_VALUE; } ok_ = false; }
int SerialPort::read(uint8_t* buf, size_t max) {
    if (!ok_) return 0;
    DWORD got = 0;
    if (!ReadFile(h_, buf, (DWORD)max, &got, nullptr)) { ok_ = false; return 0; }
    return (int)got;
}
int SerialPort::write(const uint8_t* d, size_t n) {
    if (!ok_) return 0;
    DWORD w = 0;
    if (!WriteFile(h_, d, (DWORD)n, &w, nullptr)) { ok_ = false; return 0; }
    return (int)w;
}
#else
bool SerialPort::open(const std::string& name, char* err, size_t errn) {
    fd_ = ::open(name.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
    if (fd_ < 0) { std::snprintf(err, errn, "cannot open %s", name.c_str()); return false; }
    termios t; if (tcgetattr(fd_, &t) != 0) { std::snprintf(err, errn, "%s is not a serial port", name.c_str()); close(); return false; }
    cfmakeraw(&t);
    cfsetispeed(&t, B115200); cfsetospeed(&t, B115200);
    t.c_cflag |= (CLOCAL | CREAD); t.c_cflag &= ~(CRTSCTS | HUPCL);
    t.c_cc[VMIN] = 0; t.c_cc[VTIME] = 0;
    tcsetattr(fd_, TCSANOW, &t);
    int bits = TIOCM_DTR | TIOCM_RTS; ioctl(fd_, TIOCMBIC, &bits);   // pas de reset de la carte
    tcflush(fd_, TCIOFLUSH);
    ok_ = true;
    return true;
}
void SerialPort::close() { if (fd_ >= 0) { ::close(fd_); fd_ = -1; } ok_ = false; }
int SerialPort::read(uint8_t* buf, size_t max) {
    if (!ok_) return 0;
    const ssize_t n = ::read(fd_, buf, max);
    if (n < 0) { if (errno != EAGAIN && errno != EWOULDBLOCK) ok_ = false; return 0; }
    return (int)n;
}
int SerialPort::write(const uint8_t* d, size_t n) {
    if (!ok_) return 0;
    const ssize_t w = ::write(fd_, d, n);
    if (w < 0) { if (errno != EAGAIN && errno != EWOULDBLOCK) ok_ = false; return 0; }
    return (int)w;
}
#endif

// --- liaison -------------------------------------------------------------------------------------------
namespace {
netlink::UdpTransport*        s_udp = nullptr;
SerialPort*                   s_port = nullptr;
fight::net::SlipTransport*    s_slip = nullptr;
char                          s_detail[64] = "";
}

namespace netlink {

Transport* open(Kind kind, bool host, char* err, size_t errn) {
    close();
    read_cfg();
    if (kind == LINK_WIFI) {
        s_udp = new UdpTransport();
        if (!s_udp->open(host, g_peer.c_str(), (uint16_t)g_port, err, errn)) { delete s_udp; s_udp = nullptr; return nullptr; }
        std::snprintf(s_detail, sizeof s_detail, "UDP %d%s%s", g_port, g_peer.empty() ? "" : " > ", g_peer.c_str());
        return s_udp;
    }
#ifdef _WIN32
    const std::string port = g_serial;
    if (port.empty()) { std::snprintf(err, errn, "set serial=COMx in net.txt or use --serial"); return nullptr; }
#else
    const std::string port = g_serial.empty() ? "/dev/ttyACM0" : g_serial;
#endif
    s_port = new SerialPort();
    if (!s_port->open(port, err, errn)) { delete s_port; s_port = nullptr; return nullptr; }
    s_slip = new fight::net::SlipTransport(*s_port);
    std::snprintf(s_detail, sizeof s_detail, "%s", port.c_str());
    return s_slip;
}

void close() {
    delete s_slip; s_slip = nullptr;
    delete s_port; s_port = nullptr;
    delete s_udp;  s_udp = nullptr;
    s_detail[0] = 0;
}

const char* detail() {
    if (s_udp && s_udp->peer_known() && s_udp->peer_text()[0]) {
        static char buf[96];
        std::snprintf(buf, sizeof buf, "UDP %d - %s", g_port, s_udp->peer_text());
        return buf;
    }
    return s_detail;
}

} // namespace netlink
