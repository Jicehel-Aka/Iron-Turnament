/*
  net_udp.cpp — cf. net_udp.h. Sockets BSD : identiques sur Linux, Windows (winsock) et ESP-IDF (lwIP).
*/
#include "net_udp.h"
#include <cstdio>
#include <cstring>

#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  typedef int socklen_compat;
  #define NET_CLOSE(s) closesocket((SOCKET)(s))
  #define NET_ERRNO WSAGetLastError()
  #define NET_WOULDBLOCK WSAEWOULDBLOCK
#else
  #include <arpa/inet.h>
  #include <errno.h>
  #include <fcntl.h>
  #include <netinet/in.h>
  #include <sys/socket.h>
  #include <unistd.h>
  typedef socklen_t socklen_compat;
  #define NET_CLOSE(s) ::close((int)(s))
  #define NET_ERRNO errno
  #define NET_WOULDBLOCK EWOULDBLOCK
#endif

namespace netlink {

static void say(char* err, size_t n, const char* m) { if (err && n) std::snprintf(err, n, "%s", m); }

bool UdpTransport::open(bool host, const char* peer_ip, uint16_t port, char* err, size_t errn) {
    close();
    host_ = host; peer_known_ = false; peer_txt_[0] = 0;
#ifdef _WIN32
    static bool wsa_ok = false;
    if (!wsa_ok) { WSADATA w; if (WSAStartup(MAKEWORD(2, 2), &w) != 0) { say(err, errn, "WSAStartup failed"); return false; } wsa_ok = true; }
#endif
    const int s = (int)::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (s < 0) { say(err, errn, "socket() failed"); return false; }
    fd_ = s;

    int one = 1;
    setsockopt(s, SOL_SOCKET, SO_BROADCAST, (const char*)&one, sizeof one);
    if (host) setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char*)&one, sizeof one);

#ifdef _WIN32
    u_long nb = 1; ioctlsocket((SOCKET)s, FIONBIO, &nb);
#else
    fcntl(s, F_SETFL, fcntl(s, F_GETFL, 0) | O_NONBLOCK);
#endif

    sockaddr_in a; std::memset(&a, 0, sizeof a);
    a.sin_family = AF_INET;
    a.sin_addr.s_addr = htonl(INADDR_ANY);
    a.sin_port = host ? htons(port) : 0;
    if (::bind(s, (sockaddr*)&a, sizeof a) != 0) {
        say(err, errn, host ? "bind() failed (port already in use?)" : "bind() failed");
        close();
        return false;
    }

    peer_port_ = htons(port);
    if (!host) {
        if (peer_ip && peer_ip[0]) {
            in_addr ia;
            if (inet_pton(AF_INET, peer_ip, &ia) != 1) { say(err, errn, "invalid IP address"); close(); return false; }
            peer_ip_ = ia.s_addr;
            std::snprintf(peer_txt_, sizeof peer_txt_, "%s", peer_ip);
        } else {
            peer_ip_ = htonl(INADDR_BROADCAST);
            std::snprintf(peer_txt_, sizeof peer_txt_, "LAN");
        }
        peer_known_ = true;           // cible d'appel ; remplacee par l'adresse reelle de l'hote a sa premiere reponse
    }
    return true;
}

void UdpTransport::close() {
    if (fd_ != -1) { NET_CLOSE(fd_); fd_ = -1; }
    peer_known_ = false;
}

bool UdpTransport::send(const uint8_t* data, size_t n) {
    if (fd_ == -1 || !peer_known_) return false;
    sockaddr_in a; std::memset(&a, 0, sizeof a);
    a.sin_family = AF_INET; a.sin_addr.s_addr = peer_ip_; a.sin_port = peer_port_;
    return ::sendto((int)fd_, (const char*)data, (int)n, 0, (sockaddr*)&a, sizeof a) == (int)n;
}

int UdpTransport::recv(uint8_t* buf, size_t max) {
    if (fd_ == -1) return 0;
    for (int guard = 0; guard < 16; ++guard) {
        sockaddr_in from; socklen_compat fl = sizeof from;
        const int n = (int)::recvfrom((int)fd_, (char*)buf, (int)max, 0, (sockaddr*)&from, &fl);
        if (n < 0) {
            const int e = NET_ERRNO;
            if (e == NET_WOULDBLOCK) return 0;
#ifdef _WIN32
            if (e == WSAECONNRESET) continue;           // ICMP « port inaccessible » d'un envoi precedent : sans gravite
#endif
            return 0;
        }
        if (n < 3 || buf[0] != 0x49 || buf[1] != 0x54) continue;     // pas un paquet du jeu (magic « IT »)

        if (!host_ && peer_ip_ == htonl(INADDR_BROADCAST)) {
            // L'invite apprend l'adresse reelle de l'hote.
            peer_ip_ = from.sin_addr.s_addr; peer_port_ = from.sin_port;
            char t[24]; inet_ntop(AF_INET, &from.sin_addr, t, sizeof t);
            std::snprintf(peer_txt_, sizeof peer_txt_, "%s", t);
        } else if (host_ && !peer_known_) {
            // L'hote se verrouille sur le premier appel recu.
            peer_ip_ = from.sin_addr.s_addr; peer_port_ = from.sin_port; peer_known_ = true;
            char t[24]; inet_ntop(AF_INET, &from.sin_addr, t, sizeof t);
            std::snprintf(peer_txt_, sizeof peer_txt_, "%s", t);
        } else if (from.sin_addr.s_addr != peer_ip_ || from.sin_port != peer_port_) {
            continue;                                    // paquet d'un tiers : ignore
        }
        return n;
    }
    return 0;
}

} // namespace netlink
