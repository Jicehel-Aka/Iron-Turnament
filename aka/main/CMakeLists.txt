idf_component_register(
    SRCS
        app_main.cpp
        core/graphics.cpp
        core/input.cpp
        core/audio.cpp

        shell/shell.cpp
        shell/ui.cpp
        shell/i18n.cpp
        shell/save.cpp

        games/fight/fight_data.cpp
        games/fight/fight_engine.cpp
        games/fight/fight_ai.cpp
        games/fight/fight_view.cpp
        games/fight/fight_sprites.cpp
        games/fight/fight_module.cpp

        tasks/task_system.cpp
        tasks/task_game.cpp

        assets/gfx/font_accents.cpp

    INCLUDE_DIRS
        . core shell tasks games assets/gfx

    # title.bin 150 Ko, portraits.bin 48 Ko, stages.bin 742 Ko : ~940 Ko en flash.
    EMBED_FILES
        assets/title.bin
        assets/portraits.bin
        assets/stages.bin

    # RAPPEL : les composants vont dans REQUIRES, PAS dans INCLUDE_DIRS.
    REQUIRES
        gamebuino nvs_flash app_update esp_partition esp_system fatfs esp_hw_support
)
