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
    uint8_t assist{0};          // aide de depart (Novice) : +1 a chaque nouvel essai apres une defaite
};

struct GameModule {
    i18n::GameId id;
    void      (*start)(const MatchSetup& s);
    void      (*update)(uint32_t now_ms);      // une image a 30 fps (entrees + 2 pas de 60 Hz)
    void      (*draw)(uint32_t now_ms);        // dessine TOUT l'ecran (HUD compris)
    Outcome   (*outcome)();
};

const GameModule& module_fight();

// -----------------------------------------------------------------------------
// Mode reseau 2 joueurs (cable USB ou Wi-Fi) — implemente dans fight_module.cpp
// -----------------------------------------------------------------------------
// Ouvre la liaison et prepare la session. `kind` : 0 = cable USB, 1 = Wi-Fi. L'hote impose les regles de
// `rules` (manches, temps). Renvoie false (message technique dans `err`) si la liaison est impossible.
bool net_open(uint8_t kind, bool host, uint8_t my_fighter, const MatchSetup& rules, char* err, unsigned errn);
int  net_poll(uint32_t now_ms);          // attente de l'adversaire : 0 = en cours, 1 = pret, -1 = echec
int  net_error();                        // code d'erreur (fight::net::NetError) apres un echec
const char* net_detail();                // adresse / port a afficher pendant l'attente
void net_begin_match();                  // quand net_poll() == 1 : lance le combat
bool net_active();                       // une session reseau est ouverte
int  net_match_state();                  // en combat : 0 = ok, -1 = liaison perdue / erreur (voir net_error)
uint32_t net_sim_tick();                 // images de jeu reseau simulees (diagnostic / tests)
void net_close();                        // previent l'adversaire et ferme la liaison (sans danger si inactive)

} // namespace shell
