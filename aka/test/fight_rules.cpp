/*
  fight_rules.cpp — Tests du moteur de combat (PC, sans matériel).

  Compilation et lancement :
      g++ -std=c++17 -O2 -Wall -Wextra -Werror -I main/games/fight \
          test/fight_rules.cpp main/games/fight/fight_*.cpp -o fight_rules && ./fight_rules

  Deux familles de tests :
    1. des CAS PRECIS (mouvements, raccourcis, garde, chrono, déroulé d'une manche) ;
    2. une SIMULATION de masse : les 36 duels x 3 difficultés x plusieurs graines,
       IA contre IA, avec contrôle d'invariants (bornes, terminaison, déterminisme).
*/
#include "fight.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>

using namespace fight;

static int g_fail = 0, g_checks = 0;
#define CHECK(c) do { ++g_checks; if (!(c)) { ++g_fail; \
    std::printf("  ECHEC ligne %d : %s\n", __LINE__, #c); } } while (0)

static Input none() { return Input{}; }

// Les cas precis pilotent AUSSI P2 (mannequin immobile par defaut) : sinon l'IA
// de P2 se defendrait au hasard et rendrait les mesures dependantes de la graine.
static void st(Match& m, const Input& p1, const Input& p2 = Input{}) { step_match_2p(m, p1, p2); }

// Fait avancer l'intro jusqu'au combat.
static void to_fight(Match& m) {
    for (int i = 0; i < 200 && m.phase != PH_FIGHT; ++i) st(m, none());
}

// Place les deux combattants face à face a une distance donnée, IA neutralisée.
static void setup(Match& m, FighterId a, FighterId b, float dist) {
    init_match(m, a, b, false, 12345);
    to_fight(m);
    m.f[0].x = 300; m.f[1].x = 300 + dist;
}

// -----------------------------------------------------------------------------
static void test_ladder() {
    std::printf("[ladder]\n");
    for (int p = 0; p < FIGHTER_COUNT; ++p) {
        FighterId out[5];
        build_ladder((FighterId)p, out);
        bool dup = false, has_self = false;
        for (int i = 0; i < 5; ++i) {
            if (out[i] == p) has_self = true;
            for (int j = i + 1; j < 5; ++j) if (out[i] == out[j]) dup = true;
        }
        CHECK(!dup);
        CHECK(!has_self);
        CHECK(out[4] == (p == MALAKOR ? MEILIN : MALAKOR));
        if (p != MALAKOR && def((FighterId)p).rival != MALAKOR) CHECK(out[3] == def((FighterId)p).rival);
    }
}

static void test_shortcut_and_motions() {
    std::printf("[specials]\n");
    Match m;

    // Kenji, raccourci → + A+B  => Onde Céleste (SPECIAL_1), projectile au frame 11.
    setup(m, KENJI, MALAKOR, 200);
    { Input in; in.right = true; in.jp_special = true; in.special = true; st(m, in); }
    CHECK(m.f[0].action == A_SPECIAL_1);
    for (int i = 0; i < 14; ++i) st(m, none());
    bool proj = false;
    for (auto& p : m.proj) if (p.alive && p.owner == 1) proj = true;
    CHECK(proj);

    // Kenji, ↑ + A+B => Dragon Ascendant (SPECIAL_2) : impulsion verticale + invulnérabilité.
    setup(m, KENJI, MALAKOR, 200);
    { Input in; in.up = true; in.jp_special = true; in.special = true; st(m, in); }
    CHECK(m.f[0].action == A_SPECIAL_2);
    CHECK(m.f[0].vy < 0);
    CHECK(m.f[0].invuln > 0);

    // Kenji, quart de cercle avant ↓ ↘ → puis A => Onde Céleste.
    setup(m, KENJI, MALAKOR, 200);
    { Input in; in.down = true; st(m, in); }
    { Input in; in.down = true; in.right = true; st(m, in); }
    { Input in; in.right = true; st(m, in); }
    { Input in; in.right = true; in.a = true; in.jp_a = true; st(m, in); }
    CHECK(m.f[0].action == A_SPECIAL_1);

    // Kenji, Dragon Punch → ↓ ↘ puis A => Dragon Ascendant.
    setup(m, KENJI, MALAKOR, 200);
    { Input in; in.right = true; st(m, in); }
    { Input in; in.down = true; st(m, in); }
    { Input in; in.down = true; in.right = true; st(m, in); }
    { Input in; in.right = true; in.a = true; in.jp_a = true; st(m, in); }
    CHECK(m.f[0].action == A_SPECIAL_2);

    // Titan, demi-cercle ← ↓ → puis A => Brise-Vertèbres (prise imblocable, au corps-à-corps).
    setup(m, TITAN, KENJI, 40);
    const int hp0 = m.f[1].hp;
    { Input in; in.left = true; st(m, in); }
    { Input in; in.down = true; st(m, in); }
    { Input in; in.right = true; st(m, in); }
    { Input in; in.right = true; in.a = true; in.jp_a = true; st(m, in); }
    CHECK(m.f[0].action == A_SPECIAL_1);
    for (int i = 0; i < 12; ++i) st(m, none());
    CHECK(m.f[1].hp < hp0 - 100);     // 148 de base, mis à l'échelle
}

static void test_blocking_and_chip() {
    std::printf("[garde]\n");
    Match m;

    // Coup lourd contre un mannequin immobile : il touche.
    setup(m, KENJI, KENJI, 40);
    const int hp0 = m.f[1].hp;
    { Input in; in.b = true; in.jp_b = true; st(m, in); }
    for (int i = 0; i < 20; ++i) st(m, none());
    CHECK(m.f[1].hp < hp0);

    // Le défenseur (P2 regarde à gauche) maintient « arrière » = droite : il pare.
    // Coup lourd = 4 de gratte seulement, jamais de vrai dégât.
    setup(m, KENJI, KENJI, 40);
    Input back; back.right = true;
    { Input in; in.b = true; in.jp_b = true; st(m, in, back); }
    for (int i = 0; i < 20; ++i) st(m, none(), back);
    CHECK(m.f[1].hp == hp0 - 4);

    // Balayette (coup BAS) : la garde HAUTE ne suffit pas, il faut être accroupi.
    setup(m, KENJI, KENJI, 40);
    { Input in; in.down = true; in.b = true; in.jp_b = true; st(m, in, back); }
    for (int i = 0; i < 24; ++i) st(m, none(), back);
    CHECK(m.f[1].hp < hp0 - 4);
    // ... et accroupi + arrière, elle est parée.
    setup(m, KENJI, KENJI, 40);
    Input crouch_back; crouch_back.right = true; crouch_back.down = true;
    { Input in; in.down = true; in.b = true; in.jp_b = true; st(m, in, crouch_back); }
    for (int i = 0; i < 24; ++i) st(m, none(), crouch_back);
    CHECK(m.f[1].hp == hp0 - 3);

    // La gratte ne tue pas : plancher à 1 PV même sur un coup lourd paré.
    setup(m, KENJI, KENJI, 40);
    m.f[1].hp = 2;
    { Input in; in.b = true; in.jp_b = true; st(m, in, back); }
    for (int i = 0; i < 20; ++i) st(m, none(), back);
    CHECK(m.f[1].hp == 1);
    CHECK(m.phase == PH_FIGHT);

    // Esquive haute (↓ + C) : le coup lourd passe au-dessus.
    setup(m, KENJI, KENJI, 40);
    { Input in; in.b = true; in.jp_b = true; Input ev; ev.down = true; ev.jp_special = true; ev.special = true;
      // le mannequin lance son esquive une image avant le coup
      st(m, none(), ev); st(m, in, none()); }
    for (int i = 0; i < 16; ++i) st(m, none());
    CHECK(m.f[1].hp == hp0);
}

static void test_timeout() {
    std::printf("[chrono]\n");
    Match m;
    setup(m, KENJI, TITAN, 300);
    m.f[0].hp = 900;              // 90 %
    m.f[1].hp = 500;              // ~42 %
    m.timer_frames = 1;
    for (int i = 0; i < 5; ++i) st(m, none());
    CHECK(m.phase == PH_ROUND_END);
    CHECK(m.winner_slot == 1);
    CHECK(m.wins[0] == 1);
}

static void test_round_flow() {
    std::printf("[manche]\n");
    Match m;
    setup(m, KENJI, MALAKOR, 40);

    // 1re manche : K.O. de P2 -> victoire de P1, pas de « achevez-le » (1re victoire).
    m.f[1].hp = 1;
    { Input in; in.a = true; in.jp_a = true; st(m, in); }
    for (int i = 0; i < 40 && m.phase == PH_FIGHT; ++i) st(m, none());
    CHECK(m.phase == PH_KO_SLOWMO);
    CHECK(m.wins[0] == 1);

    for (int i = 0; i < 400 && m.phase != PH_ROUND_END; ++i) st(m, none());
    CHECK(m.phase == PH_ROUND_END);

    // 2e manche : le coup qui tue déclenche la fenêtre « ACHEVEZ-LE ! ».
    start_next_round(m);
    CHECK(m.round == 2);
    to_fight(m);
    m.f[0].x = 300; m.f[1].x = 340;
    m.f[1].hp = 1;
    { Input in; in.a = true; in.jp_a = true; st(m, in); }
    for (int i = 0; i < 40 && m.phase == PH_FIGHT; ++i) st(m, none());
    CHECK(m.phase == PH_FINISH_HIM);
    CHECK(m.f[1].action == A_DIZZY);
    CHECK(m.f[1].hp == 1);

    // Coup fatal : touche C (jp_special) à portée. Le gel d'impact (hitstop) du coup
    // précédent avale les images de entrée : on le laisse passer.
    for (int i = 0; i < 12; ++i) st(m, none());
    { Input in; in.down = true; in.jp_special = true; in.special = true; st(m, in); }
    CHECK(m.phase == PH_FINISHER_ANIM);
    CHECK(m.finisher_done == FIN_HONOR);        // Kenji : sceau honorable
    for (int i = 0; i < 200 && m.phase != PH_ROUND_END; ++i) st(m, none());
    CHECK(m.phase == PH_ROUND_END);
    CHECK(m.wins[0] == 2);
}

// -----------------------------------------------------------------------------
// Simulation de masse
// -----------------------------------------------------------------------------
struct Cover { uint32_t sfx = 0; int finishers = 0, timeouts = 0, rounds = 0, grabs = 0; };

static bool sane(const Match& m) {
    for (const Fighter& f : m.f) {
        if (!(f.x >= MIN_X - 0.01f && f.x <= MAX_X + 0.01f)) return false;
        if (std::isnan(f.x) || std::isnan(f.y) || std::isnan(f.vx) || std::isnan(f.vy)) return false;
        if (f.hp < 0 || f.hp > f.max_hp) return false;
        if (f.y > 0.001f) return false;                 // jamais sous le sol
    }
    if (m.part_count > MAX_PART) return false;
    if (m.wins[0] > ROUNDS_TO_WIN || m.wins[1] > ROUNDS_TO_WIN) return false;
    if (std::fabs(m.f[0].x - m.f[1].x) > MAX_SEP + 1.0f) return false;
    return true;
}

// Joue un match complet, IA contre IA. Renvoie le nombre d'images, -1 si invalide.
static long play(FighterId a, FighterId b, Difficulty diff, uint32_t seed, bool boss, Cover& cov,
                 int& winner) {
    Match m;
    init_match(m, a, b, boss, seed);
    long frames = 0;
    const long LIMIT = 3L * (ROUND_SEC * 60 + 2000) + 4000;

    for (;;) {
        // P1 est piloté par la même IA (symétrique) : on évalue sur le combattant P1.
        const Input p1 = ai_decide(m, m.f[0], m.f[1], diff);
        step_match(m, p1, diff);
        cov.sfx |= m.sfx;
        if (m.phase == PH_ROUND_END && m.winner_slot) {
            ++cov.rounds;
            if (m.banner == BN_TIME) ++cov.timeouts;
            if (m.finisher_done != FIN_NONE) ++cov.finishers;
            if (m.wins[0] >= ROUNDS_TO_WIN || m.wins[1] >= ROUNDS_TO_WIN) {
                winner = m.wins[0] >= ROUNDS_TO_WIN ? 1 : 2;
                return frames;
            }
            // Laisse la victoire s'afficher un instant puis manche suivante.
            for (int i = 0; i < 100; ++i) step_match(m, none(), diff);
            start_next_round(m);
        }
        if (!sane(m)) { std::printf("  etat invalide a l'image %ld (%s vs %s)\n", frames,
                                    def(a).short_name, def(b).short_name); return -1; }
        if (++frames > LIMIT) { std::printf("  non termine (%s vs %s, graine %u)\n",
                                            def(a).short_name, def(b).short_name, seed); return -1; }
    }
}

static void test_mass_simulation() {
    std::printf("[simulation de masse]\n");
    Cover cov;
    int p1_wins = 0, p2_wins = 0, matches = 0;
    long total_frames = 0, max_frames = 0;

    for (int a = 0; a < FIGHTER_COUNT; ++a)
    for (int b = 0; b < FIGHTER_COUNT; ++b)
    for (int d = 0; d < 3; ++d)
    for (uint32_t seed = 1; seed <= 6; ++seed) {
        int w = 0;
        const long f = play((FighterId)a, (FighterId)b, (Difficulty)d, seed * 7919u + a * 31u + b,
                            false, cov, w);
        CHECK(f >= 0);
        if (f < 0) continue;
        ++matches; total_frames += f; if (f > max_frames) max_frames = f;
        (w == 1 ? p1_wins : p2_wins)++;
    }
    std::printf("  %d matchs, moyenne %ld images (%.1f s), maxi %ld, victoires P1/P2 : %d/%d\n",
                matches, total_frames / (matches ? matches : 1),
                total_frames / (matches ? matches : 1) / 60.0, max_frames, p1_wins, p2_wins);
    std::printf("  manches : %d, coups fatals : %d, temps écoulés : %d\n",
                cov.rounds, cov.finishers, cov.timeouts);

    // Couverture : les principaux événements doivent s'être produits au moins une fois.
    CHECK(cov.sfx & SFX_LIGHT);
    CHECK(cov.sfx & SFX_HEAVY);
    CHECK(cov.sfx & SFX_BLOCK);
    CHECK(cov.sfx & SFX_SPECIAL);
    CHECK(cov.sfx & SFX_KO);
    CHECK(cov.sfx & SFX_JUMP);
    CHECK(cov.sfx & SFX_TELEPORT);
    CHECK(cov.sfx & SFX_THROW);
    CHECK(cov.finishers > 0);
}

static void test_determinism() {
    std::printf("[determinisme]\n");
    Cover c1, c2;
    int w1 = 0, w2 = 0;
    const long f1 = play(MEILIN, TITAN, DIFF_MASTER, 777, false, c1, w1);
    const long f2 = play(MEILIN, TITAN, DIFF_MASTER, 777, false, c2, w2);
    CHECK(f1 == f2 && f1 > 0);
    CHECK(w1 == w2);
    CHECK(c1.rounds == c2.rounds);
}

static void test_boss_boost() {
    std::printf("[boss]\n");
    Match m;
    init_match(m, KENJI, MALAKOR, true, 5);
    CHECK(m.f[1].max_hp == (int16_t)std::lround(def(MALAKOR).max_hp * 1.12f));
    CHECK(m.f[0].max_hp == def(KENJI).max_hp);
    CHECK(m.banner == BN_ROUND_BOSS);
}

static void test_options_and_physics() {
    std::printf("[options + coherence physique]\n");
    // Manches a gagner : 1 -> un seul KO decide du match, 3 -> la fenetre ACHEVEZ-LE n'apparait qu'a la 3e.
    for (int rtw = 1; rtw <= 3; ++rtw) {
        Match m; MatchRules r; r.rounds_to_win = (uint8_t)rtw;
        init_match(m, KENJI, TITAN, false, 7, r);
        to_fight(m);
        m.f[0].x = 300; m.f[1].x = 330;
        CHECK(m.rounds_to_win == rtw);
        m.wins[0] = (uint8_t)(rtw - 1);                 // un round de la victoire
        m.f[1].hp = 1;
        Input p1; p1.right = false; p1.jp_a = true; p1.a = true;
        for (int i = 0; i < 40 && m.phase == PH_FIGHT; ++i) { st(m, p1); p1.jp_a = false; }
        CHECK(m.phase == PH_FINISH_HIM || m.phase == PH_ROUND_END || m.phase == PH_KO_SLOWMO);
        if (rtw > 1) CHECK(m.wins[0] <= rtw);
    }
    // Duree : 30 s -> 1800 images ; 0 -> illimitee (le chrono ne descend jamais, pas de fin aux points).
    { Match m; MatchRules r; r.round_sec = 30; init_match(m, KENJI, TITAN, false, 3, r);
      CHECK(m.timer_frames == 30 * 60); }
    { Match m; MatchRules r; r.round_sec = 0; init_match(m, KENJI, TITAN, false, 3, r);
      to_fight(m); m.f[0].x = 120; m.f[1].x = 520;
      const int t0 = m.timer_frames;
      for (int i = 0; i < 3000; ++i) st(m, none());
      CHECK(m.phase == PH_FIGHT);
      CHECK(m.timer_frames == t0); }
    // Marche : la distance cumulee suit exactement le deplacement (pilote le cycle de pas -> pas de glissement).
    { Match m; setup(m, KENJI, TITAN, 220);
      const float x0 = m.f[0].x;
      Input fw; fw.right = true;
      for (int i = 0; i < 40; ++i) st(m, fw);
      CHECK(m.f[0].walk_dist > 40.0f);
      CHECK(std::fabs(m.f[0].walk_dist - std::fabs(m.f[0].x - x0)) < 1.0f); }
    // Projectile : sort a hauteur de main (pas a la ceinture).
    { Match m; setup(m, KENJI, TITAN, 200);
      Input q; q.down = true; st(m, q); st(m, q);
      Input f; f.down = true; f.right = true; st(m, f);
      Input go; go.right = true; go.a = true; go.b = true; go.special = true; go.jp_a = go.jp_b = go.jp_special = true;
      for (int i = 0; i < 30; ++i) { st(m, go); go.jp_a = go.jp_b = go.jp_special = false; }
      bool seen = false;
      for (const Projectile& p : m.proj) if (p.alive) { seen = true; CHECK(p.y <= -36.0f && p.y >= -50.0f); }
      CHECK(seen); }
}

int main() {
    test_ladder();
    test_shortcut_and_motions();
    test_blocking_and_chip();
    test_timeout();
    test_options_and_physics();
    test_round_flow();
    test_boss_boost();
    test_determinism();
    test_mass_simulation();
    std::printf("\n%d verifications, %d echec(s)\n", g_checks, g_fail);
    return g_fail ? 1 : 0;
}
