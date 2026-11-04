# Iron Tournament — version PC (SDL2).  cmake -S pc -B build-pc && cmake --build build-pc
cmake_minimum_required(VERSION 3.16)
project(irontournament_pc CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

find_package(SDL2 REQUIRED)

set(ROOT ${CMAKE_CURRENT_SOURCE_DIR}/..)

add_executable(irontournament
    pc_main.cpp pc_graphics.cpp pc_input.cpp pc_audio.cpp pc_assets.cpp

    # --- le MEME code que la console ---
    ${ROOT}/main/shell/shell.cpp
    ${ROOT}/main/shell/ui.cpp
    ${ROOT}/main/shell/i18n.cpp
    ${ROOT}/main/shell/save.cpp
    ${ROOT}/main/games/fight/fight_data.cpp
    ${ROOT}/main/games/fight/fight_engine.cpp
    ${ROOT}/main/games/fight/fight_ai.cpp
    ${ROOT}/main/games/fight/fight_view.cpp
    ${ROOT}/main/games/fight/fight_sprites.cpp
    ${ROOT}/main/games/fight/fight_module.cpp
    ${ROOT}/main/assets/gfx/font_accents.cpp)

# font8x8_basic.h (composant gamebuino) initialise des char avec des valeurs > 127.
set_source_files_properties(pc_graphics.cpp PROPERTIES COMPILE_OPTIONS -Wno-narrowing)

target_include_directories(irontournament PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/compat
    ${ROOT}/components/gamebuino/include_lib
    ${ROOT}/main ${ROOT}/main/shell ${ROOT}/main/games/fight)
target_compile_definitions(irontournament PRIVATE IRON_PC=1 IRON_ASSET_DIR="${ROOT}/main/assets")
target_compile_options(irontournament PRIVATE -Wall -Wextra -Wno-unused-parameter)

if(MINGW AND TARGET SDL2::SDL2main)
  # Ordre impose : mingw32, SDL2main, puis SDL2
  target_link_libraries(irontournament PRIVATE mingw32 SDL2::SDL2main SDL2::SDL2)
elseif(TARGET SDL2::SDL2)
  target_link_libraries(irontournament PRIVATE SDL2::SDL2)
else()
  target_include_directories(irontournament PRIVATE ${SDL2_INCLUDE_DIRS})
  target_link_libraries(irontournament PRIVATE ${SDL2_LIBRARIES})
endif()
if(MINGW)
  target_link_options(irontournament PRIVATE -mwindows -static-libgcc -static-libstdc++)
endif()

# Le dossier du jeu (identique a celui de la carte SD : sprites/, meta.json...) a cote de l'executable.
add_custom_command(TARGET irontournament POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory ${ROOT}/sd/IRONTOURNAMENT $<TARGET_FILE_DIR:irontournament>/IRONTOURNAMENT)
install(TARGETS irontournament DESTINATION .)
install(DIRECTORY ${ROOT}/sd/IRONTOURNAMENT DESTINATION .)
