/*
===============================================================================
  shell.cpp — La coquille (Iron Tournament)
-------------------------------------------------------------------------------
  Ecran-titre -> menu -> choix du combattant -> (Versus) -> combat.

  Deux modes :
    TOURNOI  5 combats : trois adversaires, le rival jure, puis Malakor (boss).
    DUEL     un combat libre contre le combattant de son choix.

  COMMANDES
    D-Pad            curseur / mouvements
    A / B            valider / annuler  (en combat : poing / pied)
    MENU (court)     menu de pause
    MENU (long)      capture d'ecran
    RUN + MENU 500ms retour au loader   (gere par la tache systeme)
===============================================================================
*/
#include "shell.h"
#include "game_module.h"
#include "ui.h"
#include "i18n.h"
#include "textwrap.h"
#include "save.h"
#include "../core/graphics.h"
#include "../core/input.h"
#include "../core/audio.h"
#include "../tasks/task_system.h"
#include "../games/fight/fight.h"
#include "../games/fight/fight_view.h"
#include "../games/fight/netplay.h"
#include <stdio.h>
#include <string.h>

extern "C" const uint8_t title_bin_start[] asm("_binary_title_bin_start");

namespace shell {

using namespace core;

enum class State : uint8_t {
    Title, Menu, Options, SelectP1, SelectP2, Versus, Playing, InGameMenu,
    Rules, Controls, Moves, Ending, GameOver, ConfirmQuit, ConfirmAbandon,
    NetMenu, NetSelect, NetWait, NetError
};

enum class Mode : uint8_t { Tournament, Duel };

static const GameModule* s_game = nullptr;
static State s_state = State::Title;
static State s_text_back = State::Menu;     // ou revenir depuis Regles / Commandes
static Mode  s_mode  = Mode::Tournament;
static int   s_sel   = 0;
static int   s_scroll = 0;
static save::Config s_cfg;
static uint32_t s_now = 0;
static char s_msg[44] = "";
static uint32_t s_msg_until = 0;

// Combat en cours
static fight::FighterId s_pick = fight::KENJI;      // curseur de selection
static fight::FighterId s_player = fight::KENJI;
static fight::FighterId s_foe = fight::KROWEN;
static fight::FighterId s_ladder[5];
static int  s_bout = 0;
static int  s_retries = 0;               // essais successifs du meme combat apres une defaite (aide en Novice)

// Reseau (2 joueurs) : liaison choisie, role, et erreur a afficher
static bool s_net = false;               // la partie en cours est une partie reseau
static uint8_t s_net_kind = 0;           // 0 = cable USB, 1 = Wi-Fi
static bool s_net_host = false;
static int  s_net_code = 0;              // fight::net::NetError
static char s_net_tech[80] = "";         // detail technique (message anglais du systeme), affiche en petit
static bool s_net_open_failed = false;

// Appui LONG sur MENU = capture d'ecran. Appui court = menu. On ne peut donc pas
// agir au FRONT MONTANT : il faut attendre le relachement pour savoir lequel c'etait.
constexpr uint32_t MENU_LONG_MS = 600;
static bool     s_menu_down = false;
static uint32_t s_menu_at   = 0;
static bool     s_shot_done = false;

static void say(const char* m) { snprintf(s_msg, sizeof s_msg, "%s", m); s_msg_until = s_now + 2000; }

static void take_screenshot() {
    char path[64];
    if (graphics_save_screenshot_bmp(path, sizeof path)) { say(i18n::T(i18n::STR_SHOT_OK)); sfx_menu_ok(); }
    else                                                  { say("!"); sfx_illegal(); }
}

static bool menu_pressed_short() {
    const bool held = input_is_held(Button::Menu);
    if (held && !s_menu_down) { s_menu_down = true; s_menu_at = s_now; s_shot_done = false; }
    if (held && s_menu_down && !s_shot_done && (s_now - s_menu_at) >= MENU_LONG_MS) {
        take_screenshot();
        s_shot_done = true;
    }
    if (!held && s_menu_down) {
        s_menu_down = false;
        if (!s_shot_done) return true;
    }
    return false;
}

static bool menu_nav(int& idx, int n) {
    if (input_repeat(Button::Up))   { idx = (idx + n - 1) % n; sfx_cursor(); }
    if (input_repeat(Button::Down)) { idx = (idx + 1) % n;     sfx_cursor(); }
    if (input_was_pressed(Button::A)) { sfx_menu_ok(); return true; }
    return false;
}

static void go_menu() { net_close(); s_net = false; audio_play_tune(Tune::Title); s_sel = 0; s_state = State::Menu; }

// -----------------------------------------------------------------------------
// Combat
// -----------------------------------------------------------------------------
static const int kTimes[3] = { 30, 60, 99 };   // time_idx 3 = illimitee (0 s dans MatchSetup)

static void start_bout() {
    MatchSetup s;
    s.player = s_player;
    s.foe    = s_foe;
    s.boss   = (s_mode == Mode::Tournament && s_bout == 4);
    s.level  = s_cfg.level;
    s.rounds_to_win = s_cfg.rounds;
    s.round_sec     = s_cfg.time_idx >= 3 ? 0 : kTimes[s_cfg.time_idx];
    s.assist        = (uint8_t)(s_retries > 3 ? 3 : s_retries);
    s_game->start(s);
    audio_play_tune(s.boss ? Tune::Boss : Tune::Game);
    s_state = State::Playing;
}

// Revanche (duel) ou nouvel essai (tournoi perdu) : jamais en reseau, ni apres le titre de champion.
static bool game_over_can_retry() {
    if (s_net) return false;
    if (s_mode == Mode::Duel) return true;
    return s_game->outcome() != OUT_WIN;
}

static void begin_match() {
    if (s_mode == Mode::Tournament) {
        fight::build_ladder(s_player, s_ladder);
        s_bout = 0;
        s_foe = s_ladder[0];
    }
    s_sel = 0;
    s_retries = 0;
    s_state = State::Versus;
}

// -----------------------------------------------------------------------------
// Menu principal
// -----------------------------------------------------------------------------
enum MenuItem { MI_TOURNAMENT = 0, MI_DUEL, MI_NETWORK, MI_RULES, MI_CONTROLS, MI_OPTIONS, MI_QUIT, MI_COUNT };

static void update_menu() {
    if (menu_nav(s_sel, MI_COUNT)) {
        switch (s_sel) {
            case MI_TOURNAMENT: s_mode = Mode::Tournament; s_pick = (fight::FighterId)s_cfg.fighter; s_state = State::SelectP1; break;
            case MI_DUEL:       s_mode = Mode::Duel;       s_pick = (fight::FighterId)s_cfg.fighter; s_state = State::SelectP1; break;
            case MI_NETWORK:    s_sel = 0; s_state = State::NetMenu; break;
            case MI_RULES:      s_scroll = 0; s_text_back = State::Menu; s_state = State::Rules;    break;
            case MI_CONTROLS:   s_scroll = 0; s_text_back = State::Menu; s_state = State::Controls; break;
            case MI_OPTIONS:    s_sel = 0; s_state = State::Options; break;
            case MI_QUIT:       s_sel = 1; s_state = State::ConfirmQuit; break;
        }
    }
    if (input_was_pressed(Button::B)) { sfx_menu_back(); save::save(s_cfg); s_state = State::Title; }
}

static void draw_menu_screen() {
    ui::Menu m { i18n::T(i18n::STR_TITLE),
        { i18n::T(i18n::STR_MODE_TOURNAMENT), i18n::T(i18n::STR_MODE_DUEL), i18n::T(i18n::STR_NETWORK),
          i18n::T(i18n::STR_RULES), i18n::T(i18n::STR_CONTROLS),
          i18n::T(i18n::STR_OPTIONS), i18n::T(i18n::STR_QUIT) }, MI_COUNT };
    ui::draw_menu(m, s_sel);
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------
enum OptItem { OI_LEVEL = 0, OI_ROUNDS, OI_TIME, OI_LANG, OI_MUSIC, OI_SFX, OI_ZOOM, OI_CALIB, OI_BACK };

static const i18n::StrId LVL[3] = { i18n::STR_LVL_1, i18n::STR_LVL_2, i18n::STR_LVL_3 };

static int clamp_vol(int v) { return v < 0 ? 0 : (v > 100 ? 100 : v); }

// Les options affichees dependent de la plateforme : le zoom n'existe que sur PC (SDL),
// le recalibrage du joystick que sur la console.
static int option_list(int* out) {
    int n = 0;
    out[n++] = OI_LEVEL; out[n++] = OI_ROUNDS; out[n++] = OI_TIME; out[n++] = OI_LANG; out[n++] = OI_MUSIC; out[n++] = OI_SFX;
    if (graphics_zoom_supported()) out[n++] = OI_ZOOM; else out[n++] = OI_CALIB;
    out[n++] = OI_BACK;
    return n;
}

static void apply_zoom() { if (graphics_zoom_supported()) graphics_set_zoom(s_cfg.zoom); }

static void update_options() {
    int items[10];
    const int n = option_list(items);
    const int dir = (input_repeat(Button::Right) ? 1 : 0) - (input_repeat(Button::Left) ? 1 : 0);
    if (dir) {
        switch (items[s_sel]) {
            case OI_LEVEL: s_cfg.level = (uint8_t)((s_cfg.level + 3 + dir) % 3); break;
            case OI_ROUNDS: s_cfg.rounds = (uint8_t)((s_cfg.rounds - 1 + 3 + dir) % 3 + 1); break;
            case OI_TIME:   s_cfg.time_idx = (uint8_t)((s_cfg.time_idx + 4 + dir) % 4); break;
            case OI_LANG: {
                const int l = ((int)s_cfg.language + i18n::LANG_COUNT + dir) % i18n::LANG_COUNT;
                s_cfg.language = (uint8_t)l;
                i18n::set_lang((i18n::Lang)l);
                break;
            }
            case OI_MUSIC: s_cfg.music_vol = (uint8_t)clamp_vol(s_cfg.music_vol + dir * 10);
                           audio_set_music_volume(s_cfg.music_vol / 100.0f); break;
            case OI_SFX:   s_cfg.sfx_vol = (uint8_t)clamp_vol(s_cfg.sfx_vol + dir * 10);
                           audio_set_sfx_volume(s_cfg.sfx_vol / 100.0f); break;
            case OI_ZOOM:  s_cfg.zoom = (uint8_t)(((int)s_cfg.zoom - 1 + 4 + dir) % 4 + 1);   // 1..4
                           apply_zoom(); break;
            default: break;
        }
        sfx_cursor();
    }
    if (menu_nav(s_sel, n)) {
        if (items[s_sel] == OI_CALIB) { input_request_calibration(); say(i18n::T(i18n::STR_CALIB)); }
        if (items[s_sel] == OI_BACK)  { save::save(s_cfg); s_sel = MI_OPTIONS; s_state = State::Menu; }
    }
    if (input_was_pressed(Button::B)) { sfx_menu_back(); save::save(s_cfg); s_sel = MI_OPTIONS; s_state = State::Menu; }
}

static void draw_options_screen() {
    int items[10];
    const int n = option_list(items);
    static char l[10][40];
    const char* ptr[10] = {};
    for (int i = 0; i < n; ++i) {
        switch (items[i]) {
            case OI_LEVEL: snprintf(l[i], 40, "%-9s < %s >", i18n::T(i18n::STR_LEVEL), i18n::T(LVL[s_cfg.level < 3 ? s_cfg.level : 1])); break;
            case OI_ROUNDS: snprintf(l[i], 40, "%-9s < %d >", i18n::T(i18n::STR_ROUNDS), s_cfg.rounds); break;
            case OI_TIME:
                if (s_cfg.time_idx >= 3) snprintf(l[i], 40, "%-9s < %s >", i18n::T(i18n::STR_TIME_LIMIT), i18n::T(i18n::STR_UNLIMITED));
                else                     snprintf(l[i], 40, "%-9s < %d s >", i18n::T(i18n::STR_TIME_LIMIT), kTimes[s_cfg.time_idx]);
                break;
            case OI_LANG:  snprintf(l[i], 40, "%-9s < %s >", i18n::T(i18n::STR_LANG),  i18n::lang_name((i18n::Lang)s_cfg.language)); break;
            case OI_MUSIC: snprintf(l[i], 40, "%-9s < %d%% >", i18n::T(i18n::STR_MUSIC), s_cfg.music_vol); break;
            case OI_SFX:   snprintf(l[i], 40, "%-9s < %d%% >", i18n::T(i18n::STR_SFX),   s_cfg.sfx_vol); break;
            case OI_ZOOM:
                if (s_cfg.zoom >= 4) snprintf(l[i], 40, "%-9s < %s >", i18n::T(i18n::STR_ZOOM), i18n::T(i18n::STR_FULLSCREEN));
                else                 snprintf(l[i], 40, "%-9s < x%d >", i18n::T(i18n::STR_ZOOM), s_cfg.zoom);
                break;
            case OI_CALIB: snprintf(l[i], 40, "%s", i18n::T(i18n::STR_CALIB)); break;
            default:       snprintf(l[i], 40, "%s", i18n::T(i18n::STR_BACK)); break;
        }
        ptr[i] = l[i];
    }
    ui::Menu m { i18n::T(i18n::STR_OPTIONS), {}, n };
    for (int i = 0; i < n; ++i) m.items[i] = ptr[i];
    ui::draw_menu(m, s_sel);
}

// -----------------------------------------------------------------------------
// Choix du combattant
// -----------------------------------------------------------------------------
static void update_select(bool foe) {
    const int dir = (input_repeat(Button::Right) ? 1 : 0) - (input_repeat(Button::Left) ? 1 : 0);
    if (dir) { s_pick = (fight::FighterId)(((int)s_pick + fight::FIGHTER_COUNT + dir) % fight::FIGHTER_COUNT); sfx_cursor(); }

    if (input_was_pressed(Button::A)) {
        sfx_menu_ok();
        if (!foe) {
            s_player = s_pick;
            s_cfg.fighter = (uint8_t)s_pick;
            if (s_mode == Mode::Duel) {
                s_pick = fight::def(s_player).rival;
                s_state = State::SelectP2;
            } else {
                begin_match();
            }
        } else {
            s_foe = s_pick;
            begin_match();
        }
    }
    if (input_was_pressed(Button::B)) {
        sfx_menu_back();
        if (foe) { s_pick = s_player; s_state = State::SelectP1; }
        else     { save::save(s_cfg); s_sel = s_mode == Mode::Tournament ? MI_TOURNAMENT : MI_DUEL; s_state = State::Menu; }
    }
}

// -----------------------------------------------------------------------------
// Ecran « Versus » entre deux combats
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Texte de l'univers : citations d'entree / de victoire, fin du tournoi
// -----------------------------------------------------------------------------
static char s_end_buf[48][44];
static int  s_end_n = 0;
static const char* end_ln(int i) { return i < s_end_n ? s_end_buf[i] : ""; }
static void build_ending() {
    s_end_n = 0;
    for (int k = 5; k <= 7; ++k) {
        s_end_n = textwrap::wrap<44>(i18n::lore(s_player, (uint8_t)k), 38, s_end_buf, s_end_n, 47);
        if (k < 7 && s_end_n < 47) s_end_buf[s_end_n++][0] = 0;       // ligne vide entre les paragraphes
    }
}
static int s_quote_n = 0;      // tourne entre les trois citations de victoire

// Affiche un texte centre, au plus 3 lignes, a partir de y.
static void draw_quote(const char* text, int y, uint16_t color) {
    char b[3][44];
    const int n = textwrap::wrap<44>(text, 38, b, 0, 3);
    for (int i = 0; i < n; ++i) graphics_draw_text_center_raw(y + i * 10, b[i], color);
}

static void update_versus() {
    if (input_was_pressed(Button::A)) { sfx_menu_ok(); start_bout(); }
    if (input_was_pressed(Button::B)) { sfx_menu_back(); go_menu(); }
}

static void draw_versus() {
    graphics_fill_rect_raw(0, 0, ui::SCR_W, ui::SCR_H, ui::C_BG);
    graphics_fill_rect_raw(0, 0, ui::SCR_W, ui::TOP_H, ui::C_BAR);

    char t[40];
    if (s_mode == Mode::Tournament) snprintf(t, sizeof t, i18n::T(i18n::STR_BOUT_NO), s_bout + 1);
    else                            snprintf(t, sizeof t, "%s", i18n::T(i18n::STR_MODE_DUEL));
    graphics_draw_text_center_raw(5, t, ui::C_ACCENT);

    const fight::FighterDef& a = fight::def(s_player);
    const fight::FighterDef& b = fight::def(s_foe);
    auto col = [](fight::Rgb c) { return graphics_make_color(c.r, c.g, c.b); };

    graphics_fill_rect_raw(20, 50, 100, 100, col(a.accent));
    graphics_draw_bitmap565_scaled(24, 54, 92, 92, fight::portrait(s_player), 64, 64, false);
    graphics_fill_rect_raw(200, 50, 100, 100, col(b.accent));
    graphics_draw_bitmap565_scaled(204, 54, 92, 92, fight::portrait(s_foe), 64, 64, false);

    graphics_draw_text_center_raw(88, "VS", ui::C_ACCENT);
    graphics_draw_text_raw(70 - graphics_text_width(a.short_name) / 2, 158, a.short_name, ui::C_TEXT);
    graphics_draw_text_raw(250 - graphics_text_width(b.short_name) / 2, 158, b.short_name, ui::C_TEXT);
    const char* ta = i18n::title_of(s_player);
    const char* tb = i18n::title_of(s_foe);
    graphics_draw_text_raw(70 - graphics_text_width(ta) / 2, 172, ta, ui::C_DIM);
    graphics_draw_text_raw(250 - graphics_text_width(tb) / 2, 172, tb, ui::C_DIM);

    if (s_mode == Mode::Tournament && s_bout == 4)
        graphics_draw_text_center_raw(34, i18n::T(i18n::STR_FINAL_DUEL), ui::C_TARGET);
    draw_quote(i18n::lore(s_foe, 0), 188, ui::C_TEXT);              // l'adversaire parle

    ui::bottom_bar(nullptr, true);
}

// -----------------------------------------------------------------------------
// Visionneuses de texte
// -----------------------------------------------------------------------------
static const char* rules_ln(int i) { return i18n::rules_line(i18n::GAME_FIGHT, i); }

// Page « Coups » : les speciaux du combattant du joueur, avec leur mouvement et leur raccourci.
// Notation : v bas, ^ haut, > vers l'adversaire, < en arriere.
static char s_moves_buf[8][44];
static int  s_moves_n = 0;
static const char* motion_str(fight::Motion m) {
    switch (m) {
        case fight::MO_QCF: return "v >";   case fight::MO_QCB: return "v <";   case fight::MO_DP: return "> v >";
        case fight::MO_HCF: return "< v >"; case fight::MO_BF:  return "< >";   case fight::MO_DU: return "v ^";
        default:            return "v v + B";
    }
}
static const char* shortcut_str(fight::Shortcut s) { return s == fight::SC_FWD ? ">" : s == fight::SC_BACK ? "<" : "^"; }
static void build_moves() {
    const fight::FighterDef& d = fight::def(s_player);
    s_moves_n = 0;
    snprintf(s_moves_buf[s_moves_n++], 44, "%s", d.short_name);
    for (int i = 0; i < 3; ++i) {
        snprintf(s_moves_buf[s_moves_n++], 44, "%s", d.specials[i].name);
        snprintf(s_moves_buf[s_moves_n++], 44, "   %s  ou  %s + C", motion_str(d.specials[i].motion), shortcut_str(d.specials[i].shortcut));
    }
    snprintf(s_moves_buf[s_moves_n++], 44, "SUPER : %s", d.super_name);
    snprintf(s_moves_buf[s_moves_n++], 44, "   Ki 100 + meme mouvement");
}
static const char* moves_ln(int i) { return i < s_moves_n ? s_moves_buf[i] : ""; }

// Page « Commandes » : les boutons de la console, puis (version PC) les touches du clavier.
static int controls_total() { return i18n::controls_lines() + (graphics_zoom_supported() ? i18n::keys_lines() : 0); }
static const char* controls_ln(int i) {
    const int n = i18n::controls_lines();
    return i < n ? i18n::controls_line(i) : i18n::keys_line(i - n);
}

static void update_text(int n) {
    constexpr int PER = 18;
    if (input_repeat(Button::Down) && s_scroll + PER < n) { s_scroll++; sfx_cursor(); }
    if (input_repeat(Button::Up)   && s_scroll > 0)       { s_scroll--; sfx_cursor(); }
    if (input_was_pressed(Button::B) || input_was_pressed(Button::A)) {
        sfx_menu_back();
        s_state = s_text_back;
    }
}

// -----------------------------------------------------------------------------
// Reseau 2 joueurs
// -----------------------------------------------------------------------------
static const i18n::StrId kNetItems[4] = { i18n::STR_NET_HOST_USB, i18n::STR_NET_JOIN_USB, i18n::STR_NET_HOST_WIFI, i18n::STR_NET_JOIN_WIFI };

static const char* net_error_text() {
    using namespace i18n;
    if (s_net_open_failed) return T(STR_NET_ERR_OPEN);
    switch (s_net_code) {
        case fight::net::NE_TIMEOUT:   return T(STR_NET_ERR_TIMEOUT);
        case fight::net::NE_VERSION:   return T(STR_NET_ERR_VERSION);
        case fight::net::NE_DESYNC:    return T(STR_NET_ERR_DESYNC);
        case fight::net::NE_PEER_LEFT: return T(STR_NET_ERR_LEFT);
        default:                       return T(STR_NET_ERR_LINK);
    }
}

static void net_fail(bool open_failed) {
    s_net_open_failed = open_failed;
    s_net_code = net_error();
    net_close();
    s_net = false;
    sfx_illegal();
    s_sel = 0;
    s_state = State::NetError;
}

static void update_net_menu() {
    if (menu_nav(s_sel, 5)) {
        if (s_sel == 4) { s_sel = MI_NETWORK; s_state = State::Menu; return; }
        s_net_kind = (uint8_t)(s_sel / 2);
        s_net_host = (s_sel % 2) == 0;
        s_pick = (fight::FighterId)s_cfg.fighter;
        s_state = State::NetSelect;
    }
    if (input_was_pressed(Button::B)) { sfx_menu_back(); s_sel = MI_NETWORK; s_state = State::Menu; }
}

static void update_net_select() {
    const int dir = (input_repeat(Button::Right) ? 1 : 0) - (input_repeat(Button::Left) ? 1 : 0);
    if (dir) { s_pick = (fight::FighterId)(((int)s_pick + fight::FIGHTER_COUNT + dir) % fight::FIGHTER_COUNT); sfx_cursor(); }
    if (input_was_pressed(Button::A)) {
        sfx_menu_ok();
        s_player = s_pick;
        s_cfg.fighter = (uint8_t)s_pick;
        save::save(s_cfg);
        s_mode = Mode::Duel;
        MatchSetup rules{};
        rules.rounds_to_win = s_cfg.rounds;                              // l'hote impose ses regles
        rules.round_sec = s_cfg.time_idx >= 3 ? 0 : kTimes[s_cfg.time_idx];
        s_net_tech[0] = 0;
        if (net_open(s_net_kind, s_net_host, (uint8_t)s_player, rules, s_net_tech, sizeof s_net_tech)) s_state = State::NetWait;
        else net_fail(true);
    }
    if (input_was_pressed(Button::B)) { sfx_menu_back(); s_sel = 0; s_state = State::NetMenu; }
}

static void update_net_wait() {
    const int r = net_poll(s_now);
    if (r > 0) {
        net_begin_match();
        s_net = true;
        audio_play_tune(Tune::Game);
        s_state = State::Playing;
    } else if (r < 0) {
        net_fail(false);
    } else if (input_was_pressed(Button::B)) {
        sfx_menu_back(); net_close(); s_sel = 0; s_state = State::NetMenu;
    }
}

static void draw_net_wait() {
    graphics_fill_rect_raw(0, 0, ui::SCR_W, ui::SCR_H, ui::C_BG);
    graphics_fill_rect_raw(0, 0, ui::SCR_W, ui::TOP_H, ui::C_BAR);
    graphics_draw_text_center_raw(5, i18n::T(i18n::STR_NETWORK), ui::C_ACCENT);
    const fight::FighterDef& a = fight::def(s_player);
    auto col = [](fight::Rgb c) { return graphics_make_color(c.r, c.g, c.b); };
    graphics_fill_rect_raw(110, 50, 100, 100, col(a.accent));
    graphics_draw_bitmap565_scaled(114, 54, 92, 92, fight::portrait(s_player), 64, 64, false);
    graphics_draw_text_center_raw(158, a.short_name, ui::C_TEXT);
    const bool dots = ((s_now / 400) & 3) != 0;
    graphics_draw_text_center_raw(180, i18n::T(s_net_host ? i18n::STR_NET_WAIT_HOST : i18n::STR_NET_WAIT_JOIN), dots ? ui::C_TEXT : ui::C_DIM);
    graphics_draw_text_center_raw(196, net_detail(), ui::C_DIM);
    ui::bottom_bar(nullptr, true);
}

// -----------------------------------------------------------------------------
// En combat
// -----------------------------------------------------------------------------
static void update_playing() {
    if (s_net && net_match_state() < 0) { net_fail(false); return; }
    const Outcome o = s_game->outcome();
    if (o == OUT_ONGOING) { s_game->update(s_now); return; }

    if (o == OUT_WIN && s_mode == Mode::Tournament && s_bout < 4) {
        // Combat suivant.
        sfx_promote();
        s_retries = 0;
        ++s_bout;
        s_foe = s_ladder[s_bout];
        s_state = State::Versus;
        return;
    }
    audio_play_tune(o == OUT_WIN ? Tune::Victory : Tune::Defeat);
    s_sel = 0;
    if (o == OUT_WIN && !s_net && s_mode == Mode::Tournament) {        // titre de champion : la fin du personnage
        build_ending(); s_scroll = 0; s_text_back = State::GameOver; s_state = State::Ending;
        return;
    }
    s_quote_n++;
    s_state = State::GameOver;
}

// =============================================================================
void init() {
    ui::init_palette();
    s_game = &module_fight();

    if (!save::load(s_cfg)) { s_cfg = save::Config{}; save::save(s_cfg); }
    if (s_cfg.language >= i18n::LANG_COUNT) s_cfg.language = 0;
    if (s_cfg.level >= 3) s_cfg.level = 1;
    if (s_cfg.fighter >= fight::FIGHTER_COUNT) s_cfg.fighter = 0;
    if (s_cfg.zoom < 1 || s_cfg.zoom > 4) s_cfg.zoom = 2;
    i18n::set_lang((i18n::Lang)s_cfg.language);
    audio_set_music_volume(s_cfg.music_vol / 100.0f);
    audio_set_sfx_volume(s_cfg.sfx_vol / 100.0f);
    apply_zoom();

    s_state = State::Title;
}

void update(uint32_t now) {
    s_now = now;
    audio_music_tick(now);
    if (now >= s_msg_until) s_msg[0] = 0;

    // Le bouton MENU est traite PARTOUT : l'appui long (capture) doit marcher
    // meme pendant un combat.
    const bool menu_short = menu_pressed_short();

    switch (s_state) {
        case State::Title:
            audio_play_tune(Tune::Title);
            if (input_was_pressed(Button::A) || menu_short) { sfx_menu_ok(); s_sel = 0; s_state = State::Menu; }
            break;

        case State::Menu:     update_menu(); break;
        case State::Options:  update_options(); break;
        case State::SelectP1: update_select(false); break;
        case State::SelectP2: update_select(true);  break;
        case State::Versus:   update_versus(); break;
        case State::Rules:    update_text(i18n::rules_lines(i18n::GAME_FIGHT)); break;
        case State::Controls: update_text(controls_total()); break;
        case State::Moves:    update_text(s_moves_n); break;
        case State::Ending:   update_text(s_end_n); break;
        case State::NetMenu:   update_net_menu(); break;
        case State::NetSelect: update_net_select(); break;
        case State::NetWait:   update_net_wait(); break;
        case State::NetError:
            if (input_was_pressed(Button::A) || input_was_pressed(Button::B)) { sfx_menu_back(); s_sel = 0; s_state = State::NetMenu; }
            break;

        case State::Playing:
            if (menu_short) {
                // Pas de pause en reseau (l'adversaire attendrait) : MENU quitte la partie.
                if (s_net) { sfx_menu_back(); go_menu(); }
                else { sfx_menu_ok(); s_sel = 0; s_state = State::InGameMenu; }
            }
            else update_playing();
            break;

        case State::InGameMenu:
            if (menu_nav(s_sel, 5)) {
                switch (s_sel) {
                    case 0: s_state = State::Playing; break;
                    case 1: s_scroll = 0; s_text_back = State::InGameMenu; s_state = State::Rules; break;
                    case 2: s_scroll = 0; s_text_back = State::InGameMenu; s_state = State::Controls; break;
                    case 3: build_moves(); s_scroll = 0; s_text_back = State::InGameMenu; s_state = State::Moves; break;
                    case 4: s_sel = 1; s_state = State::ConfirmAbandon; break;
                }
            }
            if (input_was_pressed(Button::B) || menu_short) { sfx_menu_back(); s_state = State::Playing; }
            break;

        case State::ConfirmAbandon:
            if (menu_nav(s_sel, 2)) {
                if (s_sel == 0) { save::save(s_cfg); go_menu(); }
                else            { s_sel = 4; s_state = State::InGameMenu; }
            }
            if (input_was_pressed(Button::B)) { sfx_menu_back(); s_sel = 4; s_state = State::InGameMenu; }
            break;

        case State::GameOver:
            if (game_over_can_retry()) {
                if (menu_nav(s_sel, 2)) {
                    if (s_sel == 0) {                                   // revanche / nouvel essai : directement au combat
                        if (s_mode == Mode::Tournament) ++s_retries; else s_retries = 0;
                        start_bout();
                    } else go_menu();
                }
                if (input_was_pressed(Button::B)) { sfx_menu_back(); go_menu(); }
            } else if (input_was_pressed(Button::A) || input_was_pressed(Button::B)) { sfx_menu_ok(); go_menu(); }
            break;

        case State::ConfirmQuit:
            if (menu_nav(s_sel, 2)) {
                if (s_sel == 0) { save::save(s_cfg); audio_stop_music(); tasks::return_to_loader(); }
                else            { s_sel = MI_QUIT; s_state = State::Menu; }
            }
            if (input_was_pressed(Button::B)) { sfx_menu_back(); s_sel = MI_QUIT; s_state = State::Menu; }
            break;
    }
}

void draw() {
    switch (s_state) {
        case State::Title:
            graphics_draw_fullscreen565((const uint16_t*)title_bin_start);
            graphics_draw_text_center_raw(ui::SCR_H - 13, i18n::T(i18n::STR_PRESS_A), ui::C_TEXT);
            return;
        case State::Rules:
            ui::text_page(i18n::T(i18n::STR_RULES), rules_ln, i18n::rules_lines(i18n::GAME_FIGHT), s_scroll, 18);
            return;
        case State::Controls:
            ui::text_page(i18n::T(i18n::STR_CONTROLS), controls_ln, controls_total(), s_scroll, 18);
            return;
        case State::Ending:
            ui::text_page(i18n::lore(s_player, 4), end_ln, s_end_n, s_scroll, 18);
            return;
        case State::Moves:
            ui::text_page(i18n::T(i18n::STR_MOVES), moves_ln, s_moves_n, s_scroll, 18);
            return;
        case State::SelectP1:
            fight::draw_select(s_pick, s_now, i18n::T(i18n::STR_CHOOSE_YOU));
            return;
        case State::SelectP2:
            fight::draw_select(s_pick, s_now, i18n::T(i18n::STR_CHOOSE_FOE));
            return;
        case State::Versus:
            draw_versus();
            return;
        case State::NetSelect:
            fight::draw_select(s_pick, s_now, i18n::T(i18n::STR_CHOOSE_YOU));
            return;
        case State::NetWait:
            draw_net_wait();
            return;
        default: break;
    }

    const bool in_game = (s_state == State::Playing || s_state == State::InGameMenu ||
                          s_state == State::GameOver || s_state == State::ConfirmAbandon);
    if (in_game) {
        s_game->draw(s_now);
        if (s_msg[0]) {                                     // « Capture enregistree »
            const int w = graphics_text_width(s_msg) + 12;
            graphics_fill_rect_raw((ui::SCR_W - w) / 2, ui::SCR_H - 22, w, 16, ui::C_MENU_BG);
            graphics_draw_text_center_raw(ui::SCR_H - 18, s_msg, ui::C_TEXT);
        }
    } else {
        graphics_fill_rect_raw(0, 0, ui::SCR_W, ui::SCR_H, ui::C_BG);
    }

    switch (s_state) {
        case State::Menu:    draw_menu_screen(); ui::bottom_bar(nullptr, true); break;
        case State::Options: draw_options_screen(); ui::bottom_bar(s_msg[0] ? s_msg : nullptr, true); break;

        case State::InGameMenu: {
            const ui::Menu m { i18n::T(i18n::STR_TITLE),
                { i18n::T(i18n::STR_RESUME), i18n::T(i18n::STR_RULES),
                  i18n::T(i18n::STR_CONTROLS), i18n::T(i18n::STR_MOVES), i18n::T(i18n::STR_QUIT_MATCH) }, 5 };
            ui::draw_menu(m, s_sel);
            break;
        }
        case State::ConfirmAbandon: {
            const ui::Menu m { i18n::T(i18n::STR_QUIT_MATCH_CONFIRM),
                { i18n::T(i18n::STR_YES), i18n::T(i18n::STR_NO) }, 2 };
            ui::draw_menu(m, s_sel);
            break;
        }
        case State::NetMenu: {
            const ui::Menu m { i18n::T(i18n::STR_NETWORK),
                { i18n::T(kNetItems[0]), i18n::T(kNetItems[1]), i18n::T(kNetItems[2]), i18n::T(kNetItems[3]),
                  i18n::T(i18n::STR_BACK) }, 5 };
            ui::draw_menu(m, s_sel);
            ui::bottom_bar(nullptr, true);
            break;
        }
        case State::NetError: {
            const ui::Menu m { net_error_text(), { i18n::T(i18n::STR_BACK) }, 1 };
            ui::draw_menu(m, 0);
            if (s_net_tech[0]) graphics_draw_text_center_raw(ui::SCR_H - 40, s_net_tech, ui::C_DIM);
            break;
        }
        case State::GameOver: {
            const Outcome o = s_game->outcome();
            const char* t = o == OUT_WIN ? (!s_net && s_mode == Mode::Tournament ? i18n::T(i18n::STR_CHAMPION)
                                                                       : i18n::T(i18n::STR_YOU_WIN))
                                         : i18n::T(i18n::STR_YOU_LOSE);
            if (game_over_can_retry()) {
                const ui::Menu m { t, { i18n::T(s_mode == Mode::Tournament ? i18n::STR_RETRY : i18n::STR_REMATCH), i18n::T(i18n::STR_BACK) }, 2 };
                ui::draw_menu(m, s_sel);
            } else {
                const ui::Menu m { t, { i18n::T(i18n::STR_BACK) }, 1 };
                ui::draw_menu(m, 0);
            }
            if (!s_net) {                                              // une repartie du vainqueur
                const uint8_t who = o == OUT_WIN ? s_player : s_foe;
                draw_quote(i18n::lore(who, (uint8_t)(1 + s_quote_n % 3)), 168, ui::C_DIM);
            }
            break;
        }
        case State::ConfirmQuit: {
            const ui::Menu m { i18n::T(i18n::STR_QUIT_CONFIRM),
                { i18n::T(i18n::STR_YES), i18n::T(i18n::STR_NO) }, 2 };
            ui::draw_menu(m, s_sel);
            break;
        }
        default: break;
    }
}

} // namespace shell
