/*
===============================================================================
  graphics.cpp — Implementation graphique AKA Chess (basee sur gb_graphics)
  Reprise telle quelle de la couche AKArt, deja eprouvee sur la console :
  init, present, bitmap565 (avec cle magenta), texte, et capture BMP sur SD.
-------------------------------------------------------------------------------
  IMPORTANT : gb_graphics attend des coordonnées int16_t (short). Le moteur
  de rendu pseudo-3D peut, dans certains cas (virage cumulé, division par une
  distance proche de 0...), produire des coordonnées qui dépassent largement
  cette plage. Sans protection, ces valeurs "wrap" en nombres aberrants au
  niveau du driver LCD bas niveau, qui se met alors à boucler indéfiniment
  (vu en pratique : "Loop scanline 0 timeout" puis crash du task watchdog).
  TOUTES les primitives ci-dessous écrêtent donc systématiquement leurs
  coordonnées à une plage large mais sûre avant d'appeler gb_graphics.
===============================================================================
*/
#include "graphics.h"
#include "font_accents.h"
#include "gb_graphics.h"
#include "gb_common.h"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <sys/stat.h>

extern char font8x8_basic[128][8];

namespace core {

static gb_graphics g_gfx;

// Pile de translation (petite, suffit pour l'effet de vibration caméra)
static constexpr int kMaxTranslateStack = 8;
static int s_tx_stack[kMaxTranslateStack];
static int s_ty_stack[kMaxTranslateStack];
static int s_tx = 0, s_ty = 0, s_stack_top = 0;

// Plage de sécurité : largement suffisante pour tout dessin (même très
// hors-écran), mais bien à l'intérieur des limites d'un int16_t (±32767).
static constexpr int kSafeCoordLimit = 4000;

static inline int16_t safe_coord(int v) {
    if (v > kSafeCoordLimit) v = kSafeCoordLimit;
    if (v < -kSafeCoordLimit) v = -kSafeCoordLimit;
    return (int16_t)v;
}

static inline int16_t safe_size(int v) {
    if (v < 0) v = 0;
    if (v > kSafeCoordLimit) v = kSafeCoordLimit;
    return (int16_t)v;
}

static inline uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
    return g_gfx.makeColor(r, g, b);
}

static uint16_t color_to_rgb565(Tint c) {
    switch (c) {
        case Tint::Black:     return rgb(0, 0, 0);
        case Tint::White:     return rgb(255, 255, 255);
        case Tint::Yellow:    return rgb(255, 220, 0);
        case Tint::Red:       return rgb(220, 30, 30);
        case Tint::Green:     return rgb(40, 180, 70);
        case Tint::DarkGreen: return rgb(20, 120, 45);
        case Tint::DarkGray:  return rgb(60, 60, 65);
        case Tint::Gray:      return rgb(130, 130, 135);
        case Tint::SkyBlue:   return rgb(110, 180, 230);
        case Tint::DarkBlue:  return rgb(20, 30, 70);
        case Tint::Orange:    return rgb(230, 130, 30);
        case Tint::Brown:     return rgb(110, 70, 40);
        case Tint::LightGray: return rgb(190, 190, 195);
        case Tint::Cyan:      return rgb(0, 220, 230);
    }
    return rgb(255, 0, 255);
}

void graphics_init() {
    g_gfx.set_backlight_percent(80);
    g_gfx.set_refresh_rate(60);
}

void graphics_present() { g_gfx.update(); }

void graphics_clear(Tint color) { g_gfx.clear(color_to_rgb565(color)); }

void graphics_fill_rect(int x, int y, int w, int h, Tint color) {
    g_gfx.setColor(color_to_rgb565(color));
    g_gfx.fillRect(safe_coord(x + s_tx), safe_coord(y + s_ty), safe_size(w), safe_size(h));
}

void graphics_draw_rect(int x, int y, int w, int h, Tint color) {
    g_gfx.setColor(color_to_rgb565(color));
    g_gfx.drawRect(safe_coord(x + s_tx), safe_coord(y + s_ty), safe_size(w), safe_size(h));
}

void graphics_draw_line(int x0, int y0, int x1, int y1, Tint color) {
    g_gfx.setColor(color_to_rgb565(color));
    g_gfx.drawLine(safe_coord(x0 + s_tx), safe_coord(y0 + s_ty),
                    safe_coord(x1 + s_tx), safe_coord(y1 + s_ty));
}

void graphics_fill_circle(int cx, int cy, int r, Tint color) {
    g_gfx.setColor(color_to_rgb565(color));
    g_gfx.fillCircle(safe_coord(cx + s_tx), safe_coord(cy + s_ty), safe_size(r));
}

void graphics_draw_circle(int cx, int cy, int r, Tint color) {
    g_gfx.setColor(color_to_rgb565(color));
    g_gfx.drawCircle(safe_coord(cx + s_tx), safe_coord(cy + s_ty), safe_size(r));
}

void graphics_fill_triangle(int x0, int y0, int x1, int y1, int x2, int y2, Tint color) {
    g_gfx.setColor(color_to_rgb565(color));
    g_gfx.fillTriangle(safe_coord(x0 + s_tx), safe_coord(y0 + s_ty),
                        safe_coord(x1 + s_tx), safe_coord(y1 + s_ty),
                        safe_coord(x2 + s_tx), safe_coord(y2 + s_ty));
}

void graphics_draw_text(int x, int y, const char* text, Tint color) {
    uint16_t col = color_to_rgb565(color);

    // Hors-champ large : on évite de boucler sur du texte totalement
    // invisible (protection légère, le vrai risque est dans les formes
    // dérivées de la perspective, pas le texte, mais coûte rien d'être sûr).
    if (x < -kSafeCoordLimit || x > kSafeCoordLimit ||
        y < -kSafeCoordLimit || y > kSafeCoordLimit) return;

    int px = x + s_tx;
    int py = y + s_ty;
    while (*text) {
        unsigned char c = (unsigned char)*text++;
        if (c >= 128) c = '?';
        const uint8_t* glyph = (const uint8_t*)font8x8_basic[c];
        for (int gy = 0; gy < 8; ++gy) {
            uint8_t row = glyph[gy];
            for (int gx = 0; gx < 8; ++gx)
                if (row & (1 << gx))
                    g_gfx.drawPixel(safe_coord(px + gx), safe_coord(py + gy), col);
        }
        px += 8;
    }
}

void graphics_draw_text_center(int y, const char* text, Tint color) {
    int len = 0;
    for (const char* p = text; *p; ++p) len++;
    graphics_draw_text((graphics_width() - len * 8) / 2, y, text, color);
}

void graphics_push() {
    if (s_stack_top < kMaxTranslateStack) {
        s_tx_stack[s_stack_top] = s_tx;
        s_ty_stack[s_stack_top] = s_ty;
        s_stack_top++;
    }
}

void graphics_translate(int dx, int dy) {
    s_tx += dx;
    s_ty += dy;
}

void graphics_pop() {
    if (s_stack_top > 0) {
        s_stack_top--;
        s_tx = s_tx_stack[s_stack_top];
        s_ty = s_ty_stack[s_stack_top];
    }
}

// Pas de zoom sur la console : l'ecran fait toujours 320x240.
bool graphics_zoom_supported() { return false; }
int  graphics_get_zoom()       { return 1; }
void graphics_set_zoom(int)    {}

void graphics_get_translate(int* dx, int* dy) {
    *dx = s_tx;
    *dy = s_ty;
}

void graphics_draw_bitmap565(int x, int y, int w, int h, const uint16_t* data,
                              bool use_transparency, uint16_t transparent_key) {
    // w/h viennent toujours de constantes connues (sprites 32x32, titre
    // 320x240) : pas besoin de les écrêter. x/y peuvent en théorie dériver
    // d'un calcul de jeu ; on ignore l'appel s'ils sont absurdes.
    if (x < -kSafeCoordLimit || x > kSafeCoordLimit ||
        y < -kSafeCoordLimit || y > kSafeCoordLimit) return;

    int px = x + s_tx;
    int py = y + s_ty;

    // Écrêtage réel aux limites visibles de l'écran. safe_coord() protège
    // uniquement contre le débordement int16_t (crash "Loop scanline 0
    // timeout"), mais une coordonnée hors-écran (ex: x=350 avec un écran de
    // 320px) reste "sûre" pour safe_coord tout en étant transmise telle
    // quelle à g_gfx.drawPixel — si ce dernier ne fait pas lui-même de test
    // de limites strict, l'écriture peut retomber sur une autre ligne du
    // framebuffer (adresse = y*largeur+x non bornée), ce qui se manifeste
    // par un morceau de sprite qui "réapparaît" de l'autre côté de l'écran
    // pile quand il sort par la droite ou le bas. On ne laisse donc plus
    // rien sortir de [0, largeur) x [0, hauteur) avant l'appel bas niveau.
    const int screen_w = graphics_width();
    const int screen_h = graphics_height();

    for (int row = 0; row < h; ++row) {
        int py_row = py + row;
        if (py_row < 0 || py_row >= screen_h) continue;
        const uint16_t* line = data + row * w;
        for (int col = 0; col < w; ++col) {
            int px_col = px + col;
            if (px_col < 0 || px_col >= screen_w) continue;
            uint16_t v = line[col];
            if (use_transparency && v == transparent_key) continue;
            g_gfx.drawPixel(safe_coord(px_col), safe_coord(py_row), v);
        }
    }
}

void graphics_draw_bitmap565_scaled(int x, int y, int dst_w, int dst_h,
                                     const uint16_t* data, int src_w, int src_h,
                                     bool use_transparency, uint16_t transparent_key) {
    if (dst_w <= 0 || dst_h <= 0) return;
    if (x < -kSafeCoordLimit || x > kSafeCoordLimit ||
        y < -kSafeCoordLimit || y > kSafeCoordLimit) return;

    // Garde-fou : une taille de destination démesurée pourrait, via
    // safe_coord, finir par dessiner un nombre de pixels absurde (boucle
    // très longue). On la borne large mais raisonnablement.
    if (dst_w > 2000) dst_w = 2000;
    if (dst_h > 2000) dst_h = 2000;

    int px = x + s_tx;
    int py = y + s_ty;

    // Même correctif que graphics_draw_bitmap565 ci-dessus : écrêtage réel
    // aux limites d'écran, pas seulement anti-crash. C'est cette fonction
    // qui dessine les décors (arbres, panneaux...) via draw_decor_side —
    // c'est donc ELLE qui était responsable du morceau de sprite qui
    // réapparaissait de l'autre côté de l'écran en sortie de champ.
    const int screen_w = graphics_width();
    const int screen_h = graphics_height();

    // PERF : (col*src_w)/dst_w calculait une division PAR PIXEL (jusqu'à
    // des dizaines de milliers par frame rien que pour le décor : chaque
    // arbre/panneau/portique visible, chaque frame). Remplacé par un pas en
    // virgule fixe (16.16) précalculé une seule fois par appel : la
    // division par pixel devient une simple addition + décalage. Même
    // principe pour l'axe vertical (une division au lieu de dst_h).
    const int32_t step_x_fp = (int32_t)(((int64_t)src_w << 16) / dst_w);
    const int32_t step_y_fp = (int32_t)(((int64_t)src_h << 16) / dst_h);

    int32_t src_row_fp = 0;
    for (int row = 0; row < dst_h; ++row) {
        int py_row = py + row;
        if (py_row >= 0 && py_row < screen_h) {
            int src_row = src_row_fp >> 16;
            if (src_row >= src_h) src_row = src_h - 1;
            const uint16_t* line = data + src_row * src_w;

            int32_t src_col_fp = 0;
            for (int col = 0; col < dst_w; ++col) {
                int px_col = px + col;
                if (px_col >= 0 && px_col < screen_w) {
                    int src_col = src_col_fp >> 16;
                    if (src_col >= src_w) src_col = src_w - 1;

                    uint16_t v = line[src_col];
                    if (!use_transparency || v != transparent_key) {
                        g_gfx.drawPixel(safe_coord(px_col), safe_coord(py_row), v);
                    }
                }
                src_col_fp += step_x_fp;
            }
        }
        src_row_fp += step_y_fp;
    }
}

void graphics_draw_pixel_raw(int x, int y, uint16_t color) {
    g_gfx.drawPixel((int16_t)x, (int16_t)y, color);
}

void graphics_hline_raw(int x, int y, int w, uint16_t color) {
    if (w <= 0) return;
    g_gfx.setColor(color);
    g_gfx.fillRect((int16_t)x, (int16_t)y, (int16_t)w, 2);
}

// =============================================================================
//  Texte UTF-8
// -----------------------------------------------------------------------------
//  font8x8_basic ne contient que l'ASCII : 128 glyphes, pas un accent. On ne la
//  touche pas — on ajoute une table complementaire (font_accents.h, generee par
//  tools/gen_font.py) et on decode l'UTF-8 pour y piocher.
//
//  Interet : les sources restent lisibles. On ecrit "Débutant" dans le code, pas
//  "D\xC3\xA9butant".
// =============================================================================
static uint16_t utf8_next(const char*& p) {
    const uint8_t c = (uint8_t)*p++;
    if (c < 0x80) return c;                       // ASCII

    if ((c & 0xE0) == 0xC0 && (*p & 0xC0) == 0x80) {          // 2 octets
        const uint16_t cp = (uint16_t)(((c & 0x1F) << 6) | (*p & 0x3F));
        p++;
        return cp;
    }
    if ((c & 0xF0) == 0xE0) {                                  // 3 octets : on saute
        if ((p[0] & 0xC0) == 0x80) p++;
        if ((p[0] & 0xC0) == 0x80) p++;
        return '?';
    }
    return '?';                                                // octet invalide
}

// Nombre de CARACTERES (pas d'octets) : indispensable pour centrer un texte.
// strlen() compterait 2 octets pour un 'é' et decalerait tout.
static int utf8_len(const char* p) {
    int n = 0;
    while (*p) { utf8_next(p); n++; }
    return n;
}

static const uint8_t* glyph_of(uint16_t cp) {
    if (cp < 128) return (const uint8_t*)font8x8_basic[cp];
    const uint8_t* g = font_accent_lookup(cp);
    return g ? g : (const uint8_t*)font8x8_basic[(int)'?'];
}

// =============================================================================
//  Variantes « brutes » : couleur BGR565 directe.
// -----------------------------------------------------------------------------
//  Le rendu 3D calcule une teinte ombrée différente pour CHAQUE triangle
//  (plusieurs milliers par image) : impossible de passer par l'enum Tint, qui
//  ne connaît qu'une douzaine de couleurs fixes. Ces fonctions court-circuitent
//  donc la conversion et attaquent gb_graphics directement.
// =============================================================================
uint16_t graphics_make_color(int r, int g, int b) {
    r = std::clamp(r, 0, 255);
    g = std::clamp(g, 0, 255);
    b = std::clamp(b, 0, 255);
    return g_gfx.makeColor((uint8_t)r, (uint8_t)g, (uint8_t)b);
}

void graphics_fill_rect_raw(int x, int y, int w, int h, uint16_t color) {
    g_gfx.setColor(color);
    g_gfx.fillRect(safe_coord(x + s_tx), safe_coord(y + s_ty), safe_size(w), safe_size(h));
}

void graphics_draw_rect_raw(int x, int y, int w, int h, uint16_t color) {
    g_gfx.setColor(color);
    g_gfx.drawRect(safe_coord(x + s_tx), safe_coord(y + s_ty), safe_size(w), safe_size(h));
}

void graphics_fill_triangle_raw(int x0, int y0, int x1, int y1, int x2, int y2,
                                 uint16_t color) {
    g_gfx.setColor(color);
    g_gfx.fillTriangle(safe_coord(x0 + s_tx), safe_coord(y0 + s_ty),
                        safe_coord(x1 + s_tx), safe_coord(y1 + s_ty),
                        safe_coord(x2 + s_tx), safe_coord(y2 + s_ty));
}

void graphics_fill_circle_raw(int cx, int cy, int r, uint16_t color) {
    g_gfx.setColor(color);
    g_gfx.fillCircle(safe_coord(cx + s_tx), safe_coord(cy + s_ty), safe_size(r));
}

void graphics_draw_line_raw(int x0, int y0, int x1, int y1, uint16_t color) {
    g_gfx.setColor(color);
    g_gfx.drawLine(safe_coord(x0 + s_tx), safe_coord(y0 + s_ty),
                    safe_coord(x1 + s_tx), safe_coord(y1 + s_ty));
}

void graphics_draw_text_raw(int x, int y, const char* text, uint16_t color) {
    if (!text) return;
    if (x < -kSafeCoordLimit || x > kSafeCoordLimit ||
        y < -kSafeCoordLimit || y > kSafeCoordLimit) return;

    int px = x + s_tx;
    const int py = y + s_ty;

    while (*text) {
        const uint16_t cp = utf8_next(text);

        // DECOUPAGE. Sans lui, un texte trop long ne « repart pas a la ligne » : il
        // continue de dessiner hors ecran, et safe_coord() ramene tous les pixels
        // sur la colonne 319 — ca empile une bouillie verticale au bord droit.
        // On s'arrete net des que le glyphe sort du cadre.
        if (px >= SCREEN_WIDTH) break;
        if (px + 8 <= 0) { px += 8; continue; }

        const uint8_t* glyph = glyph_of(cp);
        for (int gy = 0; gy < 8; ++gy) {
            const uint8_t row = glyph[gy];
            for (int gx = 0; gx < 8; ++gx) {
                const int X = px + gx;
                if (X < 0 || X >= SCREEN_WIDTH) continue;
                if (row & (1 << gx))
                    g_gfx.drawPixel(safe_coord(X), safe_coord(py + gy), color);
            }
        }
        px += 8;
    }
}

void graphics_draw_text_center_raw(int y, const char* text, uint16_t color) {
    if (!text) return;
    // utf8_len() et non strlen() : un 'é' pese 2 octets mais n'occupe qu'une
    // colonne. Compter les octets decalerait tout texte accentue vers la gauche.
    graphics_draw_text_raw((graphics_width() - utf8_len(text) * 8) / 2, y, text, color);
}

int graphics_text_width(const char* text) {
    return text ? utf8_len(text) * 8 : 0;
}

// Écran-titre : image BGR565 brute 320x240, déjà au format matériel. On la
// recopie telle quelle, sans conversion ni transparence — c'est le chemin le
// plus rapide possible vers le framebuffer.
void graphics_draw_fullscreen565(const uint16_t* data) {
    if (!data) return;
    for (int y = 0; y < SCREEN_HEIGHT; ++y)
        for (int x = 0; x < SCREEN_WIDTH; ++x)
            g_gfx.drawPixel((int16_t)x, (int16_t)y, data[y * SCREEN_WIDTH + x]);
}

int graphics_width()  { return SCREEN_WIDTH; }
int graphics_height() { return SCREEN_HEIGHT; }

// -----------------------------------------------------------------------------
// graphics_save_screenshot_bmp()
// -----------------------------------------------------------------------------
// Lit le framebuffer déjà dessiné via lcd_getpixel() (pixel hardware au format
// BGR565 : rouge sur les 5 bits bas, vert sur les 6 bits du milieu, bleu sur
// les 5 bits hauts — cf. lcd_color_rgb() dans gb_ll_lcd), et écrit un BMP 24
// bits classique (BGR, lignes bas→haut, alignement 4 octets par ligne — le
// format BMP standard, lisible tel quel par n'importe quel visualiseur).
//
// Les noms longs sont acceptés sur la carte SD (CONFIG_FATFS_LFN_HEAP) ; les
// captures vont dans le dossier du jeu : /sdcard/IRONTOURNAMENT/capture_NNNN.bmp.
bool graphics_save_screenshot_bmp(char* out_path, int out_path_size) {
    static const char* kDir = "/sdcard/IRONTOURNAMENT";

    // Le dossier peut déjà exister (mkdir échoue alors silencieusement, ce
    // qui est very bien : on ignore son retour).
    mkdir(kDir, 0777);

    // Cherche le premier nom capture_NNNN.bmp non utilisé.
    char path[64];
    int shot_num = -1;
    for (int i = 0; i < 10000; ++i) {
        snprintf(path, sizeof(path), "%s/capture_%04d.bmp", kDir, i);
        FILE* test = fopen(path, "rb");
        if (!test) { shot_num = i; break; }
        fclose(test);
    }
    if (shot_num < 0) return false; // 10000 captures déjà présentes...

    FILE* f = fopen(path, "wb");
    if (!f) return false;

    const int W = SCREEN_WIDTH;
    const int H = SCREEN_HEIGHT;
    const int row_bytes = W * 3;
    const int row_padding = (4 - (row_bytes % 4)) % 4;
    const int row_stride = row_bytes + row_padding;
    const uint32_t data_size = (uint32_t)row_stride * H;
    const uint32_t file_size = 14 + 40 + data_size;

    uint8_t header[54] = {0};
    // BITMAPFILEHEADER (14 octets)
    header[0] = 'B'; header[1] = 'M';
    header[2]  = (uint8_t)(file_size);
    header[3]  = (uint8_t)(file_size >> 8);
    header[4]  = (uint8_t)(file_size >> 16);
    header[5]  = (uint8_t)(file_size >> 24);
    header[10] = 54; // offset des données pixel

    // BITMAPINFOHEADER (40 octets)
    header[14] = 40;
    header[18] = (uint8_t)(W);       header[19] = (uint8_t)(W >> 8);
    header[22] = (uint8_t)(H);       header[23] = (uint8_t)(H >> 8);
    header[26] = 1;                  // planes
    header[28] = 24;                 // bits par pixel
    header[34] = (uint8_t)(data_size);
    header[35] = (uint8_t)(data_size >> 8);
    header[36] = (uint8_t)(data_size >> 16);
    header[37] = (uint8_t)(data_size >> 24);

    fwrite(header, 1, 54, f);

    uint8_t row[SCREEN_WIDTH * 3 + 3] = {0}; // + marge pour le padding
    for (int y = H - 1; y >= 0; --y) {       // BMP stocke les lignes bas→haut
        for (int x = 0; x < W; ++x) {
            gb_pixel v = lcd_getpixel((uint16_t)x, (uint16_t)y);
            uint8_t r5 = v & 0x1F;
            uint8_t g6 = (v >> 5) & 0x3F;
            uint8_t b5 = (v >> 11) & 0x1F;
            row[x * 3 + 0] = (uint8_t)((b5 * 255) / 31); // BMP = B,G,R
            row[x * 3 + 1] = (uint8_t)((g6 * 255) / 63);
            row[x * 3 + 2] = (uint8_t)((r5 * 255) / 31);
        }
        for (int p = 0; p < row_padding; ++p) row[row_bytes + p] = 0;
        fwrite(row, 1, row_stride, f);
    }

    fclose(f);

    if (out_path && out_path_size > 0) {
        strncpy(out_path, path, out_path_size - 1);
        out_path[out_path_size - 1] = '\0';
    }
    return true;
}

} // namespace core
