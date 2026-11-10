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
    // Equilibrage : le joueur (P1) utilise la ligne Maitre ; set_ai_level change seulement le combattant de l'IA.
    { Match m; init_match(m, KENJI, TITAN, false, 5);
      CHECK(m.f[0].dmg_scale == g_dmg_scale[DIFF_MASTER][KENJI]);
      set_ai_level(m, DIFF_NOVICE);
      CHECK(m.f[1].dmg_scale == g_dmg_scale[DIFF_NOVICE][TITAN] * g_level_ai_mult[DIFF_NOVICE]);
      CHECK(m.f[0].dmg_scale == g_dmg_scale[DIFF_MASTER][KENJI] * g_level_human_mult[DIFF_NOVICE]);
      CHECK(g_level_ai_mult[DIFF_NOVICE] < 1.0f && g_level_human_mult[DIFF_NOVICE] > 1.0f);   // mode facile plus clement
      set_ai_level(m, DIFF_MASTER);
      CHECK(m.f[0].dmg_scale == g_dmg_scale[DIFF_MASTER][KENJI]);
      for (int l = 0; l < 3; ++l) for (int f = 0; f < FIGHTER_COUNT; ++f)
          CHECK(g_dmg_scale[l][f] >= 0.5f && g_dmg_scale[l][f] <= 1.7f); }
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


// Jauge de Ki : gains, EX (50), Ki Cancel, SUPER (100), conservation entre manches.
static void test_ground_rules() {
    std::printf("[regles au sol]\n");
    Match m;

    // Un adversaire a terre (chute) est intouchable en melee : pas de balayage en boucle.
    setup(m, KENJI, TITAN, 36);
    m.f[1].hp = m.f[1].max_hp = 3000;
    { Input in; in.down = in.b = in.jp_b = true; st(m, in); }
    for (int i = 0; i < 12 && m.f[1].action != A_KNOCKDOWN; ++i) st(m, none());
    CHECK(m.f[1].action == A_KNOCKDOWN);
    for (int i = 0; i < 6 && m.f[1].y < 0; ++i) st(m, none());      // atterrissage
    m.f[1].x = m.f[0].x + 30; m.f[1].y = 0; m.f[1].vx = 0; m.f[1].vy = 0;
    const int hp_down = m.f[1].hp;
    for (int i = 0; i < 40 && m.f[0].action != A_IDLE; ++i) st(m, none());
    { Input in; in.down = in.b = in.jp_b = true; st(m, in); }
    for (int i = 0; i < 14; ++i) { m.f[1].x = m.f[0].x + 30; st(m, none()); if (m.f[1].action != A_KNOCKDOWN) break; }
    CHECK(m.f[1].hp == hp_down || m.f[1].action != A_KNOCKDOWN);   // aucune touche tant qu'il est couche

    // Coup leger : l'adversaire recule d'une dizaine de pixels (friction), pas de glissade de 34 px.
    setup(m, KENJI, TITAN, 36);
    m.f[1].hp = m.f[1].max_hp = 3000;
    const float x0 = m.f[1].x;
    { Input in; in.a = in.jp_a = true; st(m, in); }
    for (int i = 0; i < 40; ++i) st(m, none());
    CHECK(m.f[1].hp < 3000);
    CHECK(m.f[1].x - x0 < 20.0f);

    // Balayage : 27 images au total (retombee de 4 images de plus qu'avant).
    setup(m, KENJI, TITAN, 300);
    { Input in; in.down = in.b = in.jp_b = true; st(m, in); }
    CHECK(m.f[0].action == A_LOW_KICK);
    CHECK(m.f[0].action_total >= 23);
}

static void test_parry_riposte() {
    std::printf("[parade punitive et riposte]\n");
    Match m;
    Input a; a.a = a.jp_a = true;

    // 4e coup identique d'affilee : parade (aucun degat, l'attaquant est etourdi, le parant a une riposte).
    setup(m, KENJI, TITAN, 36);
    m.f[1].hp = m.f[1].max_hp = 3000;
    m.f[0].rep_kind = 1; m.f[0].rep_count = REPEAT_LIMIT; m.f[0].rep_timer = 100;     // 3 jabs deja lances
    st(m, a);
    CHECK(m.f[0].spam);
    for (int i = 0; i < 12; ++i) st(m, none());
    CHECK(m.f[1].hp == 3000);
    CHECK(m.f[0].action == A_HITSTUN);
    CHECK(m.f[1].riposte > 0);
    CHECK(m.f[0].rep_count == 0 && !m.f[0].spam);

    // Seulement 3 coups identiques : aucun effet.
    setup(m, KENJI, TITAN, 36);
    m.f[1].hp = m.f[1].max_hp = 3000;
    m.f[0].rep_kind = 1; m.f[0].rep_count = REPEAT_LIMIT - 1; m.f[0].rep_timer = 100;
    st(m, a);
    CHECK(!m.f[0].spam);
    for (int i = 0; i < 12; ++i) st(m, none());
    CHECK(m.f[1].hp < 3000);

    // Un autre coup repart de 1 : pas de parade.
    setup(m, KENJI, TITAN, 36);
    m.f[1].hp = m.f[1].max_hp = 3000;
    m.f[0].rep_kind = 1; m.f[0].rep_count = 5; m.f[0].rep_timer = 100;
    { Input b; b.b = b.jp_b = true; st(m, b); }
    CHECK(!m.f[0].spam && m.f[0].rep_count == 1 && m.f[0].rep_kind == 2);
    for (int i = 0; i < 16; ++i) st(m, none());
    CHECK(m.f[1].hp < 3000);

    // La serie est oubliee apres REPEAT_WINDOW images.
    setup(m, KENJI, TITAN, 300);
    st(m, a);
    CHECK(m.f[0].rep_count == 1);
    for (int i = 0; i < REPEAT_WINDOW + 5; ++i) st(m, none());
    CHECK(m.f[0].rep_count == 0);

    // Un adversaire deja en garde est pare aussi (le jab sur garde n'est plus une pression gratuite).
    setup(m, KENJI, TITAN, 28);
    m.f[1].hp = m.f[1].max_hp = 3000;
    m.f[0].rep_kind = 1; m.f[0].rep_count = REPEAT_LIMIT; m.f[0].rep_timer = 100;
    { Input g; g.right = true; st(m, a, g);                           // P2 garde (arriere = droite)
      bool stunned = false;
      for (int i = 0; i < 30; ++i) { st(m, none(), g); if (m.f[0].action == A_HITSTUN) stunned = true; }
      CHECK(stunned);
      CHECK(m.f[1].hp == 3000); }

    // Garde : BLOCKSTUN images, puis riposte.
    setup(m, KENJI, TITAN, 28);
    m.f[1].hp = m.f[1].max_hp = 3000;
    { Input g; g.right = true;
      st(m, a, g);
      for (int i = 0; i < 12 && m.f[1].action != A_BLOCK_HIGH; ++i) st(m, none(), g);
      CHECK(m.f[1].action == A_BLOCK_HIGH);
      CHECK(m.f[1].action_total == BLOCKSTUN);
      CHECK(m.f[1].riposte > 0 && m.f[1].riposte <= RIPOSTE_FRAMES); }

    // Meme coup avec et sans riposte : rapport des degats ~ RIPOSTE_BONUS.
    int dmg[2] = {0, 0};
    for (int variant = 0; variant < 2; ++variant) {
        setup(m, TITAN, KENJI, 36);
        m.f[1].hp = m.f[1].max_hp = 3000;
        m.f[0].dmg_scale = 1.0f;
        m.f[0].riposte = variant == 0 ? 25 : 0;
        Input hv; hv.b = hv.jp_b = true; st(m, hv);
        for (int i = 0; i < 20; ++i) st(m, none());
        dmg[variant] = 3000 - m.f[1].hp;
    }
    CHECK(dmg[1] > 0);
    CHECK(dmg[0] > dmg[1]);
    CHECK(std::fabs((float)dmg[0] / (float)dmg[1] - RIPOSTE_BONUS) < 0.08f);
}

static void test_input_buffer() {
    std::printf("[tampon d'entree]\n");
    Match m;

    // Sans tampon, un A presse 3 images avant la fin d'un coup leger serait perdu : ici il part des que possible.
    setup(m, KENJI, TITAN, 200);
    { Input in; in.a = in.jp_a = true; st(m, in); }
    CHECK(m.f[0].action == A_LIGHT);
    int guard = 0;
    while (m.f[0].action == A_LIGHT && m.f[0].action_total - m.f[0].action_frame > 3 && ++guard < 100) st(m, none());
    CHECK(m.f[0].action == A_LIGHT);
    { Input in; in.a = in.jp_a = true; st(m, in); }                 // presse trop tot (encore ~2 images de fin)
    for (int i = 0; i < 4; ++i) { st(m, none()); }
    CHECK(m.f[0].action == A_LIGHT && m.f[0].action_frame <= 4);     // 2e coup lance sans nouvelle pression

    // Une pression trop ancienne (> INPUT_BUFFER images avant la fin) est oubliee.
    setup(m, KENJI, TITAN, 200);
    { Input in; in.a = in.jp_a = true; st(m, in); }
    st(m, none());
    { Input in; in.a = in.jp_a = true; st(m, in); }                 // tout debut du 1er coup : trop tot
    for (int i = 0; i < 40; ++i) st(m, none());
    CHECK(m.f[0].action == A_IDLE);

    // Le tampon ne declenche jamais deux coups pour une seule pression.
    setup(m, KENJI, TITAN, 200);
    { Input in; in.a = in.jp_a = true; st(m, in); }
    int starts = 0; Action prev = m.f[0].action;
    for (int i = 0; i < 80; ++i) { st(m, none()); if (m.f[0].action == A_LIGHT && prev != A_LIGHT) ++starts; prev = m.f[0].action; }
    CHECK(starts == 0);
}

static void test_ki() {
    std::printf("[ki]\n");
    Match m;

    // Gains : frapper +14, encaisser +8.
    setup(m, TITAN, KENJI, 40);
    { Input in; in.jp_b = true; in.b = true; st(m, in); }
    for (int i = 0; i < 20; ++i) st(m, none());
    CHECK(m.f[0].ki == 14);
    CHECK(m.f[1].ki == 8);

    // Lancer un special NORMAL ne coute et ne rapporte rien.
    setup(m, KENJI, MALAKOR, 200);
    m.f[0].ki = 70;
    { Input in; in.right = true; in.jp_special = true; in.special = true; st(m, in); }
    CHECK(m.f[0].action == A_SPECIAL_1);
    CHECK(m.f[0].power == 0);
    CHECK(m.f[0].ki == 70);

    // EX : C maintenu + A => coute 50, power 1, projectile plus fort que le normal.
    int dmg_normal = 0, dmg_ex = 0;
    for (int pass = 0; pass < 2; ++pass) {
        setup(m, KENJI, MALAKOR, 200);
        m.f[0].ki = pass ? 80 : 0;
        Input in; in.right = true; in.jp_special = true; in.special = true; in.a = pass == 1;
        st(m, in);
        CHECK(m.f[0].action == A_SPECIAL_1);
        CHECK(m.f[0].power == (pass ? 1 : 0));
        if (pass) { CHECK(m.f[0].ki == 30); CHECK(m.f[0].invuln > 0); }
        int d = 0;
        for (int i = 0; i < 14; ++i) { st(m, none()); for (auto& p : m.proj) if (p.alive && p.owner == 1) d = p.damage; }
        (pass ? dmg_ex : dmg_normal) = d;
    }
    CHECK(dmg_normal > 0);
    CHECK(dmg_ex >= dmg_normal * 13 / 10);

    // EX sans assez de Ki : special NORMAL.
    setup(m, KENJI, MALAKOR, 200);
    m.f[0].ki = 49;
    { Input in; in.right = true; in.jp_special = true; in.special = true; in.a = true; st(m, in); }
    CHECK(m.f[0].power == 0);
    CHECK(m.f[0].ki == 49);

    // SUPER : bas + C a 100 Ki => vide la jauge, frappe imblocable (meme garde tenue), gros degats.
    setup(m, KENJI, MALAKOR, 70);
    m.f[0].ki = 100;
    const int hp0 = m.f[1].hp;
    { Input in; in.down = true; in.jp_special = true; in.special = true; st(m, in); }
    CHECK(m.f[0].power == 2);
    CHECK(m.f[0].ki == 0);
    CHECK(m.banner == BN_SUPER);
    Input guard; guard.left = false; guard.right = true;     // P2 regarde a gauche : "right" = garde arriere
    for (int i = 0; i < SUPER_STARTUP + SUPER_ACTIVE + 4; ++i) st(m, none(), guard);
    CHECK(m.f[1].hp < hp0 - 150);
    CHECK(m.f[1].action == A_KNOCKDOWN || m.f[1].action == A_DEFEAT || m.phase != PH_FIGHT);

    // SUPER refuse sous 100 Ki.
    setup(m, KENJI, MALAKOR, 70);
    m.f[0].ki = 99;
    { Input in; in.down = true; in.jp_special = true; in.special = true; st(m, in); }
    CHECK(m.f[0].power == 0);
    CHECK(m.f[0].ki == 99);

    // Ki Cancel : un normal qui touche, puis EX => special enchaine (50 Ki).
    setup(m, KENJI, MALAKOR, 40);
    m.f[0].ki = 60;
    { Input in; in.jp_b = true; in.b = true; st(m, in); }
    for (int i = 0; i < 14; ++i) st(m, none());
    CHECK(m.f[0].ki >= 74);

    // Le Ki est conserve a la manche suivante.
    setup(m, KENJI, MALAKOR, 60);
    m.f[0].ki = 77; m.f[1].ki = 33;
    m.f[1].hp = 0;
    start_next_round(m);
    CHECK(m.f[0].ki == 77);
    CHECK(m.f[1].ki == 33);
}


// -----------------------------------------------------------------------------
// Niveaux sur TOUT le match, aide aux debutants, zone de clemence
// -----------------------------------------------------------------------------
static void test_level_and_assist() {
    std::printf("[niveaux, aide aux debutants, clemence]\n");
    // Les coefficients de niveau survivent au changement de manche (bug trouve en recette : ils etaient perdus des la manche 2).
    for (int d = 0; d < 3; ++d) {
        Match m; init_match(m, KENJI, TITAN, false, 9);
        set_ai_level(m, (Difficulty)d);
        const float a = m.f[1].dmg_scale, h = m.f[0].dmg_scale;
        m.winner_slot = 1; start_next_round(m);                 // le joueur gagne la manche 1
        CHECK(m.f[1].dmg_scale == a && m.f[0].dmg_scale == h);
        m.winner_slot = 1; start_next_round(m);
        CHECK(m.f[1].dmg_scale == a && m.f[0].dmg_scale == h);
    }
    // Hors set_ai_level (IA contre IA, reseau) : les coefficients posees a la main sont conserves aussi.
    { Match m; init_match(m, KENJI, TITAN, false, 9);
      m.f[0].dmg_scale = 1.234f; m.f[1].dmg_scale = 0.777f;
      m.winner_slot = 2; start_next_round(m);
      CHECK(m.f[0].dmg_scale == 1.234f && m.f[1].dmg_scale == 0.777f && m.assist == 0); }
    // Novice : chaque manche perdue adoucit la suivante, chaque manche gagnee reprend une partie de l'aide, plafonnee.
    { Match m; init_match(m, KENJI, TITAN, false, 9, MatchRules{3, 99});
      set_ai_level(m, DIFF_NOVICE);
      const float ai0 = m.f[1].dmg_scale, hu0 = m.f[0].dmg_scale;
      m.winner_slot = 2; start_next_round(m);
      CHECK(m.assist == 1 && m.f[1].dmg_scale < ai0 && m.f[0].dmg_scale > hu0);
      m.winner_slot = 2; start_next_round(m); m.winner_slot = 2; start_next_round(m); m.winner_slot = 2; start_next_round(m);
      CHECK(m.assist == ASSIST_MAX);
      CHECK(std::fabs(m.f[1].dmg_scale - ai0 * ASSIST_AI * ASSIST_AI * ASSIST_AI) < 1e-5f);
      m.winner_slot = 1; start_next_round(m);
      CHECK(m.assist == ASSIST_MAX - 1); }
    // Arcade : aide legere (2 paliers, plus faible qu'en Novice) ; Maitre : jamais d'aide, meme apres des defaites.
    { Match m; init_match(m, KENJI, TITAN, false, 9, MatchRules{3, 99});
      set_ai_level(m, DIFF_ARCADE);
      const float ai0 = m.f[1].dmg_scale;
      for (int i = 0; i < 4; ++i) { m.winner_slot = 2; start_next_round(m); }
      CHECK(m.assist == ASSIST_MAX_ARCADE);
      CHECK(std::fabs(m.f[1].dmg_scale - ai0 * ASSIST_AI_ARCADE * ASSIST_AI_ARCADE) < 1e-5f);
      CHECK(ASSIST_AI_ARCADE > ASSIST_AI && ASSIST_HUMAN_ARCADE < ASSIST_HUMAN); }
    { Match m; init_match(m, KENJI, TITAN, false, 9);
      set_ai_level(m, DIFF_MASTER, 3);
      CHECK(m.assist == 0);
      m.winner_slot = 2; start_next_round(m);
      CHECK(m.assist == 0); }
    // Aide de depart (nouvel essai apres une defaite) : plafonnee et seulement en Novice.
    { Match m; init_match(m, KENJI, TITAN, false, 9);
      set_ai_level(m, DIFF_NOVICE, 2); CHECK(m.assist == 2);
      set_ai_level(m, DIFF_NOVICE, 9); CHECK(m.assist == ASSIST_MAX); }
    // Zone de clemence : le meme coup de l'IA fait moins mal a un joueur sous 25 % de vie (Novice uniquement).
    auto hit_dmg = [](Difficulty d, int hp) {
        Match m; init_match(m, KENJI, TITAN, false, 11);
        set_ai_level(m, d);
        m.f[1].dmg_scale = 1.0f;                                // isole l'effet de la clemence
        m.phase = PH_FIGHT; m.phase_timer = 0;
        m.f[0].x = 200; m.f[1].x = 226; m.f[0].facing = 1; m.f[1].facing = -1;
        m.f[0].max_hp = 400; m.f[0].hp = (int16_t)hp;
        Input none, hit; hit.a = hit.jp_a = true;
        const int before = m.f[0].hp;
        for (int i = 0; i < 60 && m.f[0].hp == before; ++i) step_match_2p(m, none, i == 0 ? hit : none);
        return before - m.f[0].hp;
    };
    { const int full = hit_dmg(DIFF_NOVICE, 400), low = hit_dmg(DIFF_NOVICE, 90), master_low = hit_dmg(DIFF_MASTER, 90);
      CHECK(full > 0 && low > 0 && master_low > 0);
      CHECK(low < full);                                         // clemence
      CHECK(master_low > low); }
}

// Enchainement leger -> lourd
static void test_chain() {
    std::printf("[enchainement leger -> lourd]\n");
    auto run = [](bool chain, int* combo_max, int* dmg) {
        Match m; setup(m, KENJI, TITAN, 200);
        m.f[1].x = m.f[0].x + 30;
        Input none, a, b; a.a = a.jp_a = true; b.b = b.jp_b = true;
        const int hp0 = m.f[1].hp;
        st(m, a);
        int pressed = 0; *combo_max = 0;
        for (int i = 0; i < 80; ++i) {
            const bool go = chain && !pressed && m.f[0].action == A_LIGHT && m.f[0].hit_confirmed;
            if (go) { st(m, b); pressed = 1; } else st(m, none);
            if (m.f[1].combo_count > *combo_max) *combo_max = m.f[1].combo_count;
        }
        *dmg = hp0 - m.f[1].hp;
        return pressed;
    };
    int c1, d1, c2, d2;
    const int p1 = run(false, &c1, &d1), p2 = run(true, &c2, &d2);
    CHECK(p1 == 0 && p2 == 1);
    CHECK(c1 == 1);                 // le jab seul : un coup
    CHECK(c2 >= 2);                 // jab + lourd : un vrai enchainement (la cible n'est pas libre entre les deux)
    CHECK(d2 > d1);
    // Une pression faite PENDANT le gel d'impact n'est pas perdue : le lourd part quand meme.
    { Match m; setup(m, KENJI, TITAN, 200); m.f[1].x = m.f[0].x + 30;
      Input none, a, b; a.a = a.jp_a = true; b.b = b.jp_b = true;
      step_match_2p(m, a, none);
      for (int i = 0; i < 20 && !(m.f[0].hit_confirmed && m.hitstop > 1); ++i) step_match_2p(m, none, none);
      CHECK(m.hitstop > 1);
      step_match_2p(m, b, none);                       // appui unique, en plein gel
      bool heavy = false;
      for (int i = 0; i < 30; ++i) { step_match_2p(m, none, none); if (m.f[0].action == A_HEAVY) heavy = true; }
      CHECK(heavy); }
    // Jamais de lourd -> lourd, ni de chaine depuis un lourd.
    { Match m; setup(m, KENJI, TITAN, 200); m.f[1].x = m.f[0].x + 30;
      Input none, b; b.b = b.jp_b = true;
      st(m, b);
      for (int i = 0; i < 40 && !(m.f[0].action == A_HEAVY && m.f[0].hit_confirmed); ++i) st(m, none);
      bool restarted = false; int last = m.f[0].action_frame;
      for (int i = 0; i < 12; ++i) { st(m, b); if (m.f[0].action == A_HEAVY && m.f[0].action_frame < last) restarted = true; last = m.f[0].action_frame; }
      CHECK(!restarted); }
}

int main() {
    test_ladder();
    test_shortcut_and_motions();
    test_blocking_and_chip();
    test_timeout();
    test_options_and_physics();
    test_ki();
    test_input_buffer();
    test_ground_rules();
    test_parry_riposte();
    test_level_and_assist();
    test_chain();
    test_round_flow();
    test_boss_boost();
    test_determinism();
    test_mass_simulation();
    std::printf("\n%d verifications, %d echec(s)\n", g_checks, g_fail);
    return g_fail ? 1 : 0;
}
