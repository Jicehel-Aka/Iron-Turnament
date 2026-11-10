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
#include "netplay.h"
#include "../../net/net_link.h"
#include "../../core/graphics.h"
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

// --- mode reseau ---
static fight::net::Session*   s_sess = nullptr;
static fight::net::Transport* s_tr   = nullptr;
static int                    s_net_err = 0;
static bool                   s_net_match = false;      // un combat reseau est en cours (apres net_begin_match)
static shell::MatchSetup      s_net_rules;
static uint8_t                s_net_fighter = 0;
static bool                   s_net_host = false;

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
    s_net_match = false;                  // les combats contre l'IA ne passent jamais par ici en reseau
    s_diff = s.level == 0 ? fight::DIFF_NOVICE : s.level == 2 ? fight::DIFF_MASTER : fight::DIFF_ARCADE;
    fight::MatchRules rules;
    rules.rounds_to_win = s.rounds_to_win ? s.rounds_to_win : fight::ROUNDS_TO_WIN;
    rules.round_sec     = s.round_sec;
    fight::init_match(s_m, (fight::FighterId)s.player, (fight::FighterId)s.foe, s.boss, esp_random(), rules);
    fight::set_ai_level(s_m, (fight::Difficulty)s.level, s.assist);
    // Charge les sprites des deux combattants depuis la SD (~1 s). Echec = dessin vectoriel.
    fight::spr::load_pair((fight::FighterId)s.player, (fight::FighterId)s.foe);
    s_out = OUT_ONGOING;
    s_sfx = 0;
    s_end_steps = 0;
}

// Fin de manche / de match, commune au jeu local et au jeu reseau (meme calendrier que le moteur).
static void after_step() {
    if (s_m.phase == fight::PH_ROUND_END && s_m.winner_slot) {
        // Une fatalite a besoin de plus de recul que la simple victoire aux points.
        const int hold = s_m.finisher_done != fight::FIN_NONE ? 170 : 110;
        if (++s_end_steps >= hold) {
            s_end_steps = 0;
            const bool p1_won = s_m.wins[0] >= s_m.rounds_to_win, p2_won = s_m.wins[1] >= s_m.rounds_to_win;
            if (p1_won || p2_won) {
                const bool local_p1 = !s_net_match || s_net_host;
                s_out = (p1_won == local_p1) ? OUT_WIN : OUT_LOSS;
            } else {
                fight::start_next_round(s_m);
            }
        }
    } else {
        s_end_steps = 0;
    }
}

static void update_net(uint32_t now) {
    if (!s_sess) return;
    s_sess->poll(now);
    if (s_sess->state() != fight::net::NS_RUNNING) return;      // echec : la coquille le constate (net_poll)
    if (s_out != OUT_ONGOING) return;

    fight::Input p1, p2;
    if (!s_sess->tick(read_input(), p1, p2)) return;            // l'adversaire n'a pas encore repondu : on attend

    for (int k = 0; k < 2 && s_out == OUT_ONGOING; ++k) {
        fight::Input a = p1, b = p2;
        if (k == 1) { a.jp_a = a.jp_b = a.jp_special = false; b.jp_a = b.jp_b = b.jp_special = false; }
        fight::step_match_2p(s_m, a, b);
        s_sfx |= s_m.sfx;
        s_m.sfx = 0;
        after_step();
    }
    s_sess->on_simulated(s_m);
    fight::play_sfx(s_sfx);
    s_sfx = 0;
}

static void update(uint32_t now) {
    if (s_net_match) { update_net(now); return; }
    if (s_out != OUT_ONGOING) return;

    const fight::Input in = read_input();

    for (int k = 0; k < 2 && s_out == OUT_ONGOING; ++k) {
        fight::Input step = in;
        if (k == 1) step.jp_a = step.jp_b = step.jp_special = false;

        fight::step_match(s_m, step, s_diff);
        s_sfx |= s_m.sfx;
        s_m.sfx = 0;

        after_step();
    }

    fight::play_sfx(s_sfx);
    s_sfx = 0;
}

static void draw(uint32_t now_ms) {
    fight::draw_match(s_m, now_ms);
    if (s_net_match && s_sess && s_sess->stalled_frames() > 10 && s_out == OUT_ONGOING) {
        const char* t = i18n::T(i18n::STR_NET_STALL);
        const int w = core::graphics_text_width(t) + 14;
        core::graphics_fill_rect_raw((320 - w) / 2, 112, w, 16, core::graphics_make_color(10, 8, 16));
        core::graphics_draw_text_center_raw(116, t, core::graphics_make_color(250, 204, 21));
    }
}
static Outcome outcome() { return s_out; }

// -----------------------------------------------------------------------------
// Mode reseau
// -----------------------------------------------------------------------------
bool net_open(uint8_t kind, bool host, uint8_t my_fighter, const MatchSetup& rules, char* err, unsigned errn) {
    net_close();
    s_tr = netlink::open(kind == 0 ? netlink::LINK_USB : netlink::LINK_WIFI, host, err, errn);
    if (!s_tr) return false;
    fight::net::NetOptions o;
    o.rounds_to_win = rules.rounds_to_win ? rules.rounds_to_win : fight::ROUNDS_TO_WIN;
    o.round_sec = rules.round_sec;
    s_sess = new fight::net::Session(*s_tr, host, my_fighter, o, host ? esp_random() : 0);
    s_net_rules = rules; s_net_fighter = my_fighter; s_net_host = host; s_net_err = 0;
    return true;
}

int net_poll(uint32_t now_ms) {
    if (!s_sess) return -1;
    s_sess->poll(now_ms);
    switch (s_sess->state()) {
        case fight::net::NS_RUNNING:    return 1;
        case fight::net::NS_CONNECTING: return 0;
        default: s_net_err = s_sess->error(); return -1;
    }
}

int net_error() { return s_sess ? (int)s_sess->error() : s_net_err; }
const char* net_detail() { return netlink::detail(); }
bool net_active() { return s_sess != nullptr; }

void net_begin_match() {
    if (!s_sess || s_sess->state() != fight::net::NS_RUNNING) return;
    const fight::net::NetOptions o = s_sess->options();
    fight::MatchRules rules;
    rules.rounds_to_win = o.rounds_to_win;
    rules.round_sec = o.round_sec;
    const fight::FighterId p1 = (fight::FighterId)s_sess->p1_fighter();
    const fight::FighterId p2 = (fight::FighterId)s_sess->p2_fighter();
    fight::init_match(s_m, p1, p2, false, s_sess->seed(), rules);   // meme graine, memes regles des deux cotes
    fight::spr::load_pair(p1, p2);
    s_net_match = true;
    s_out = OUT_ONGOING;
    s_sfx = 0;
    s_end_steps = 0;
}

void net_close() {
    if (s_sess) { s_sess->leave(); delete s_sess; s_sess = nullptr; }
    s_tr = nullptr;
    netlink::close();
    s_net_match = false;
}

uint32_t net_sim_tick() { return s_sess ? s_sess->sim_tick() : 0; }

// Etat d'echec en cours de combat : la coquille le teste a chaque image.
int net_match_state() {
    if (!s_net_match || !s_sess) return 0;
    return s_sess->state() == fight::net::NS_RUNNING ? 0 : -1;
}

const GameModule& module_fight() {
    static const GameModule m { i18n::GAME_FIGHT, start, update, draw, outcome };
    return m;
}

} // namespace shell
