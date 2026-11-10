/*
===============================================================================
  audio.cpp — Son et musique synthétisés (mAKAdames)
-------------------------------------------------------------------------------
  Le SDK ne fournit que des oscillateurs (gb_audio_track_tone : sinus, carré,
  triangle, bruit) et un lecteur de modules PMF. On n'utilise QUE les
  oscillateurs : un module PMF embarquerait des samples PCM, donc des assets
  externes sous licence. Ici, la musique naît de trois tables de notes.

  Le séquenceur n'a pas de tâche à lui. Il est appelé une fois par frame et
  regarde l'horloge : si le pas suivant est dû, il déclenche les notes. C'est
  suffisant (un pas dure 400 ms, la boucle de jeu tourne à 30+ fps) et ça évite
  une tâche FreeRTOS de plus, avec sa pile et ses problèmes de synchronisation.
===============================================================================
*/
#include "audio.h"
#include "gb_audio_player.h"
#include "gb_audio_track_tone.h"
#include "gb_audio_track_pmf.h"
#include "gb_ll_audio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <math.h>

namespace core {

// -----------------------------------------------------------------------------
// Le mixeur du SDK est limité à 4 pistes (AUDIO_PLAYER_TRACK_COUNT). On les
// dépense donc avec parcimonie : 3 pour la musique, 1 pour les effets.
// -----------------------------------------------------------------------------
static gb_audio_player     g_player;
static gb_audio_track_tone g_bass;
static gb_audio_track_tone g_chord;
static gb_audio_track_tone g_melody;
static gb_audio_track_tone g_sfx;
static gb_audio_track_pmf  g_pmf;      // crochet, inutilisé par défaut

static float g_music_vol = 0.34f;      // reglage du joueur (Options) ecrase cette valeur par defaut
static float g_sfx_vol   = 0.85f;

// -----------------------------------------------------------------------------
// Table des fréquences MIDI. Calculée une fois : évite un powf() par note.
// -----------------------------------------------------------------------------
constexpr int MIDI_LO = 36;    // do1
constexpr int MIDI_HI = 96;    // do6
static float g_freq[MIDI_HI - MIDI_LO + 1];

static void build_freq_table() {
    for (int n = MIDI_LO; n <= MIDI_HI; ++n)
        g_freq[n - MIDI_LO] = 440.0f * powf(2.0f, (n - 69) / 12.0f);
}
static inline float note_freq(uint8_t n) {
    if (n < MIDI_LO || n > MIDI_HI) return 0.0f;
    return g_freq[n - MIDI_LO];
}

static void audio_task(void*) {
    while (true) {
        g_player.pool();
        vTaskDelay(pdMS_TO_TICKS(2));
    }
}

void audio_init() {
    build_freq_table();
    gb_ll_audio_set_volume(200);

    g_player.add_track(&g_bass);
    g_player.add_track(&g_chord);
    g_player.add_track(&g_melody);
    g_player.add_track(&g_sfx);

    // Les volumes de PISTE restent a 1.0, et c'est deliberé : le reglage du joueur
    // est applique EXPLICITEMENT sur chaque note, au moment de la jouer (cf.
    // audio_music_tick et les sfx_*). On ne depend donc d'aucune hypothese sur la
    // semantique de set_track_volume() du SDK — le reglage agit, point.
    g_bass.set_track_volume(1.0f);
    g_chord.set_track_volume(1.0f);
    g_melody.set_track_volume(1.0f);
    g_sfx.set_track_volume(1.0f);

    // Le mixeur doit tourner en continu : sa propre tâche, sur le CPU 0, pour
    // ne pas être bousculée par la recherche d'échecs (qui, elle, monopolise
    // le CPU 1 pendant plusieurs secondes au niveau Maître).
    xTaskCreatePinnedToCore(audio_task, "AudioTask", 4096, nullptr, 5, nullptr, 0);
}

void audio_set_master_volume(uint8_t v) { gb_ll_audio_set_volume(v); }

void audio_set_music_volume(float v) {
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;
    g_music_vol = v;
    // A zero, on coupe VRAIMENT : sinon la note en cours continuerait de sonner
    // jusqu'a la fin de son enveloppe, et le joueur croirait le reglage casse.
    if (v <= 0.0f) {
        g_bass.stop_playing();
        g_chord.stop_playing();
        g_melody.stop_playing();
    }
}
void audio_set_sfx_volume(float v) {
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;
    g_sfx_vol = v;
}

// =============================================================================
//  Séquenceur
// =============================================================================
//
// Une piste = un octet par pas. 0 = silence, sinon numéro de note MIDI.
// 32 pas = 4 mesures à 8 croches. Progression en la mineur (Am - F - C - G) :
// mineure sans être plombante, et surtout tonale et prévisible — la musique
// d'un jeu de réflexion ne doit jamais accrocher l'oreille.
//
constexpr int STEPS = 32;

// --- Musique de combat : basse pulsee, arpeges, accroche -------------------------
// Meme grille Am - F - C - G que le reste du jeu, mais a 135 ms la croche (~110 bpm) avec une basse qui
// martele : on est dans un jeu de baston, pas devant un echiquier.
static const uint8_t GAME_BASS[STEPS] = {
    45,0,45,0, 45,0,52,0,
    41,0,41,0, 41,0,48,0,
    48,0,48,0, 48,0,55,0,
    43,0,43,0, 43,0,50,0,
};
static const uint8_t GAME_CHORD[STEPS] = {
    57,60,64,60, 57,60,64,67,   // Am
    53,57,60,57, 53,57,60,65,   // F
    60,64,67,64, 60,64,67,72,   // C
    55,59,62,59, 55,59,62,67,   // G
};
static const uint8_t GAME_MELODY[STEPS] = {
    69,0,72,0, 76,0,74,72,
    72,0,69,0, 65,0,69,72,
    76,0,0,79, 76,0,74,72,
    74,0,71,0, 67,0,71,74,
};

// --- Duel final : re mineur / la majeur, plus rapide, plus tendu ---------------
static const uint8_t BOSS_BASS[STEPS] = {
    38,0,38,38, 38,0,45,0,
    46,0,46,46, 46,0,53,0,
    48,0,48,48, 48,0,55,0,
    45,0,45,45, 45,0,52,0,
};
static const uint8_t BOSS_CHORD[STEPS] = {
    62,65,69,65, 62,65,69,74,   // Dm
    58,62,65,62, 58,62,65,70,   // Bb
    60,64,67,64, 60,64,67,72,   // C
    57,61,64,61, 57,61,64,69,   // A
};
static const uint8_t BOSS_MELODY[STEPS] = {
    74,0,77,0, 81,0,77,74,
    77,0,74,0, 70,0,74,77,
    79,0,0,76, 79,0,76,72,
    73,0,76,0, 81,0,0,0,
};

// --- Écran-titre : même harmonie, mais plus présente et plus ample -------------
static const uint8_t TITLE_BASS[STEPS] = {
    45,0,45,0, 0,0,0,0,
    41,0,41,0, 0,0,0,0,
    48,0,48,0, 0,0,0,0,
    43,0,43,0, 55,0,0,0,
};
static const uint8_t TITLE_CHORD[STEPS] = {
    69,0,72,0, 76,0,72,0,
    65,0,69,0, 72,0,69,0,
    72,0,76,0, 79,0,76,0,
    67,0,71,0, 74,0,71,0,
};
static const uint8_t TITLE_MELODY[STEPS] = {
    76,0,0,74, 72,0,0,0,
    69,0,0,71, 72,0,0,0,
    76,0,0,79, 76,0,74,0,
    72,0,71,0, 69,0,0,0,
};

// --- Victoire / défaite : joués UNE fois, pas en boucle ------------------------
static const uint8_t WIN_BASS[STEPS] = {
    48,0,0,0, 52,0,0,0, 55,0,0,0, 60,0,0,0,
     0,0,0,0,  0,0,0,0,  0,0,0,0,  0,0,0,0,
};
static const uint8_t WIN_CHORD[STEPS] = {
    64,0,67,0, 72,0,76,0, 79,0,0,0, 84,0,0,0,
     0,0,0,0,  0,0,0,0,   0,0,0,0,   0,0,0,0,
};
static const uint8_t WIN_MELODY[STEPS] = {
     0,0,0,0,  0,0,0,0,  0,0,0,0,  0,0,0,0,
     0,0,0,0,  0,0,0,0,  0,0,0,0,  0,0,0,0,
};

static const uint8_t LOSE_BASS[STEPS] = {
    45,0,0,0, 43,0,0,0, 41,0,0,0, 38,0,0,0,
     0,0,0,0,  0,0,0,0,  0,0,0,0,  0,0,0,0,
};
static const uint8_t LOSE_CHORD[STEPS] = {
    60,0,0,0, 57,0,0,0, 53,0,0,0, 50,0,0,0,
     0,0,0,0,  0,0,0,0,  0,0,0,0,  0,0,0,0,
};
static const uint8_t LOSE_MELODY[STEPS] = {
     0,0,0,0,  0,0,0,0,  0,0,0,0,  0,0,0,0,
     0,0,0,0,  0,0,0,0,  0,0,0,0,  0,0,0,0,
};

struct TuneDef {
    const uint8_t* bass;
    const uint8_t* chord;
    const uint8_t* melody;
    uint16_t step_ms;
    bool     loop;
};

static const TuneDef TUNES[] = {
    { nullptr,     nullptr,      nullptr,      0,   false },  // None
    { TITLE_BASS,  TITLE_CHORD,  TITLE_MELODY, 300, true  },  // Title
    { GAME_BASS,   GAME_CHORD,   GAME_MELODY,  135, true  },  // Game
    { WIN_BASS,    WIN_CHORD,    WIN_MELODY,   180, false },  // Victory
    { LOSE_BASS,   LOSE_CHORD,   LOSE_MELODY,  260, false },  // Defeat
    { BOSS_BASS,   BOSS_CHORD,   BOSS_MELODY,  112, true  },  // Boss
};

static Tune     g_tune     = Tune::None;
static int      g_step     = 0;
static uint32_t g_next_ms  = 0;

void audio_play_tune(Tune t) {
    if (g_tune == t) return;
    if (t == Tune::None) { audio_stop_music(); return; }   // sinon la dernière
                                                           // note continuerait
                                                           // de sonner
    g_tune    = t;
    g_step    = 0;
    g_next_ms = 0;      // 0 = « déclenche au prochain tick », quel qu'il soit
}

void audio_stop_music() {
    g_tune = Tune::None;
    g_bass.stop_playing();
    g_chord.stop_playing();
    g_melody.stop_playing();
}

void audio_music_tick(uint32_t now_ms) {
    if (g_tune == Tune::None) return;
    const TuneDef& td = TUNES[(int)g_tune];
    if (!td.bass) return;

    if (g_next_ms == 0) g_next_ms = now_ms;
    if ((int32_t)(now_ms - g_next_ms) < 0) return;

    const uint8_t nb = td.bass[g_step];
    const uint8_t nc = td.chord[g_step];
    const uint8_t nm = td.melody[g_step];

    // Enveloppe décroissante (volume final < volume initial) : ça donne un son
    // « pincé » plutôt qu'un bourdon d'orgue, bien plus supportable en boucle.
    // Le volume du joueur multiplie CHAQUE note. A 0 %, plus une seule note n'est
    // declenchee : le silence est reel, pas approximatif.
    const float V = g_music_vol;
    if (V > 0.001f) {
        if (nb) {
            const float f = note_freq(nb);
            g_bass.play_tone(f, f, 0.55f * V, 0.10f * V, td.step_ms * 3,
                             gb_audio_track_tone::TRIANGLE);
        }
        if (nc) {
            const float f = note_freq(nc);
            g_chord.play_tone(f, f, 0.30f * V, 0.02f * V, (uint16_t)(td.step_ms * 1.6f),
                              gb_audio_track_tone::TRIANGLE);
        }
        if (nm) {
            const float f = note_freq(nm);
            g_melody.play_tone(f, f, 0.42f * V, 0.05f * V, td.step_ms * 2,
                               gb_audio_track_tone::SINE);
        }
    }

    g_next_ms += td.step_ms;
    g_step++;
    if (g_step >= STEPS) {
        if (td.loop) g_step = 0;
        else         g_tune = Tune::None;   // fanfare terminée
    }
}

void audio_play_pmf(const void* pmf_data) {
    // Crochet laissé en place : si un vrai module PMF est fourni un jour, il
    // suffit de l'appeler ici. Il faudra alors libérer une piste du séquenceur
    // (le mixeur n'en a que 4).
    if (pmf_data) g_pmf.play_pmf(pmf_data);
}

// =============================================================================
//  Effets sonores
// =============================================================================
//
// Chaque son doit être IDENTIFIABLE à l'oreille sans regarder l'écran : c'est
// tout l'intérêt, on garde les yeux sur l'échiquier. D'où des timbres nettement
// contrastés — le bois mat d'un coup joué n'a rien à voir avec le claquement
// d'une prise, ni avec l'alerte d'un échec.
//
using T = gb_audio_track_tone;

// Tous les effets passent par ici : le volume du joueur est applique une fois,
// au meme endroit. Impossible d'en oublier un.
static inline void sfx(float f0, float f1, float v0, float v1, uint16_t ms, T::tone_type w) {
    if (g_sfx_vol <= 0.001f) return;
    g_sfx.play_tone(f0, f1, v0 * g_sfx_vol, v1 * g_sfx_vol, ms, w);
}

void sfx_cursor()   { sfx(880,  880,  0.18f, 0.05f,  25, T::SQUARE); }
void sfx_select()   { sfx(520,  780,  0.50f, 0.30f,  60, T::TRIANGLE); }
void sfx_cancel()   { sfx(600,  380,  0.40f, 0.15f,  70, T::TRIANGLE); }

// Coup simple : un « toc » sourd et court — le bois sur le bois.
void sfx_move()        { sfx(320, 180, 0.65f, 0.05f,  90, T::TRIANGLE); }

// Prise : sec et percussif, avec une pointe de bruit.
void sfx_capture()     { sfx(260,  90, 0.85f, 0.10f, 130, T::NOISE); }

// GRANDE rafle (3 pions et plus) : c'est LE moment de la partie aux dames, il
// doit s'entendre comme tel. Balayage descendant large — on croit voir les pions
// tomber les uns après les autres.
void sfx_multi_capture(){ sfx(900, 140, 0.95f, 0.15f, 420, T::NOISE); }

// Promotion en dame : arpège ascendant, franchement triomphal.
void sfx_promote()     { sfx(520, 1560, 0.75f, 0.30f, 360, T::TRIANGLE); }

void sfx_gameover()    { sfx(400,  110, 0.90f, 0.20f, 600, T::SQUARE); }
void sfx_draw()        { sfx(440,  440, 0.55f, 0.10f, 400, T::SINE); }

// Coup impossible : buzz court et franchement désagréable. Il faut qu'on
// comprenne tout de suite qu'on s'est trompé.
void sfx_illegal()  { sfx(150,  110,  0.55f, 0.20f,  90, T::SQUARE); }

// --- Effets de combat -----------------------------------------------------------------------------------
void sfx_hit_light() { sfx(420, 160, 0.85f, 0.05f,  55, T::NOISE); }
void sfx_hit_heavy() { sfx(240,  60, 0.98f, 0.10f, 160, T::NOISE); }
void sfx_block()     { sfx(1100, 800, 0.55f, 0.10f,  50, T::SQUARE); }
void sfx_whoosh()    { sfx(900, 300, 0.22f, 0.02f,  75, T::NOISE); }
void sfx_special()   { sfx(300, 900, 0.70f, 0.20f, 170, T::TRIANGLE); }
void sfx_parry()     { sfx(1320, 1980, 0.65f, 0.25f, 130, T::SQUARE); }
void sfx_jump()      { sfx(300, 520, 0.28f, 0.05f,  45, T::TRIANGLE); }

void sfx_menu_ok()  { sfx(660,  990,  0.55f, 0.20f, 100, T::SQUARE); }
void sfx_menu_back(){ sfx(500,  330,  0.50f, 0.15f, 100, T::SQUARE); }

} // namespace core
