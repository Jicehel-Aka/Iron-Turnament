/*
  pc_input.cpp — core/input.h pour la version PC. Les touches viennent de pc_main.cpp
  (clavier + manette) ; les fronts et la repetition sont calcules ici, a la cadence du jeu,
  exactement comme sur la console.
*/
#include "../main/core/input.h"
#include "pc_platform.h"

namespace core {

constexpr int NB = (int)Button::COUNT;
constexpr uint32_t REPEAT_DELAY_MS = 380, REPEAT_RATE_MS = 90;

static bool     s_raw[NB]  = {};
static bool     s_now[NB]  = {}, s_prev[NB] = {}, s_rep[NB] = {};
static uint32_t s_down_ms[NB] = {}, s_next_rep[NB] = {};

void pc_input_feed(const bool* held) { for (int i = 0; i < NB; ++i) s_raw[i] = held[i]; }

void input_service() {}
void input_request_calibration() {}
bool input_calibrating() { return false; }
uint16_t input_raw_state() { return 0; }

void input_poll(uint32_t now_ms) {
    for (int i = 0; i < NB; ++i) {
        const bool held = s_raw[i];
        s_prev[i] = s_now[i]; s_now[i] = held; s_rep[i] = false;
        if (held && !s_prev[i]) { s_down_ms[i] = now_ms; s_next_rep[i] = now_ms + REPEAT_DELAY_MS; }
        else if (held && (int32_t)(now_ms - s_next_rep[i]) >= 0) { s_rep[i] = true; s_next_rep[i] = now_ms + REPEAT_RATE_MS; }
        else if (!held) s_down_ms[i] = 0;
    }
}
bool input_is_held(Button b)     { return s_now[(int)b]; }
bool input_was_pressed(Button b) { return s_now[(int)b] && !s_prev[(int)b]; }
bool input_repeat(Button b)      { return input_was_pressed(b) || s_rep[(int)b]; }
uint32_t input_held_ms(Button b, uint32_t now_ms) {
    const int i = (int)b;
    return (s_now[i] && s_down_ms[i]) ? now_ms - s_down_ms[i] : 0;
}

} // namespace core
