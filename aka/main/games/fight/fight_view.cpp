/*
===============================================================================
  fight_view.cpp — Rendu d'Iron Tournament sur la AKA (320x240, BGR565)
-------------------------------------------------------------------------------
  Le prototype web dessinait ses combattants avec un « pose rig » de 2 300 lignes
  et trois moteurs de rendu (2.5D, sprites, 3D). Sur la AKA on garde UN seul rendu,
  VECTORIEL et léger : chaque combattant est un squelette à 10 articulations dont
  les membres sont des segments épais, posé par une fonction d'animation qui ne
  dépend que de (action, image). Aucun atlas de sprites, donc :
     - zéro octet de PSRAM pour les animations (les 24 actions x 6 combattants du
       prototype auraient pesé ~25 Mo en 16 bits) ;
     - des poses interpolées, sans « saut » entre deux images ;
     - chaque combattant se distingue par ses couleurs et un accessoire propre.

  Décor : image 360x176 embarquée (40 px de parallaxe) + sol procédural dont les
  dalles défilent à la vitesse de la caméra.
===============================================================================
*/
#include "fight_view.h"
#include "fight_sprites.h"
#include "../../core/graphics.h"
#include "../../core/audio.h"
#include "../../shell/i18n.h"
#include "../../shell/ui.h"
#include <cmath>
#include <cstdio>
#include <cstring>

extern "C" const uint8_t portraits_bin_start[] asm("_binary_portraits_bin_start");
extern "C" const uint8_t stages_bin_start[]    asm("_binary_stages_bin_start");

using namespace core;

namespace fight {

static constexpr int SCR_W = 320, SCR_H = 240;
static constexpr int STAGE_W = 360, STAGE_H = 176;
static constexpr int PORTRAIT_PX = 64;
static constexpr int GROUND_Y = 212;          // ligne des pieds
static constexpr int HUD_H = 34;

const uint16_t* portrait(FighterId id) {
    return (const uint16_t*)portraits_bin_start + (size_t)id * PORTRAIT_PX * PORTRAIT_PX;
}
static const uint16_t* stage(FighterId id) {
    return (const uint16_t*)stages_bin_start + (size_t)id * STAGE_W * STAGE_H;
}

static uint16_t col(Rgb c) { return graphics_make_color(c.r, c.g, c.b); }
static uint16_t shade(Rgb c, float k) {
    auto s = [k](int v) { v = (int)(v * k); return v > 255 ? 255 : (v < 0 ? 0 : v); };
    return graphics_make_color(s(c.r), s(c.g), s(c.b));
}

// -----------------------------------------------------------------------------
// Primitives : segment épais (deux triangles) et bande de couleur
// -----------------------------------------------------------------------------
static void thick_line(float x0, float y0, float x1, float y1, float w, uint16_t c) {
    const float dx = x1 - x0, dy = y1 - y0;
    const float len = std::sqrt(dx * dx + dy * dy);
    if (len < 0.001f) { graphics_fill_circle_raw((int)x0, (int)y0, (int)(w * 0.5f + 0.5f), c); return; }
    const float nx = -dy / len * w * 0.5f, ny = dx / len * w * 0.5f;
    graphics_fill_triangle_raw((int)(x0 + nx), (int)(y0 + ny), (int)(x0 - nx), (int)(y0 - ny),
                               (int)(x1 + nx), (int)(y1 + ny), c);
    graphics_fill_triangle_raw((int)(x0 - nx), (int)(y0 - ny), (int)(x1 - nx), (int)(y1 - ny),
                               (int)(x1 + nx), (int)(y1 + ny), c);
}

static void limb(float x0, float y0, float x1, float y1, float w, uint16_t fill, uint16_t outline) {
    thick_line(x0, y0, x1, y1, w + 2, outline);
    thick_line(x0, y0, x1, y1, w, fill);
}

// -----------------------------------------------------------------------------
// Pose : positions RELATIVES aux hanches, +x vers l'avant, y vers le BAS.
// -----------------------------------------------------------------------------
struct V2 { float x, y; };

struct Pose {
    float hip_drop = 0;          // accroupissement (px vers le bas)
    float lean = 0;              // inclinaison du buste (px de décalage de l'épaule)
    V2 hand_f{14, -46}, hand_b{8, -44};   // mains avant / arrière, relatives aux hanches
    V2 foot_f{11, 0},   foot_b{-11, 0};   // pieds, relatifs aux hanches (ground=0)
    float head_tilt = 0;
    bool lying = false;          // à terre : tout le corps est tracé à l'horizontale
    float lie_t = 1;             // 0 debout -> 1 à plat (relèvement)
};

static inline float lerp(float a, float b, float t) { return a + (b - a) * t; }
static inline float clamp01(float t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
// 0 avant `a`, 1 après `b`, rampe entre les deux.
static inline float ramp(float v, float a, float b) { return clamp01((v - a) / (b - a)); }

static V2 mix(V2 a, V2 b, float t) { return { lerp(a.x, b.x, t), lerp(a.y, b.y, t) }; }

static Pose compute_pose(const Fighter& f, const FighterDef& d, int now_frame) {
    Pose p;
    const float t = (float)f.action_frame;
    const float T = (float)(f.action_total > 0 ? f.action_total : 1);
    const float reach = 40.0f + (d.reach - 55) * 0.35f;

    switch (f.action) {
    case A_IDLE: {
        const float b = std::sin(now_frame * 0.11f + f.slot) * 1.6f;
        p.hip_drop = 2.0f + b * 0.6f;
        p.hand_f = { 15, -48 + b }; p.hand_b = { 9, -46 + b };
        break;
    }
    case A_WALK_FWD: case A_WALK_BACK: {
        const float dir = f.action == A_WALK_FWD ? 1.0f : -1.0f;
        const float s = std::sin(now_frame * 0.32f) * 9.0f * dir;
        p.foot_f = { 8 + s, -std::fmax(0.0f, std::cos(now_frame * 0.32f) * 4.0f) };
        p.foot_b = { -8 - s, -std::fmax(0.0f, -std::cos(now_frame * 0.32f) * 4.0f) };
        p.hip_drop = 2; p.lean = 1.5f * dir;
        p.hand_f = { 13, -47 }; p.hand_b = { 7, -45 };
        break;
    }
    case A_CROUCH:
        p.hip_drop = 15; p.lean = 2;
        p.foot_f = { 15, 0 }; p.foot_b = { -13, 0 };
        p.hand_f = { 17, -26 }; p.hand_b = { 10, -24 };
        break;
    case A_JUMP: {
        const float tuck = f.y < -6 ? 1.0f : 0.4f;
        p.hip_drop = 0;
        p.foot_f = { lerp(11, 14, tuck), lerp(0, -12, tuck) };
        p.foot_b = { lerp(-11, -9, tuck), lerp(0, -7, tuck) };
        p.hand_f = { 14, -50 }; p.hand_b = { 6, -52 };
        break;
    }
    case A_JUMP_ATTACK:
        p.lean = 4;
        p.foot_f = { reach * 0.8f, -14 }; p.foot_b = { -8, -6 };
        p.hand_f = { 12, -50 }; p.hand_b = { 4, -52 };
        break;
    case A_LIGHT: {                                   // coup de poing
        const float e = ramp(t, 1, 5) * (1.0f - ramp(t, 9, T));
        p.hand_f = mix({ 15, -48 }, { reach, -49 }, e);
        p.lean = 4 * e; p.hip_drop = 2;
        if (f.y < -6) { p.foot_f = { 12, -10 }; p.foot_b = { -8, -6 }; }
        break;
    }
    case A_HEAVY: {                                   // coup de pied haut
        const float e = ramp(t, 3, 8) * (1.0f - ramp(t, 13, T));
        p.foot_f = mix({ 11, 0 }, { reach + 8, -36 }, e);
        p.lean = -5 * e; p.hip_drop = 1;
        p.hand_f = { 10, -52 }; p.hand_b = { 3, -50 };
        break;
    }
    case A_LOW_KICK: {                                // balayette
        const float e = ramp(t, 3, 7) * (1.0f - ramp(t, 12, T));
        p.hip_drop = 14;
        p.foot_f = mix({ 13, 0 }, { reach + 10, -4 }, e);
        p.foot_b = { -14, 0 };
        p.hand_f = { 6, -22 }; p.hand_b = { -2, -24 };
        break;
    }
    case A_UPPERCUT: {                                // crochet montant
        const float e = ramp(t, 1, 6) * (1.0f - ramp(t, 10, T));
        p.hip_drop = 10 - 6 * e;
        p.hand_f = mix({ 14, -24 }, { 12, -76 }, e);
        p.hand_b = { 6, -34 };
        p.foot_f = { 13, 0 }; p.foot_b = { -11, 0 };
        break;
    }
    case A_THROW: {
        const float e = ramp(t, 2, 12);
        p.hand_f = mix({ 16, -46 }, { 24, -52 }, e);
        p.hand_b = mix({ 10, -44 }, { 22, -44 }, e);
        p.lean = 5 + 4 * e; p.hip_drop = 8;
        break;
    }
    case A_EVADE_HIGH: p.hip_drop = 22; p.lean = 4; p.foot_f = { 16, 0 }; p.foot_b = { -14, 0 };
                       p.hand_f = { 14, -22 }; p.hand_b = { 8, -20 }; break;
    case A_EVADE_MID:  p.lean = -9; p.hip_drop = 4; p.foot_f = { 6, 0 }; p.foot_b = { -16, 0 };
                       p.hand_f = { 8, -50 }; p.hand_b = { 2, -48 }; break;
    case A_EVADE_LOW:  p.hip_drop = 0; p.lean = -4; p.foot_f = { 10, -14 }; p.foot_b = { -10, -14 };
                       p.hand_f = { 12, -44 }; p.hand_b = { 6, -42 }; break;
    case A_BLOCK_HIGH: p.hip_drop = 3; p.lean = -2;
                       p.hand_f = { 14, -58 }; p.hand_b = { 11, -54 }; break;
    case A_BLOCK_LOW:  p.hip_drop = 15; p.lean = -2; p.foot_f = { 15, 0 }; p.foot_b = { -13, 0 };
                       p.hand_f = { 16, -30 }; p.hand_b = { 12, -26 }; break;
    case A_HITSTUN: case A_HITSTUN_GUT: {
        const float s = f.action == A_HITSTUN_GUT ? 1.0f : 0.0f;
        p.lean = -8; p.hip_drop = 4 + 6 * s;
        p.head_tilt = -5;
        p.hand_f = { 4 + 6 * s, -30 - 10 * (1 - s) }; p.hand_b = { -6, -42 };
        break;
    }
    case A_KNOCKDOWN: case A_DEFEAT:
        p.lying = true;
        p.lie_t = (f.y < -4) ? 0.5f : 1.0f;            // encore en l'air : à moitié renversé
        break;
    case A_WAKEUP:
        p.lying = true; p.lie_t = 1.0f - ramp(t, 0, T);
        break;
    case A_TAUNT: {
        const float s = std::sin(t * 0.5f);
        p.lean = -7; p.head_tilt = -6;
        p.hand_f = { 12, -62 + s * 3 }; p.hand_b = { -2, -60 - s * 3 };
        break;
    }
    case A_DIZZY: {
        const float s = std::sin(now_frame * 0.25f);
        p.lean = 6 * s; p.hip_drop = 9; p.head_tilt = 5 * s;
        p.hand_f = { 6, -26 }; p.hand_b = { -4, -28 };
        p.foot_f = { 13, 0 }; p.foot_b = { -12, 0 };
        break;
    }
    case A_FINISHER: {
        const float e = ramp(t, 8, 30) * (1.0f - ramp(t, 90, T));
        p.hand_f = mix({ 15, -48 }, { 28, -60 }, e);
        p.hand_b = mix({ 9, -46 }, { 24, -52 }, e);
        p.lean = 6 * e; p.hip_drop = 5 * e;
        break;
    }
    case A_FINISHER_VICTIM:
        p.lying = true; p.lie_t = 0.6f + 0.4f * ramp(t, 0, 60);
        break;
    case A_VICTORY: {
        const float s = std::sin(now_frame * 0.3f);
        p.hand_f = { 6, -84 + s * 2 }; p.hand_b = { -6, -62 };
        p.lean = -2;
        break;
    }
    case ACTION_COUNT: break;
    case A_SPECIAL_1: case A_SPECIAL_2: case A_SPECIAL_3: {
        const SpecialDef& sp = d.specials[f.action - A_SPECIAL_1];
        const float su = (float)sp.startup, ac = (float)sp.active;
        const float e = ramp(t, 0, su) * (1.0f - ramp(t, su + ac, T));
        switch (sp.type) {
        case SP_PROJECTILE: case SP_TRAP_ORB: case SP_HARPOON:
            p.hand_f = mix({ 14, -46 }, { 26, -50 }, e);
            p.hand_b = mix({ 8, -44 }, { 24, -48 }, e);
            p.lean = 3 * e; p.hip_drop = 5 * e;
            break;
        case SP_ANTI_AIR:
            p.hand_f = mix({ 14, -30 }, { 10, -90 }, e);
            p.hand_b = { 5, -46 };
            p.foot_f = { 8, -10 * e }; p.foot_b = { -9, 0 };
            p.lean = -3 * e;
            break;
        case SP_DASH_STRIKE:
            p.lean = 9 * e; p.hip_drop = 6 * e;
            p.foot_f = mix({ 11, 0 }, { reach + 10, -22 }, e);
            p.hand_f = mix({ 14, -46 }, { 26, -44 }, e);
            p.hand_b = { 4, -40 };
            break;
        case SP_OVERHEAD:
            p.lean = 6 * e;
            p.hand_f = mix({ 8, -86 }, { 24, -30 }, ramp(t, su - 4, su + ac * 0.5f));
            p.hand_b = mix({ 4, -84 }, { 20, -28 }, ramp(t, su - 4, su + ac * 0.5f));
            p.foot_f = { 12, -10 }; p.foot_b = { -9, -6 };
            break;
        case SP_TELEPORT:
            p.hip_drop = 14; p.lean = 3;
            p.hand_f = { 10, -26 }; p.hand_b = { 4, -24 };
            p.foot_f = { 14, 0 }; p.foot_b = { -12, 0 };
            break;
        case SP_COMMAND_GRAB:
            p.hand_f = mix({ 16, -44 }, { 30, -40 }, e);
            p.hand_b = mix({ 10, -44 }, { 28, -52 }, e);
            p.lean = 8 * e; p.hip_drop = 8;
            break;
        case SP_QUAKE:
            p.hand_f = mix({ 10, -90 }, { 22, -10 }, ramp(t, su - 6, su));
            p.hand_b = mix({ 6, -88 }, { 20, -8 }, ramp(t, su - 6, su));
            p.hip_drop = 10 * ramp(t, su - 6, su);
            p.lean = 6 * ramp(t, su - 6, su);
            break;
        }
        break;
    }
    }
    return p;
}

// Deux os (cuisse/mollet, bras/avant-bras) : le coude/genou est placé « vers le
// bas et l'arrière » pour les jambes, « vers le bas » pour les bras.
static V2 two_bone(V2 root, V2 target, float l1, float l2, float bend_dir) {
    float dx = target.x - root.x, dy = target.y - root.y;
    float dist = std::sqrt(dx * dx + dy * dy);
    const float maxd = l1 + l2 - 0.5f;
    if (dist > maxd) { dx *= maxd / dist; dy *= maxd / dist; dist = maxd; }
    if (dist < 1.0f) dist = 1.0f;
    const float a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    float h2 = l1 * l1 - a * a; if (h2 < 0) h2 = 0;
    const float h = std::sqrt(h2);
    const float mx = root.x + dx * a / dist, my = root.y + dy * a / dist;
    return { mx - dy / dist * h * bend_dir, my + dx / dist * h * bend_dir };
}

// -----------------------------------------------------------------------------
// Un combattant
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Rendu par SPRITES (planches .spr) : action du moteur -> (ligne, colonne)
// -----------------------------------------------------------------------------
static inline int imin_(int a, int b) { return a < b ? a : b; }

// Colonne (0..5) d'une animation jouee une fois, selon l'avancement de l'action.
static int oneshot_col(const Fighter& f) {
    const int total = f.action_total > 0 ? f.action_total : 1;
    int c = (int)((float)f.action_frame * 6.0f / (float)total);
    return c < 0 ? 0 : imin_(c, 5);
}

static bool sprite_cell(const Fighter& f, const FighterDef& d, int now, int& row, int& col, int& y_adj) {
    using namespace spr;
    y_adj = 0;
    const int af = f.action_frame;
    switch (f.action) {
    case A_IDLE:       row = R_IDLE;      col = (now / 10) % 6; break;
    case A_WALK_FWD:   row = R_WALK_FWD;  col = (now / 6) % 6;  break;
    case A_WALK_BACK:  row = R_WALK_BACK; col = (now / 6) % 6;  break;
    case A_CROUCH:     row = R_CROUCH;    col = 2; break;
    case A_JUMP: {
        row = R_JUMP; y_adj = 10;                      // la planche monte deja le sauteur de ~10 px
        const float jv = -d.jump_vel;                  // > 0
        float t = jv > 0 ? (f.vy + jv) / (2.0f * jv) : 0.5f;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        col = imin_((int)(t * 6.0f), 5);
        break;
    }
    case A_JUMP_ATTACK: row = R_JUMP_ATTACK; y_adj = 10; col = oneshot_col(f); break;
    case A_EVADE_HIGH:  row = R_EVADE_HIGH;  col = oneshot_col(f); break;
    case A_EVADE_MID:   row = R_EVADE_MID;   col = oneshot_col(f); break;
    case A_EVADE_LOW:   row = R_EVADE_LOW;   col = oneshot_col(f); break;
    case A_LIGHT:       row = R_LIGHT;       col = oneshot_col(f); break;
    case A_HEAVY:       row = R_HEAVY;       col = oneshot_col(f); break;
    case A_LOW_KICK:    row = R_LOW_KICK;    col = oneshot_col(f); break;
    case A_UPPERCUT:    row = R_UPPERCUT;    col = oneshot_col(f); break;
    case A_THROW:       row = R_LIGHT;       col = oneshot_col(f); break;
    case A_SPECIAL_1:   row = R_SPECIAL_1;   col = oneshot_col(f); break;
    case A_SPECIAL_2:   row = R_SPECIAL_2;   col = oneshot_col(f); break;
    case A_SPECIAL_3:   row = R_SPECIAL_3;   col = oneshot_col(f); break;
    case A_BLOCK_HIGH:  row = R_BLOCK_HIGH;  col = imin_(oneshot_col(f), 2); break;   // la garde se tient
    case A_BLOCK_LOW:   row = R_BLOCK_LOW;   col = imin_(oneshot_col(f), 2); break;
    case A_HITSTUN:     row = R_HITSTUN;      col = oneshot_col(f); break;
    case A_HITSTUN_GUT: row = R_HITSTUN_GUT;  col = oneshot_col(f); break;
    case A_KNOCKDOWN: case A_DEFEAT: case A_FINISHER_VICTIM:
        row = f.action == A_KNOCKDOWN ? R_KNOCKDOWN : R_DEFEAT;
        if (f.y < -4.0f) col = imin_(af / 5, 2);       // encore en l'air : trois premieres images
        else             col = 3 + imin_(af / 10, 2);  // au sol : trois dernieres
        break;
    case A_WAKEUP: {                                   // se releve : la chute a l'envers
        row = R_KNOCKDOWN;
        const int total = f.action_total > 0 ? f.action_total : 1;
        col = 5 - imin_((int)((float)af * 3.0f / (float)total), 2);
        break;
    }
    case A_TAUNT:      row = R_VICTORY; col = (now / 8) % 6; break;
    case A_DIZZY:      row = R_HITSTUN_GUT; col = (now / 8) % 6; break;
    case A_FINISHER:   row = R_HEAVY; col = imin_(af / 8, 3); break;
    case A_VICTORY:    row = R_VICTORY; col = af < 48 ? af / 8 : 3 + (af / 8) % 3; break;
    default: return false;
    }
    return true;
}

static uint16_t s_mirror[128 * 112];                  // image retournee (regard a gauche)

// Dessine le combattant avec son sprite. Faux si le sprite n'est pas disponible.
static bool draw_fighter_sprite(const Fighter& f, const FighterDef& d, float cam_x, int now) {
    if (!spr::ready(f.id)) return false;
    int row, col, y_adj;
    if (!sprite_cell(f, d, now, row, col, y_adj)) return false;

    spr::Frame fr;
    if (!spr::frame(f.id, row, col, fr)) return false;
    if (!fr.px) return true;                           // image vide : rien a dessiner

    const int fx = (int)(f.x - cam_x);
    const int fy = (int)(GROUND_Y + f.y);

    if (f.facing > 0) {
        graphics_draw_bitmap565(fx + fr.ox, fy + fr.oy + y_adj, fr.w, fr.h, fr.px, true);
    } else {
        for (int y = 0; y < fr.h; ++y) {
            const uint16_t* src = fr.px + y * fr.w;
            uint16_t* dst = s_mirror + y * fr.w;
            for (int x = 0; x < fr.w; ++x) dst[x] = src[fr.w - 1 - x];
        }
        graphics_draw_bitmap565(fx - (fr.ox + fr.w), fy + fr.oy + y_adj, fr.w, fr.h, s_mirror, true);
    }

    if (f.action == A_DIZZY) {                         // etoiles au-dessus de la tete
        for (int i = 0; i < 3; ++i) {
            const float a = now * 0.12f + i * 2.094f;
            graphics_fill_circle_raw((int)(fx + std::cos(a) * 10), (int)(fy - 84 + std::sin(a) * 3),
                                     2, graphics_make_color(250, 226, 80));
        }
    }
    return true;
}

static void draw_fighter(const Fighter& f, float cam_x, int now_frame) {
    const FighterDef& d = def(f.id);
    const Pose pose = compute_pose(f, d, now_frame);

    const float scale = f.id == TITAN ? 1.18f : f.id == MALAKOR ? 1.08f : f.id == MEILIN ? 0.95f : 1.0f;
    const float fx = f.x - cam_x;                    // pied de référence à l'écran
    const float fy = GROUND_Y + f.y;
    const float dir = (float)f.facing;

    const uint16_t c_pri  = col(d.primary);
    const uint16_t c_dark = shade(d.primary, 0.45f);
    const uint16_t c_sec  = col(d.secondary);
    const uint16_t c_skin = col(d.skin);
    const uint16_t c_out  = graphics_make_color(12, 10, 18);

    // Ombre portée (se réduit avec l'altitude).
    {
        const int sw = (int)(15 * scale * (1.0f + f.y / 140.0f));
        graphics_fill_rect_raw((int)fx - sw, GROUND_Y - 1, sw * 2, 3, graphics_make_color(8, 8, 12));
    }

    // Sprites (planches .spr) si disponibles ; sinon le dessin vectoriel ci-dessous sert de secours.
    if (draw_fighter_sprite(f, d, cam_x, now_frame)) return;

    // Transformation locale -> écran : x miroir selon le regard.
    auto X = [&](float lx) { return fx + lx * scale * dir; };
    auto Y = [&](float ly) { return fy + ly * scale; };

    if (pose.lying) {
        // À terre : buste horizontal, tête vers l'arrière. lie_t < 1 : relèvement/chute.
        const float k = pose.lie_t;
        const float hipx = lerp(0.0f, -6.0f, k), hipy = lerp(-30.0f, -7.0f, k);
        const V2 head = { lerp(0.0f, -34.0f, k), lerp(-60.0f, -9.0f, k) };
        const V2 shoulder = { lerp(0.0f, -22.0f, k), lerp(-50.0f, -9.0f, k) };
        // jambes
        limb(X(hipx), Y(hipy), X(lerp(10, 20, k)), Y(lerp(-12, -9, k)), 5 * scale, c_pri, c_out);
        limb(X(lerp(10, 20, k)), Y(lerp(-12, -9, k)), X(lerp(11, 30, k)), Y(lerp(0, -4, k)), 5 * scale, c_pri, c_out);
        limb(X(hipx), Y(hipy), X(lerp(-9, 14, k)), Y(lerp(-12, -3, k)), 5 * scale, c_dark, c_out);
        // buste + bras
        limb(X(hipx), Y(hipy), X(shoulder.x), Y(shoulder.y), 9 * scale, c_pri, c_out);
        limb(X(shoulder.x), Y(shoulder.y), X(lerp(10, -10, k)), Y(lerp(-40, -18, k)), 4 * scale, c_skin, c_out);
        graphics_fill_circle_raw((int)X(head.x), (int)Y(head.y), (int)(7 * scale), c_out);
        graphics_fill_circle_raw((int)X(head.x), (int)Y(head.y), (int)(6 * scale), c_skin);
        return;
    }

    // --- Squelette debout --------------------------------------------------------
    const V2 hip = { 0, -30.0f + pose.hip_drop };
    const V2 sho = { pose.lean, hip.y - 22.0f };
    const V2 head = { pose.lean * 1.2f + pose.head_tilt * 0.4f, sho.y - 10.0f };

    // Pieds : les coordonnées de la pose sont relatives au SOL, pas aux hanches.
    V2 ff = { pose.foot_f.x, pose.foot_f.y };
    V2 fb = { pose.foot_b.x, pose.foot_b.y };
    V2 hf = { pose.hand_f.x, pose.hand_f.y + 30.0f - pose.hip_drop };   // mains : relatives aux hanches
    V2 hb = { pose.hand_b.x, pose.hand_b.y + 30.0f - pose.hip_drop };
    hf = { hf.x, hf.y + hip.y }; hb = { hb.x, hb.y + hip.y };

    // Cape de Malakor, derrière tout.
    if (f.id == MALAKOR) {
        graphics_fill_triangle_raw((int)X(sho.x - 2), (int)Y(sho.y), (int)X(sho.x - 2), (int)Y(hip.y + 12),
                                   (int)X(-24 - pose.lean), (int)Y(hip.y + 28), c_dark);
    }

    // Jambes : genou vers l'avant.
    const V2 kf = two_bone(hip, ff, 16, 16, -1.0f);
    const V2 kb = two_bone(hip, fb, 16, 16, -1.0f);
    limb(X(hip.x), Y(hip.y), X(kb.x), Y(kb.y), 6 * scale, c_dark, c_out);
    limb(X(kb.x), Y(kb.y), X(fb.x), Y(fb.y), 5 * scale, c_dark, c_out);
    graphics_fill_circle_raw((int)X(fb.x), (int)Y(fb.y), (int)(3 * scale), c_sec);
    limb(X(hip.x), Y(hip.y), X(kf.x), Y(kf.y), 6 * scale, c_pri, c_out);
    limb(X(kf.x), Y(kf.y), X(ff.x), Y(ff.y), 5 * scale, c_pri, c_out);
    graphics_fill_circle_raw((int)X(ff.x), (int)Y(ff.y), (int)(3 * scale), c_sec);

    // Bras arrière (derrière le buste).
    {
        const V2 eb = two_bone(sho, hb, 12, 12, 1.0f);
        limb(X(sho.x), Y(sho.y + 2), X(eb.x), Y(eb.y), 4 * scale, c_skin, c_out);
        limb(X(eb.x), Y(eb.y), X(hb.x), Y(hb.y), 4 * scale, c_skin, c_out);
        graphics_fill_circle_raw((int)X(hb.x), (int)Y(hb.y), (int)((f.id == TITAN ? 4.5f : 3.0f) * scale),
                                 f.id == TITAN ? c_sec : c_skin);
    }

    // Buste + ceinture.
    limb(X(hip.x), Y(hip.y), X(sho.x), Y(sho.y), 10 * scale, c_pri, c_out);
    thick_line(X(hip.x - 4), Y(hip.y - 2), X(hip.x + 4), Y(hip.y - 2), 3 * scale, c_sec);

    // Tête.
    const int hx = (int)X(head.x), hy = (int)Y(head.y), hr = (int)(7 * scale);
    graphics_fill_circle_raw(hx, hy, hr + 1, c_out);
    graphics_fill_circle_raw(hx, hy, hr, f.id == KROWEN ? graphics_make_color(226, 222, 206) : c_skin);

    // Accessoire propre à chaque maître : on reconnaît le combattant au premier coup d'oeil.
    switch (f.id) {
    case KENJI:                                           // bandeau écarlate + nœud
        thick_line(X(head.x - 7), Y(head.y - 2), X(head.x + 7), Y(head.y - 2), 3 * scale, c_sec);
        thick_line(X(head.x - 6), Y(head.y - 2), X(head.x - 13), Y(head.y + 2), 2, c_sec);
        break;
    case KROWEN:                                          // masque d'os : fentes des yeux
        graphics_fill_rect_raw(hx + (int)(dir * 1), hy - 2, 4, 2, c_out);
        graphics_fill_rect_raw(hx - 4 + (int)(dir * 1), hy - 2, 3, 2, c_out);
        graphics_fill_circle_raw(hx, hy - hr + 1, 3, c_pri);
        break;
    case MEILIN:                                          // queue de cheval
        thick_line(X(head.x - 5), Y(head.y - 3), X(head.x - 14), Y(head.y + 9 + std::sin(now_frame * 0.2f) * 2), 3, c_out);
        thick_line(X(head.x - 5), Y(head.y - 3), X(head.x - 13), Y(head.y + 8 + std::sin(now_frame * 0.2f) * 2), 2, c_sec);
        graphics_fill_rect_raw(hx - hr, hy - hr, hr * 2, 4, c_out);
        break;
    case TITAN:                                           // crâne rasé, épaulières d'acier
        graphics_fill_circle_raw((int)X(sho.x), (int)Y(sho.y + 1), (int)(5 * scale), c_sec);
        break;
    case NYXIA:                                           // tresses d'argent
        thick_line(X(head.x - 3), Y(head.y - 2), X(head.x - 9), Y(head.y + 20), 2, c_sec);
        thick_line(X(head.x - 5), Y(head.y - 2), X(head.x - 13), Y(head.y + 16), 2, c_sec);
        graphics_fill_rect_raw(hx - hr, hy - hr, hr * 2, 3, c_sec);
        break;
    case MALAKOR:                                         // couronne d'airain
        for (int i = -1; i <= 1; ++i)
            graphics_fill_triangle_raw(hx + i * 4 - 2, hy - hr, hx + i * 4 + 2, hy - hr,
                                       hx + i * 4, hy - hr - 5, c_sec);
        break;
    default: break;
    }

    // Bras avant (devant le buste) : c'est lui qui frappe.
    {
        const V2 ef = two_bone(sho, hf, 12, 12, 1.0f);
        limb(X(sho.x), Y(sho.y + 2), X(ef.x), Y(ef.y), 4 * scale, c_skin, c_out);
        limb(X(ef.x), Y(ef.y), X(hf.x), Y(hf.y), 4 * scale, c_skin, c_out);
        graphics_fill_circle_raw((int)X(hf.x), (int)Y(hf.y), (int)((f.id == TITAN ? 4.5f : 3.2f) * scale),
                                 f.id == TITAN ? c_sec : c_skin);
        if (f.id == KENJI || f.id == KROWEN)
            graphics_fill_circle_raw((int)X(hf.x), (int)Y(hf.y), (int)(2 * scale), c_sec);
    }

    // Étoiles d'étourdissement.
    if (f.action == A_DIZZY) {
        for (int i = 0; i < 3; ++i) {
            const float a = now_frame * 0.12f + i * 2.094f;
            graphics_fill_circle_raw((int)(X(head.x) + std::cos(a) * 10), (int)(Y(head.y) - 12 + std::sin(a) * 3),
                                     2, graphics_make_color(250, 226, 80));
        }
    }
}

// -----------------------------------------------------------------------------
// Projectiles
// -----------------------------------------------------------------------------
static void draw_projectiles(const Match& m, float cam_x, int now_frame) {
    for (const Projectile& p : m.proj) {
        if (!p.alive) continue;
        const FighterDef& d = def(p.fighter);
        const uint16_t acc = col(d.accent), core = graphics_make_color(255, 255, 255);
        const uint16_t glow = shade(d.accent, 0.5f);
        const int x = (int)(p.x - cam_x), y = (int)(GROUND_Y + p.y);
        const int w = (int)p.w, h = (int)p.h;
        const int dir = p.vx >= 0 ? 1 : -1;

        switch (p.kind) {
        case PK_HARPOON:
            thick_line(x - dir * 48, y, x, y, 3, shade(d.secondary, 0.8f));
            graphics_fill_triangle_raw(x, y - 5, x, y + 5, x + dir * 11, y, acc);
            break;
        case PK_LIGHTNING: {
            const int j = (now_frame & 1) ? 3 : -3;
            thick_line(x - dir * 22, y + j, x - dir * 11, y - j, 3, glow);
            thick_line(x - dir * 11, y - j, x, y + j, 3, acc);
            thick_line(x, y + j, x + dir * 10, y, 2, core);
            break;
        }
        case PK_STEEL_FAN: {
            const float a = now_frame * 0.5f;
            graphics_fill_circle_raw(x, y, w / 2 + 1, glow);
            for (int i = 0; i < 3; ++i)
                thick_line(x, y, x + (int)(std::cos(a + i * 2.1f) * 8), y + (int)(std::sin(a + i * 2.1f) * 8), 2, acc);
            graphics_fill_circle_raw(x, y, 2, core);
            break;
        }
        case PK_STASIS_ORB: {
            const int r = h / 2 + (int)(std::sin(now_frame * 0.3f) * 2);
            graphics_fill_circle_raw(x, y, r + 2, glow);
            graphics_fill_circle_raw(x, y, r, acc);
            graphics_fill_circle_raw(x, y, r / 2, core);
            break;
        }
        case PK_DARK_WAVE:
            graphics_fill_circle_raw(x, y, h / 2 + 3, glow);
            graphics_fill_triangle_raw(x - dir * 12, y - h / 2, x - dir * 12, y + h / 2, x + dir * 10, y, acc);
            graphics_fill_circle_raw(x, y, h / 4, core);
            break;
        default:   // KI_WAVE
            graphics_fill_circle_raw(x, y, h / 2 + 3, glow);
            graphics_fill_circle_raw(x, y, h / 2 + 1, acc);
            graphics_fill_circle_raw(x, y, h / 4, core);
            thick_line(x - dir * 14, y, x - dir * 4, y, 3, glow);
            break;
        }
    }
}

// -----------------------------------------------------------------------------
// Décor
// -----------------------------------------------------------------------------
static void draw_stage(const Match& m, float cam_x, int shake_x, int shake_y) {
    // Le décor est celui du combattant de P2 (l'hôte du combat), comme dans le prototype.
    const FighterId home = m.f[1].id;
    const uint16_t* bg = stage(home);
    const int off = (int)(cam_x * (float)(STAGE_W - SCR_W) / (float)(WORLD_W - SCR_W));   // parallaxe 0..40

    for (int y = 0; y < STAGE_H; ++y)
        graphics_draw_bitmap565(shake_x, y + shake_y, SCR_W, 1, bg + y * STAGE_W + off, false);

    // Sol : le décor lui-même se prolonge vers le bas, en REFLET assombri (comme un sol poli).
    // La ligne y = STAGE_H reprend exactement la dernière ligne du décor : aucune coupure, aucune
    // dalle, aucun aplat de couleur. L'assombrissement croît avec la profondeur.
    static uint16_t line[SCR_W];
    const int floor_h = SCR_H - STAGE_H;
    for (int i = 0; i < floor_h; ++i) {
        const uint16_t* src = bg + (STAGE_H - 1 - (i < STAGE_H ? i : STAGE_H - 1)) * STAGE_W + off;
        const int k = 12 - (i * 9) / floor_h;                       // 12/16 en haut -> 3/16 en bas
        for (int x = 0; x < SCR_W; ++x) {
            const uint16_t c = src[x];                              // BGR565 : R bas, V milieu, B haut
            const int r = ((c & 31) * k) >> 4;
            const int g = (((c >> 5) & 63) * k) >> 4;
            const int b = (((c >> 11) & 31) * k) >> 4;
            line[x] = (uint16_t)((b << 11) | (g << 5) | r);
        }
        graphics_draw_bitmap565(shake_x, STAGE_H + i + shake_y, SCR_W, 1, line, false);
    }
}

// -----------------------------------------------------------------------------
// HUD
// -----------------------------------------------------------------------------
static void draw_bar(int x, int y, int w, int h, const Fighter& f, bool right_to_left, Rgb accent) {
    graphics_fill_rect_raw(x - 1, y - 1, w + 2, h + 2, graphics_make_color(10, 8, 14));
    graphics_fill_rect_raw(x, y, w, h, graphics_make_color(50, 20, 26));

    const int hp_w   = (int)((float)w * f.hp / f.max_hp);
    const int disp_w = (int)((float)w * f.display_hp / f.max_hp);
    const uint16_t hp_col = f.hp * 100 / f.max_hp < 28 ? graphics_make_color(239, 68, 68) : col(accent);

    if (right_to_left) {
        graphics_fill_rect_raw(x + w - disp_w, y, disp_w, h, graphics_make_color(220, 60, 50));   // trainée rouge
        graphics_fill_rect_raw(x + w - hp_w,  y, hp_w,  h, hp_col);
        graphics_fill_rect_raw(x + w - hp_w,  y, hp_w,  2, graphics_make_color(255, 255, 255));
    } else {
        graphics_fill_rect_raw(x, y, disp_w, h, graphics_make_color(220, 60, 50));
        graphics_fill_rect_raw(x, y, hp_w, h, hp_col);
        graphics_fill_rect_raw(x, y, hp_w, 2, graphics_make_color(255, 255, 255));
    }
}

static void draw_win_pips(int x, int y, int wins, bool right_to_left) {
    for (int i = 0; i < ROUNDS_TO_WIN; ++i) {
        const int px = right_to_left ? x - i * 10 : x + i * 10;
        const bool on = i < wins;
        graphics_fill_circle_raw(px, y, 3, graphics_make_color(10, 8, 14));
        graphics_fill_circle_raw(px, y, 2, on ? graphics_make_color(250, 204, 21) : graphics_make_color(60, 60, 78));
    }
}

static const char* banner_main(const Match& m, char* buf, size_t n) {
    using namespace i18n;
    switch (m.banner) {
    case BN_ROUND_READY: case BN_ROUND_FINAL: case BN_ROUND_BOSS: case BN_ROUND_NEXT:
        snprintf(buf, n, "%s %d", T(STR_ROUND), m.round); return buf;
    case BN_FIGHT:       return T(STR_FIGHT);
    case BN_COUNTER:     return T(STR_COUNTER);
    case BN_THROW:       return T(STR_THROW);
    case BN_GRAB:        return def((FighterId)m.banner_arg).specials[0].name;
    case BN_GUARD_BREAK: return T(STR_GUARD_BREAK);
    case BN_PULL:        return T(STR_PULL);
    case BN_FINISH_HIM:  return T(STR_FINISH_HIM);
    case BN_FATALITY:    return T(STR_FATALITY);
    case BN_HONOR:       return T(STR_HONOR);
    case BN_KO:          return T(STR_KO);
    case BN_PERFECT:     return T(STR_PERFECT);
    case BN_TIME:        return T(STR_TIME_OVER);
    default:             return "";
    }
}

static const char* banner_sub(const Match& m, char* buf, size_t n) {
    using namespace i18n;
    const FighterDef& w = def((FighterId)m.banner_arg);
    switch (m.banner) {
    case BN_ROUND_READY: return T(STR_GET_READY);
    case BN_ROUND_FINAL: return T(STR_DECISIVE);
    case BN_ROUND_BOSS:  return T(STR_FINAL_DUEL);
    case BN_ROUND_NEXT:  return T(STR_EN_GARDE);
    case BN_GUARD_BREAK: return T(STR_OVERHEAD);
    case BN_PULL:        return w.specials[0].name;
    case BN_FINISH_HIM: case BN_FATALITY: case BN_HONOR:
        return w.finisher.name;
    case BN_COUNTER:
        snprintf(buf, n, T(STR_PUNISHES), w.short_name); return buf;
    case BN_KO: case BN_PERFECT:
        snprintf(buf, n, T(STR_WINS_ROUND), w.short_name); return buf;
    case BN_TIME:
        snprintf(buf, n, T(STR_WINS_POINTS), w.short_name); return buf;
    default: return "";
    }
}

static void draw_hud(const Match& m) {
    const Fighter& a = m.f[0];
    const Fighter& b = m.f[1];
    const FighterDef& da = def(a.id);
    const FighterDef& db = def(b.id);

    graphics_fill_rect_raw(0, 0, SCR_W, HUD_H, graphics_make_color(12, 10, 20));
    graphics_fill_rect_raw(0, HUD_H, SCR_W, 1, graphics_make_color(240, 176, 64));

    // Portraits 26x26 de part et d'autre du chrono.
    graphics_draw_bitmap565_scaled(3, 3, 26, 26, portrait(a.id), PORTRAIT_PX, PORTRAIT_PX, false);
    graphics_draw_bitmap565_scaled(SCR_W - 29, 3, 26, 26, portrait(b.id), PORTRAIT_PX, PORTRAIT_PX, false);
    graphics_draw_rect_raw(2, 2, 28, 28, col(da.accent));
    graphics_draw_rect_raw(SCR_W - 30, 2, 28, 28, col(db.accent));

    // Barres de vie.
    draw_bar(34, 7, 100, 9, a, false, da.accent);
    draw_bar(SCR_W - 34 - 100, 7, 100, 9, b, true, db.accent);

    graphics_draw_text_raw(34, 21, da.short_name, ui::C_TEXT);
    graphics_draw_text_raw(SCR_W - 34 - graphics_text_width(db.short_name), 21, db.short_name, ui::C_TEXT);
    draw_win_pips(34 + graphics_text_width(da.short_name) + 10, 25, m.wins[0], false);
    draw_win_pips(SCR_W - 34 - graphics_text_width(db.short_name) - 10, 25, m.wins[1], true);

    // Chrono.
    char t[16];
    snprintf(t, sizeof t, "%02d", (int)((m.timer_frames + 59) / 60));
    graphics_fill_rect_raw(SCR_W / 2 - 17, 3, 34, 26, graphics_make_color(24, 20, 36));
    graphics_draw_rect_raw(SCR_W / 2 - 17, 3, 34, 26, graphics_make_color(240, 176, 64));
    graphics_draw_text_center_raw(11, t, m.timer_frames < 10 * 60 ? graphics_make_color(239, 68, 68) : ui::C_TEXT);
}

static void draw_banner(const Match& m) {
    if (m.banner == BN_NONE || m.banner_timer <= 0) return;
    char b1[40], b2[48];
    const char* main_t = banner_main(m, b1, sizeof b1);
    const char* sub_t  = banner_sub(m, b2, sizeof b2);
    if (!main_t[0]) return;

    const bool fatal = m.banner == BN_FINISH_HIM || m.banner == BN_FATALITY;
    const uint16_t fg = fatal ? graphics_make_color(255, 70, 90)
                      : m.banner == BN_FIGHT ? graphics_make_color(52, 211, 153)
                      : (m.banner == BN_COUNTER || m.banner == BN_PULL) ? graphics_make_color(56, 189, 248)
                      : ui::C_ACCENT;
    const int y = 78;
    const int w = graphics_text_width(main_t);
    const int sw = sub_t[0] ? graphics_text_width(sub_t) : 0;
    const int bw = (w > sw ? w : sw) + 24;
    graphics_fill_rect_raw((SCR_W - bw) / 2, y - 6, bw, sub_t[0] ? 36 : 22, graphics_make_color(10, 8, 16));
    graphics_draw_rect_raw((SCR_W - bw) / 2, y - 6, bw, sub_t[0] ? 36 : 22, fg);
    graphics_draw_text_center_raw(y, main_t, fg);
    if (sub_t[0]) graphics_draw_text_center_raw(y + 16, sub_t, ui::C_TEXT);
}

// -----------------------------------------------------------------------------
// Match complet
// -----------------------------------------------------------------------------
void draw_match(const Match& m, uint32_t now_ms) {
    const int frame = (int)(m.frame);
    (void)now_ms;

    // Tremblement d'écran : décalage entier, +-shake/3 px.
    int sx = 0, sy = 0;
    if (m.shake > 0) { sx = ((m.frame * 7) % 5) - 2; sy = ((m.frame * 3) % 5) - 2; sx = sx * m.shake / 6; sy = sy * m.shake / 8; }

    const float cam = camera_left_x(m.f[0].x, m.f[1].x);
    draw_stage(m, cam, sx, sy);

    // Le plus proche de la caméra (celui qui agit) se dessine en dernier.
    const bool p1_front = m.f[0].action != A_IDLE && m.f[0].action != A_WALK_BACK &&
                          m.f[0].action != A_KNOCKDOWN && m.f[0].action != A_DEFEAT;
    const Fighter* order[2] = { &m.f[1], &m.f[0] };
    if (!p1_front) { order[0] = &m.f[0]; order[1] = &m.f[1]; }
    for (int i = 0; i < 2; ++i) {
        Fighter f = *order[i];
        f.x += sx; f.y += sy;
        draw_fighter(f, cam, frame);
    }
    draw_projectiles(m, cam, frame);

    // Particules (x monde -> écran ; y déjà en pixels écran).
    for (int i = 0; i < m.part_count; ++i) {
        const Particle& p = m.part[i];
        const int px = (int)(p.x - cam) + sx, py = (int)p.y + sy;
        if (px < 0 || px >= SCR_W || py < HUD_H || py >= SCR_H) continue;
        graphics_fill_rect_raw(px, py, p.size, p.size, col(p.color));
    }

    // Voile sombre pendant les coups fatals : on assombrit en bandes (damier léger, peu coûteux).
    if (m.dark_flash > 0 && (m.phase == PH_FINISH_HIM || m.phase == PH_FINISHER_ANIM)) {
        const uint16_t veil = graphics_make_color(24, 6, 18);
        for (int y = HUD_H + 1 + (frame & 1); y < SCR_H; y += 2)
            graphics_fill_rect_raw(0, y, SCR_W, 1, veil);
    }

    draw_hud(m);
    draw_banner(m);
}

// -----------------------------------------------------------------------------
// Sélection du combattant
// -----------------------------------------------------------------------------
static void stat_bar(int x, int y, const char* label, int value /*0..100*/, uint16_t c) {
    graphics_draw_text_raw(x, y, label, ui::C_DIM);
    graphics_fill_rect_raw(x + 62, y + 1, 62, 6, graphics_make_color(30, 30, 44));
    graphics_fill_rect_raw(x + 62, y + 1, value * 62 / 100, 6, c);
}

void draw_fighter_card(FighterId id, int x, int y) {
    const FighterDef& d = def(id);
    const uint16_t c = col(d.accent);
    stat_bar(x, y,      i18n::T(i18n::STR_ST_VITALITY), d.max_hp * 100 / 1250, c);
    stat_bar(x, y + 11, i18n::T(i18n::STR_ST_SPEED),    (int)(d.walk_fwd * 100.0f / 3.2f), c);
    stat_bar(x, y + 22, i18n::T(i18n::STR_ST_POWER),    d.power, c);
    stat_bar(x, y + 33, i18n::T(i18n::STR_ST_DEFENSE),  d.defense, c);
    stat_bar(x, y + 44, i18n::T(i18n::STR_ST_REACH),    d.reach, c);
}

void draw_select(FighterId sel, uint32_t now_ms, const char* title) {
    graphics_fill_rect_raw(0, 0, SCR_W, SCR_H, ui::C_BG);
    graphics_fill_rect_raw(0, 0, SCR_W, ui::TOP_H, ui::C_BAR);
    graphics_draw_text_center_raw(5, title, ui::C_ACCENT);

    const FighterDef& d = def(sel);
    const uint16_t acc = col(d.accent);

    // Grand portrait (128x128, agrandissement x2 au plus proche) + cadre animé.
    const int px = 12, py = 28;
    graphics_fill_rect_raw(px - 3, py - 3, 134, 134, acc);
    graphics_draw_bitmap565_scaled(px, py, 128, 128, portrait(sel), PORTRAIT_PX, PORTRAIT_PX, false);

    // Fiche à droite.
    graphics_draw_text_raw(152, 30, d.short_name, acc);
    graphics_draw_text_raw(152, 42, i18n::title_of(sel), ui::C_DIM);
    draw_fighter_card(sel, 152, 62);

    graphics_draw_text_raw(152, 114, i18n::T(i18n::STR_SPECIALS), ui::C_ACCENT);
    for (int i = 0; i < 3; ++i)
        graphics_draw_text_raw(152, 126 + i * 10, d.specials[i].name, ui::C_TEXT);
    graphics_draw_text_raw(152, 158, d.finisher.name, ui::C_DIM);

    // Bandeau des six, le choisi encadré (clignote doucement).
    const int sz = 36, gap = 8;
    const int x0 = (SCR_W - (FIGHTER_COUNT * sz + (FIGHTER_COUNT - 1) * gap)) / 2;
    for (int i = 0; i < FIGHTER_COUNT; ++i) {
        const int x = x0 + i * (sz + gap), y = 176;
        const bool on = i == (int)sel;
        const bool blink = ((now_ms / 300) & 1) != 0;
        graphics_fill_rect_raw(x - 2, y - 2, sz + 4, sz + 4,
                               on ? (blink ? ui::C_CURSOR : acc) : graphics_make_color(50, 52, 70));
        graphics_draw_bitmap565_scaled(x, y, sz, sz, portrait((FighterId)i), PORTRAIT_PX, PORTRAIT_PX, false);
    }

    graphics_fill_rect_raw(0, SCR_H - ui::BOT_H, SCR_W, ui::BOT_H, ui::C_BAR);
    graphics_draw_text_center_raw(SCR_H - ui::BOT_H + 3, i18n::T(i18n::STR_HELP_SELECT), ui::C_DIM);
}

// -----------------------------------------------------------------------------
// Son
// -----------------------------------------------------------------------------
void play_sfx(uint16_t b) {
    // Un seul effet par image : on garde le plus important (ordre décroissant).
    if (b & SFX_FINISHER)      { sfx_multi_capture(); return; }
    if (b & SFX_KO)            { sfx_gameover();      return; }
    if (b & SFX_FINISH_STING)  { sfx_promote();       return; }
    if (b & SFX_HEAVY)         { sfx_capture();       return; }
    if (b & SFX_THROW)         { sfx_capture();       return; }
    if (b & SFX_SPECIAL)       { sfx_move();          return; }
    if (b & SFX_TELEPORT)      { sfx_select();        return; }
    if (b & SFX_LIGHT)         { sfx_select();        return; }
    if (b & SFX_BLOCK)         { sfx_cancel();        return; }
    if (b & SFX_VICTORY)       { sfx_promote();       return; }
    if (b & SFX_BELL)          { sfx_menu_ok();       return; }
    if (b & SFX_JUMP)          { sfx_cursor();        return; }
    if (b & SFX_WHIFF)         { sfx_cursor();        return; }
}

} // namespace fight
