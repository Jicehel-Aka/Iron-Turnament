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
        games/fight/netplay.cpp

        net/net_udp.cpp
        net/net_link_esp.cpp

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
        esp_wifi esp_netif esp_event lwip esp_driver_usb_serial_jtag
)

# Determinisme du mode reseau : le moteur ne doit pas utiliser de multiplication-addition fusionnee (FMA),
# sinon la console et le PC divergent apres quelques secondes de jeu (cf. games/fight/netplay.h).
set_source_files_properties(
    games/fight/fight_engine.cpp games/fight/fight_ai.cpp games/fight/fight_data.cpp games/fight/netplay.cpp
    PROPERTIES COMPILE_OPTIONS "-ffp-contract=off")
