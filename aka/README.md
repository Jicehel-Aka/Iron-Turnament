# Iron Tournament — Gamebuino AKA

Jeu de combat 1 contre 1 pour la Gamebuino AKA (ESP32-S3, ESP-IDF). Port du prototype web
`Jicehel-Aka/Iron-Turnament` : six maîtres, tournoi en 5 combats (3 adversaires, le rival juré,
puis Malakor le boss) et duels libres. Trois niveaux d'IA (Novice / Arcade / Maître), 5 langues
(FR / EN / DE / ES / IT).

## Commandes
| Touche | Action |
|---|---|
| D-Pad / joystick | avancer, reculer, sauter, s'accroupir |
| A / B | poing / pied (↓+A uppercut, ↓+B balayette) |
| C | coup spécial : →+C, ←+C, ↑+C (ou le mouvement arcade classique) ; ↓+C esquive (ou SUPER à 100 Ki) |
| C maintenu + A ou B | spécial **EX** (50 Ki) |
| MENU (court) | pause |
| MENU (long, 600 ms) | capture d'écran |
| RUN + MENU (500 ms) | retour au loader |

## Architecture (mêmes principes que mAKArena)
- **Coquille** (`main/shell/`) : états Titre → Menu → Choix → Versus → Combat, options, règles,
  commandes, sauvegarde, retour au loader. Interface `GameModule` (`game_module.h`).
- **Moteur** (`main/games/fight/fight.h`, `fight_data/engine/ai.cpp`) : C++ pur, sans matériel,
  testable sur PC. Logique à 60 Hz, appelée **deux fois** par image de 30 fps.
- **Vue** (`fight_view.cpp`) : combattants en **sprites** (planches fournies : 23 animations × 6 images,
  cellules 128×112, clé magenta 0xF81F) ; dessin vectoriel de secours si un `.spr` manque. Décors
  360×176 embarqués avec parallaxe de 40 px, HUD, bandeaux, projectiles, particules.
- **Sprites** (`fight_sprites.cpp`) : `tools/gen_sprites.py` convertit `assets_src/sheets/*.png` en
  `sd/IRONTOURNAMENT/sprites/<NOM>.spr` (images recadrées, ~0,7–0,85 Mo chacun, 4,4 Mo au total). Au début
  d'un combat, seuls les DEUX combattants concernés sont chargés de la SD vers la PSRAM (~1,5 Mo, ~1 s).
- **Tâches** : SysTask (CPU 0, prio 6, seule à appeler `g_core.pool()`), GameTask (CPU 1, prio 5,
  30 fps), AudioTask. **Pas de tâche d'IA** : l'IA de combat décide en quelques comparaisons.
- **i18n** : `tools/gen_i18n.py` génère `main/shell/i18n.{h,cpp}` (règles ≤ 38 colonnes, barres
  d'aide ≤ 40). Pas de majuscules accentuées ni de flèches : la police 8×8 ne les a pas.

## Carte SD
Le dossier `sd/IRONTOURNAMENT/` se copie tel quel à la racine de la carte :
`firmware.bin` (à ajouter après la compilation), `meta.json`, `Picture.png`, `screen.bmp` (160×120, 24 bits)
et `sprites/*.spr` (**indispensable pour voir les vrais combattants**, sinon le jeu utilise le dessin vectoriel).
Le jeu y écrit `config.dat` et `capture_NNNN.bmp`. **Noms longs activés** (`CONFIG_FATFS_LFN_HEAP=y`
dans `sdkconfig` — contrairement à mAKArena qui était en `LFN_NONE`).

## Compilation
```
idf.py set-target esp32s3   # une seule fois
idf.py build
```
Le binaire est `build/irontournament.bin` ; renommez-le `firmware.bin` dans le dossier SD.
Assets (déjà générés) : `python3 tools/gen_assets.py`, `tools/gen_title.py`, `tools/gen_font.py`.
Flash embarqué : ~940 Ko (title 150 Ko, portraits 48 Ko, stages 742 Ko) pour une partition factory de 3 Mo.
Sprites : `python3 tools/gen_sprites.py` (à relancer si une planche change).

## Tests sur PC (sans matériel)
```
sh test/run_tests.sh     # 715 vérifications + 648 combats simulés (règles, IA, coups fatals, déterminisme)
sh test/run_preview.sh /tmp/preview   # rendu simulé en .ppm, sprites compris (textes remplacés par des blocs)
```

## Version PC (SDL2)
Même moteur, même coquille, même vue : seuls `core/graphics`, `core/input`, `core/audio`, les tâches et `app_main`
sont remplacés par `pc/*` (framebuffer logiciel 320×240).
```
cmake -S pc -B build-pc && cmake --build build-pc     # nécessite SDL2 (libsdl2-dev / mingw-w64-x86_64-SDL2)
./build-pc/irontournament --scale 3                  # zoom ×1 à ×4, --fullscreen, --data DIR
```
Le zoom se règle aussi dans **Options > Zoom** (×2, ×3, ×4, plein écran) ; **F11** bascule le plein écran.
Les options (niveau, langue FR/EN/DE/ES/IT, musique, bruitages, zoom) sont sauvegardées dans `config.dat`.
Clavier : flèches/WASD, J = A (coup de poing), K = B (coup de pied), L = C (spécial), Entrée/Espace = valider,
Retour arrière = retour, Échap = menu ; manette SDL reconnue. Les données (`IRONTOURNAMENT/`, sprites compris)
sont cherchées à côté de l'exécutable, ou dans `sd/IRONTOURNAMENT`. Audio : synthèse simple (effets + mélodies).
`--autotest` rejoue un parcours scripté et enregistre des captures (utilisé en intégration continue).

## Options de match
Options > **Manches** (1, 2 ou 3 à gagner) et **Temps** (30 s, 60 s, 99 s ou illimité), sauvegardées dans `config.dat`
(un ancien `config.dat` reste lisible). Éventail de Mei-Lin rééquilibré comme dans le prototype web (démarrage 14, actif 14, récupération 11).

## Décors animés
Chaque décor a ses effets, dessinés par-dessus l'image fixe (`fx_stage` dans `fight_view.cpp`) : **Kyoto** pétales de cerisier et lucioles ;
**fosse d'obsidienne** torches qui vacillent, braises montantes, scintillement de la lave ; **port de Hong Kong** pluie et rides sur le sol mouillé ;
**forge** braises du four, étincelles de la coulée, vapeur de la cheminée, neige derrière la baie ; **Atacama** braseros et orage (éclairs +
éclaircissement du ciel) ; **salle du trône** flammes violettes, torches dorées, vitraux illuminés par l'orage. Les effets sont **sans état**
(fonction pure de l'horloge du combat, aucun tirage dans le hasard du moteur) : ils ne modifient ni le gameplay ni la synchronisation réseau,
et coûtent une centaine de petites primitives par image.

## Jauge de Ki
Barre bleue sous la vie, conservée d'une manche à l'autre. Gains : +14 en touchant, +8 en encaissant, +6 / +4 en gardant
(attaquant / défenseur). Dépenses : **EX** à 50 Ki (spécial lancé avec C maintenu + A ou B : dégâts ×1,4, départ plus vif,
invulnérable au départ), **Ki Cancel** (un EX annule la fin d'un spécial qui a touché, 50 Ki), **SUPER** à 100 Ki (↓+C : charge
imblocable de 250 de base, un coup par combattant, nom affiché en bandeau). L'IA utilise EX et SUPER selon son niveau.

## Mode réseau 2 joueurs (câble USB ou Wi-Fi)
Menu principal > **Réseau 2 joueurs** : *Héberger* ou *Rejoindre*, par **câble USB** ou par **Wi-Fi**. Fonctionne console ↔ PC,
PC ↔ PC et console ↔ console. L'hôte (J1) impose ses règles (manches, temps) ; MENU quitte la partie (pas de pause en réseau).

**Principe (lockstep).** Les deux machines font tourner le *même* combat avec la *même* graine ; seules les entrées voyagent
(2 octets par image). Délai d'entrée de 3 images (100 ms), entrées non acquittées répétées dans chaque paquet (une perte ne bloque
rien), attente de l'adversaire si un paquet tarde, et un **condensé de l'état** échangé toutes les 30 images : un écart arrête la
partie avec « Désynchronisation » au lieu de laisser les deux écrans diverger. Code : `main/games/fight/netplay.*` (portable,
sans dépendance console ni SDL).

| Liaison | Console AKA | PC |
|---|---|---|
| **Câble USB** | port USB natif (USB Serial/JTAG, apparaît comme un port série), trames SLIP + CRC-16 | `--serial COM5` ou `/dev/ttyACM0` (défaut Linux) ; réglage aussi dans `net.txt` |
| **Wi-Fi** | l'hôte crée le réseau `IRON-TOURNAMENT` (WPA2, mot de passe `irontournament`) ; ou `wifi.txt` sur la SD (`ssid=`, `pass=`) pour utiliser votre box | UDP sur le réseau local, port 7777 (`--port`) ; l'invité retrouve l'hôte **par diffusion**, ou `--peer IP` / `peer=` dans `net.txt` |

Exemples : console hôte en Wi-Fi → rejoindre le réseau `IRON-TOURNAMENT` depuis le PC, puis *Rejoindre (Wi-Fi)*. Câble :
brancher l'USB de la console au PC, lancer `irontournament --serial COM5`, *Rejoindre (câble USB)* côté PC et *Héberger (câble USB)* côté console.

**Vérifié :** tests de liaison simulée (25 % de pertes, doublons, retards, coupure, départ, désynchronisation, bruit sur le câble),
UDP réel sur la boucle locale, et deux instances de la version PC qui se battent via les menus (`test/run_net_pc.sh`, lancé par la CI).
**Non vérifié sur matériel :** le Wi-Fi et l'USB de la console (`main/net/net_link_esp.cpp` est compilé par la CI, pas encore essayé
sur une AKA), ni le câble USB côté PC réel (Windows/Linux). **Risque principal :** le moteur doit donner exactement les mêmes
résultats sur x86 et sur l'ESP32-S3 (virgule flottante simple précision). Il n'utilise que + − × ÷ et des comparaisons (le
sinus/cosinus ne sert qu'aux particules, exclues du condensé) et il est compilé avec `-ffp-contract=off` sur toutes les cibles ; si une
différence subsistait, la partie s'arrêterait sur « Désynchronisation » (pas de divergence silencieuse).
**Pas de jeu par Internet** : il faudrait un serveur-relais et traverser les box (NAT), et un délai de 100 ms ne suffit plus au-delà
de quelques dizaines de ms de latence ; ce serait un autre chantier (retour arrière / « rollback »).

## Équilibrage et niveaux (simulation IA contre IA)
`sh test/run_balance.sh [parties] [niveau 0-2]` joue des milliers de matchs complets sur PC (1 à 30 s selon le nombre) et affiche
la matrice de victoires des six combattants, la durée moyenne et l'écart entre niveaux. `--tune` règle automatiquement les
coefficients de dégâts `g_dmg_scale[niveau][combattant]` (fight_data.cpp) : le joueur utilise toujours la ligne Maître, l'IA
celle de son niveau. Résultats actuels (100 matchs par paire, après l'audit ci-dessous) : taux de victoire moyen par combattant de 47 à 53 %
(Maître), 40 à 57 % (Arcade), 39 à 54 % (Novice) ; Arcade bat Novice 76 %, Maître bat Arcade 70 %.
Le balancement est celui de l'IA : un joueur humain n'en profitera pas de la même façon ; certaines paires restent très
déséquilibrées (Krowen/Nyxia). Avant ce réglage, ~95 % des dégâts venaient des coups spéciaux et Titan gagnait 98 % de ses matchs.

## Audit critique du moteur (banc `sh test/run_audit.sh`)
Un banc de mesure (`test/audit.cpp`) calcule les données d'images de chaque coup (avantage sur touche / garde), les
enchaînements réels et le comportement de robots « bêtes » (un seul coup répété) contre l'IA. Défauts **mesurés** puis corrigés :

| Défaut constaté | Mesure avant | Correction | Mesure après |
|---|---|---|---|
| Aucun tampon d'entrée : une touche pressée 1 image trop tôt est perdue | — | tampon de 5 images (≈ 83 ms) pour A, B et C, exécuté dès que le combattant est libre (`INPUT_BUFFER`) | testé (`test_input_buffer`) ; inclus dans le condensé réseau |
| Un robot qui répète le **balayage** battait l'IA | 82 % / 69 % / 50 % (Novice / Arcade / Maître) | l'IA punit un coup raté ou gardé (et s'avance si la retombée est longue), garde plus souvent ; le balayage retombe 4 images plus tard (23 → 27) | 45 % / 36 % / 16 % |
| Même robot « saut + B » | 68 % / 35 % / 33 % | idem | 48 % / 35 % / 18 % |
| Robot « jab » | 68 % / 42 % / 27 % | idem | 68 % / 37 % / 20 % |
| **Enchaînement infini** : un balayage rattrapait l'adversaire encore couché (38 images de chute pour 27 de retombée), surtout dans un coin ; les projectiles l'ignoraient déjà, pas la mêlée | boucle de 6 à 9 touches (25 à 46 % des PV) sur cible inerte | un adversaire à terre est intouchable en mêlée jusqu'au relevé | 1 touche (`test_ground_rules`, vérifié par mutation) |
| Un coup léger (A, bas + A) faisait **glisser l'adversaire de 34 px** au lieu de ~9 : `A_HITSTUN_GUT` oublié dans la friction au sol | 34 px | friction appliquée | ≈ 9 px |

Les coefficients de dégâts ont été re-réglés (`--tune`) car ces règles changent l'équilibre.

**Encore à améliorer (non fait, par ordre d'intérêt)** : mode entraînement (adversaire fixe, affichage des images
d'avantage) ; liste des coups dans la pause ; vrais enchaînements (les coups normaux ne s'enchaînent pas : le recul de
~6 px sort le suivant de portée, seuls les annulations en spécial font des combos) ; défense du joueur (pas de
contre-projection ni de garde-poussée) ; le coup léger est à +1 sur garde pour Kenji et Nyxia (pression sans risque) ;
tous les coups sautés sont « hauts » (la garde accroupie ne les arrête pas), choix de conception à valider ; compteur de
touches (il faudrait d'abord distinguer vrai combo et coups rapprochés) ; rollback pour le jeu par Internet.

## Cohérence physique des animations
Audit mesuré sur les planches (`tools/gen_sprites.py` + moteur) :
- **Marche** : le cycle de pas suit la *distance parcourue* (`walk_dist`) et non l'horloge. Avant, 160 px parcourus pour
  ~55 px de foulée : les pieds glissaient environ 3 fois trop vite.
- **Sol** : une image au contact du sol est rognée sous le pivot +4 px (la natte de Krowen, capes et écharpes ne traversent
  plus le décor : jusqu'à 14 px sous le sol auparavant).
- **Chute (KNOCKDOWN)** : les 3 images aériennes sont ramenées au sol ; la hauteur n'est plus comptée deux fois (planche + gravité du
  moteur), plus de saut de ~20 px à l'atterrissage.
- **Projectiles** : ils partent à hauteur de la main mesurée sur l'image de tir (40 à 46 px selon le combattant, 26 px = la ceinture auparavant).
- Les vêtements et cheveux sont animés **dans les planches** (dessinés image par image) : le moteur ne fait pas de simulation de tissu.

## Non repris du prototype web
Mode histoire / textes de lore, mode 2 joueurs, LED. Les noms de coups restent en français dans
toutes les langues (ce sont des noms propres).

## État de vérification
Le moteur est testé sur PC. Le reste (coquille, vue, module, tâches) passe une vérification
syntaxique stricte (`-Wall -Wextra -Werror`) et un aperçu de rendu sur PC, mais **n'a pas été compilé avec
ESP-IDF ni essayé sur la console** : prévoir un premier build et un réglage du ressenti (vitesse, équilibrage).
