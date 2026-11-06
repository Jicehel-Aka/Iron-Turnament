/*
  net_udp.h — Transport UDP IPv4 (PC Linux/Windows et console : sockets BSD de lwIP).

  Decouverte : l'invite sans adresse explicite DIFFUSE son appel (255.255.255.255:port) ; l'hote repond
  en direct a l'expediteur, et chacun ne parle plus ensuite qu'a l'autre. Aucune configuration d'adresse.
*/
#pragma once
#include "../games/fight/netplay.h"

namespace netlink {

class UdpTransport : public fight::net::Transport {
public:
    ~UdpTransport() override { close(); }
    // host : ecoute sur `port`. invite : appelle `peer_ip` ; nullptr ou "" = diffusion sur le reseau local.
    bool open(bool host, const char* peer_ip, uint16_t port, char* err, size_t errn);
    void close();
    bool send(const uint8_t* data, size_t n) override;
    int  recv(uint8_t* buf, size_t max) override;
    bool alive() override { return fd_ != -1; }
    const char* peer_text() const { return peer_txt_; }
    bool peer_known() const { return peer_known_; }
private:
    intptr_t fd_ = -1;
    bool     host_ = false, peer_known_ = false;
    uint32_t peer_ip_ = 0;             // ordre reseau
    uint16_t peer_port_ = 0;           // ordre reseau
    char     peer_txt_[24] = "";
};

} // namespace netlink
