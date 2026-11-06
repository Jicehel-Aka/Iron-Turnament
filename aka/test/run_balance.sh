#!/bin/sh
# Simulation d'equilibrage IA contre IA (PC uniquement). Usage : sh test/run_balance.sh [parties] [niveau 0-2]
set -e
g++ -std=c++17 -O2 -Wall -Wextra -I main/games/fight test/balance.cpp \
    main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp -o /tmp/balance
/tmp/balance "$@"
