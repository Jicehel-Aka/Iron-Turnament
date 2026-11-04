/*
===============================================================================
  task_system.cpp — Tâche système (AKA Chess)
-------------------------------------------------------------------------------
  POURQUOI ELLE EXISTE

  Elle est le SEUL propriétaire du matériel d'entrée : g_core.pool() (bus I2C
  de l'expander + ADC du joystick) n'est appelé que d'ici. Rien d'autre dans le
  programme ne touche à ces périphériques.

  Et elle tourne en PRIORITÉ 6 sur le CPU 0, donc AU-DESSUS de l'IA (priorité 4,
  même cœur). C'est indispensable : au niveau Maître, la recherche occupe le
  CPU 0 pendant 3,5 secondes d'affilée. La boucle idle d'app_main (priorité 1)
  serait purement et simplement affamée pendant tout ce temps — plus aucune
  lecture des boutons, et le combo RUN+MENU de retour au loader ne répondrait
  plus. Une tâche prioritaire à 10 ms de période règle le problème, et son coût
  est négligeable.

  Elle porte donc :
    - la lecture des entrées                (input_service)
    - le recalibrage du joystick à la demande
    - le combo RUN+MENU -> retour au loader
===============================================================================
*/
#include "task_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "gb_core.h"
#include "../core/input.h"

#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <esp_system.h>

extern gb_core g_core;

namespace tasks {

// RUN + MENU maintenus 500 ms -> retour au loader (partition OTA_1).
static uint32_t s_combo_start = 0;

void return_to_loader() {
    const esp_partition_t* loader = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, nullptr);
    if (loader) {
        esp_ota_set_boot_partition(loader);
        esp_restart();
    }
}

static void check_return_to_loader() {
    const uint16_t st = core::input_raw_state();
    const bool run_held  = (st & gb_buttons::KEY_RUN)  != 0;
    const bool menu_held = (st & gb_buttons::KEY_MENU) != 0;

    if (!run_held || !menu_held) { s_combo_start = 0; return; }

    const uint32_t now = g_core.get_millis();
    if (s_combo_start == 0) { s_combo_start = now; return; }
    if (now - s_combo_start < 500) return;

    s_combo_start = 0;
    return_to_loader();
}

void task_system(void*) {
    TickType_t last_wake = xTaskGetTickCount();

    while (true) {
        core::input_service();       // seul accès au matériel d'entrée
        check_return_to_loader();
        vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(10));
    }
}

} // namespace tasks
