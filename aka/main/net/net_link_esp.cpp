/*
  net_link_esp.cpp — Liaison reseau de la console AKA : Wi-Fi (ESP32-S3) et USB Serial/JTAG.

  WI-FI
    - sans fichier de reglage : l'HOTE cree un point d'acces « IRON-TOURNAMENT » (WPA2, mot de passe
      « irontournament », 192.168.4.1) ; l'INVITE s'y connecte. Un PC rejoint ce reseau Wi-Fi puis lance
      « Invite Wi-Fi » (decouverte automatique de l'hote par diffusion).
    - avec /sdcard/IRONTOURNAMENT/wifi.txt (lignes `ssid=...` et `pass=...`) : les deux roles se connectent a CE
      reseau (box, point d'acces du PC...) ; la decouverte par diffusion fait le reste.
  USB
    - le port USB natif de l'ESP32-S3 (USB Serial/JTAG) apparait cote PC comme un port serie. Le flux est
      encadre (SLIP + CRC) ; les journaux ESP_LOG sont coupes pendant la partie pour ne pas polluer le flux.

  NON VERIFIE SUR MATERIEL a la livraison : ce fichier est compile par l'integration continue (ESP-IDF 5.4)
  mais n'a pas encore tourne sur une console reelle.
*/
#include "net_link.h"
#include "net_udp.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "driver/usb_serial_jtag.h"
#include "nvs_flash.h"
#include <cstdio>
#include <cstring>

using fight::net::ByteStream;
using fight::net::Transport;

namespace {

constexpr const char* kApSsid = "IRON-TOURNAMENT";
constexpr const char* kApPass = "irontournament";
constexpr const char* kWifiFile = "/sdcard/IRONTOURNAMENT/wifi.txt";

// --- USB Serial/JTAG --------------------------------------------------------------------------------
class UsbStream : public ByteStream {
public:
    bool open() {
        if (!installed_) {
            usb_serial_jtag_driver_config_t cfg = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
            cfg.rx_buffer_size = 1024; cfg.tx_buffer_size = 1024;
            if (usb_serial_jtag_driver_install(&cfg) != ESP_OK) return false;
            installed_ = true;
        }
        uint8_t junk[64];
        while (usb_serial_jtag_read_bytes(junk, sizeof junk, 0) > 0) {}    // purge
        return true;
    }
    int read(uint8_t* buf, size_t max) override { const int n = usb_serial_jtag_read_bytes(buf, (uint32_t)max, 0); return n > 0 ? n : 0; }
    int write(const uint8_t* d, size_t n) override { const int w = usb_serial_jtag_write_bytes(d, n, 0); return w > 0 ? w : 0; }
private:
    bool installed_ = false;
};

UsbStream                   s_usb;
fight::net::SlipTransport*  s_slip = nullptr;
netlink::UdpTransport*      s_udp = nullptr;
esp_netif_t*                s_netif = nullptr;
bool                        s_wifi_on = false;
char                        s_detail[48] = "";

// --- Wi-Fi ---------------------------------------------------------------------------------------------
bool read_wifi_file(char* ssid, size_t sn, char* pass, size_t pn) {
    FILE* f = std::fopen(kWifiFile, "r");
    if (!f) return false;
    char line[100]; bool got = false;
    ssid[0] = pass[0] = 0;
    while (std::fgets(line, sizeof line, f)) {
        char* nl = std::strpbrk(line, "\r\n"); if (nl) *nl = 0;
        if (!std::strncmp(line, "ssid=", 5)) { std::snprintf(ssid, sn, "%s", line + 5); got = true; }
        else if (!std::strncmp(line, "pass=", 5)) std::snprintf(pass, pn, "%s", line + 5);
    }
    std::fclose(f);
    return got && ssid[0];
}

bool wifi_start(bool host, char* err, size_t errn) {
    // nvs_flash est deja initialise par la coquille (reglages) ; ces appels tolerent « deja fait ».
    esp_err_t e = nvs_flash_init();
    if (e == ESP_ERR_NVS_NO_FREE_PAGES || e == ESP_ERR_NVS_NEW_VERSION_FOUND) { nvs_flash_erase(); nvs_flash_init(); }
    esp_netif_init();
    esp_event_loop_create_default();

    char ssid[33], pass[65];
    const bool custom = read_wifi_file(ssid, sizeof ssid, pass, sizeof pass);
    const bool as_ap = host && !custom;

    s_netif = as_ap ? esp_netif_create_default_wifi_ap() : esp_netif_create_default_wifi_sta();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    if (esp_wifi_init(&init) != ESP_OK) { std::snprintf(err, errn, "esp_wifi_init failed (not enough memory?)"); return false; }
    esp_wifi_set_storage(WIFI_STORAGE_RAM);

    wifi_config_t cfg; std::memset(&cfg, 0, sizeof cfg);
    if (as_ap) {
        std::snprintf((char*)cfg.ap.ssid, sizeof cfg.ap.ssid, "%s", kApSsid);
        std::snprintf((char*)cfg.ap.password, sizeof cfg.ap.password, "%s", kApPass);
        cfg.ap.ssid_len = (uint8_t)std::strlen(kApSsid);
        cfg.ap.channel = 6; cfg.ap.max_connection = 2; cfg.ap.authmode = WIFI_AUTH_WPA2_PSK;
        esp_wifi_set_mode(WIFI_MODE_AP);
        esp_wifi_set_config(WIFI_IF_AP, &cfg);
        std::snprintf(s_detail, sizeof s_detail, "Wi-Fi %s", kApSsid);
    } else {
        const char* use_ssid = custom ? ssid : kApSsid;
        const char* use_pass = custom ? pass : kApPass;
        std::snprintf((char*)cfg.sta.ssid, sizeof cfg.sta.ssid, "%s", use_ssid);
        std::snprintf((char*)cfg.sta.password, sizeof cfg.sta.password, "%s", use_pass);
        cfg.sta.threshold.authmode = use_pass[0] ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;
        esp_wifi_set_mode(WIFI_MODE_STA);
        esp_wifi_set_config(WIFI_IF_STA, &cfg);
        std::snprintf(s_detail, sizeof s_detail, "Wi-Fi %s", use_ssid);
    }
    if (esp_wifi_start() != ESP_OK) { std::snprintf(err, errn, "esp_wifi_start failed"); return false; }
    if (!as_ap) esp_wifi_connect();      // la liaison se fait en tache de fond ; les « HELLO » de l'invite reessaient
    s_wifi_on = true;
    return true;
}

void wifi_stop() {
    if (!s_wifi_on) return;
    esp_wifi_stop();
    esp_wifi_deinit();
    if (s_netif) { esp_netif_destroy_default_wifi(s_netif); s_netif = nullptr; }
    s_wifi_on = false;
}

} // namespace

namespace netlink {

Transport* open(Kind kind, bool host, char* err, size_t errn) {
    close();
    if (kind == LINK_USB) {
        if (!s_usb.open()) { std::snprintf(err, errn, "USB Serial/JTAG driver unavailable"); return nullptr; }
        esp_log_level_set("*", ESP_LOG_NONE);              // les journaux partagent ce port : on les coupe
        s_slip = new fight::net::SlipTransport(s_usb);
        std::snprintf(s_detail, sizeof s_detail, "USB");
        return s_slip;
    }
    if (!wifi_start(host, err, errn)) { wifi_stop(); return nullptr; }
    s_udp = new UdpTransport();
    if (!s_udp->open(host, nullptr, fight::net::DEFAULT_PORT, err, errn)) {
        delete s_udp; s_udp = nullptr; wifi_stop(); return nullptr;
    }
    return s_udp;
}

void close() {
    delete s_slip; s_slip = nullptr;
    delete s_udp;  s_udp = nullptr;
    wifi_stop();
    esp_log_level_set("*", ESP_LOG_INFO);
    s_detail[0] = 0;
}

const char* detail() { return s_detail; }

} // namespace netlink
