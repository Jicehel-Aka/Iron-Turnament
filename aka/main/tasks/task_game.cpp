/*
  task_game.cpp — Boucle principale (Iron Tournament). 30 fps, CPU 1.
  Le moteur de combat (60 Hz logique, 2 pas par image) et l'IA de combat tournent
  ici : ils ne coutent que quelques comparaisons par pas, donc PAS de tache d'IA
  separee. L'audio et les entrees materielles restent sur le CPU 0.
*/
#include "task_game.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gb_core.h"
#include "../core/graphics.h"
#include "../core/input.h"
#include "../shell/shell.h"

extern gb_core g_core;

namespace tasks {

void task_game(void*) {
    core::graphics_init();
    shell::init();

    TickType_t last = xTaskGetTickCount();
    while (true) {
        const uint32_t now = g_core.get_millis();

        core::input_poll(now);
        shell::update(now);
        shell::draw();

        // SANS CET APPEL, L'ECRAN RESTE NOIR. Le framebuffer n'est transfere a la
        // dalle que par graphics_present() (= g_gfx.update()).
        core::graphics_present();

        vTaskDelayUntil(&last, pdMS_TO_TICKS(33));
    }
}

}
