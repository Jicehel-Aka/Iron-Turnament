/*
  pc_graphics.cpp — core/graphics.h sur un framebuffer logiciel 320x240 BGR565.
  Memes signatures et memes comportements que core/graphics.cpp (version console).
*/
#include "../main/core/graphics.h"
#include "../main/assets/gfx/font_accents.h"
#include "pc_platform.h"
#include "font8x8_basic.h"      // definit font8x8_basic[128][8] (composant gamebuino)
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <sys/stat.h>

namespace core {

static constexpr int W = 320, H = 240;
static uint16_t s_fb[W * H];
static int s_tx = 0, s_ty = 0;
static int s_tx_stack[8], s_ty_stack[8], s_top = 0;
static int s_zoom = 2;
static char s_data_dir[400] = "IRONTOURNAMENT";

static inline void put(int x, int y, uint16_t c) { if ((unsigned)x < (unsigned)W && (unsigned)y < (unsigned)H) s_fb[y * W + x] = c; }

uint16_t graphics_make_color(int r, int g, int b) {
    r = std::clamp(r, 0, 255); g = std::clamp(g, 0, 255); b = std::clamp(b, 0, 255);
    return (uint16_t)(((b >> 3) << 11) | ((g >> 2) << 5) | (r >> 3));
}

static uint16_t tint_rgb(Tint c) {
    switch (c) {
        case Tint::Black:     return graphics_make_color(0, 0, 0);
        case Tint::White:     return graphics_make_color(255, 255, 255);
        case Tint::Yellow:    return graphics_make_color(255, 220, 0);
        case Tint::Red:       return graphics_make_color(220, 30, 30);
        case Tint::Green:     return graphics_make_color(40, 180, 70);
        case Tint::DarkGreen: return graphics_make_color(20, 120, 45);
        case Tint::DarkGray:  return graphics_make_color(60, 60, 65);
        case Tint::Gray:      return graphics_make_color(130, 130, 135);
        case Tint::SkyBlue:   return graphics_make_color(110, 180, 230);
        case Tint::DarkBlue:  return graphics_make_color(20, 30, 70);
        case Tint::Orange:    return graphics_make_color(230, 130, 30);
        case Tint::Brown:     return graphics_make_color(110, 70, 40);
        case Tint::LightGray: return graphics_make_color(190, 190, 195);
        case Tint::Cyan:      return graphics_make_color(0, 220, 230);
    }
    return 0;
}

void graphics_init() { std::memset(s_fb, 0, sizeof s_fb); }
void graphics_present() { pc_present(s_fb); }
int graphics_width()  { return W; }
int graphics_height() { return H; }

// --- primitives brutes ----------------------------------------------------------
void graphics_fill_rect_raw(int x, int y, int w, int h, uint16_t c) {
    x += s_tx; y += s_ty;
    const int x0 = std::max(x, 0), y0 = std::max(y, 0), x1 = std::min(x + w, W), y1 = std::min(y + h, H);
    for (int j = y0; j < y1; ++j) for (int i = x0; i < x1; ++i) s_fb[j * W + i] = c;
}
void graphics_draw_rect_raw(int x, int y, int w, int h, uint16_t c) {
    graphics_fill_rect_raw(x, y, w, 1, c); graphics_fill_rect_raw(x, y + h - 1, w, 1, c);
    graphics_fill_rect_raw(x, y, 1, h, c); graphics_fill_rect_raw(x + w - 1, y, 1, h, c);
}
void graphics_fill_circle_raw(int cx, int cy, int r, uint16_t c) {
    cx += s_tx; cy += s_ty;
    for (int j = -r; j <= r; ++j) for (int i = -r; i <= r; ++i)
        if (i * i + j * j <= r * r + r / 2) put(cx + i, cy + j, c);
}
void graphics_fill_triangle_raw(int x0, int y0, int x1, int y1, int x2, int y2, uint16_t c) {
    x0 += s_tx; x1 += s_tx; x2 += s_tx; y0 += s_ty; y1 += s_ty; y2 += s_ty;
    const int minx = std::max(std::min({x0, x1, x2}), 0), maxx = std::min(std::max({x0, x1, x2}), W - 1);
    const int miny = std::max(std::min({y0, y1, y2}), 0), maxy = std::min(std::max({y0, y1, y2}), H - 1);
    auto e = [](int ax, int ay, int bx, int by, int px, int py) { return (bx - ax) * (py - ay) - (by - ay) * (px - ax); };
    for (int y = miny; y <= maxy; ++y) for (int x = minx; x <= maxx; ++x) {
        const int a = e(x0, y0, x1, y1, x, y), b = e(x1, y1, x2, y2, x, y), d = e(x2, y2, x0, y0, x, y);
        if ((a >= 0 && b >= 0 && d >= 0) || (a <= 0 && b <= 0 && d <= 0)) s_fb[y * W + x] = c;
    }
}
void graphics_draw_line_raw(int x0, int y0, int x1, int y1, uint16_t c) {
    x0 += s_tx; x1 += s_tx; y0 += s_ty; y1 += s_ty;
    const int dx = std::abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -std::abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;
    for (;;) {
        put(x0, y0, c);
        if (x0 == x1 && y0 == y1) break;
        const int e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}
void graphics_draw_pixel_raw(int x, int y, uint16_t c) { put(x, y, c); }
void graphics_hline_raw(int x, int y, int w, uint16_t c) { for (int i = 0; i < w; ++i) put(x + i, y, c); }

// --- Tint ---------------------------------------------------------------------------
void graphics_clear(Tint c) { const uint16_t v = tint_rgb(c); for (auto& p : s_fb) p = v; }
void graphics_fill_rect(int x, int y, int w, int h, Tint c)   { graphics_fill_rect_raw(x, y, w, h, tint_rgb(c)); }
void graphics_draw_rect(int x, int y, int w, int h, Tint c)   { graphics_draw_rect_raw(x, y, w, h, tint_rgb(c)); }
void graphics_draw_line(int a, int b, int c2, int d, Tint c)  { graphics_draw_line_raw(a, b, c2, d, tint_rgb(c)); }
void graphics_fill_circle(int x, int y, int r, Tint c)        { graphics_fill_circle_raw(x, y, r, tint_rgb(c)); }
void graphics_draw_circle(int cx, int cy, int r, Tint c) {
    const uint16_t v = tint_rgb(c); cx += s_tx; cy += s_ty;
    for (int j = -r; j <= r; ++j) for (int i = -r; i <= r; ++i) {
        const int d = i * i + j * j;
        if (d <= r * r + r && d >= (r - 1) * (r - 1)) put(cx + i, cy + j, v);
    }
}
void graphics_fill_triangle(int a, int b, int c2, int d, int e, int f, Tint c) { graphics_fill_triangle_raw(a, b, c2, d, e, f, tint_rgb(c)); }

// --- texte UTF-8 (meme decodage que la version console) ---------------------------------
static uint16_t utf8_next(const char*& p) {
    const uint8_t c = (uint8_t)*p++;
    if (c < 0x80) return c;
    if ((c & 0xE0) == 0xC0 && (*p & 0xC0) == 0x80) { const uint16_t cp = (uint16_t)(((c & 0x1F) << 6) | (*p & 0x3F)); p++; return cp; }
    if ((c & 0xF0) == 0xE0) { if ((p[0] & 0xC0) == 0x80) p++; if ((p[0] & 0xC0) == 0x80) p++; return '?'; }
    return '?';
}
static int utf8_len(const char* p) { int n = 0; while (*p) { utf8_next(p); n++; } return n; }
static const uint8_t* glyph_of(uint16_t cp) {
    if (cp < 128) return (const uint8_t*)font8x8_basic[cp];
    const uint8_t* g = font_accent_lookup(cp);
    return g ? g : (const uint8_t*)font8x8_basic[(int)'?'];
}
void graphics_draw_text_raw(int x, int y, const char* text, uint16_t color) {
    if (!text) return;
    int px = x + s_tx; const int py = y + s_ty;
    while (*text) {
        const uint16_t cp = utf8_next(text);
        if (px >= W) break;
        if (px + 8 > 0) {
            const uint8_t* g = glyph_of(cp);
            for (int gy = 0; gy < 8; ++gy) for (int gx = 0; gx < 8; ++gx)
                if (g[gy] & (1 << gx)) put(px + gx, py + gy, color);
        }
        px += 8;
    }
}
void graphics_draw_text_center_raw(int y, const char* t, uint16_t c) { if (t) graphics_draw_text_raw((W - utf8_len(t) * 8) / 2, y, t, c); }
int  graphics_text_width(const char* t) { return t ? utf8_len(t) * 8 : 0; }
void graphics_draw_text(int x, int y, const char* t, Tint c) { graphics_draw_text_raw(x, y, t, tint_rgb(c)); }
void graphics_draw_text_center(int y, const char* t, Tint c) { graphics_draw_text_center_raw(y, t, tint_rgb(c)); }

// --- translation ------------------------------------------------------------------------------
void graphics_push() { if (s_top < 8) { s_tx_stack[s_top] = s_tx; s_ty_stack[s_top] = s_ty; ++s_top; } }
void graphics_translate(int dx, int dy) { s_tx += dx; s_ty += dy; }
void graphics_pop() { if (s_top > 0) { --s_top; s_tx = s_tx_stack[s_top]; s_ty = s_ty_stack[s_top]; } }
void graphics_get_translate(int* dx, int* dy) { *dx = s_tx; *dy = s_ty; }

// --- bitmaps ---------------------------------------------------------------------------------------
void graphics_draw_bitmap565(int x, int y, int w, int h, const uint16_t* d, bool tr, uint16_t key) {
    x += s_tx; y += s_ty;
    for (int j = 0; j < h; ++j) {
        const int yy = y + j; if (yy < 0 || yy >= H) continue;
        for (int i = 0; i < w; ++i) {
            const int xx = x + i; if (xx < 0 || xx >= W) continue;
            const uint16_t v = d[j * w + i];
            if (tr && v == key) continue;
            s_fb[yy * W + xx] = v;
        }
    }
}
void graphics_draw_bitmap565_scaled(int x, int y, int dw, int dh, const uint16_t* d, int sw, int sh, bool tr, uint16_t key) {
    x += s_tx; y += s_ty;
    for (int j = 0; j < dh; ++j) {
        const int yy = y + j; if (yy < 0 || yy >= H) continue;
        const uint16_t* row = d + (j * sh / dh) * sw;
        for (int i = 0; i < dw; ++i) {
            const int xx = x + i; if (xx < 0 || xx >= W) continue;
            const uint16_t v = row[i * sw / dw];
            if (tr && v == key) continue;
            s_fb[yy * W + xx] = v;
        }
    }
}
void graphics_draw_fullscreen565(const uint16_t* d) { std::memcpy(s_fb, d, sizeof s_fb); }

// --- zoom (version PC) -------------------------------------------------------------------------------------
bool graphics_zoom_supported() { return true; }
int  graphics_get_zoom() { return s_zoom; }
void graphics_set_zoom(int z) { s_zoom = std::clamp(z, 1, 4); pc_apply_zoom(s_zoom); }

// --- capture d'ecran : BMP 24 bits dans le dossier du jeu --------------------------------------------------
bool graphics_save_screenshot_bmp(char* out_path, int out_size) {
    char path[460];
    int n = -1;
    for (int i = 0; i < 10000; ++i) {
        std::snprintf(path, sizeof path, "%s/capture_%04d.bmp", s_data_dir, i);
        FILE* t = std::fopen(path, "rb");
        if (!t) { n = i; break; }
        std::fclose(t);
    }
    if (n < 0) return false;
    FILE* f = std::fopen(path, "wb");
    if (!f) return false;
    const int stride = (W * 3 + 3) & ~3;
    const uint32_t data = (uint32_t)stride * H, total = 54 + data;
    uint8_t hd[54] = {};
    hd[0] = 'B'; hd[1] = 'M';
    std::memcpy(hd + 2, &total, 4);
    const uint32_t off = 54, hsz = 40; const int32_t w = W, h = H; const uint16_t planes = 1, bpp = 24;
    std::memcpy(hd + 10, &off, 4); std::memcpy(hd + 14, &hsz, 4); std::memcpy(hd + 18, &w, 4);
    std::memcpy(hd + 22, &h, 4); std::memcpy(hd + 26, &planes, 2); std::memcpy(hd + 28, &bpp, 2);
    std::memcpy(hd + 34, &data, 4);
    std::fwrite(hd, 1, 54, f);
    uint8_t* row = (uint8_t*)std::calloc(1, (size_t)stride);
    for (int y = H - 1; y >= 0; --y) {
        for (int x = 0; x < W; ++x) {
            const uint16_t c = s_fb[y * W + x];
            row[x * 3 + 0] = (uint8_t)(((c >> 11) & 31) << 3);   // B
            row[x * 3 + 1] = (uint8_t)(((c >> 5) & 63) << 2);    // G
            row[x * 3 + 2] = (uint8_t)((c & 31) << 3);           // R
        }
        std::fwrite(row, 1, (size_t)stride, f);
    }
    std::free(row);
    std::fclose(f);
    if (out_path && out_size > 0) std::snprintf(out_path, (size_t)out_size, "%s", path);
    return true;
}

} // namespace core

void pc_set_data_dir(const char* d) { std::snprintf(core::s_data_dir, sizeof core::s_data_dir, "%s", d); }
const char* pc_data_dir() { return core::s_data_dir; }
