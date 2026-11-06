/*
===============================================================================
  fight_module.cpp — Colle entre le moteur (fight_engine) et la coquille
-------------------------------------------------------------------------------
  - lit les boutons : D-Pad (ou joystick) = directions, A poing, B pied,
    C coup special ;
  - fait avancer le moteur de DEUX pas de 60 Hz par image de 30 fps (c'est la
    cadence a laquelle le moteur a ete equilibre) ;
  - la pression d'un bouton (front montant) n'est transmise qu'au PREMIER des
    deux pas, sinon un appui compterait double ;
  - enchaine les manches et detecte la fin du match.

  Pas de tache d'IA : l'IA de combat decide en quelques comparaisons.
===============================================================================
*/
#include "../../shell/game_module.h"
#include "fight.h"
#include "fight_view.h"
#include "fight_sprites.h"
#include "../../core/input.h"
#include "esp_random.h"

namespace shell {

using core::Button;
using core::input_is_held;
using core::input_was_pressed;

static fight::Match      s_m;
static fight::Difficulty s_diff = fight::DIFF_ARCADE;
static Outcome           s_out  = OUT_ONGOING;
static uint16_t          s_sfx  = 0;
static int               s_end_steps = 0;     // pas de 60 Hz passes sur l'ecran de fin de manche

static fight::Input read_input() {
    fight::Input in;
    in.left  = input_is_held(Button::Left);
    in.right = input_is_held(Button::Right);
    in.up    = input_is_held(Button::Up);
    in.down  = input_is_held(Button::Down);
    in.a       = input_is_held(Button::A);
    in.b       = input_is_held(Button::B);
    in.special = input_is_held(Button::C);
    in.jp_a       = input_was_pressed(Button::A);
    in.jp_b       = input_was_pressed(Button::B);
    in.jp_special = input_was_pressed(Button::C);
    return in;
}

static void start(const MatchSetup& s) {
    s_diff = s.level == 0 ? fight::DIFF_NOVICE : s.level == 2 ? fight::DIFF_MASTER : fight::DIFF_ARCADE;
    fight::MatchRules rules;
    rules.rounds_to_win = s.rounds_to_win ? s.rounds_to_win : fight::ROUNDS_TO_WIN;
    rules.round_sec     = s.round_sec;
    fight::init_match(s_m, (fight::FighterId)s.player, (fight::FighterId)s.foe, s.boss, esp_random(), rules);
    // Charge les sprites des deux combattants depuis la SD (~1 s). Echec = dessin vectoriel.
    fight::spr::load_pair((fight::FighterId)s.player, (fight::FighterId)s.foe);
    s_out = OUT_ONGOING;
    s_sfx = 0;
    s_end_steps = 0;
}

static void update(uint32_t) {
    if (s_out != OUT_ONGOING) return;

    const fight::Input in = read_input();

    for (int k = 0; k < 2 && s_out == OUT_ONGOING; ++k) {
        fight::Input step = in;
        if (k == 1) step.jp_a = step.jp_b = step.jp_special = false;

        fight::step_match(s_m, step, s_diff);
        s_sfx |= s_m.sfx;
        s_m.sfx = 0;

        if (s_m.phase == fight::PH_ROUND_END && s_m.winner_slot) {
            // Une fatalite a besoin de plus de recul que la simple victoire aux points.
            const int hold = s_m.finisher_done != fight::FIN_NONE ? 170 : 110;
            if (++s_end_steps >= hold) {
                s_end_steps = 0;
                if (s_m.wins[0] >= s_m.rounds_to_win)      s_out = OUT_WIN;
                else if (s_m.wins[1] >= s_m.rounds_to_win) s_out = OUT_LOSS;
                else                                          fight::start_next_round(s_m);
            }
        } else {
            s_end_steps = 0;
        }
    }

    fight::play_sfx(s_sfx);
    s_sfx = 0;
}

static void draw(uint32_t now_ms) { fight::draw_match(s_m, now_ms); }
static Outcome outcome() { return s_out; }

const GameModule& module_fight() {
    static const GameModule m { i18n::GAME_FIGHT, start, update, draw, outcome };
    return m;
}

} // namespace shell
