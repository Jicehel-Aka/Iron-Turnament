/*
===============================================================================
  fight_data.cpp — Les six maîtres du Tournoi de Fer
-------------------------------------------------------------------------------
  Données reprises à l'identique de src/data/fighters.ts (prototype web).

  EQUILIBRAGE : chaque combattant dispose d'un budget strict de 360 points sur
  six attributs (vitalité + vitesse + puissance + défense + portée + récupération).
  Seuls quatre sont lus par le moteur (puissance, défense, portée, récupération) ;
  vitalité et vitesse sont déjà « cuites » dans max_hp et walk_*.

  Les textes d'ambiance (lore, répliques, fins) du prototype ne sont PAS repris :
  ils ne sont pas traduits, et la coquille AKA est en cinq langues.
===============================================================================
*/
#include "fight.h"

namespace fight {

static const FighterDef DEFS[FIGHTER_COUNT] = {
    // ------------------------------------------------------------------ KENJI
    { "KENJI", 1000, 62, 60, 58, 60,
      2.25f, 1.85f, -7.9f,
      {241,245,249}, {220, 38, 38}, {224,169,126}, { 56,189,248},
      KROWEN,
      { 76, 0.52f, 0.78f, 0.88f, 0.58f, 0.00f, 0.25f, 0.02f, 0.35f },
      {
        { "Onde Céleste",     MO_QCF, SC_FWD,   78, 14, 11, 18, 18, SP_PROJECTILE },
        { "Dragon Ascendant", MO_DP,  SC_UP,   112, 18,  5, 14, 26, SP_ANTI_AIR   },
        { "Ouragan Ecarlate", MO_QCB, SC_BACK,  94, 16,  9, 20, 17, SP_DASH_STRIKE},
      },
      { "SCEAU DU VIDE CELESTE", RANGE_ANY, true },
      { 58, 38, 24 }, {124, 45, 18} },

    // ----------------------------------------------------------------- KROWEN
    { "KROWEN", 950, 68, 48, 62, 62,
      2.55f, 2.05f, -8.2f,
      { 30, 41, 59}, {217,119,  6}, {200,155,123}, {249,115, 22},
      KENJI,
      { 54, 0.82f, 0.34f, 0.62f, 0.56f, 0.92f, 0.35f, 0.12f, 0.98f },
      {
        { "Harpon des Enfers", MO_BF,  SC_FWD,   74, 12, 12, 16, 22, SP_HARPOON  },
        { "Pas de Brume",      MO_QCB, SC_BACK,  86, 14,  8, 10, 21, SP_TELEPORT },
        { "Souffle Calciné",   MO_QCF, SC_UP,    98, 20, 13, 14, 20, SP_OVERHEAD },
      },
      { "BUCHER DU SPECTRE", RANGE_MID, false },
      { 39, 39, 42}, {234, 88, 12} },

    // ----------------------------------------------------------------- MEILIN
    { "MEI-LIN", 940, 54, 52, 52, 70,
      2.95f, 2.45f, -8.5f,
      {  5,150,105}, {251,191, 36}, {241,194,155}, { 52,211,153},
      MALAKOR,
      { 44, 0.86f, 0.42f, 0.65f, 0.48f, 0.00f, 0.30f, 0.04f, 0.65f },
      {
        { "Eventail d'Acier",  MO_BF,  SC_FWD,   66, 12,  9, 16, 14, SP_PROJECTILE  },
        { "Cent Eclairs",      MO_QCF, SC_BACK,  96, 22,  7, 22, 16, SP_DASH_STRIKE },
        { "Flèche du Phénix",  MO_DU,  SC_UP,    90, 16, 10, 18, 18, SP_OVERHEAD    },
      },
      { "DANSE DES MILLE LAMES", RANGE_CLOSE, false },
      { 30, 41, 59}, { 16,185,129} },

    // ------------------------------------------------------------------ TITAN
    { "TITAN", 1180, 84, 76, 40, 36,
      1.62f, 1.32f, -7.2f,
      {120, 53, 15}, {148,163,184}, {217,158,118}, {239, 68, 68},
      NYXIA,
      { 30, 0.68f, 0.72f, 0.55f, 0.00f, 0.00f, 0.94f, 0.14f, 0.70f },
      {
        { "Brise-Vertèbres", MO_HCF, SC_FWD,  148,  0,  6, 10, 26, SP_COMMAND_GRAB },
        { "Lariat Blindé",   MO_QCB, SC_UP,    92, 18,  7, 22, 22, SP_ANTI_AIR     },
        { "Séisme d'Oural",  MO_DD,  SC_BACK,  95, 20, 16, 14, 24, SP_QUAKE        },
      },
      { "SUPLEX ORBITAL ROUGE", RANGE_CLOSE, false },
      { 51, 65, 85}, {245,158, 11} },

    // ------------------------------------------------------------------ NYXIA
    { "NYXIA", 920, 58, 46, 88, 58,
      2.30f, 2.35f, -8.0f,
      {146, 64, 14}, {226,232,240}, {198,139, 99}, { 34,211,238},
      TITAN,
      { 118, 0.28f, 0.90f, 0.74f, 0.88f, 0.00f, 0.12f, 0.06f, 0.80f },
      {
        { "Lance Foudroyante", MO_QCF, SC_FWD,   72, 15, 10, 18, 19, SP_PROJECTILE },
        { "Sphère de Stase",   MO_QCB, SC_BACK,  68, 16, 14, 45, 18, SP_TRAP_ORB   },
        { "Torpille d'Orage",  MO_BF,  SC_UP,    94, 18,  9, 18, 22, SP_DASH_STRIKE},
      },
      { "SENTENCE ZENITHALE", RANGE_ANY, false },
      {203,213,225}, {  8,145,178} },

    // ---------------------------------------------------------------- MALAKOR
    { "MALAKOR", 1080, 78, 64, 54, 38,
      2.15f, 1.70f, -7.6f,
      {127, 29, 29}, {180, 83,  9}, {197,144,118}, {192,132,252},
      MEILIN,
      { 62, 0.78f, 0.48f, 0.70f, 0.52f, 0.00f, 0.42f, 0.45f, 1.00f },
      {
        { "Torpille Pourpre",     MO_BF,  SC_FWD,  102, 22, 11, 20, 25, SP_DASH_STRIKE },
        { "Marteau de l'Empereur",MO_DP,  SC_UP,   110, 24, 15, 14, 24, SP_OVERHEAD    },
        { "Egide Noire",          MO_QCB, SC_BACK,  80, 16, 12, 18, 22, SP_PROJECTILE  },
      },
      { "OBLITERATION IMPERIALE", RANGE_ANY, false },
      { 41, 37, 36}, {168, 85,247} },
};

const FighterDef& def(FighterId id) { return DEFS[id]; }

void build_ladder(FighterId player, FighterId out[5]) {
    static const FighterId ORDER[FIGHTER_COUNT] = { KENJI, KROWEN, MEILIN, TITAN, NYXIA, MALAKOR };
    const FighterId rival = DEFS[player].rival;

    // Malakor lui-meme : les quatre heros, puis son rival Mei-Lin en boss ultime.
    if (player == MALAKOR) {
        const FighterId l[5] = { TITAN, NYXIA, KROWEN, KENJI, MEILIN };
        for (int i = 0; i < 5; ++i) out[i] = l[i];
        return;
    }

    // Rival = Malakor (cas de Mei-Lin) : les quatre autres, puis Malakor.
    if (rival == MALAKOR) {
        int n = 0;
        for (FighterId id : ORDER)
            if (id != player && id != MALAKOR) out[n++] = id;
        out[4] = MALAKOR;
        return;
    }

    // Cas general : 3 adversaires varies, le rival jure, puis Malakor.
    int n = 0;
    for (FighterId id : ORDER) {
        if (id == player || id == rival || id == MALAKOR) continue;
        if (n < 3) out[n++] = id;
    }
    out[3] = rival;
    out[4] = MALAKOR;
}

} // namespace fight
