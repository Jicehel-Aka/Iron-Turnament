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
