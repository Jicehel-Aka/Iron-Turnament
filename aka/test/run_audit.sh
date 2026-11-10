#!/bin/sh
# Banc de mesure « agent critique » (PC uniquement). Usage : sh test/run_audit.sh [frames|chain|bots|playtest|all] [matchs_par_paire]
set -e
g++ -std=c++17 -O2 -Wall -Wextra -ffp-contract=off -I main/games/fight test/audit.cpp \
    main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp -o /tmp/audit
/tmp/audit "$@"
