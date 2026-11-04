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
| C | coup spécial : →+C, ←+C, ↑+C (ou le mouvement arcade classique) ; ↓+C esquive |
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

## Non repris du prototype web
Mode histoire / textes de lore, mode 2 joueurs, LED. Les noms de coups restent en français dans
toutes les langues (ce sont des noms propres).

## État de vérification
Le moteur est testé sur PC. Le reste (coquille, vue, module, tâches) passe une vérification
syntaxique stricte (`-Wall -Wextra -Werror`) et un aperçu de rendu sur PC, mais **n'a pas été compilé avec
ESP-IDF ni essayé sur la console** : prévoir un premier build et un réglage du ressenti (vitesse, équilibrage).
