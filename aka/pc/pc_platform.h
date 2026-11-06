/*
  pc_platform.h — Colle entre la couche « core » (graphics/input/audio) et SDL2.
  La version PC compile le MEME moteur, la MEME vue et la MEME coquille que la console ;
  seuls core/graphics, core/input, core/audio, tasks et app_main sont remplaces par le dossier pc.
*/
#pragma once
#include <cstdint>

void pc_set_data_dir(const char* dir);        // dossier du jeu : config.dat, captures, sprites/
const char* pc_data_dir();

// Fournis par pc_main.cpp
void pc_present(const uint16_t* fb);          // envoie le framebuffer a la fenetre
void pc_apply_zoom(int zoom);                 // 1, 2, 3 ou 4 (= plein ecran)
void pc_request_quit();
bool pc_quit_requested();

namespace core {
void pc_input_feed(const bool* held);         // etat des touches (indexe par Button)
}
// pc_audio.cpp
void pc_audio_open();
void pc_audio_close();

// pc_net.cpp : reglages de la liaison reseau (aussi lus dans net.txt du dossier du jeu)
void pc_net_set_serial(const char* port);     // COM5, /dev/ttyACM0
void pc_net_set_peer(const char* ip);         // invite Wi-Fi : IP de l'hote (vide = recherche automatique)
void pc_net_set_port(int port);
