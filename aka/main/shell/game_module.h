/*
===============================================================================
  game_module.h — L'interface commune des jeux (coquille AKA)
-------------------------------------------------------------------------------
  Meme principe que mAKArena : la coquille s'occupe des menus, des regles, des
  options, de la langue, de la sauvegarde et du retour au loader ; le jeu se
  resume a quelques fonctions.

  Difference avec les jeux de plateau : pas de « coup annule/refait » ni de tour
  par tour (donc pas de tache d'IA). A la place, un MatchSetup decrit le combat.
===============================================================================
*/
#pragma once
#include <cstdint>
#include "i18n.h"

namespace shell {

// Resultat du point de vue du JOUEUR HUMAIN.
enum Outcome : int8_t { OUT_ONGOING = 0, OUT_WIN = 1, OUT_LOSS = -1 };

struct MatchSetup {
    uint8_t player;    // FighterId du joueur (P1)
    uint8_t foe;       // FighterId de l'adversaire (P2, pilote par l'IA)
    bool    boss;      // duel final du Tournoi : le boss a 12 % de vitalite en plus
    uint8_t level;     // 0 = Novice, 1 = Arcade, 2 = Maitre
    uint8_t rounds_to_win{2};   // manches a gagner (1, 2 ou 3)
    uint16_t round_sec{99};     // duree d'une manche en secondes ; 0 = illimitee
};

struct GameModule {
    i18n::GameId id;
    void      (*start)(const MatchSetup& s);
    void      (*update)(uint32_t now_ms);      // une image a 30 fps (entrees + 2 pas de 60 Hz)
    void      (*draw)(uint32_t now_ms);        // dessine TOUT l'ecran (HUD compris)
    Outcome   (*outcome)();
};

const GameModule& module_fight();

} // namespace shell
