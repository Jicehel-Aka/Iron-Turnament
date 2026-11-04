/*
  pc_audio.cpp — core/audio.h pour la version PC : meme principe que la console, tout est
  SYNTHETISE (aucun fichier son). Deux oscillateurs de musique + un pool d'effets, rendus dans
  le callback SDL.
*/
#include "../main/core/audio.h"
#include "pc_platform.h"
#include <SDL.h>
#include <cmath>
#include <cstdlib>

namespace core {

static constexpr int RATE = 44100;
static SDL_AudioDeviceID s_dev = 0;
static float s_master = 1.0f, s_music_vol = 0.35f, s_sfx_vol = 0.85f;

// --- effets : un « bip » a glissando, jusqu'a 6 en parallele ----------------------------------------------
struct Sfx { float f0, f1, vol; int len, pos; int wave; bool on; };
static Sfx s_sfx[6];

static void play_sfx(float f0, float f1, float ms, float vol, int wave) {
    if (!s_dev) return;
    SDL_LockAudioDevice(s_dev);
    for (Sfx& s : s_sfx) if (!s.on) { s = { f0, f1, vol, (int)(ms * RATE / 1000), 0, wave, true }; break; }
    SDL_UnlockAudioDevice(s_dev);
}

void sfx_cursor()        { play_sfx(900, 900, 25, 0.10f, 0); }
void sfx_select()        { play_sfx(660, 880, 55, 0.20f, 0); }
void sfx_cancel()        { play_sfx(500, 300, 70, 0.20f, 0); }
void sfx_move()          { play_sfx(260, 200, 70, 0.28f, 1); }
void sfx_capture()       { play_sfx(180, 70, 140, 0.40f, 2); }
void sfx_multi_capture() { play_sfx(120, 40, 380, 0.50f, 2); play_sfx(600, 1200, 250, 0.20f, 0); }
void sfx_promote()       { play_sfx(440, 880, 220, 0.25f, 0); play_sfx(660, 1320, 260, 0.15f, 0); }
void sfx_gameover()      { play_sfx(440, 110, 500, 0.30f, 1); }
void sfx_draw()          { play_sfx(330, 330, 200, 0.20f, 1); }
void sfx_illegal()       { play_sfx(110, 90, 90, 0.30f, 1); }
void sfx_menu_ok()       { play_sfx(520, 780, 70, 0.22f, 0); }
void sfx_menu_back()     { play_sfx(520, 340, 70, 0.20f, 0); }

// --- musique : deux pistes (basse triangle + melodie carree), notes en demi-tons au-dessus de A2 -------
struct Song { const int8_t* mel; const int8_t* bass; int len; int step_ms; bool loop; };
static const int8_t TITLE_M[] = { 24,0,27,0,31,0,27,0, 29,0,32,0,36,0,32,0 };
static const int8_t TITLE_B[] = { 0,0,0,0,0,0,0,0, 5,0,0,0,5,0,0,0 };
static const int8_t GAME_M[]  = { 24,0,24,27, 0,24,0,22, 24,0,24,29, 0,27,0,26,  24,0,24,27, 0,31,0,29, 27,0,26,0, 24,0,0,0 };
static const int8_t GAME_B[]  = { 0,0,0,0, 0,0,0,0, 3,0,0,0, 3,0,0,0,  0,0,0,0, 0,0,0,0, 5,0,0,0, 7,0,0,0 };
static const int8_t WIN_M[]   = { 24,28,31,36, 0,31,36,0 };
static const int8_t WIN_B[]   = { 0,0,7,0, 0,0,12,0 };
static const int8_t LOSE_M[]  = { 31,0,29,0, 27,0,24,0, 0,0,0,0 };
static const int8_t LOSE_B[]  = { 7,0,0,0, 3,0,0,0, 0,0,0,0 };
static const Song SONGS[5] = {
    { nullptr, nullptr, 0, 1, false },
    { TITLE_M, TITLE_B, 16, 260, true },
    { GAME_M,  GAME_B,  32, 150, true },
    { WIN_M,   WIN_B,   8,  170, false },
    { LOSE_M,  LOSE_B,  12, 260, false },
};
static Tune s_tune = Tune::None;
static int  s_step = 0; static int s_step_samples = 0;
static float s_ph_m = 0, s_ph_b = 0;
static float s_f_m = 0, s_f_b = 0;

static float note_hz(int n) { return 110.0f * std::pow(2.0f, (float)n / 12.0f); }

static void music_step(const Song& s) {
    if (s.len == 0) return;
    if (s_step >= s.len) {
        if (!s.loop) { s_tune = Tune::None; s_f_m = s_f_b = 0; return; }
        s_step = 0;
    }
    const int m = s.mel[s_step], b = s.bass[s_step];
    if (m) s_f_m = note_hz(m);     // 0 = on laisse sonner la note precedente (sustain), -1 = silence
    if (b) s_f_b = note_hz(b - 12);
    ++s_step;
}

static void callback(void*, Uint8* stream, int bytes) {
    int16_t* out = (int16_t*)stream;
    const int n = bytes / 2;
    for (int i = 0; i < n; ++i) {
        float v = 0;

        if (s_tune != Tune::None) {
            const Song& sg = SONGS[(int)s_tune];
            if (s_step_samples <= 0) { s_step_samples = sg.step_ms * RATE / 1000; music_step(sg); }
            --s_step_samples;
            if (s_f_m > 0) { s_ph_m += s_f_m / RATE; if (s_ph_m >= 1) s_ph_m -= 1; v += (s_ph_m < 0.25f ? 0.5f : -0.5f) * 0.5f * s_music_vol; }
            if (s_f_b > 0) { s_ph_b += s_f_b / RATE; if (s_ph_b >= 1) s_ph_b -= 1; v += (4.0f * std::fabs(s_ph_b - 0.5f) - 1.0f) * 0.5f * s_music_vol; }
        }

        for (Sfx& s : s_sfx) {
            if (!s.on) continue;
            const float t = (float)s.pos / (float)s.len;
            const float f = s.f0 + (s.f1 - s.f0) * t;
            static float ph[6]; float& p = ph[&s - s_sfx];
            p += f / RATE; if (p >= 1) p -= 1;
            float w = s.wave == 0 ? (p < 0.5f ? 1.0f : -1.0f)
                    : s.wave == 1 ? (4.0f * std::fabs(p - 0.5f) - 1.0f)
                                  : ((float)(std::rand() & 1023) / 512.0f - 1.0f);        // bruit
            v += w * s.vol * (1.0f - t) * s_sfx_vol * 0.5f;
            if (++s.pos >= s.len) s.on = false;
        }
        v *= s_master;
        out[i] = (int16_t)(std::fmax(-1.0f, std::fmin(1.0f, v)) * 30000.0f);
    }
}

void audio_init() {}
void audio_set_master_volume(uint8_t v) { s_master = (float)v / 255.0f; }
void audio_set_music_volume(float v)    { s_music_vol = v; }
void audio_set_sfx_volume(float v)      { s_sfx_vol = v; }
void audio_music_tick(uint32_t) {}
void audio_play_pmf(const void*) {}
void audio_stop_music() { if (s_dev) SDL_LockAudioDevice(s_dev); s_tune = Tune::None; s_f_m = s_f_b = 0; if (s_dev) SDL_UnlockAudioDevice(s_dev); }
void audio_play_tune(Tune t) {
    if (t == s_tune || !s_dev) return;           // la coquille l'appelle a chaque image sur l'ecran-titre
    SDL_LockAudioDevice(s_dev);
    s_tune = t; s_step = 0; s_step_samples = 0; s_f_m = s_f_b = 0;
    SDL_UnlockAudioDevice(s_dev);
}

} // namespace core

void pc_audio_open() {
    if (SDL_InitSubSystem(SDL_INIT_AUDIO) != 0) return;
    SDL_AudioSpec want = {}, have = {};
    want.freq = core::RATE; want.format = AUDIO_S16SYS; want.channels = 1; want.samples = 1024;
    want.callback = core::callback;
    core::s_dev = SDL_OpenAudioDevice(nullptr, 0, &want, &have, 0);
    if (core::s_dev) SDL_PauseAudioDevice(core::s_dev, 0);
}
void pc_audio_close() { if (core::s_dev) { SDL_CloseAudioDevice(core::s_dev); core::s_dev = 0; } }
