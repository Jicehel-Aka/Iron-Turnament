/*
===============================================================================
  graphics.h — Couche graphique AKA Chess (wrap gb_graphics)
===============================================================================
*/
#pragma once
#include <cstdint>


namespace core {

// Cet enum s'appelait « Color ». Chaque jeu de la collection definit SA propre
// couleur de camp (noir/blanc, rouge/jaune, Nord/Sud...), et un `using namespace`
// faisait systematiquement collision. Ca m'a coute trois erreurs de compilation
// dans trois fichiers differents avant que je comprenne que le probleme n'etait
// pas les collisions, mais le NOM : trop generique pour un type de la couche
// graphique. D'ou « Tint ».
enum class Tint {
    Black,
    White,
    Yellow,
    Red,
    Green,
    DarkGreen,   // ← ajouté : 2e teinte d'herbe (au lieu de réutiliser DarkGray, qui donnait un gris pur, pas une nuance de vert)
    DarkGray,
    Gray,
    SkyBlue,
    DarkBlue,
    Orange,
    Brown,
    LightGray,
    Cyan,
};

void graphics_init();
void graphics_present();   // transfère le framebuffer à l'écran

void graphics_clear(Tint color);

void graphics_fill_rect(int x, int y, int w, int h, Tint color);
void graphics_draw_rect(int x, int y, int w, int h, Tint color);
void graphics_draw_line(int x0, int y0, int x1, int y1, Tint color);
void graphics_fill_circle(int cx, int cy, int r, Tint color);
void graphics_draw_circle(int cx, int cy, int r, Tint color);
void graphics_fill_triangle(int x0, int y0, int x1, int y1, int x2, int y2, Tint color);


void graphics_draw_text(int x, int y, const char* text, Tint color = Tint::White);
void graphics_draw_text_center(int y, const char* text, Tint color = Tint::White);

// Pile de translation simple (utilisée pour les petits effets de vibration caméra)
void graphics_push();
void graphics_translate(int dx, int dy);
void graphics_pop();


// Bitmap RGB565 brut (sprites importés, cf. core/kart_loader.h). Le pixel de
// valeur transparent_key (magenta 0xF81F par défaut) n'est pas dessiné.
constexpr uint16_t TRANSPARENT_KEY = 0xF81F;
void graphics_draw_bitmap565(int x, int y, int w, int h, const uint16_t* data,
                              bool use_transparency = true,
                              uint16_t transparent_key = TRANSPARENT_KEY);

// Variante avec mise à l'échelle (nearest-neighbor, suffisant en pixel-art).
// (x,y) = coin haut-gauche de la zone DE DESTINATION (déjà à l'échelle).
// dst_w/dst_h = taille voulue à l'écran ; src_w/src_h = taille réelle des
// données sources (data). Utilisée pour les karts adverses, dont la taille
// à l'écran varie avec la distance (perspective).
void graphics_draw_bitmap565_scaled(int x, int y, int dst_w, int dst_h,
                                     const uint16_t* data, int src_w, int src_h,
                                     bool use_transparency = true,
                                     uint16_t transparent_key = TRANSPARENT_KEY);

// Dessin direct d'un pixel RGB565 hardware (sans safe_coord ni translation) —
// utilisé uniquement pour le rendu du fond défilant (draw_sky) dont les
// coordonnées sont toujours dans les limites de l'écran.
void graphics_draw_pixel_raw(int x, int y, uint16_t color);

// Dessin d'une bande horizontale RGB565 hardware (sans translation ni écrêtage).
// Utilisé par le rendu du fond défilant (draw_sky) — plus rapide que fillRect
// car évite la conversion de couleur (données déjà en format hardware).
void graphics_hline_raw(int x, int y, int w, uint16_t color);

// -----------------------------------------------------------------------------
// Variantes « brutes » : couleur BGR565 directe, au lieu de l'enum Tint.
// L'enum suffit pour un jeu de karts (une poignée de teintes fixes) ; il ne
// suffit pas ici : l'échiquier a ses propres tons, et le rendu 3D calcule une
// couleur ombrée DIFFÉRENTE POUR CHAQUE TRIANGLE. Passer par un enum
// obligerait à pré-déclarer des centaines de teintes.
// -----------------------------------------------------------------------------
uint16_t graphics_make_color(int r, int g, int b);   // -> BGR565

void graphics_fill_rect_raw(int x, int y, int w, int h, uint16_t color);
void graphics_draw_rect_raw(int x, int y, int w, int h, uint16_t color);
void graphics_fill_triangle_raw(int x0, int y0, int x1, int y1, int x2, int y2,
                                 uint16_t color);
void graphics_fill_circle_raw(int cx, int cy, int r, uint16_t color);
void graphics_draw_line_raw(int x0, int y0, int x1, int y1, uint16_t color);
void graphics_draw_text_raw(int x, int y, const char* text, uint16_t color);
void graphics_draw_text_center_raw(int y, const char* text, uint16_t color);

// Largeur en pixels d'un texte UTF-8 (un 'é' pese 2 octets mais 1 colonne).
int graphics_text_width(const char* text);

// Dessine l'écran-titre (image BGR565 brute 320x240 embarquée en flash).
void graphics_draw_fullscreen565(const uint16_t* data);

int graphics_width();
int graphics_height();

// Zoom de la fenetre (version PC/SDL uniquement). Sur la AKA : supported() = faux, le reste ne fait rien.
// zoom : 1, 2, 3, ou 4 = plein ecran.
bool graphics_zoom_supported();
int  graphics_get_zoom();
void graphics_set_zoom(int zoom);

// Capture l'écran courant (ce qui a déjà été dessiné dans le framebuffer, AVANT
// graphics_present()) et l'enregistre en BMP 24 bits sur la carte SD, dans
// /sdcard/IRONTOURNAMENT/, sous le nom capture_NNNN.bmp auto-incrémenté.
// Retourne true si l'écriture a réussi ; out_path (si non nul) reçoit le
// chemin complet du fichier écrit (utile pour l'affichage d'un message).
bool graphics_save_screenshot_bmp(char* out_path = nullptr, int out_path_size = 0);

// Accès interne utilisé par sprites.cpp pour dessiner avec les coordonnées
// déjà décalées par la pile de translation.
void graphics_get_translate(int* dx, int* dy);

} // namespace core
