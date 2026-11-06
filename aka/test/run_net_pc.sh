#!/bin/sh
# Test reseau de bout en bout : DEUX instances de la version PC (hote + invite) naviguent dans les menus jusqu'a
# Reseau > Wi-Fi, se connectent en UDP sur la boucle locale et se battent ~50 s ; aucune ne doit se desynchroniser.
# Usage : sh test/run_net_pc.sh build-pc/irontournament      (sous xvfb-run en integration continue)
set -e
BIN=${1:-build-pc/irontournament}
T=$(mktemp -d)
mkdir -p "$T/h" "$T/g"
cp -r sd/IRONTOURNAMENT/. "$T/h/"; cp -r sd/IRONTOURNAMENT/. "$T/g/"
export SDL_AUDIODRIVER=dummy
"$BIN" --data "$T/h" --autotest-net host  --scale 1 --port 47900 > "$T/h.log" 2>&1 &
HP=$!
sleep 1
"$BIN" --data "$T/g" --autotest-net guest --scale 1 --port 47900 --peer 127.0.0.1 > "$T/g.log" 2>&1 || true
wait $HP || true
cat "$T/h.log" "$T/g.log"
for who in host guest; do
  L=$(grep "NETTEST $who" "$T/h.log" "$T/g.log" | head -1)
  echo "$L" | grep -q "active=1 state=0 err=0" || { echo "ECHEC : $who ne s'est pas termine proprement"; exit 1; }
  SIM=$(echo "$L" | sed 's/.*sim=\([0-9]*\).*/\1/')
  [ "$SIM" -gt 1000 ] || { echo "ECHEC : $who n'a simule que $SIM images"; exit 1; }
done
echo "Reseau PC <-> PC : OK"
