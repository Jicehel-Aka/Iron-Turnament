/*
  fight_view.h — Rendu d'un match (décor, combattants, projectiles, HUD) et choix du
  personnage. Dépend de core/graphics.h : à NE PAS inclure dans les tests PC.
*/
#pragma once
#include <cstdint>
#include "fight.h"

namespace fight {

// Portrait 64x64 BGR565 d'un combattant (embarqué en flash).
const uint16_t* portrait(FighterId id);

// Dessine tout le match dans le framebuffer (le HUD inclus).
void draw_match(const Match& m, uint32_t now_ms);

// Écran de sélection : combattant `sel` en grand, les six en bandeau.
void draw_select(FighterId sel, uint32_t now_ms, const char* title);

// Fiche d'un combattant : barres de stats (puissance, défense, portée, récupération...).
void draw_fighter_card(FighterId id, int x, int y);

// Convertit les événements sonores du moteur en sons (core/audio.h).
void play_sfx(uint16_t sfx_bits);

} // namespace fight
