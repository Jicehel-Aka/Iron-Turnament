/*
===============================================================================
  fight_ai.cpp — IA pilotée par la PERSONNALITÉ (port de aiController.ts)
-------------------------------------------------------------------------------
  Chaque maître a un caractère (portée préférée, agressivité, patience, réflexes
  anti-aériens, goût du projectile, de la prise, de la provocation...). L'IA
  s'adapte aussi aux habitudes du joueur : une garde trop passive attire les prises.

  Tourne dans la tâche de jeu (30 fps, 2 appels/image) : quelques comparaisons, pas
  de recherche — contrairement aux jeux de plateau, il n'y a PAS de tâche d'IA
  séparée à prévoir.
===============================================================================
*/
#include "fight.h"
#include <cmath>

namespace fight {

static inline int sgn(float v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); }

Input ai_decide(Match& m, Fighter& ai, const Fighter& opp, Difficulty diff) {
    Input in;

    // L'IA n'agit que pendant le combat ou la fenêtre « ACHEVEZ-LE ! ».
    if (m.phase != PH_FIGHT && m.phase != PH_FINISH_HIM) return in;

    const FighterDef& d = def(ai.id);
    const AiProfile& pr = d.ai;

    const float diff_scale = diff == DIFF_NOVICE ? 0.52f : diff == DIFF_ARCADE ? 0.80f : 1.0f;

    const float dx = opp.x - ai.x;
    const float dist = std::fabs(dx);
    const bool toward_left = dx < 0;

    auto toward = [&]() { if (toward_left) in.left = true; else in.right = true; };
    auto away   = [&]() { if (toward_left) in.right = true; else in.left = true; };
    // Special : avec assez de Ki (mais pas pleine jauge, reservee au SUPER), l'IA le renforce parfois (EX).
    auto special = [&]() {
        in.special = true; in.jp_special = true;
        if (ai.ki >= KI_EX_COST && ai.ki < KI_MAX && rnd(m) < 0.40f * diff_scale) in.a = true;
    };

    // --- 1. Fenêtre « ACHEVEZ-LE ! » -----------------------------------------
    if (m.phase == PH_FINISH_HIM && opp.action == A_DIZZY) {
        const bool wants = d.finisher.honorable ||
                           rnd(m) < pr.ruthless * diff_scale + 0.15f;
        if (wants) {
            if (d.finisher.range == RANGE_CLOSE && dist > 46.0f) { toward(); return in; }
            if (m.frame % 18 == 0) { in.down = true; special(); return in; }
        } else if (dist > 42.0f) {
            toward(); return in;
        } else if (m.frame % 20 == 0) {
            in.b = true; in.jp_b = true; return in;
        }
    }

    // Temps de réaction modulé par la difficulté.
    const int react = diff == DIFF_NOVICE ? 18 : diff == DIFF_ARCADE ? 10 : 5;

    // Menace de projectile adverse en approche.
    const Projectile* incoming = nullptr;
    for (int i = 0; i < MAX_PROJ; ++i) {
        const Projectile& p = m.proj[i];
        if (p.alive && p.owner != ai.slot && std::fabs(p.x - ai.x) < 95.0f &&
            sgn(p.vx) == sgn(ai.x - p.x)) { incoming = &p; break; }
    }

    // --- 1b. SUPER : jauge pleine, adversaire a portee et au sol -> charge imblocable.
    if (ai.ki >= KI_SUPER_COST && m.phase == PH_FIGHT && dist >= 34.0f && dist <= 120.0f &&
        opp.y > -30 && m.frame % react == 0 && rnd(m) < 0.55f * diff_scale) {
        in.down = true; special(); in.a = false; return in;
    }

    // --- 2. Réactions face aux projectiles ------------------------------------
    if (incoming) {
        // Krowen : contre-téléportation dans le dos.
        if (pr.teleport > 0.5f && rnd(m) < pr.teleport * diff_scale) {
            away(); special(); return in;
        }
        // Titan : pulvérise le projectile avec son Lariat Blindé.
        if (ai.id == TITAN && std::fabs(incoming->x - ai.x) < 56.0f && rnd(m) < 0.72f * diff_scale) {
            in.up = true; special(); return in;
        }
        // Mei-Lin : saute par-dessus.
        if (ai.id == MEILIN && std::fabs(incoming->x - ai.x) < 72.0f && ai.y >= 0 &&
            rnd(m) < 0.78f * diff_scale) {
            in.up = true; toward(); return in;
        }
        // Garde prudente par défaut.
        if (rnd(m) < (0.45f + pr.patience * 0.45f) * diff_scale) { away(); return in; }
    }

    // --- 3. Réflexe anti-aérien -------------------------------------------------
    if (opp.y < -22 && dist < 68.0f && m.frame % react == 0) {
        if (rnd(m) < pr.anti_air * diff_scale) {
            if (ai.id == KENJI || ai.id == TITAN) {      // Dragon Ascendant / Lariat Blindé
                in.up = true; special(); return in;
            }
            in.down = true; in.a = true; in.jp_a = true; // uppercut normal
            return in;
        }
    }

    // --- 4. Défense au corps-à-corps --------------------------------------------
    const bool opp_attacking =
        opp.action == A_LIGHT || opp.action == A_HEAVY || opp.action == A_LOW_KICK ||
        opp.action == A_SPECIAL_1 || opp.action == A_SPECIAL_2 || opp.action == A_SPECIAL_3;

    if (opp_attacking && dist < 66.0f) {
        const float block = (0.32f + pr.patience * 0.5f) * diff_scale;
        if (rnd(m) < block) {
            away();
            if (opp.action == A_LOW_KICK) in.down = true;
            return in;
        }
    }

    // --- 5. Trait d'orgueil (Malakor se moque quand il domine) ------------------
    const float lead = (float)ai.hp / ai.max_hp - (float)opp.hp / opp.max_hp;
    if (pr.arrogance > 0.3f && lead > 0.26f && dist > 85.0f && ai.ai_cooldown <= 0 &&
        m.frame % 45 == 0 && rnd(m) < pr.arrogance * 0.45f) {
        ai.action = A_TAUNT;
        ai.action_frame = 0;
        ai.action_total = 42;
        ai.vx = 0;
        ai.ai_cooldown = 90;
        return in;
    }

    // Cooldown de décision : on se positionne selon sa personnalité.
    if (ai.ai_cooldown > 0) {
        if (dist > pr.preferred_range + 18) toward();
        else if (dist < pr.preferred_range - 20 && pr.patience > 0.65f) away();
        return in;
    }

    if (m.frame % react != 0) {
        if (dist > pr.preferred_range + 14) toward();
        else if (dist < pr.preferred_range - 22 && pr.aggression < 0.45f) away();
        return in;
    }

    // Adaptation aux habitudes du joueur.
    const bool turtling = m.habits.blocking > 90;
    const bool spamming = m.habits.projectiles >= 3;

    // --- 6. Choix offensifs selon la distance et le caractère --------------------

    // A. Corps-à-corps (< 46 px)
    if (dist <= 46.0f) {
        const float grab_boost = turtling ? 0.28f : 0.0f;

        // Titan adore son Brise-Vertèbres imblocable.
        if (ai.id == TITAN && rnd(m) < (pr.grapple + grab_boost) * diff_scale) {
            toward(); special(); ai.ai_cooldown = 22; return in;
        }
        // Projection si le joueur se protège beaucoup.
        if ((opp.action == A_BLOCK_HIGH || opp.action == A_BLOCK_LOW || turtling) &&
            rnd(m) < (pr.grapple + 0.3f) * diff_scale) {
            toward();
            in.a = in.b = true; in.jp_a = in.jp_b = true;
            ai.ai_cooldown = 20;
            return in;
        }
        // Nyxia déteste le corps-à-corps : Torpille d'Orage pour dégager.
        if (ai.id == NYXIA && rnd(m) < 0.72f * diff_scale) {
            in.up = true; special(); ai.ai_cooldown = 24; return in;
        }
        // Mix-up bas / rapide / brise-garde / lourd.
        const float roll = rnd(m);
        if (roll < 0.34f) {
            in.down = true; in.b = true; in.jp_b = true; ai.ai_cooldown = 16;
        } else if (roll < 0.66f) {
            in.a = true; in.jp_a = true; ai.ai_cooldown = 11;
        } else if ((ai.id == KROWEN || ai.id == MALAKOR) && roll < 0.88f) {
            in.up = true; special(); ai.ai_cooldown = 24;      // brise-garde
        } else {
            in.b = true; in.jp_b = true; ai.ai_cooldown = 18;
        }
        return in;
    }

    // B. Mi-distance (47 - 105 px)
    if (dist <= 105.0f) {
        const float roll = rnd(m);

        if (ai.id == MEILIN && roll < 0.45f * diff_scale) {
            if (rnd(m) < 0.55f) { away(); special(); }          // Cent Éclairs
            else                { in.up = true; special(); }    // Flèche du Phénix
            ai.ai_cooldown = 20;
            return in;
        }
        if (ai.id == MALAKOR && roll < 0.48f * diff_scale) {
            toward(); special(); ai.ai_cooldown = 24; return in;        // Torpille Pourpre
        }
        if (ai.id == KENJI && roll < 0.36f * diff_scale) {
            if (rnd(m) < 0.55f) { toward(); special(); }                // Onde Céleste
            else                { away();   special(); }                // Ouragan Écarlate
            ai.ai_cooldown = 22;
            return in;
        }
        if (ai.id == TITAN && roll < 0.34f * diff_scale && opp.y >= 0) {
            away(); special(); ai.ai_cooldown = 26; return in;          // Séisme d'Oural
        }
        if (roll < 0.35f * pr.aggression) {
            in.up = true; toward(); ai.ai_cooldown = 18; return in;     // assaut aérien
        }
        if (dist < 72.0f && roll < 0.65f) {
            in.b = true; in.jp_b = true; ai.ai_cooldown = 16; return in;
        }
        toward();
        return in;
    }

    // C. Longue distance (> 105 px)
    bool own_proj = false;
    for (int i = 0; i < MAX_PROJ; ++i)
        if (m.proj[i].alive && m.proj[i].owner == ai.slot) { own_proj = true; break; }

    if (ai.id == KROWEN) {
        if ((spamming || rnd(m) < 0.42f) && rnd(m) < diff_scale) {
            away(); special(); ai.ai_cooldown = 26; return in;          // Pas de Brume
        }
        if (!own_proj && rnd(m) < 0.58f * diff_scale) {
            toward(); special(); ai.ai_cooldown = 26; return in;        // Harpon
        }
    }

    if (ai.id == NYXIA && !own_proj && rnd(m) < pr.projectile * diff_scale) {
        if (rnd(m) < 0.62f) { toward(); special(); }                    // Lance Foudroyante
        else                { away();   special(); }                    // Sphère de Stase
        ai.ai_cooldown = 22;
        return in;
    }

    if (!own_proj && pr.projectile > 0.4f && rnd(m) < pr.projectile * 0.65f * diff_scale) {
        if (ai.id == MALAKOR) away(); else toward();
        special();
        ai.ai_cooldown = 24;
        return in;
    }

    toward();
    return in;
}

} // namespace fight
