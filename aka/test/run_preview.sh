#!/bin/sh
# Apercu PC du rendu : sh test/run_preview.sh <dossier_de_sortie>   (racine du projet)
set -e
OUT=${1:-/tmp/preview}; mkdir -p "$OUT"
g++ -std=c++17 -O1 -I main/games/fight -I main -I main/shell -I main/core \
    test/render_preview.cpp main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp \
    main/games/fight/fight_ai.cpp main/games/fight/fight_view.cpp main/games/fight/fight_sprites.cpp main/shell/i18n.cpp -o /tmp/render_preview
/tmp/render_preview "$OUT"
