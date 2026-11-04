/*
===============================================================================
  input.cpp — Entrées (AKA Chess)
===============================================================================
*/
#include "input.h"
#include "gb_core.h"

extern gb_core g_core;

namespace core {

static gb_buttons::gb_key map_button(Button b) {
    switch (b) {
        case Button::Left:  return gb_buttons::KEY_LEFT;
        case Button::Right: return gb_buttons::KEY_RIGHT;
        case Button::Up:    return gb_buttons::KEY_UP;
        case Button::Down:  return gb_buttons::KEY_DOWN;
        case Button::A:     return gb_buttons::KEY_A;
        case Button::B:     return gb_buttons::KEY_B;
        case Button::C:     return gb_buttons::KEY_C;
        case Button::D:     return gb_buttons::KEY_D;
        case Button::L1:    return gb_buttons::KEY_L1;
        case Button::R1:    return gb_buttons::KEY_R1;
        case Button::Menu:  return gb_buttons::KEY_MENU;
        case Button::Run:   return gb_buttons::KEY_RUN;
        default:            return gb_buttons::KEY_A;
    }
}

constexpr int NB = (int)Button::COUNT;

// Répétition : 380 ms avant de démarrer (assez long pour qu'un appui bref ne
// parte jamais en rafale), puis un pas toutes les 90 ms.
constexpr uint32_t REPEAT_DELAY_MS = 380;
constexpr uint32_t REPEAT_RATE_MS  = 90;

// -----------------------------------------------------------------------------
// Frontière entre les deux tâches : un simple uint16_t. Les lectures et
// écritures d'un mot aligné sont atomiques sur l'ESP32 — pas besoin de mutex,
// et surtout pas de mutex dans une boucle de rendu.
// -----------------------------------------------------------------------------
static volatile uint16_t s_raw       = 0;
static volatile bool     s_calib_req = false;
static volatile bool     s_calib_now = false;

// --- Tâche système (CPU 0) : SEULE à toucher le matériel ----------------------
void input_service() {
    if (s_calib_req) {
        s_calib_req = false;
        s_calib_now = true;

        // calibrate_center() enchaîne 2000 lectures ADC entrecoupées de
        // gb_delay_us(100) : c'est une attente ACTIVE de plusieurs centaines de
        // millisecondes. Elle ne peut se faire que d'ici, où l'on est seul sur
        // l'ADC. L'appeler depuis la tâche de jeu, pendant que cette tâche-ci
        // lisait le même ADC, faisait paniquer la console.
        g_core.joystick.calibrate_center();

        s_calib_now = false;
    }

    g_core.pool();

    // D-Pad physique OU émulation D-Pad du joystick analogique. On combine les
    // deux ÉTATS, et les fronts sont dérivés plus loin de cet état combiné :
    // combiner les détecteurs de front du SDK (buttons.pressed() |
    // joystick.pressed()) donnerait un résultat incohérent, chacun tenant son
    // propre historique.
    s_raw = g_core.buttons.state() | g_core.joystick.state();
}

void input_request_calibration() { s_calib_req = true; }
bool input_calibrating()         { return s_calib_now || s_calib_req; }
uint16_t input_raw_state()       { return s_raw; }

// --- Tâche de jeu (CPU 1) : ne touche AUCUN périphérique ---------------------
static bool     s_now[NB]         = {};
static bool     s_prev[NB]        = {};
static uint32_t s_down_ms[NB]     = {};
static uint32_t s_next_rep_ms[NB] = {};
static bool     s_repeated[NB]    = {};

void input_poll(uint32_t now_ms) {
    const uint16_t combined = s_raw;   // simple relecture du cache

    for (int i = 0; i < NB; ++i) {
        const bool held = (combined & (uint16_t)map_button((Button)i)) != 0;
        s_prev[i]     = s_now[i];
        s_now[i]      = held;
        s_repeated[i] = false;

        if (held && !s_prev[i]) {
            s_down_ms[i]     = now_ms;
            s_next_rep_ms[i] = now_ms + REPEAT_DELAY_MS;
        } else if (held && (int32_t)(now_ms - s_next_rep_ms[i]) >= 0) {
            s_repeated[i]    = true;
            s_next_rep_ms[i] = now_ms + REPEAT_RATE_MS;
        } else if (!held) {
            s_down_ms[i] = 0;
        }
    }
}

bool input_is_held(Button b)     { return s_now[(int)b]; }
bool input_was_pressed(Button b) { return s_now[(int)b] && !s_prev[(int)b]; }
bool input_repeat(Button b)      { return input_was_pressed(b) || s_repeated[(int)b]; }

uint32_t input_held_ms(Button b, uint32_t now_ms) {
    const int i = (int)b;
    if (!s_now[i] || s_down_ms[i] == 0) return 0;
    return now_ms - s_down_ms[i];
}

} // namespace core
