/*
  audit.cpp — Banc de mesure « agent critique » du moteur (PC uniquement, aucun materiel).
    sh test/run_audit.sh [frames|chain|bots|all]
  - frames : donnees d'images de chaque coup (demarrage, actif, avantage sur touche / garde)
  - chain  : enchainements d'un joueur qui matraque une touche (combos infinis ? degats maxi)
  - bots   : robots « betes » (balayage, saut, jab, boule, tortue) contre l'IA a chaque niveau
*/
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include "fight.h"
using namespace fight;

static const char* FN[] = {"Kenji", "Krowen", "MeiLin", "Titan", "Nyxia", "Malakor"};

static bool free_state(const Fighter& f) {
    return f.action == A_IDLE || f.action == A_WALK_FWD || f.action == A_WALK_BACK || f.action == A_CROUCH;
}

static void to_fight(Match& m, FighterId a, FighterId b, uint32_t seed = 1) {
    init_match(m, a, b, false, seed);
    m.f[0].dmg_scale = g_dmg_scale[2][a];
    m.f[1].dmg_scale = g_dmg_scale[2][b];
    Input none;
    for (int i = 0; i < 600 && m.phase != PH_FIGHT; ++i) step_match_2p(m, none, none);
}

// ------------------------------------------------------------------ frames
enum MoveKind { MV_LIGHT, MV_HEAVY, MV_UPPER, MV_LOWKICK, MV_SP0, MV_SP1, MV_SP2, MV_COUNT };
static const char* MVN[] = {"A (leger)", "B (lourd)", "bas+A", "bas+B", "special1", "special2", "special3"};

static Input move_input(FighterId id, int mv) {
    Input in;
    switch (mv) {
    case MV_LIGHT:   in.a = in.jp_a = true; break;
    case MV_HEAVY:   in.b = in.jp_b = true; break;
    case MV_UPPER:   in.down = in.a = in.jp_a = true; break;
    case MV_LOWKICK: in.down = in.b = in.jp_b = true; break;
    default: {
        const SpecialDef& sp = def(id).specials[mv - MV_SP0];
        in.special = in.jp_special = true;
        if (sp.shortcut == SC_UP) in.up = true;
        if (sp.shortcut == SC_BACK) in.left = true;      // P1 regarde a droite : « arriere » = gauche
        if (sp.shortcut == SC_FWD) in.right = true;
        break; }
    }
    return in;
}

struct FD { bool hit; int startup, total, adv; Action def_state; int dmg; };

// block : 0 = P2 inerte (prend le coup), 1 = P2 garde (arriere, + bas pour un coup bas).
static FD measure(FighterId a, FighterId b, int mv, float gap, bool block, bool crouch_block) {
    static Match m;
    to_fight(m, a, b, 5);
    m.f[0].x = 200; m.f[0].facing = 1; m.f[1].x = 200 + gap; m.f[1].facing = -1;
    m.f[0].ki = 0; m.f[1].ki = 0;
    Input p2;
    if (block) { p2.right = true; p2.down = crouch_block; }   // P2 regarde a gauche : arriere = droite
    FD r{false, 0, 0, 0, A_IDLE, 0};
    const int hp0 = m.f[1].hp;
    int t = 0, hit_t = -1, p1_free = -1, p2_free = -1;
    for (; t < 240; ++t) {
        Input p1;
        if (t == 0) p1 = move_input(a, mv);
        Action prev = m.f[1].action;
        step_match_2p(m, p1, p2);
        if (hit_t < 0) {
            const Action x = m.f[1].action;
            if (m.f[1].hp < hp0 || x == A_BLOCK_HIGH || x == A_BLOCK_LOW) { hit_t = t; r.hit = true; r.def_state = x; }
            (void)prev;
        }
        if (t > 0 && p1_free < 0 && free_state(m.f[0])) p1_free = t;
        if (hit_t >= 0 && t > hit_t && p2_free < 0 && free_state(m.f[1])) p2_free = t;
        if (hit_t >= 0 && p1_free >= 0 && p2_free >= 0) break;
        if (hit_t < 0 && p1_free >= 0 && t > 80) break;
    }
    r.dmg = hp0 - m.f[1].hp;
    r.startup = hit_t;                // image de la touche (inclut le demarrage)
    r.total = p1_free;
    r.adv = (p1_free >= 0 && p2_free >= 0) ? p2_free - p1_free : 0;
    return r;
}

static void do_frames() {
    std::printf("=== Donnees d'images (60 Hz) : t_touche = image du contact ; avantage = (attaquant libre) vs (defenseur libre) ===\n");
    std::printf("avantage > 0 : l'attaquant agit en premier ; sur GARDE un avantage < -8 signifie « puni par un normal »\n\n");
    for (int a = 0; a < 6; ++a) {
        std::printf("%s\n", FN[a]);
        for (int mv = 0; mv < MV_COUNT; ++mv) {
            const SpecialDef* sp = mv >= MV_SP0 ? &def((FighterId)a).specials[mv - MV_SP0] : nullptr;
            const bool proj = sp && (sp->type == SP_PROJECTILE || sp->type == SP_HARPOON || sp->type == SP_TRAP_ORB);
            const float gap = proj ? 130.0f : 34.0f;
            const bool low = mv == MV_LOWKICK;
            FD h = measure((FighterId)a, (FighterId)((a + 3) % 6), mv, gap, false, false);
            FD g = measure((FighterId)a, (FighterId)((a + 3) % 6), mv, gap, true, low);
            std::printf("  %-10s %-18s touche:%s t=%3d adv=%+3d dmg=%3d | garde:%s adv=%+3d | libre apres %3d\n",
                        MVN[mv], sp ? sp->name : "", h.hit ? "oui" : "NON", h.startup, h.adv, h.dmg,
                        g.hit ? "oui" : "NON", g.adv, h.total);
        }
    }
}

// ------------------------------------------------------------------ chain
static void do_chain() {
    std::printf("=== Enchainements : P1 matraque une touche, P2 inerte (aucune defense) ===\n");
    std::printf("%-8s %-10s %6s %6s %8s\n", "combatt.", "touche", "touches", "degats", "% de PV");
    for (int a = 0; a < 6; ++a) {
        const int moves[] = {MV_LIGHT, MV_HEAVY, MV_UPPER, MV_LOWKICK};
        for (int mi = 0; mi < 4; ++mi) {
            static Match m;
            to_fight(m, (FighterId)a, (FighterId)((a + 3) % 6), 9);
            m.f[0].x = 200; m.f[1].x = 236; m.f[0].facing = 1; m.f[1].facing = -1;
            m.f[1].hp = m.f[1].max_hp = 30000;       // pas de K.O. : on mesure la duree de l'enchainement
            m.f[0].ki = 0;
            const int hp0 = m.f[1].hp;
            int hits = 0, last_hp = hp0, tick = 0, since_hit = 0, best = 0, maxcombo = 0, combo_dmg = 0, best_dmg = 0, cur = 0, cur_dmg = 0;
            bool def_was_free = true; int last_hp2 = hp0;
            for (int t = 0; t < 60 * 10; ++t) {
                Input p1;
                // P1 suit P2 (marche) et ne frappe qu'a portee : mesure les VRAIS enchainements
                const bool close = m.f[1].x - m.f[0].x <= 36;
                if (free_state(m.f[0]) && close && (t & 1) == 0) p1 = move_input((FighterId)a, moves[mi]);
                else if (free_state(m.f[0]) && !close) p1.right = true;
                step_match_2p(m, p1, Input());
                if (m.f[1].hp < last_hp) { ++hits; last_hp = m.f[1].hp; since_hit = 0; tick = t; }
                else ++since_hit;
                // VRAI enchainement : le defenseur n'a pas ete libre entre deux touches
                if (m.f[1].hp < last_hp2) {
                    if (def_was_free) { cur = 1; cur_dmg = last_hp2 - m.f[1].hp; }
                    else { ++cur; cur_dmg += last_hp2 - m.f[1].hp; }
                    def_was_free = false; last_hp2 = m.f[1].hp;
                    if (cur > maxcombo) { maxcombo = cur; best_dmg = cur_dmg; }
                }
                if (free_state(m.f[1]) || m.f[1].action == A_WAKEUP) def_was_free = true;
                if (since_hit > 90) break;           // l'enchainement est termine
                if (hits > best) best = hits;
            }
            (void)tick;
            const int dmg = hp0 - m.f[1].hp;
            (void)combo_dmg; (void)best_dmg;
            std::printf("%-8s %-10s %6d %6d %7.0f%%   vrai combo maxi : %d touches, %.0f%% des PV\n", FN[a], MVN[moves[mi]], hits, dmg,
                        100.0 * dmg / def((FighterId)((a + 3) % 6)).max_hp, maxcombo, 100.0 * best_dmg / def((FighterId)((a + 3) % 6)).max_hp);
        }
    }
}

// ------------------------------------------------------------------ bots
struct Bot {
    int kind; int t = 0; bool pa = false;
};
enum { B_SWEEP, B_JUMP, B_JAB, B_BALL, B_TURTLE, B_THROW, B_COUNT };
static const char* BN[] = {"balayage", "saut+B", "jab", "boule", "tortue", "projection"};

static Input bot_decide(Bot& b, const Match& m) {
    const Fighter& me = m.f[0]; const Fighter& op = m.f[1];
    Input in;
    ++b.t;
    const float dist = std::fabs(op.x - me.x);
    const bool act = free_state(me);
    const bool pulse = (b.t & 1) == 0;
    switch (b.kind) {
    case B_SWEEP:
        if (!act) break;
        if (dist > 56) in.right = (op.x > me.x), in.left = !in.right;
        else if (pulse) { in.down = in.b = in.jp_b = true; }
        break;
    case B_JUMP:
        if (act && dist > 90) { in.up = true; in.right = op.x > me.x; in.left = !in.right; }
        else if (act && dist > 56) { in.right = op.x > me.x; in.left = !in.right; }
        else if (me.action == A_JUMP && me.y < -20 && pulse) { in.b = in.jp_b = true; }
        else if (act && pulse) { in.b = in.jp_b = true; }
        break;
    case B_JAB:
        if (!act) break;
        if (dist > 38) in.right = (op.x > me.x), in.left = !in.right;
        else if (pulse) { in.a = in.jp_a = true; }
        break;
    case B_BALL: {
        if (!act) break;
        const FighterDef& d = def(me.id);
        int k = -1;
        for (int i = 0; i < 3; ++i) if (d.specials[i].type == SP_PROJECTILE || d.specials[i].type == SP_HARPOON) { k = i; break; }
        if (k < 0) { if (dist > 40) in.right = op.x > me.x, in.left = !in.right; else if (pulse) in.a = in.jp_a = true; break; }
        if (dist < 120 && dist > 40 && (b.t % 70) == 0) {
            in.special = in.jp_special = true;
            const Shortcut sc = d.specials[k].shortcut;
            if (sc == SC_UP) in.up = true;
            if (sc == SC_BACK) in.left = me.facing == 1, in.right = me.facing != 1;
            if (sc == SC_FWD) in.right = me.facing == 1, in.left = me.facing != 1;
        } else if (dist > 130) in.right = op.x > me.x, in.left = !in.right;
        else if (dist < 40 && pulse) in.a = in.jp_a = true;
        break; }
    case B_TURTLE:
        in.down = true;
        if (me.facing == 1) in.left = true; else in.right = true;
        break;
    case B_THROW:
        if (!act) break;
        if (dist > 30) in.right = (op.x > me.x), in.left = !in.right;
        else if (pulse) { in.a = in.b = true; in.jp_a = true; }
        break;
    }
    return in;
}

// Renvoie 1 si le robot (P1) gagne le match, 0 si l'IA gagne, -1 sinon.
static int play_bot(int kind, FighterId bf, FighterId af, Difficulty diff, uint32_t seed, int* timeouts) {
    static Match m;
    init_match(m, bf, af, false, seed);
    m.f[0].dmg_scale = g_dmg_scale[2][bf];
    m.f[1].dmg_scale = g_dmg_scale[diff][af];
    Bot b; b.kind = kind;
    int end_hold = 0;
    for (int frames = 0; frames < 60 * 60 * 8; ++frames) {
        Input i1 = bot_decide(b, m);
        Input i2 = ai_decide(m, m.f[1], m.f[0], diff);
        step_match_2p(m, i1, i2);
        if (m.banner == BN_TIME && m.banner_timer == 94 && timeouts) ++*timeouts;
        if (m.phase == PH_ROUND_END && m.winner_slot) {
            if (++end_hold > 120) {
                end_hold = 0;
                if (m.wins[0] >= m.rounds_to_win) return 1;
                if (m.wins[1] >= m.rounds_to_win) return 0;
                start_next_round(m);
            }
        } else end_hold = 0;
    }
    return -1;
}

static void do_bots(int N) {
    std::printf("=== Robots betes (P1, coefficient Maitre) contre l'IA : taux de victoire du ROBOT, %d matchs/paire ===\n", N);
    std::printf("%-11s %8s %8s %8s\n", "robot", "Novice", "Arcade", "Maitre");
    for (int k = 0; k < B_COUNT; ++k) {
        double r[3]; int to = 0;
        for (int d = 0; d < 3; ++d) {
            int w = 0, n = 0;
            for (int a = 0; a < 6; ++a) for (int c = 0; c < 6; ++c) if (a != c)
                for (int s = 0; s < N; ++s) {
                    int x = play_bot(k, (FighterId)a, (FighterId)c, (Difficulty)d, 100 + s * 13 + a * 7 + c, d == 2 ? &to : nullptr);
                    if (x < 0) continue;
                    ++n; w += x;
                }
            r[d] = n ? 100.0 * w / n : 0;
        }
        std::printf("%-11s %7.0f%% %7.0f%% %7.0f%%   (manches au temps vs Maitre : %d)\n", BN[k], r[0], r[1], r[2], to);
    }
}

int main(int argc, char** argv) {
    const char* what = argc > 1 ? argv[1] : "all";
    const int N = argc > 2 ? std::atoi(argv[2]) : 3;
    const bool all = !std::strcmp(what, "all");
    if (all || !std::strcmp(what, "frames")) do_frames();
    if (all || !std::strcmp(what, "chain"))  { std::printf("\n"); do_chain(); }
    if (all || !std::strcmp(what, "bots"))   { std::printf("\n"); do_bots(N); }
    return 0;
}
