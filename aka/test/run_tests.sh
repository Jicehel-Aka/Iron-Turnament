#!/bin/sh
# Compile et lance les tests du moteur de combat et du mode reseau sur PC (aucun materiel requis).
# Usage : sh test/run_tests.sh      (depuis la racine du projet)
set -e
g++ -std=c++17 -O2 -Wall -Wextra -Werror -ffp-contract=off -I main/games/fight \
    test/fight_rules.cpp \
    main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp \
    -o /tmp/fight_rules
/tmp/fight_rules
g++ -std=c++17 -O2 -Wall -Wextra -Werror -ffp-contract=off -I main/games/fight \
    test/net_test.cpp \
    main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp \
    main/games/fight/netplay.cpp -o /tmp/net_test
/tmp/net_test
g++ -std=c++17 -O2 -Wall -Wextra -Werror -ffp-contract=off -I main/games/fight -I main/net \
    test/net_udp_test.cpp \
    main/games/fight/fight_data.cpp main/games/fight/fight_engine.cpp main/games/fight/fight_ai.cpp \
    main/games/fight/netplay.cpp main/net/net_udp.cpp -o /tmp/net_udp_test -pthread
/tmp/net_udp_test
g++ -std=c++17 -O2 -Wall -Wextra -Werror -I main/shell test/lore_test.cpp main/shell/i18n.cpp -o /tmp/lore_test
/tmp/lore_test
