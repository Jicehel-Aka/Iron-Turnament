/*
  fight_sprites.h — Planches de sprites des combattants (fichiers .spr, cf. tools/gen_sprites.py)

  Les sprites vivent sur la carte SD (/sdcard/IRONTOURNAMENT/sprites/<NOM>.spr, ~0,7 a 0,85 Mo
  chacun) et sont charges en PSRAM au debut de chaque combat : seuls les DEUX combattants
  concernes occupent la memoire (~1,5 Mo). Si un fichier manque, la vue retombe sur le
  dessin vectoriel : le jeu reste jouable.
*/
#pragma once
#include <cstdint>
#include "fight.h"

namespace fight { namespace spr {

constexpr int COLS = 6;
constexpr int ROWS = 23;
constexpr int PIVOT_X = 60, PIVOT_Y = 98;      // pied du combattant dans la cellule 128x112

// Lignes de la planche (meme ordre que le prototype web).
enum Row : uint8_t {
    R_IDLE, R_WALK_FWD, R_WALK_BACK, R_JUMP, R_JUMP_ATTACK, R_CROUCH, R_BLOCK_HIGH, R_BLOCK_LOW,
    R_EVADE_HIGH, R_EVADE_MID, R_EVADE_LOW, R_LIGHT, R_HEAVY, R_LOW_KICK, R_UPPERCUT,
    R_SPECIAL_1, R_SPECIAL_2, R_SPECIAL_3, R_HITSTUN, R_HITSTUN_GUT, R_KNOCKDOWN, R_DEFEAT, R_VICTORY
};

struct Frame {
    uint16_t w, h;             // taille du cadre recadre (0 : image vide)
    int16_t  ox, oy;           // coin haut-gauche, relatif au pivot (pied)
    const uint16_t* px;        // BGR565, cle de transparence 0xF81F
};

// Dossier des .spr (defaut : /sdcard/IRONTOURNAMENT/sprites ; la version PC passe le sien).
void set_dir(const char* dir);

// Charge (ou conserve) les sprites de ces deux combattants ; libere les autres.
// Renvoie vrai si LES DEUX sont disponibles.
bool load_pair(FighterId a, FighterId b);
bool ready(FighterId id);
bool frame(FighterId id, int row, int col, Frame& out);
void release_all();

}} // namespace fight::spr
