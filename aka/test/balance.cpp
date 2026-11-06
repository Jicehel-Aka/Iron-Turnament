/*
  balance.cpp — Simulation IA contre IA du moteur de combat (aucun materiel) : matrice de victoires
  entre les six combattants, ecart entre les niveaux, duree des matchs.
  Usage : sh test/run_balance.sh [parties_par_paire] [niveau 0-2]
*/
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include "fight.h"
using namespace fight;

struct Result { int winner; int frames; bool timeout_decided; };

// Un match complet (2 manches gagnantes, 99 s) entre deux IA. winner : 0 = P1, 1 = P2, -1 = pas de fin.
static Result play(FighterId a, FighterId b, Difficulty da, Difficulty db, uint32_t seed) {
    static Match m;
    init_match(m, a, b, false, seed);
    m.f[0].dmg_scale = g_dmg_scale[da][a];     // chaque IA utilise le coefficient de son niveau
    m.f[1].dmg_scale = g_dmg_scale[db][b];
    int frames = 0, timeouts = 0;
    int end_hold = 0;
    while (frames < 60 * 60 * 8) {
        Input i1 = ai_decide(m, m.f[0], m.f[1], da);
        Input i2 = ai_decide(m, m.f[1], m.f[0], db);
        step_match_2p(m, i1, i2);
        ++frames;
        if (m.banner == BN_TIME) ++timeouts;
        if (m.phase == PH_ROUND_END && m.winner_slot) {
            if (++end_hold > 120) {
                end_hold = 0;
                if (m.wins[0] >= m.rounds_to_win) return {0, frames, timeouts > 0};
                if (m.wins[1] >= m.rounds_to_win) return {1, frames, timeouts > 0};
                start_next_round(m);
            }
        } else end_hold = 0;
    }
    return {-1, frames, false};
}

static void win_rates(int N, Difficulty D, double out[6]) {
    for (int i = 0; i < 6; ++i) {
        int wins = 0, played = 0;
        for (int j = 0; j < 6; ++j) if (i != j) for (int k = 0; k < N; ++k) {
            const bool swap = (k & 1) != 0;
            Result r = swap ? play((FighterId)j, (FighterId)i, D, D, 3000 + k * 7 + i * 131 + j)
                            : play((FighterId)i, (FighterId)j, D, D, 3000 + k * 7 + i * 131 + j);
            if (r.winner < 0) continue;
            ++played; if ((r.winner == 0) != swap) ++wins;
        }
        out[i] = played ? 100.0 * wins / played : 50.0;
    }
}

int main(int argc, char** argv) {
    if (argc > 1 && !std::strcmp(argv[1], "--tune")) {      // reglage automatique des coefficients de degats
        const int N = argc > 2 ? std::atoi(argv[2]) : 20, iters = argc > 3 ? std::atoi(argv[3]) : 12;
        const int L = argc > 4 ? std::atoi(argv[4]) : 2;
        for (int it = 0; it < iters; ++it) {
            double w[6]; win_rates(N, (Difficulty)L, w);
            std::printf("iter %2d :", it);
            for (int i = 0; i < 6; ++i) std::printf(" %5.1f%%(x%.3f)", w[i], g_dmg_scale[L][i]);
            std::printf("\n"); std::fflush(stdout);
            for (int i = 0; i < 6; ++i) {
                float s = g_dmg_scale[L][i] * (1.0f + 0.0030f * (float)(50.0 - w[i]));
                g_dmg_scale[L][i] = s < 0.60f ? 0.60f : s > 1.60f ? 1.60f : s;
            }
        }
        std::printf("niveau %d : { ", L);
        for (int i = 0; i < 6; ++i) std::printf("%.3ff%s", g_dmg_scale[L][i], i < 5 ? ", " : " };\n");
        return 0;
    }
    const int N = argc > 1 ? std::atoi(argv[1]) : 40;
    const int lv = argc > 2 ? std::atoi(argv[2]) : 2;
    const Difficulty D = (Difficulty)lv;
    static const char* names[6] = { "Kenji", "Krowen", "Mei-Lin", "Titan", "Nyxia", "Malakor" };

    std::printf("=== Matrice de victoires (IA %s contre IA %s, %d matchs par paire ordonnee) ===\n",
                lv == 0 ? "Novice" : lv == 1 ? "Arcade" : "Maitre", lv == 0 ? "Novice" : lv == 1 ? "Arcade" : "Maitre", N);
    std::printf("%-8s", "");
    for (int j = 0; j < 6; ++j) std::printf("%8s", names[j]);
    std::printf("%9s\n", "moyenne");
    double total_frames = 0; int total = 0, unfinished = 0, by_time = 0;
    double avg[6] = {0};
    for (int i = 0; i < 6; ++i) {
        std::printf("%-8s", names[i]);
        double rowsum = 0; int rowcnt = 0;
        for (int j = 0; j < 6; ++j) {
            if (i == j) { std::printf("%8s", "-"); continue; }
            int wins = 0, played = 0;
            for (int k = 0; k < N; ++k) {
                // moitie des parties avec i en P1, moitie en P2 (annule l'avantage de cote)
                const bool swap = (k & 1) != 0;
                Result r = swap ? play((FighterId)j, (FighterId)i, D, D, 1000 + k * 7 + i * 131 + j)
                                : play((FighterId)i, (FighterId)j, D, D, 1000 + k * 7 + i * 131 + j);
                total_frames += r.frames; ++total;
                if (r.winner < 0) { ++unfinished; continue; }
                if (r.timeout_decided) ++by_time;
                ++played;
                if ((r.winner == 0) != swap) ++wins;
            }
            const double pct = played ? 100.0 * wins / played : 0;
            std::printf("%7.0f%%", pct);
            rowsum += pct; ++rowcnt;
        }
        avg[i] = rowsum / rowcnt;
        std::printf("%8.0f%%\n", avg[i]);
    }
    std::printf("Duree moyenne d'un match : %.1f s ; non termines : %d ; manches au temps : %d (sur %d matchs)\n",
                total_frames / total / 60.0, unfinished, by_time, total);

    // --- Ecart entre niveaux : meme combattant, niveau X (en P1/P2 alternes) contre niveau Y ---
    std::printf("\n=== Ecart entre niveaux (victoires du niveau le plus haut, tous combattants confondus) ===\n");
    const int pairs[3][2] = { {1, 0}, {2, 1}, {2, 0} };
    const char* ln[3] = { "Novice", "Arcade", "Maitre" };
    for (auto& p : pairs) {
        int wins = 0, played = 0;
        for (int a = 0; a < 6; ++a) for (int b = 0; b < 6; ++b) for (int k = 0; k < N / 2 + 1; ++k) {
            const bool swap = (k & 1) != 0;
            Result r = swap ? play((FighterId)b, (FighterId)a, (Difficulty)p[1], (Difficulty)p[0], 500 + k * 11 + a * 17 + b)
                            : play((FighterId)a, (FighterId)b, (Difficulty)p[0], (Difficulty)p[1], 500 + k * 11 + a * 17 + b);
            if (r.winner < 0) continue;
            ++played;
            // le niveau haut est P1 si !swap, P2 si swap
            if ((r.winner == 0) != swap) ++wins;
        }
        std::printf("%s bat %s : %.0f%% (%d matchs)\n", ln[p[0]], ln[p[1]], played ? 100.0 * wins / played : 0, played);
    }
    return 0;
}
