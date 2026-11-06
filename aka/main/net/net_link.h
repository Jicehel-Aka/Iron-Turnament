/*
===============================================================================
  net_link.h — Ouverture de la liaison reseau (cable USB ou Wi-Fi), selon la plateforme
-------------------------------------------------------------------------------
  Interface unique ; deux implementations :
    - console AKA : main/net/net_link_esp.cpp (Wi-Fi ESP32-S3 + USB Serial/JTAG) ;
    - PC          : pc/pc_net.cpp             (UDP sur le reseau local + port serie).
  La couche UDP (net_udp.*) est commune aux deux.
===============================================================================
*/
#pragma once
#include "../games/fight/netplay.h"
#include <cstddef>
#include <cstdint>

namespace netlink {

enum Kind : uint8_t { LINK_USB = 0, LINK_WIFI = 1 };

// Ouvre la liaison. Renvoie nullptr si impossible (message technique, en anglais, dans `err`).
// La liaison reste ouverte jusqu'a close().
fight::net::Transport* open(Kind kind, bool host, char* err, size_t errn);
void close();

// Detail affichable pendant l'attente : adresse ou port (ex. « 192.168.4.1 », « /dev/ttyACM0 »).
const char* detail();

} // namespace netlink
