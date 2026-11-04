/*
===============================================================================
  audio.h — Son et musique (mAKAdames)
-------------------------------------------------------------------------------
  Tout est SYNTHÉTISÉ : aucun fichier audio, aucun sample, aucun asset.

  Le SDK Gamebuino expose un mixeur logiciel (gb_audio_player) limité à 4
  pistes. On les répartit ainsi :
      piste 0 : basse      \
      piste 1 : accords     >  musique (séquenceur maison, cf. audio.cpp)
      piste 2 : mélodie    /
      piste 3 : effets sonores

  Pourquoi pas de PMF (le format tracker du SDK) ? Parce qu'un module PMF
  embarque des SAMPLES PCM — donc des assets externes, avec leur licence. Le
  séquenceur ci-dessous produit une vraie musique à partir de rien : quelques
  tables de notes et trois oscillateurs. Pour un jeu d'échecs, une ambiance
  sobre et clairsemée colle d'ailleurs mieux qu'un module tracker.

  Le crochet PMF reste disponible (audio_play_pmf) si l'on veut brancher un
  module plus tard : il suffira de fournir les données.
===============================================================================
*/
#pragma once
#include <cstdint>

namespace core {

void audio_init();
void audio_set_master_volume(uint8_t volume);   // 0..255

// -----------------------------------------------------------------------------
// Musique
// -----------------------------------------------------------------------------
enum class Tune : uint8_t {
    None = 0,
    Title,      // écran-titre : ample, un peu solennel
    Game,       // partie : lent, discret, ne doit JAMAIS distraire du calcul
    Victory,
    Defeat,
};

void audio_play_tune(Tune t);
void audio_stop_music();
void audio_set_music_volume(float v);           // 0.0 .. 1.0

// À appeler à chaque frame : c'est lui qui déclenche la note suivante quand la
// précédente est finie. Le séquenceur n'a pas de thread à lui — il se contente
// de regarder l'horloge.
void audio_music_tick(uint32_t now_ms);

// Crochet PMF, au cas où l'on brancherait un vrai module tracker plus tard.
void audio_play_pmf(const void* pmf_data);

// -----------------------------------------------------------------------------
// Effets sonores
// -----------------------------------------------------------------------------
void sfx_cursor();        // déplacement du curseur : très bref, discret
void sfx_select();        // sélection d'un pion / étape d'une rafle
void sfx_cancel();        // désélection
void sfx_move();          // coup simple
void sfx_capture();       // prise (1 ou 2 pions)
void sfx_multi_capture(); // GRANDE rafle (3+) : doit sonner comme un événement
void sfx_promote();       // promotion en dame : arpège ascendant
void sfx_gameover();      // partie perdue / gagnée
void sfx_draw();          // nulle
void sfx_illegal();       // coup impossible : buzz court et sec
void sfx_menu_ok();
void sfx_menu_back();

void audio_set_sfx_volume(float v);

} // namespace core
