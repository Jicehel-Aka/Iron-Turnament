/*
===============================================================================
  input.h — Entrées (AKA Chess)
-------------------------------------------------------------------------------
  UN SEUL PROPRIÉTAIRE DU MATÉRIEL.

  g_core.pool() lit le bus I2C (expander, boutons) et l'ADC (joystick). Ces
  périphériques ne sont PAS protégés contre les accès concurrents. L'appeler
  depuis deux tâches — ce que faisait la première version : la boucle idle ET
  input_poll() — est une course qui finit par planter. Elle explose franchement
  au recalibrage du joystick, qui enchaîne 2000 lectures ADC d'affilée.

  D'où la séparation :

    input_service()  <- appelée UNIQUEMENT par la tâche système (CPU 0).
                        Seule à toucher g_core.pool() et l'ADC. Elle range
                        l'état brut des touches dans une variable atomique.

    input_poll()     <- appelée par la tâche de jeu (CPU 1). Ne touche AUCUN
                        périphérique : elle relit l'état brut mis en cache et
                        calcule les fronts et la répétition à la cadence du jeu.

  Les fronts DOIVENT être calculés côté jeu : s'ils l'étaient côté système
  (100 Hz), un appui serait consommé avant que la boucle de jeu (30 Hz) ne le
  voie, et une touche sur trois serait perdue.
===============================================================================
*/
#pragma once
#include <cstdint>

namespace core {

enum class Button {
    Left, Right, Up, Down,
    A, B, C, D,
    L1, R1,
    Menu, Run,
    COUNT
};

// --- Côté tâche système (CPU 0) ---------------------------------------------
void     input_service();                  // g_core.pool() + cache de l'état brut
void     input_request_calibration();      // demande un recalibrage (asynchrone)
bool     input_calibrating();              // vrai pendant le recalibrage
uint16_t input_raw_state();                // état brut, pour le combo loader

// --- Côté tâche de jeu (CPU 1) ----------------------------------------------
void input_poll(uint32_t now_ms);

bool input_is_held(Button b);
bool input_was_pressed(Button b);

// Front montant OU répétition automatique quand la touche reste maintenue.
// C'est ce qu'il faut pour un curseur ; input_was_pressed() reste le bon choix
// pour une validation (on ne veut évidemment pas valider huit fois).
bool input_repeat(Button b);

uint32_t input_held_ms(Button b, uint32_t now_ms);

} // namespace core
