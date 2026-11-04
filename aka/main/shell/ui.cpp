#include "ui.h"
#include <stdio.h>
#include "i18n.h"
#include "../core/graphics.h"

namespace ui {

uint16_t C_BG, C_BAR, C_TEXT, C_DIM, C_ACCENT;
uint16_t C_BOARD, C_BOARD_ALT, C_GRID;
uint16_t C_P1, C_P2, C_P1_DARK, C_P2_DARK;
uint16_t C_CURSOR, C_TARGET, C_LAST, C_MENU_BG, C_MENU_SEL;

using namespace core;

void init_palette() {
    C_BG        = graphics_make_color( 24,  26,  34);
    C_BAR       = graphics_make_color( 42,  46,  62);
    C_TEXT      = graphics_make_color(238, 238, 232);
    C_DIM       = graphics_make_color(146, 150, 166);
    C_ACCENT    = graphics_make_color(240, 176,  64);

    C_BOARD     = graphics_make_color( 62, 130,  86);   // le vert du feutre
    C_BOARD_ALT = graphics_make_color( 54, 116,  76);
    C_GRID      = graphics_make_color( 34,  76,  52);

    // Les deux camps. Contraste MESURE, pas devine : le blanc et le noir doivent
    // se detacher du plateau ET l'un de l'autre.
    C_P1        = graphics_make_color( 30,  30,  36);   // « noir »
    C_P1_DARK   = graphics_make_color( 10,  10,  14);
    C_P2        = graphics_make_color(240, 238, 230);   // « blanc »
    C_P2_DARK   = graphics_make_color(176, 172, 160);

    C_CURSOR    = graphics_make_color(250, 226,  80);
    C_TARGET    = graphics_make_color( 90, 170, 230);
    C_LAST      = graphics_make_color(226, 118,  70);
    C_MENU_BG   = graphics_make_color( 32,  36,  50);
    C_MENU_SEL  = graphics_make_color( 66,  72, 100);
}

void top_bar(const char* left, const char* right, bool thinking, uint32_t now) {
    graphics_fill_rect_raw(0, 0, SCR_W, TOP_H, C_BAR);
    if (left)  graphics_draw_text_raw(4, 5, left, C_TEXT);

    if (thinking) {
        // Trois points qui defilent : le seul moyen de dire « je calcule, je n'ai
        // pas plante » sur une console sans indicateur d'activite.
        char b[24];
        const int n = (int)((now / 300) % 4);
        char dots[5] = "    ";
        for (int i = 0; i < n; ++i) dots[i] = '.';
        snprintf(b, sizeof b, "%s%s", i18n::T(i18n::STR_THINKING), dots);
        graphics_draw_text_raw(SCR_W - graphics_text_width(b) - 4, 5, b, C_ACCENT);
    } else if (right) {
        graphics_draw_text_raw(SCR_W - graphics_text_width(right) - 4, 5, right, C_DIM);
    }
}

void bottom_bar(const char* msg, bool in_menu) {
    graphics_fill_rect_raw(0, SCR_H - BOT_H, SCR_W, BOT_H, C_BAR);

    // Dans un MENU, les boutons ne font pas la meme chose. Afficher l'aide du jeu
    // pendant qu'on navigue serait trompeur.
    const char* t = in_menu ? i18n::T(i18n::STR_HELP_MENU)
                            : (msg && msg[0] ? msg : i18n::T(i18n::STR_HELP_GAME));
    graphics_draw_text_center_raw(SCR_H - BOT_H + 3, t,
                                  (msg && msg[0] && !in_menu) ? C_ACCENT : C_DIM);
}

void draw_menu(const Menu& m, int sel) {
    // Largeur CALCULEE : cinq langues, aucune chaine ne doit deborder.
    int wmax = graphics_text_width(m.title);
    for (int i = 0; i < m.count; ++i) {
        const int w = graphics_text_width(m.items[i]);
        if (w > wmax) wmax = w;
    }
    int w = wmax + 34;
    if (w > SCR_W - 12) w = SCR_W - 12;
    if (w < 170)        w = 170;

    const int h = 30 + m.count * 18;
    const int x = (SCR_W - w) / 2;
    const int y = (SCR_H - h) / 2;

    graphics_fill_rect_raw(x, y, w, h, C_MENU_BG);
    graphics_draw_rect_raw(x, y, w, h, C_ACCENT);
    graphics_draw_text_center_raw(y + 7, m.title, C_ACCENT);

    for (int i = 0; i < m.count; ++i) {
        const int iy = y + 26 + i * 18;
        if (i == sel) graphics_fill_rect_raw(x + 5, iy - 3, w - 10, 16, C_MENU_SEL);
        graphics_draw_text_raw(x + 13, iy, m.items[i], (i == sel) ? C_TEXT : C_DIM);
    }
}

void disc(int cx, int cy, int r, uint16_t fill, uint16_t rim) {
    graphics_fill_circle_raw(cx, cy, r, rim);
    graphics_fill_circle_raw(cx, cy, r - 1, fill);
}

void text_page(const char* title, const char* (*line)(int), int n_lines,
               int scroll, int per_page) {
    graphics_fill_rect_raw(0, 0, SCR_W, SCR_H, C_BG);
    graphics_fill_rect_raw(0, 0, SCR_W, TOP_H, C_BAR);
    graphics_draw_text_center_raw(5, title, C_ACCENT);

    for (int i = 0; i < per_page; ++i) {
        const int k = scroll + i;
        if (k >= n_lines) break;
        graphics_draw_text_raw(6, TOP_H + 6 + i * 10, line(k), C_TEXT);
    }

    graphics_fill_rect_raw(0, SCR_H - BOT_H, SCR_W, BOT_H, C_BAR);
    if (scroll + per_page < n_lines)
        graphics_draw_text_center_raw(SCR_H - BOT_H + 3, i18n::T(i18n::STR_MORE), C_ACCENT);
    else
        graphics_draw_text_center_raw(SCR_H - BOT_H + 3, i18n::T(i18n::STR_HELP_MENU), C_DIM);
}

} // namespace ui
