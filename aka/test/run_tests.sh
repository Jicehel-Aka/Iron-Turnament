#!/bin/sh
# Compile et lance les tests du moteur de combat sur PC (aucun materiel requis).
# Usage : sh test/run_tests.sh      (depuis la racine du projet)
set -e
g++ -std=c++17 -O2 -Wall -Wextra -Werror -I main/games/fight \
    test/fight_rules.cpp \
    main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp \
    -o /tmp/fight_rules
/tmp/fight_rules
