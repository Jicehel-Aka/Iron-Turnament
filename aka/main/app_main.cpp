/*
===============================================================================
  app_main.cpp — Iron Tournament (Gamebuino AKA)
-------------------------------------------------------------------------------
  REPARTITION DES TACHES — la lecon la plus couteuse des projets precedents.

    CPU 0                                  CPU 1
    -----------------------------------    ----------------------------
    SysTask   prio 6   toutes les 10 ms    GameTask  prio 5   30 fps
      -> SEUL a appeler g_core.pool()        -> entrees (lecture du cache)
      -> recalibrage joystick                -> logique + rendu
      -> combo RUN+MENU
    AudioTask prio 5   toutes les 2 ms

  Pas de tache d'IA : l'IA de combat decide en quelques comparaisons, dans la
  tache de jeu (30 fps, deux pas de 60 Hz par image).

  Et UN SEUL proprietaire du materiel : g_core.pool() lit le bus I2C et l'ADC,
  qui ne sont pas proteges contre les acces concurrents.
===============================================================================
*/
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gb_core.h"
#include "core/input.h"
#include "core/audio.h"
#include "tasks/task_system.h"
#include "tasks/task_game.h"
#include <esp_heap_caps.h>

gb_core g_core;

static void print_mem(const char* when) {
    printf("[IronTournament] %-12s SRAM %7u o | PSRAM %8u o\n", when,
           (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
           (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
}

extern "C" void app_main(void) {
    printf("\n=========================================\n");
    printf("  Iron Tournament - Gamebuino AKA\n");
    printf("=========================================\n\n");

    g_core.init();
    core::audio_init();

    // Calibrage du joystick AVANT de lancer la moindre tache : on est encore seul
    // sur l'ADC, aucune course possible. Le stick est suppose au repos.
    core::input_service();
    core::input_request_calibration();
    core::input_service();

    print_mem("au demarrage");

    xTaskCreatePinnedToCore(tasks::task_system, "SysTask",  4096, nullptr, 6, nullptr, 0);
    xTaskCreatePinnedToCore(tasks::task_game,   "GameTask", 12288, nullptr, 5, nullptr, 1);

    printf("[IronTournament] Pret. RUN+MENU (500 ms) = retour au loader.\n\n");

    while (true) {
        vTaskDelay(pdMS_TO_TICKS(10000));
        print_mem("en marche");
    }
}
