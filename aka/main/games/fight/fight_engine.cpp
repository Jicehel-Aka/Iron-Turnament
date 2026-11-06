/*
===============================================================================
  fight_engine.cpp — Moteur de combat (port de src/game/engine.ts)
-------------------------------------------------------------------------------
  Logique pure, 60 Hz, sans matériel. Voir fight.h pour la cadence.

  Convention verticale : y = 0 au sol, NÉGATIF en l'air (comme le prototype).
  Les particules, elles, sont en pixels ÉCRAN verticalement (y ≈ 175 = torse).
===============================================================================
*/
#include "fight.h"
#include <cmath>
#include <cstring>

namespace fight {

static constexpr int UNLIMITED_FRAMES = 999999;   // chrono d'une manche sans limite de temps

static constexpr float FLOOR_Y = 0.0f;

// -----------------------------------------------------------------------------
// Utilitaires
// -----------------------------------------------------------------------------
float rnd(Match& m) {                       // xorshift32 -> [0,1)
    uint32_t s = m.rng ? m.rng : 0x9E3779B9u;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    m.rng = s;
    return (float)(s >> 8) * (1.0f / 16777216.0f);
}

static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static inline int   imax(int a, int b) { return a > b ? a : b; }
static inline int   imin(int a, int b) { return a < b ? a : b; }

float camera_left_x(float p1x, float p2x) {
    return clampf((p1x + p2x) * 0.5f - ARENA_W * 0.5f, 0.0f, (float)(WORLD_W - ARENA_W));
}

static void sfx(Match& m, SfxBit b) { m.sfx |= (uint16_t)b; }

static void banner(Match& m, BannerId id, uint8_t arg, int timer) {
    m.banner = id; m.banner_arg = arg; m.banner_timer = (int16_t)timer;
}

static void spawn_particles(Match& m, float x, float y, Rgb color, int count,
                            float speed = 3.2f, float size = 3.0f) {
    for (int i = 0; i < count; ++i) {
        if (m.part_count >= MAX_PART) return;
        const float angle = rnd(m) * 6.2831853f;
        const float mag   = (0.35f + rnd(m) * 0.85f) * speed;
        Particle& p = m.part[m.part_count++];
        p.x = x; p.y = y;
        p.vx = std::cos(angle) * mag;
        p.vy = std::sin(angle) * mag - 0.8f;
        p.size = (uint8_t)imax(1, (int)std::lround(size * (0.7f + rnd(m) * 0.6f)));
        p.color = color;
        p.life = 0;
        p.max_life = (uint8_t)(12 + (int)(rnd(m) * 14.0f));
    }
}

// -----------------------------------------------------------------------------
// Création
// -----------------------------------------------------------------------------
static void create_fighter(Fighter& f, FighterId id, uint8_t slot, bool boss) {
    const FighterDef& d = def(id);
    std::memset(&f, 0, sizeof f);
    f.id = id;
    f.dmg_scale = g_dmg_scale[DIFF_MASTER][id];
    f.slot = slot;
    f.max_hp = boss ? (int16_t)std::lround(d.max_hp * 1.12f) : d.max_hp;
    f.hp = f.max_hp;
    f.display_hp = f.max_hp;
    f.x = slot == 1 ? 246.0f : 394.0f;
    f.facing = slot == 1 ? 1 : -1;
    f.action = A_IDLE;
    f.action_total = 1;
    f.boss = boss;
    f.ai_cooldown = 18;
}

void init_match(Match& m, FighterId p1, FighterId p2, bool boss_match, uint32_t seed,
                const MatchRules& rules) {
    std::memset(&m, 0, sizeof m);
    m.rng = seed ? seed : 1u;
    m.round = 1;
    m.rounds_to_win = rules.rounds_to_win < 1 ? 1 : (rules.rounds_to_win > 3 ? 3 : rules.rounds_to_win);
    m.round_sec = rules.round_sec;
    m.timer_frames = m.round_sec == 0 ? UNLIMITED_FRAMES : m.round_sec * 60;
    m.phase = PH_INTRO;
    m.phase_timer = 84;
    m.boss_match = boss_match;
    banner(m, boss_match ? BN_ROUND_BOSS : BN_ROUND_READY, 0, 84);
    m.finisher_done = FIN_NONE;
    create_fighter(m.f[0], p1, 1, false);
    create_fighter(m.f[1], p2, 2, boss_match);
}

void set_ai_level(Match& m, Difficulty diff) {
    m.f[1].dmg_scale = g_dmg_scale[diff][m.f[1].id];
}

void start_next_round(Match& m) {
    const uint8_t k1 = m.f[0].ki, k2 = m.f[1].ki;
    const bool boss = m.f[1].boss;
    const FighterId i1 = m.f[0].id, i2 = m.f[1].id;

    m.round++;
    m.timer_frames = m.round_sec == 0 ? UNLIMITED_FRAMES : m.round_sec * 60;
    m.hitstop = 0; m.shake = 0; m.dark_flash = 0;
    m.phase = PH_INTRO;
    m.phase_timer = 80;
    const bool decisive = m.rounds_to_win > 1 && m.wins[0] == m.rounds_to_win - 1 && m.wins[1] == m.rounds_to_win - 1;
    banner(m, decisive ? BN_ROUND_FINAL : BN_ROUND_NEXT, 0, 80);
    m.finisher_done = FIN_NONE;
    m.winner_slot = 0;
    std::memset(m.proj, 0, sizeof m.proj);
    m.part_count = 0;

    create_fighter(m.f[0], i1, 1, false);  m.f[0].ki = k1;
    create_fighter(m.f[1], i2, 2, boss);   m.f[1].ki = k2;
}

// -----------------------------------------------------------------------------
// Entrées : direction relative, historique, mouvements
// -----------------------------------------------------------------------------
static Dir relative_dir(const Input& in, int facing) {
    const bool fwd  = facing == 1 ? in.right : in.left;
    const bool back = facing == 1 ? in.left  : in.right;
    if (in.down && fwd)  return D_DF;
    if (in.down && back) return D_DB;
    if (in.up && fwd)    return D_UF;
    if (in.up && back)   return D_UB;
    if (in.down)         return D_D;
    if (in.up)           return D_U;
    if (fwd)             return D_F;
    if (back)            return D_B;
    return D_N;
}

static void record_direction(Fighter& f, const Input& in, int32_t frame) {
    const Dir d = relative_dir(in, f.facing);
    if (f.hist_len == 0 || f.hist[f.hist_len - 1].dir != d) {
        if (f.hist_len == 16) {                         // shift()
            std::memmove(&f.hist[0], &f.hist[1], 15 * sizeof(DirEntry));
            f.hist_len = 15;
        }
        f.hist[f.hist_len++] = { (uint8_t)d, frame };
    }
    // Purge des entrées trop anciennes (> 26 images).
    uint8_t n = 0;
    for (uint8_t i = 0; i < f.hist_len; ++i)
        if (frame - f.hist[i].frame <= 26) f.hist[n++] = f.hist[i];
    f.hist_len = n;
}

static constexpr uint16_t bit(Dir d) { return (uint16_t)(1u << d); }

// La séquence est donnée de la plus ANCIENNE à la plus RÉCENTE étape.
static bool has_motion(const Fighter& f, const uint16_t* seq, int n) {
    int idx = n - 1;
    for (int i = (int)f.hist_len - 1; i >= 0; --i) {
        if (seq[idx] & (1u << f.hist[i].dir)) {
            if (--idx < 0) return true;
        }
    }
    return false;
}

static int find_by_motion(const FighterDef& d, Motion mo) {
    for (int i = 0; i < 3; ++i) if (d.specials[i].motion == mo) return i;
    return -1;
}
static int find_by_shortcut(const FighterDef& d, Shortcut sc) {
    for (int i = 0; i < 3; ++i) if (d.specials[i].shortcut == sc) return i;
    return -1;
}

// Renvoie l'indice (0..2) du special demandé, ou -1.
static int detect_special(const Fighter& f, const Input& in) {
    const FighterDef& d = def(f.id);
    const bool fwd  = f.facing == 1 ? in.right : in.left;
    const bool back = f.facing == 1 ? in.left  : in.right;

    // 1. Raccourcis AKA : direction + A+B (ou la touche C).
    const bool trigger = in.jp_special || (in.jp_a && in.b) || (in.jp_b && in.a);
    if (trigger && !in.down) {
        int k;
        if (in.up   && (k = find_by_shortcut(d, SC_UP))   >= 0) return k;
        if (back    && (k = find_by_shortcut(d, SC_BACK)) >= 0) return k;
        if ((fwd || (!in.up && !back)) && (k = find_by_shortcut(d, SC_FWD)) >= 0) return k;
    }

    // 2. Manipulations arcade classiques.
    if (in.jp_a || in.jp_b) {
        int k;
        { const uint16_t s[] = { bit(D_F), bit(D_D), (uint16_t)(bit(D_DF) | bit(D_F)) };
          if (has_motion(f, s, 3) && (k = find_by_motion(d, MO_DP)) >= 0) return k; }
        { const uint16_t s[] = { (uint16_t)(bit(D_B) | bit(D_DB)), bit(D_D), (uint16_t)(bit(D_DF) | bit(D_F)) };
          if (has_motion(f, s, 3) && (k = find_by_motion(d, MO_HCF)) >= 0) return k; }
        { const uint16_t s[] = { bit(D_D), (uint16_t)(bit(D_DF) | bit(D_F)) };
          if (has_motion(f, s, 2) && (k = find_by_motion(d, MO_QCF)) >= 0) return k; }
        { const uint16_t s[] = { bit(D_D), (uint16_t)(bit(D_DB) | bit(D_B)) };
          if (has_motion(f, s, 2) && (k = find_by_motion(d, MO_QCB)) >= 0) return k; }
        { const uint16_t s[] = { (uint16_t)(bit(D_B) | bit(D_DB)), bit(D_F) };
          if (has_motion(f, s, 2) && (k = find_by_motion(d, MO_BF)) >= 0) return k; }
        { const uint16_t s[] = { (uint16_t)(bit(D_D) | bit(D_DB) | bit(D_DF)), (uint16_t)(bit(D_U) | bit(D_UF)) };
          if (has_motion(f, s, 2) && (k = find_by_motion(d, MO_DU)) >= 0) return k; }
        { const uint16_t s[] = { bit(D_D), bit(D_N), bit(D_D) };
          if (has_motion(f, s, 3) && in.jp_b && (k = find_by_motion(d, MO_DD)) >= 0) return k; }
    }
    return -1;
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------
static void start_action(Fighter& f, Action a, int total) {
    f.action = a;
    f.action_frame = 0;
    f.action_total = (int16_t)total;
    f.hit_confirmed = false;
}

static bool can_act(const Fighter& f) {
    return f.action == A_IDLE || f.action == A_WALK_FWD ||
           f.action == A_WALK_BACK || f.action == A_CROUCH;
}


static bool is_special(Action a) { return a == A_SPECIAL_1 || a == A_SPECIAL_2 || a == A_SPECIAL_3; }

static void apply_physics(Fighter& f) {
    f.x += f.vx;
    if (f.action == A_WALK_FWD || f.action == A_WALK_BACK) f.walk_dist += std::fabs(f.vx);
    f.y += f.vy;

    if (f.y < FLOOR_Y) f.vy += GRAVITY;
    if (f.y >= FLOOR_Y) {
        const bool airborne = f.y > 0.01f || f.vy > 0.5f;
        f.y = FLOOR_Y;
        f.vy = 0.0f;
        if (airborne &&
            (f.action == A_JUMP ||
             ((f.action == A_LIGHT || f.action == A_HEAVY) && f.action_frame > 4))) {
            start_action(f, A_IDLE, 1);
            f.vx = 0.0f;
        }
    }

    // Friction au sol en hitstun / garde / chute.
    if (f.y >= FLOOR_Y &&
        (f.action == A_HITSTUN || f.action == A_BLOCK_HIGH || f.action == A_BLOCK_LOW ||
         f.action == A_KNOCKDOWN || f.action == A_DEFEAT)) {
        f.vx *= 0.82f;
    }
    f.x = clampf(f.x, MIN_X, MAX_X);
}

static bool blocking_correctly(const Fighter& d, const Input& in, int height /*0 MID 1 LOW 2 OVERHEAD*/) {
    if (d.y < 0) return false;                         // pas de garde en l'air
    if (d.action != A_IDLE && d.action != A_WALK_BACK && d.action != A_CROUCH &&
        d.action != A_BLOCK_HIGH && d.action != A_BLOCK_LOW) return false;
    const bool holding_back = d.facing == 1 ? in.left : in.right;
    if (!holding_back) return false;
    if (height == 1) return in.down;
    if (height == 2) return !in.down;
    return true;
}

// -----------------------------------------------------------------------------
// Fin de manche
// -----------------------------------------------------------------------------
static void trigger_standard_ko(Match& m, Fighter& winner, Fighter& loser) {
    loser.hp = 0;
    start_action(loser, A_DEFEAT, 120);
    loser.vx = -loser.facing * 3.8f;
    loser.vy = -5.0f;

    m.wins[winner.slot - 1]++;
    m.winner_slot = winner.slot;
    m.phase = PH_KO_SLOWMO;
    m.phase_timer = 95;
    m.shake = 12;

    const bool perfect = winner.hp == winner.max_hp;
    banner(m, perfect ? BN_PERFECT : BN_KO, winner.id, 95);

    sfx(m, SFX_KO);
    spawn_particles(m, loser.x, 176 + loser.y, Rgb{239, 68, 68}, 22, 4.2f, 4);
}

static void check_round_finish(Match& m, Fighter& attacker, Fighter& defender) {
    if (defender.hp > 0 || m.phase != PH_FIGHT) return;

    const int cur_wins = m.wins[attacker.slot - 1];

    // Manche décisive : fenêtre « ACHEVEZ-LE ! » à la Mortal Kombat.
    if (cur_wins >= m.rounds_to_win - 1) {
        defender.hp = 1;
        defender.vx = 0; defender.vy = 0; defender.y = 0;
        start_action(defender, A_DIZZY, 270);
        m.phase = PH_FINISH_HIM;
        m.phase_timer = 260;
        m.dark_flash = 260;
        banner(m, BN_FINISH_HIM, attacker.id, 140);
        sfx(m, SFX_FINISH_STING);
        return;
    }
    trigger_standard_ko(m, attacker, defender);
}

// -----------------------------------------------------------------------------
// Dégâts
// -----------------------------------------------------------------------------
static void apply_damage(Match& m, Fighter& atk, Fighter& dfn, int raw, bool knockdown,
                         bool unblockable = false, BannerId special_banner = BN_NONE) {
    const FighterDef& ad = def(atk.id);
    const FighterDef& dd = def(dfn.id);

    const float power_scale = 0.82f + (ad.power / 100.0f) * 0.34f;
    const float boss_scale  = atk.boss ? 1.08f : 1.0f;
    const float def_mitig   = 1.14f - (dd.defense / 100.0f) * 0.26f;
    const float combo_scale = std::fmax(0.55f, 1.0f - dfn.combo_count * 0.12f);

    const int dmg = imax(8, (int)std::lround(raw * power_scale * boss_scale * def_mitig * combo_scale * atk.dmg_scale));

    const bool was_attacking =
        dfn.action == A_LIGHT || dfn.action == A_HEAVY || dfn.action == A_LOW_KICK ||
        is_special(dfn.action) || dfn.action == A_TAUNT;

    dfn.hp = (int16_t)imax(0, dfn.hp - dmg);
    dfn.combo_count++;
    dfn.combo_timer = 42;
    if (atk.power < 2) atk.ki = (uint8_t)imin(KI_MAX, atk.ki + 14);   // pas de Ki en retour d'un SUPER
    dfn.ki = (uint8_t)imin(KI_MAX, dfn.ki + 8);

    if (was_attacking && !unblockable && m.banner_timer <= 0) {
        banner(m, BN_COUNTER, atk.id, 34);
    } else if (special_banner != BN_NONE) {
        banner(m, special_banner, atk.id, 36);
    }

    m.hitstop = knockdown ? 7 : 4;
    m.shake   = knockdown ? 9 : 4;

    const float sx = (atk.x + dfn.x) * 0.5f;
    const float sy = 175 + dfn.y;
    spawn_particles(m, sx, sy, ad.accent, knockdown ? 16 : 9, 3.6f, 3);
    spawn_particles(m, sx, sy, Rgb{250, 204, 21}, 5, 2.4f, 2);

    if (knockdown || dfn.y < 0) {
        start_action(dfn, A_KNOCKDOWN, 38);
        dfn.vx = -dfn.facing * 3.4f;
        dfn.vy = -4.2f;
    } else {
        const bool gut = atk.action == A_LIGHT || atk.action == A_UPPERCUT;
        start_action(dfn, gut ? A_HITSTUN_GUT : A_HITSTUN, 16);
        dfn.vx = -dfn.facing * 2.1f;
    }

    check_round_finish(m, atk, dfn);
}

static void resolve_strike(Match& m, Fighter& atk, Fighter& dfn, int base, int chip,
                           int height, bool knockdown, const Input* dfn_in) {
    if (dfn.invuln > 0) return;

    // Esquives actives.
    if ((dfn.action == A_EVADE_HIGH && height != 1) ||
        (dfn.action == A_EVADE_MID  && height == 0) ||
        (dfn.action == A_EVADE_LOW  && height == 1)) {
        spawn_particles(m, dfn.x, 178 + dfn.y, Rgb{56, 189, 248}, 5, 2.0f, 2);
        return;
    }

    const bool blocked = dfn_in && blocking_correctly(dfn, *dfn_in, height);
    if (blocked) {
        // Dégâts de gratte : ne tuent jamais (plancher à 1 PV).
        dfn.hp = (int16_t)imax(1, dfn.hp - imax(0, chip));
        start_action(dfn, dfn_in->down ? A_BLOCK_LOW : A_BLOCK_HIGH, 12);
        dfn.vx = -dfn.facing * 1.9f;
        atk.ki = (uint8_t)imin(KI_MAX, atk.ki + 6);
        dfn.ki = (uint8_t)imin(KI_MAX, dfn.ki + 4);
        m.hitstop = 3;
        sfx(m, SFX_BLOCK);
        spawn_particles(m, dfn.x + dfn.facing * 10, 174 + dfn.y, Rgb{147, 197, 253}, 7, 2.4f, 2);
        return;
    }

    if (height == 2 && dfn_in && dfn_in->down && (dfn_in->left || dfn_in->right))
        banner(m, BN_GUARD_BREAK, atk.id, 34);

    sfx(m, (knockdown || base >= 85) ? SFX_HEAVY : SFX_LIGHT);
    apply_damage(m, atk, dfn, base, knockdown);
}

// -----------------------------------------------------------------------------
// Projectiles & spéciaux
// -----------------------------------------------------------------------------
// Hauteur (px au-dessus du sol) de la main qui lance le projectile, mesuree sur l'image de tir de
// chaque planche (ancien reglage unique : 26 px = la ceinture, bien trop bas).
static float launch_height(FighterId id, SpecialType t) {
    switch (id) {
    case KENJI:   return 42.0f;                       // Onde Celeste : paumes au plexus/poitrine
    case KROWEN:  return 41.0f;                       // Harpon
    case MEILIN:  return 41.0f;                       // Eventail, main tendue
    case NYXIA:   return t == SP_TRAP_ORB ? 40.0f : 46.0f;   // lance : poing leve a hauteur d'epaule
    case MALAKOR: return 40.0f;                       // Egide Noire
    default:      return 38.0f;
    }
}

static void spawn_projectile(Match& m, Fighter& f, const SpecialDef& sp) {
    const FighterDef& d = def(f.id);
    const int dir = f.facing;

    if (f.slot == 1) m.habits.projectiles++;

    ProjKind kind = PK_KI_WAVE;
    float vx = dir * 4.4f, w = 16, h = 12;
    int max_life = 80;
    bool pulls = false;

    if (f.id == KROWEN && sp.type == SP_HARPOON) {
        kind = PK_HARPOON; vx = dir * 6.2f; w = 22; h = 8; max_life = 38; pulls = true;
    } else if (f.id == MEILIN) {
        kind = PK_STEEL_FAN; vx = dir * 5.4f; w = 14; h = 10; max_life = 65;
    } else if (f.id == NYXIA && sp.type == SP_PROJECTILE) {
        kind = PK_LIGHTNING; vx = dir * 6.4f; w = 24; h = 8; max_life = 55;
    } else if (f.id == NYXIA && sp.type == SP_TRAP_ORB) {
        kind = PK_STASIS_ORB; vx = dir * 1.65f; w = 18; h = 18; max_life = 115;
    } else if (f.id == MALAKOR) {
        kind = PK_DARK_WAVE; vx = dir * 4.7f; w = 20; h = 18; max_life = 72;
    }
    sfx(m, SFX_SPECIAL);

    for (int i = 0; i < MAX_PROJ; ++i) {
        Projectile& p = m.proj[i];
        if (p.alive) continue;
        p.alive = true;
        p.owner = f.slot;
        p.fighter = f.id;
        p.kind = kind;
        p.x = f.x + dir * 24.0f;
        p.y = f.y - launch_height(f.id, sp.type);
        p.vx = vx; p.vy = 0;
        p.w = w; p.h = h;
        p.damage = sp.damage; p.chip = sp.chip;
        p.life = 0; p.max_life = (int16_t)max_life;
        p.pulls = pulls;
        (void)d;
        return;
    }
}

// Special EFFECTIF : la version EX est plus rapide et frappe plus fort (le SUPER a sa propre routine).
static SpecialDef eff_special(const Fighter& f, int idx) {
    SpecialDef sp = def(f.id).specials[idx];
    if (f.power == 1) {
        sp.damage  = (int16_t)std::lround(sp.damage * 1.4f);
        sp.chip    = (int16_t)std::lround(sp.chip * 1.5f + 2);
        sp.startup = (uint8_t)imax(3, sp.startup - 3);
        sp.recovery = (uint8_t)imax(6, sp.recovery - 4);
    }
    return sp;
}

// SUPER : charge imblocable. Phase d'elan (invulnerable), coup unique, longue recuperation.
static constexpr int SUPER_DAMAGE = 250;
static constexpr float SUPER_REACH = 96.0f;

static void trigger_super(Match& m, Fighter& f) {
    start_action(f, A_SPECIAL_1, SUPER_STARTUP + SUPER_ACTIVE + SUPER_RECOVERY);
    f.power = 2;
    f.ki = 0;
    f.invuln = SUPER_STARTUP;
    f.vx = 0;
    m.dark_flash = 40;
    m.shake = 6;
    banner(m, BN_SUPER, f.id, 60);
    sfx(m, SFX_SUPER);
    spawn_particles(m, f.x, 176 + f.y, def(f.id).accent, 24, 4.2f, 3);
}

static void ongoing_super(Match& m, Fighter& f, Fighter& opp) {
    // Elan vers l'adversaire pendant la mise en place, puis freinage.
    if (f.action_frame < SUPER_STARTUP) {
        const float dx = (opp.x - f.x) * f.facing;
        f.vx = dx > 40.0f ? f.facing * 5.0f : 0.0f;
        if ((f.action_frame & 3) == 0) spawn_particles(m, f.x, 190 + f.y, def(f.id).accent, 3, 2.0f, 2);
    } else {
        f.vx *= 0.6f;
    }
    if (f.action_frame >= SUPER_STARTUP && f.action_frame <= SUPER_STARTUP + SUPER_ACTIVE && !f.hit_confirmed) {
        const float dx = (opp.x - f.x) * f.facing;
        const float dy = std::fabs(opp.y - f.y);
        if (dx >= -10.0f && dx <= SUPER_REACH && dy <= 46.0f && opp.invuln <= 0) {
            f.hit_confirmed = true;
            m.dark_flash = 30;
            resolve_strike(m, f, opp, SUPER_DAMAGE, 0, 0, true, nullptr);
        }
    }
}

static void trigger_special(Match& m, Fighter& f, int idx, int power) {
    const FighterDef& d = def(f.id);
    f.power = (uint8_t)power;
    if (power == 1) {
        f.ki = (uint8_t)(f.ki - KI_EX_COST);
        f.invuln = imax(f.invuln, 6);
        m.dark_flash = imax(m.dark_flash, 10);
        banner(m, BN_EX, f.id, 28);
        spawn_particles(m, f.x, 180 + f.y, Rgb{250, 204, 21}, 12, 3.4f, 3);
    }
    const SpecialDef sp = eff_special(f, idx);
    start_action(f, (Action)(A_SPECIAL_1 + idx), sp.startup + sp.active + sp.recovery);
    f.vx = 0;

    spawn_particles(m, f.x, 184 + f.y, d.accent, 8, 2.6f, 2);

    if (sp.type == SP_ANTI_AIR && f.id == KENJI) {
        f.invuln = 10; f.vy = -7.2f; f.vx = f.facing * 1.8f;
        sfx(m, SFX_SPECIAL);
    } else if (sp.type == SP_ANTI_AIR && f.id == TITAN) {
        sfx(m, SFX_SPECIAL);
    } else if (sp.type == SP_DASH_STRIKE) {
        f.vx = f.facing * (f.id == MALAKOR ? 5.2f : 4.2f);
        if (f.id == KENJI) f.vy = -2.4f;
        sfx(m, SFX_SPECIAL);
    } else if (sp.type == SP_OVERHEAD) {
        f.vy = f.id == MEILIN ? -5.8f : -4.6f;
        f.vx = f.facing * 3.6f;
        sfx(m, SFX_SPECIAL);
    } else if (sp.type == SP_TELEPORT) {
        sfx(m, SFX_TELEPORT);
        spawn_particles(m, f.x, 175 + f.y, Rgb{249, 115, 22}, 16, 3.6f, 3);
    } else if (sp.type == SP_COMMAND_GRAB) {
        sfx(m, SFX_WHIFF);
    } else if (sp.type == SP_QUAKE) {
        sfx(m, SFX_SPECIAL);
    }
}

static void ongoing_special(Match& m, Fighter& f, Fighter& opp) {
    if (!is_special(f.action)) return;
    if (f.power == 2) { ongoing_super(m, f, opp); return; }
    const int idx = f.action - A_SPECIAL_1;
    const SpecialDef sp = eff_special(f, idx);

    // Tir au frame exact de startup.
    if ((sp.type == SP_PROJECTILE || sp.type == SP_HARPOON || sp.type == SP_TRAP_ORB) &&
        f.action_frame == sp.startup) {
        spawn_projectile(m, f, sp);
    }

    // Pas de Brume : Krowen réapparaît dans le dos de l'adversaire.
    if (sp.type == SP_TELEPORT && f.action_frame == sp.startup) {
        const float tx = opp.x - opp.facing * 34.0f;
        f.x = clampf(tx, MIN_X + 6, MAX_X - 6);
        f.facing = opp.x >= f.x ? 1 : -1;
        spawn_particles(m, f.x, 175 + f.y, Rgb{249, 115, 22}, 16, 3.8f, 3);
    }

    // Lariat Blindé : pulvérise les projectiles ennemis proches.
    if (f.id == TITAN && sp.type == SP_ANTI_AIR) {
        const bool active = f.action_frame >= sp.startup && f.action_frame <= sp.startup + sp.active;
        if (active) {
            for (int i = 0; i < MAX_PROJ; ++i) {
                Projectile& p = m.proj[i];
                if (p.alive && p.owner != f.slot && std::fabs(p.x - f.x) < 42.0f) {
                    spawn_particles(m, p.x, 200 + p.y, Rgb{245, 158, 11}, 10, 3.2f, 2);
                    sfx(m, SFX_BLOCK);
                    p.alive = false;
                }
            }
        }
    }

    // Brise-Vertèbres : prise de commande imblocable.
    if (sp.type == SP_COMMAND_GRAB && f.action_frame == sp.startup && !f.hit_confirmed) {
        if (std::fabs(f.x - opp.x) <= 44.0f && opp.y >= -14 && opp.invuln <= 0) {
            f.hit_confirmed = true;
            apply_damage(m, f, opp, sp.damage, true, true, BN_GRAB);
            sfx(m, SFX_THROW);
        }
    }

    // Séisme d'Oural : touche tout adversaire au sol à portée large.
    if (sp.type == SP_QUAKE && f.action_frame == sp.startup && !f.hit_confirmed) {
        m.shake = 10;
        spawn_particles(m, f.x + f.facing * 28, 202, Rgb{245, 158, 11}, 18, 3.5f, 3);
        if (std::fabs(f.x - opp.x) <= 88.0f && opp.y >= -4 && opp.invuln <= 0) {
            f.hit_confirmed = true;
            resolve_strike(m, f, opp, sp.damage, sp.chip, 1, true, nullptr);
        }
    }

    // Freinage après la phase active des charges.
    if ((sp.type == SP_DASH_STRIKE || sp.type == SP_OVERHEAD) &&
        f.action_frame > sp.startup + sp.active) {
        f.vx *= 0.65f;
    }
}

static void normal_throw(Match& m, Fighter& atk, Fighter& dfn) {
    start_action(atk, A_THROW, 26);
    atk.vx = 0;
    atk.hit_confirmed = true;
    const int dmg = (int)std::lround(92.0f * (def(atk.id).power / 62.0f));
    apply_damage(m, atk, dfn, dmg, true, true, BN_THROW);
    sfx(m, SFX_THROW);
}

static bool try_finisher(Match& m, Fighter& winner, Fighter& loser, const Input& in) {
    if (m.phase != PH_FINISH_HIM || loser.action != A_DIZZY) return false;

    const bool pressed = in.jp_special || (in.jp_a && in.b) || (in.jp_b && in.a);
    if (!pressed) return false;

    const FighterDef& d = def(winner.id);
    const float dist = std::fabs(winner.x - loser.x);
    if (d.finisher.range == RANGE_CLOSE && dist > 62.0f)  return false;
    if (d.finisher.range == RANGE_MID   && dist > 145.0f) return false;

    m.phase = PH_FINISHER_ANIM;
    m.phase_timer = 115;
    m.dark_flash = 115;
    m.shake = 14;
    m.finisher_done = d.finisher.honorable ? FIN_HONOR : FIN_FATALITY;

    start_action(winner, A_FINISHER, 110);
    winner.vx = 0;
    start_action(loser, A_FINISHER_VICTIM, 110);
    loser.vx = 0;
    loser.hp = 0;

    banner(m, d.finisher.honorable ? BN_HONOR : BN_FATALITY, winner.id, 115);
    sfx(m, SFX_FINISHER);
    spawn_particles(m, loser.x, 176 + loser.y, d.accent, 28, 4.8f, 4);
    return true;
}

// -----------------------------------------------------------------------------
// Mise à jour d'un combattant
// -----------------------------------------------------------------------------
static void update_fighter(Match& m, Fighter& f, Fighter& opp, const Input& in) {
    const FighterDef& d = def(f.id);
    record_direction(f, in, m.frame);
    if (!is_special(f.action)) f.power = 0;

    if (f.invuln > 0) f.invuln--;
    if (f.ai_cooldown > 0) f.ai_cooldown--;
    if (f.combo_timer > 0) {
        f.combo_timer--;
        if (f.combo_timer == 0) f.combo_count = 0;
    }

    // Barre de vie rouge résiduelle.
    if (f.display_hp > f.hp) f.display_hp = std::fmax((float)f.hp, f.display_hp - 3.2f);
    else                     f.display_hp = f.hp;

    // Habitudes de P1 (lues par l'IA adaptative).
    if (f.slot == 1 && m.phase == PH_FIGHT) {
        if (f.action == A_BLOCK_HIGH || f.action == A_BLOCK_LOW)
            m.habits.blocking = (int16_t)imin(200, m.habits.blocking + 2);
        else if (m.habits.blocking > 0)
            m.habits.blocking--;
        if (std::fabs(f.x - opp.x) < 55.0f) m.habits.close++;
    }

    // Orientation automatique au sol dans les états neutres.
    if (f.y >= 0 &&
        (f.action == A_IDLE || f.action == A_WALK_FWD || f.action == A_WALK_BACK ||
         f.action == A_CROUCH || f.action == A_DIZZY)) {
        if (opp.x > f.x + 2)      f.facing = 1;
        else if (opp.x < f.x - 2) f.facing = -1;
    }

    // Intro et animations de fin : aucun contrôle.
    if (m.phase != PH_FIGHT && m.phase != PH_FINISH_HIM) {
        f.action_frame++;
        apply_physics(f);
        return;
    }

    // « ACHEVEZ-LE ! » : le vainqueur peut lancer son coup fatal.
    if (m.phase == PH_FINISH_HIM && opp.action == A_DIZZY) {
        if (try_finisher(m, f, opp, in)) return;
    }

    if (f.action == A_DIZZY) {
        f.vx = 0;
        f.action_frame++;
        apply_physics(f);
        return;
    }

    f.action_frame++;

    // Demande de puissance : EX = C maintenu avec A ou B (50 Ki) ; SUPER = bas + C (100 Ki).
    const bool ex_req    = in.special && (in.a || in.b) && f.ki >= KI_EX_COST;
    const bool super_req = in.down && in.jp_special && f.ki >= KI_SUPER_COST && m.phase == PH_FIGHT;

    // Annulation d'un normal qui a touché par un spécial (« 2-in-1 cancel »), et « Ki Cancel » :
    // un EX peut annuler la fin d'un spécial qui a touché ou ete garde (50 Ki).
    const bool special_cancel =
        (f.action == A_LIGHT || f.action == A_HEAVY || f.action == A_UPPERCUT) &&
        f.hit_confirmed && f.y >= 0;
    const bool ki_cancel =
        is_special(f.action) && f.power < 2 && f.hit_confirmed && f.y >= 0 && ex_req &&
        f.action_frame > def(f.id).specials[f.action - A_SPECIAL_1].startup +
                         def(f.id).specials[f.action - A_SPECIAL_1].active;

    if (super_req && ((can_act(f) && f.y >= 0) || special_cancel)) {
        trigger_super(m, f);
        apply_physics(f);
        return;
    }
    if ((can_act(f) && f.y >= 0) || special_cancel || ki_cancel) {
        const int k = detect_special(f, in);
        if (k >= 0) {
            trigger_special(m, f, k, ex_req ? 1 : 0);
            apply_physics(f);
            return;
        }
    }

    // États verrouillés.
    if (!can_act(f)) {
        if (f.action == A_JUMP && f.y < -8) {
            if (in.jp_a) {
                f.hit_confirmed = false; sfx(m, SFX_WHIFF);
                f.action = A_LIGHT; f.action_frame = 0; f.action_total = 20;
            } else if (in.jp_b) {
                f.hit_confirmed = false; sfx(m, SFX_WHIFF);
                f.action = A_JUMP_ATTACK; f.action_frame = 0; f.action_total = 24;
            }
        }

        ongoing_special(m, f, opp);

        if (f.action != A_JUMP && f.action_frame >= f.action_total) {
            if (f.action == A_KNOCKDOWN) {
                start_action(f, A_WAKEUP, 14);
                f.invuln = 18;
            } else {
                start_action(f, f.y < 0 ? A_JUMP : A_IDLE, 1);
            }
        }
        apply_physics(f);
        return;
    }

    // --- Neutre au sol -------------------------------------------------------
    const bool fwd  = f.facing == 1 ? in.right : in.left;
    const bool back = f.facing == 1 ? in.left  : in.right;

    const bool both_just = (in.jp_a && in.b) || (in.jp_b && in.a);
    const bool evade_trigger = in.jp_special || both_just;

    if (evade_trigger && in.down) {
        sfx(m, SFX_WHIFF);
        if (back) { f.vx = -f.facing * 1.4f; start_action(f, A_EVADE_LOW, 18); }
        else      { f.vx =  f.facing * 0.8f; start_action(f, A_EVADE_HIGH, 17); }
        apply_physics(f);
        return;
    }

    // Double-tap arrière : esquive moyenne.
    const int hl = f.hist_len;
    if (hl >= 4 &&
        f.hist[hl - 1].frame == m.frame && f.hist[hl - 1].dir == D_B &&
        f.hist[hl - 2].dir == D_N && f.hist[hl - 3].dir == D_B &&
        m.frame - f.hist[hl - 3].frame <= 14) {
        sfx(m, SFX_WHIFF);
        f.vx = -f.facing * 2.2f;
        start_action(f, A_EVADE_MID, 16);
        apply_physics(f);
        return;
    }

    if (both_just && std::fabs(f.x - opp.x) <= 36.0f && opp.y >= -6 && opp.invuln <= 0) {
        normal_throw(m, f, opp);
        apply_physics(f);
        return;
    }

    // Coups normaux.
    const int rec_bonus = (int)std::lround((d.recovery - 55) * 0.08f);
    if (in.jp_a) {
        f.vx = 0; sfx(m, SFX_WHIFF);
        if (in.down) start_action(f, A_UPPERCUT, imax(14, 18 - rec_bonus));
        else         start_action(f, A_LIGHT,    imax(12, 15 - rec_bonus));
        apply_physics(f);
        return;
    }
    if (in.jp_b) {
        f.vx = 0; sfx(m, SFX_WHIFF);
        if (in.down) start_action(f, A_LOW_KICK, imax(19, 23 - rec_bonus));
        else         start_action(f, A_HEAVY,    imax(20, 24 - rec_bonus));
        apply_physics(f);
        return;
    }

    // Saut.
    if (in.up && f.y >= 0) {
        f.vy = d.jump_vel;
        f.vx = fwd ? d.walk_fwd * 1.12f * f.facing
                   : back ? -d.walk_back * 1.05f * f.facing : 0.0f;
        start_action(f, A_JUMP, 60);
        sfx(m, SFX_JUMP);
        if (f.slot == 1) m.habits.jumps++;
        apply_physics(f);
        return;
    }

    // Accroupi & marche.
    if (in.down)      { f.vx = 0;                         f.action = A_CROUCH; }
    else if (fwd)     { f.vx = d.walk_fwd * f.facing;     f.action = A_WALK_FWD; }
    else if (back)    { f.vx = -d.walk_back * f.facing;   f.action = A_WALK_BACK; }
    else              { f.vx = 0;                         f.action = A_IDLE; }

    apply_physics(f);
}

// -----------------------------------------------------------------------------
// Collisions de mêlée
// -----------------------------------------------------------------------------
static void check_melee(Match& m, Fighter& atk, Fighter& dfn, const Input& dfn_in) {
    if (atk.hit_confirmed || m.phase == PH_FINISHER_ANIM) return;

    const FighterDef& d = def(atk.id);
    const int reach_bonus = (int)std::lround((d.reach - 55) * 0.35f);

    int a0 = -1, a1 = -1, reach = 0, base = 0, chip = 0;
    int height = 0;                 // 0 MID, 1 LOW, 2 OVERHEAD
    bool knockdown = false;

    switch (atk.action) {
    case A_LIGHT:
        a0 = 4; a1 = 9; reach = 42 + reach_bonus; base = 46; chip = 0;
        height = atk.y < -6 ? 2 : 0;
        break;
    case A_UPPERCUT:
        a0 = 4; a1 = 10; reach = 40 + reach_bonus; base = 58; chip = 0;
        height = 0; knockdown = dfn.y < -8;
        break;
    case A_HEAVY:
        a0 = 7; a1 = 13; reach = 54 + reach_bonus; base = 82; chip = 4;
        height = atk.y < -6 ? 2 : 0;
        break;
    case A_JUMP_ATTACK:
        a0 = 4; a1 = 16; reach = 56 + reach_bonus; base = 84; chip = 4; height = 2;
        break;
    case A_LOW_KICK:
        a0 = 6; a1 = 12; reach = 52 + reach_bonus; base = 72; chip = 3;
        height = 1; knockdown = true;
        break;
    case A_SPECIAL_1: case A_SPECIAL_2: case A_SPECIAL_3: {
        if (atk.power == 2) return;                       // le SUPER gere sa propre frappe (ongoing_super)
        const SpecialDef sp = eff_special(atk, atk.action - A_SPECIAL_1);
        if (sp.type == SP_ANTI_AIR || sp.type == SP_DASH_STRIKE ||
            sp.type == SP_OVERHEAD || sp.type == SP_TELEPORT) {
            a0 = sp.startup; a1 = sp.startup + sp.active;
            reach = 52 + imax(0, reach_bonus);
            base = sp.damage; chip = sp.chip;
            height = sp.type == SP_OVERHEAD ? 2 : 0;
            knockdown = true;
        }
        break;
    }
    default: break;
    }

    if (a0 < 0 || atk.action_frame < a0 || atk.action_frame > a1) return;

    const float dx = (dfn.x - atk.x) * atk.facing;
    const float dy = std::fabs(dfn.y - atk.y);
    if (!(dx >= -8.0f && dx <= (float)reach && dy <= 42.0f)) return;

    atk.hit_confirmed = true;

    // Déjà en fenêtre « ACHEVEZ-LE ! » : un coup normal donne le K.O. final.
    if (m.phase == PH_FINISH_HIM && dfn.action == A_DIZZY) {
        dfn.hp = 0;
        trigger_standard_ko(m, atk, dfn);
        return;
    }
    resolve_strike(m, atk, dfn, base, chip, height, knockdown, &dfn_in);
}

static void update_projectiles(Match& m, const Input& p1_in, const Input& p2_in) {
    const float cam = camera_left_x(m.f[0].x, m.f[1].x);

    for (int i = 0; i < MAX_PROJ; ++i) {
        Projectile& p = m.proj[i];
        if (!p.alive) continue;

        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (p.x < cam - 36 || p.x > cam + ARENA_W + 36 || p.x < 0 || p.x > WORLD_W ||
            p.life >= p.max_life) {
            p.alive = false;
            continue;
        }

        // Choc projectile contre projectile adverse (parmi ceux deja traites).
        bool clashed = false;
        for (int j = 0; j < i; ++j) {
            Projectile& o = m.proj[j];
            if (o.alive && o.owner != p.owner &&
                std::fabs(o.x - p.x) < (o.w + p.w) * 0.6f) {
                spawn_particles(m, (p.x + o.x) * 0.5f, 195 + p.y, Rgb{255, 255, 255}, 14, 3.6f, 3);
                sfx(m, SFX_BLOCK);
                o.alive = false;
                p.alive = false;
                clashed = true;
                break;
            }
        }
        if (clashed) continue;

        Fighter& atk = p.owner == 1 ? m.f[0] : m.f[1];
        Fighter& dfn = p.owner == 1 ? m.f[1] : m.f[0];
        const Input& dfn_in = p.owner == 1 ? p2_in : p1_in;

        const bool hit_x = std::fabs(p.x - dfn.x) <= p.w * 0.5f + 14.0f;
        const bool hit_y = std::fabs(p.y - (dfn.y - 24.0f)) <= p.h * 0.5f + 22.0f;

        if (hit_x && hit_y && dfn.invuln <= 0 && dfn.action != A_KNOCKDOWN &&
            dfn.action != A_EVADE_HIGH && dfn.action != A_EVADE_MID) {

            if (m.phase == PH_FINISH_HIM && dfn.action == A_DIZZY) {
                dfn.hp = 0;
                trigger_standard_ko(m, atk, dfn);
                p.alive = false;
                continue;
            }

            if (p.pulls && !blocking_correctly(dfn, dfn_in, 0)) {
                // Harpon : « VIENS ICI ! » attire la cible devant Krowen.
                dfn.x = clampf(atk.x + atk.facing * 32.0f, MIN_X, MAX_X);
                start_action(dfn, A_HITSTUN, 28);
                dfn.hp = (int16_t)imax(0, dfn.hp - p.damage);
                banner(m, BN_PULL, atk.id, 38);
                sfx(m, SFX_HEAVY);
                spawn_particles(m, dfn.x, 176, Rgb{249, 115, 22}, 14, 3.4f, 3);
                check_round_finish(m, atk, dfn);
                p.alive = false;
                continue;
            }

            resolve_strike(m, atk, dfn, p.damage, p.chip, 0, false, &dfn_in);
            p.alive = false;
        }
    }
}

// -----------------------------------------------------------------------------
// Collisions physiques
// -----------------------------------------------------------------------------
static void pushbox(Fighter& a, Fighter& b) {
    const float min_sep = 25.0f;
    const float dx = b.x - a.x;
    const float adx = std::fabs(dx);
    const float dy = std::fabs(b.y - a.y);
    if (adx < min_sep && dy < 36.0f) {
        const float overlap = (min_sep - adx) * 0.5f + 0.5f;
        if (dx >= 0) { a.x = std::fmax(MIN_X, a.x - overlap); b.x = std::fmin(MAX_X, b.x + overlap); }
        else         { a.x = std::fmin(MAX_X, a.x + overlap); b.x = std::fmax(MIN_X, b.x - overlap); }
    }
}

static void camera_tether(Fighter& a, Fighter& b) {
    const float dx = b.x - a.x;
    const float adx = std::fabs(dx);
    if (adx > MAX_SEP) {
        const float excess = (adx - MAX_SEP) * 0.5f;
        if (dx >= 0) { a.x = std::fmin(MAX_X, a.x + excess); b.x = std::fmax(MIN_X, b.x - excess); }
        else         { a.x = std::fmax(MIN_X, a.x - excess); b.x = std::fmin(MAX_X, b.x + excess); }
    }
}

// -----------------------------------------------------------------------------
// Une image logique
// -----------------------------------------------------------------------------
static void round_won_by(Match& m, Fighter& winner, int victory_frames = 90) {
    m.wins[winner.slot - 1]++;
    m.winner_slot = winner.slot;
    start_action(winner, A_VICTORY, victory_frames);
    m.phase = PH_ROUND_END;
    sfx(m, SFX_VICTORY);
}

static void step_impl(Match& m, const Input& p1_in, const Input* p2_given, Difficulty diff) {
    m.frame++;

    if (m.shake > 0)       m.shake--;
    if (m.dark_flash > 0)  m.dark_flash--;
    if (m.banner_timer > 0) m.banner_timer--;

    // Particules : mises à jour même pendant le hitstop.
    {
        uint8_t n = 0;
        for (uint8_t i = 0; i < m.part_count; ++i) {
            Particle p = m.part[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.14f;
            p.life++;
            if (p.life < p.max_life) m.part[n++] = p;
        }
        m.part_count = n;
    }

    // Hitstop : gel d'impact.
    if (m.hitstop > 0) { m.hitstop--; return; }

    Fighter& P1 = m.f[0];
    Fighter& P2 = m.f[1];

    if (m.phase == PH_INTRO) {
        m.phase_timer--;
        if (m.phase_timer == 26) {
            banner(m, BN_FIGHT, 0, 34);
            sfx(m, SFX_BELL);
        }
        if (m.phase_timer <= 0) m.phase = PH_FIGHT;
        return;
    }

    if (m.phase == PH_FINISHER_ANIM) {
        m.phase_timer--;
        P1.action_frame++;
        P2.action_frame++;
        if (m.phase_timer % 12 == 0) {
            Fighter& loser  = P1.action == A_FINISHER_VICTIM ? P1 : P2;
            Fighter& winner = loser.slot == 1 ? P2 : P1;
            spawn_particles(m, loser.x + (rnd(m) - 0.5f) * 28.0f, 168 + (rnd(m) - 0.5f) * 26.0f,
                            def(winner.id).accent, 10, 3.5f, 3);
        }
        if (m.phase_timer <= 0) {
            Fighter& winner = P1.action == A_FINISHER ? P1 : P2;
            round_won_by(m, winner);
        }
        return;
    }

    if (m.phase == PH_KO_SLOWMO) {
        m.phase_timer--;
        if (m.frame % 2 == 0) {                         // ralenti : 1 image sur 2
            apply_physics(P1);
            apply_physics(P2);
            camera_tether(P1, P2);
        }
        if (m.phase_timer <= 0) {
            Fighter& winner = m.winner_slot == 1 ? P1 : P2;
            start_action(winner, A_VICTORY, 90);        // la victoire est déjà comptée au K.O.
            m.phase = PH_ROUND_END;
            sfx(m, SFX_VICTORY);
        }
        return;
    }

    if (m.phase == PH_ROUND_END) {
        P1.action_frame++;
        P2.action_frame++;
        return;
    }

    // Fenêtre « ACHEVEZ-LE ! » qui expire.
    if (m.phase == PH_FINISH_HIM) {
        m.phase_timer--;
        if (m.phase_timer <= 0) {
            Fighter& winner = P1.action == A_DIZZY ? P2 : P1;
            Fighter& loser  = winner.slot == 1 ? P2 : P1;
            trigger_standard_ko(m, winner, loser);
            return;
        }
    }

    // Chronomètre : au temps écoulé, victoire au pourcentage de vitalité (round_sec == 0 : illimité).
    if (m.phase == PH_FIGHT) {
        if (m.round_sec == 0) {
            // pas de limite de temps
        } else if (m.timer_frames > 0) {
            m.timer_frames--;
        } else {
            const float r1 = (float)P1.hp / P1.max_hp;
            const float r2 = (float)P2.hp / P2.max_hp;
            Fighter& winner = r1 >= r2 ? P1 : P2;
            round_won_by(m, winner);
            banner(m, BN_TIME, winner.id, 90);
            return;
        }
    }

    // Entrées de P2 : l'IA à personnalité.
    const Input p2_in = p2_given ? *p2_given : ai_decide(m, P2, P1, diff);

    update_fighter(m, P1, P2, p1_in);
    update_fighter(m, P2, P1, p2_in);

    pushbox(P1, P2);
    camera_tether(P1, P2);

    check_melee(m, P1, P2, p2_in);
    check_melee(m, P2, P1, p1_in);
    update_projectiles(m, p1_in, p2_in);
}

void step_match(Match& m, const Input& p1_in, Difficulty diff) {
    step_impl(m, p1_in, nullptr, diff);
}

void step_match_2p(Match& m, const Input& p1_in, const Input& p2_in) {
    step_impl(m, p1_in, &p2_in, DIFF_ARCADE);
}

} // namespace fight
