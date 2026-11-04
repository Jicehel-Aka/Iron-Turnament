/*
  ui.h — Primitives d'interface communes (Iron Tournament)
  Tout ce que les quatre jeux partagent : palette, bandeaux, menus, curseur.
*/
#pragma once
#include <cstdint>

namespace ui {

constexpr int SCR_W = 320, SCR_H = 240;
constexpr int TOP_H = 18, BOT_H = 14;
constexpr int MID_Y = TOP_H;
constexpr int MID_H = SCR_H - TOP_H - BOT_H;   // 208

extern uint16_t C_BG, C_BAR, C_TEXT, C_DIM, C_ACCENT;
extern uint16_t C_BOARD, C_BOARD_ALT, C_GRID;
extern uint16_t C_P1, C_P2, C_P1_DARK, C_P2_DARK;
extern uint16_t C_CURSOR, C_TARGET, C_LAST, C_MENU_BG, C_MENU_SEL;

void init_palette();

void top_bar(const char* left, const char* right, bool thinking, uint32_t now);
void bottom_bar(const char* msg, bool in_menu);

struct Menu {
    const char* title;
    const char* items[10];
    int count;
};
void draw_menu(const Menu& m, int sel);

// Un jeton rond avec liseré : c'est la piece de TOUS les jeux de la collection.
void disc(int cx, int cy, int r, uint16_t fill, uint16_t rim);

// Visionneuse de texte paginee (regles, commandes).
void text_page(const char* title, const char* (*line)(int), int n_lines,
               int scroll, int per_page);

} // namespace ui
