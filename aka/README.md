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
celle de son niveau. Résultats actuels (60 matchs par paire, réglage refait après la correction « niveaux sur tout le match », voir plus bas) :
taux de victoire moyen par combattant de 45 à 56 % (Maître), 46 à 54 % (Arcade), 45 à 55 % (Novice) ; Arcade bat Novice 81 %,
Maître bat Arcade 60 %.
Le balancement est celui de l'IA : un joueur humain n'en profitera pas de la même façon ; certaines paires restent très
déséquilibrées (Krowen/Nyxia). Avant ce réglage, ~95 % des dégâts venaient des coups spéciaux et Titan gagnait 98 % de ses matchs.

## Audit critique du moteur (banc `sh test/run_audit.sh`)
Un banc de mesure (`test/audit.cpp`) calcule les données d'images de chaque coup (avantage sur touche / garde), les
enchaînements réels et le comportement de robots « bêtes » (un seul coup répété) contre l'IA. Défauts **mesurés** puis corrigés :

| Défaut constaté | Mesure avant | Correction | Mesure après |
|---|---|---|---|
| Aucun tampon d'entrée : une touche pressée 1 image trop tôt est perdue | — | tampon de 5 images (≈ 83 ms) pour A, B et C, exécuté dès que le combattant est libre (`INPUT_BUFFER`) | testé (`test_input_buffer`) ; inclus dans le condensé réseau |
| Un robot qui répète le **balayage** battait l'IA | 82 % / 69 % / 50 % (Novice / Arcade / Maître) | l'IA punit un coup raté ou gardé (et s'avance si la retombée est longue), garde plus souvent ; le balayage retombe 4 images plus tard (23 → 27) | 45 % / 36 % / 16 % (puis 28 % / 7 % / 4 % avec la parade punitive) |
| Même robot « saut + B » | 68 % / 35 % / 33 % | idem | 48 % / 35 % / 18 % |
| Robot « jab » | 68 % / 42 % / 27 % | idem | 68 % / 37 % / 20 % |
| **Enchaînement infini** : un balayage rattrapait l'adversaire encore couché (38 images de chute pour 27 de retombée), surtout dans un coin ; les projectiles l'ignoraient déjà, pas la mêlée | boucle de 6 à 9 touches (25 à 46 % des PV) sur cible inerte | un adversaire à terre est intouchable en mêlée jusqu'au relevé | 1 touche (`test_ground_rules`, vérifié par mutation) |
| Un coup léger (A, bas + A) faisait **glisser l'adversaire de 34 px** au lieu de ~9 : `A_HITSTUN_GUT` oublié dans la friction au sol | 34 px | friction appliquée | ≈ 9 px |

Les coefficients de dégâts ont été re-réglés (`--tune`) car ces règles changent l'équilibre.

**Encore à améliorer (non fait, par ordre d'intérêt)** : mode entraînement (adversaire fixe, affichage des images
d'avantage) ; liste des coups dans la pause ; vrais enchaînements (les coups normaux ne s'enchaînent pas : le recul de
~6 px sort le suivant de portée, seuls les annulations en spécial font des combos) ; défense du joueur (pas de
contre-projection ni de garde-poussée) ; 
tous les coups sautés sont « hauts » (la garde accroupie ne les arrête pas), choix de conception à valider ; compteur de
touches (il faudrait d'abord distinguer vrai combo et coups rapprochés) ; rollback pour le jeu par Internet.

## Coups répétés, garde et mode facile
- **Parade punitive** : le 4ᵉ coup identique d'affilée (même touche ou même spécial, séries de moins de 2,5 s entre deux
  lancers) est **paré automatiquement** par l'adversaire s'il est libre ou déjà en garde : aucun dégât, l'attaquant est
  étourdi 30 images (0,5 s), bandeau « PARADE ! ». Vaut pour le joueur comme pour l'IA, y compris les boules de feu lancées
  en rafale. Un coup reçu, un autre coup ou 2,5 s d'attente remettent le compte à zéro ; ni les projections ni les SUPER ne comptent.
- **Garde et riposte** : une garde dure 9 images (12 avant) et ouvre une fenêtre de 30 images pendant laquelle le coup
  suivant qui touche fait **+25 %** de dégâts (« RIPOSTE ! », +6 Ki). Une parade ouvre la même fenêtre (40 images). Un coup lourd
  gardé laisse donc le temps de répliquer.
- **Mode facile** (Novice) : l'IA inflige 35 % de dégâts en moins et le joueur 10 % de plus (`g_level_ai_mult` / `g_level_human_mult`) ;
  elle ne varie pas ses coups (elle se fait donc parer), alors que Arcade et Maître changent de coup presque toujours.
  Mesure (`sh test/run_audit.sh bots`, victoires du robot) : un robot qui répète une seule action (balayage, jab, boule, saut)
  gagne 5 à 39 % contre Novice, 4 à 13 % contre Arcade/Maître, alors qu'un joueur qui varie (IA Arcade pilotant P1) gagne 84 %
  contre Novice, 52 % contre Arcade, 39 % contre Maître. Le robot « joueur varié » n'est qu'un substitut : à confirmer avec un humain.

## Recette « agence » : trois testeurs, une réunion de livraison
`sh test/run_audit.sh playtest [N]` fait jouer trois profils virtuels contre les trois niveaux (36 paires de combattants) :
**Karim**, fan de jeux de combat (l'IA Maître aux commandes) ; **Léa**, arcade, qui matraque les boutons sans garder ;
**Tom**, débutant (un ordre toutes les 0,3 s, garde rarement). Ce sont des robots : ils mesurent des tendances, pas le plaisir.

| testeur | Novice | Arcade | Maître |
|---|---|---|---|
| Karim | 99 % | 61 % | 55 % |
| Léa | 71 % | 5 % | 3 % |
| Tom | 23 % | 0 % | 0 % |

(victoires par match ; avant la correction ci-dessous : Léa 32 % et Tom 0 % en Novice.) Ce qui est sorti de la réunion :
- **Bug (programmeur)** : les coefficients de niveau (mode facile, équilibrage) étaient perdus dès la 2e manche, car chaque manche
  recréait les combattants. Ils valent maintenant pour tout le match, et l'équilibrage a été refait.
- **Débutants (testeur faible, ergonome)** : en Novice, chaque manche perdue adoucit la suivante (l'IA cogne ×0,78, le joueur ×1,12,
  3 paliers au plus) ; sous 25 % de vie le joueur prend 25 % de dégâts en moins de l'IA (« zone de clémence »). En Arcade, même principe en plus léger (×0,92 / ×1,04, 2 paliers) ; Maître : aucune aide.
- **Flux (chef de projet)** : écran de fin avec **Revanche** (duel) ou **Réessayer** (tournoi perdu) qui relance le combat sans repasser
  par les menus ; chaque nouvel essai du même combat ajoute un palier d'aide (Novice). Pas de revanche en réseau.
- **Arcade (testeur graphismes)** : compteur « N HITS » du côté de la victime à partir de 2 coups enchaînés (rouge dès 4).
- **Son (musicien)** : le son venait du jeu d'échecs (« bois sur le bois », musique volontairement discrète). Nouveaux effets de combat
  (claque, choc grave, garde métallique, souffle, balayage du spécial, tintement de parade, saut), nouvelle musique de combat
  (basse pulsée, arpèges, 135 ms la croche) et morceau dédié au duel final (112 ms), sur console comme sur PC.
- **Enchaînement (3e sprint)** : coup léger au sol qui touche (ou est gardé) puis B = coup lourd, une fois ; B pressé pendant le gel d'impact est mémorisé.
- **Ergonomie (2e sprint)** : le menu pause a une page **Coups** (spéciaux du combattant, mouvement et raccourci, SUPER).

## Comparatif avec des jeux équivalents (3e sprint)
De nouveaux testeurs « connaisseurs » (anciens des salles d'arcade, joueurs de Street Fighter II/Alpha, Mortal Kombat, Samurai Shodown,
Tekken, Killer Instinct) ont comparé Iron Tournament à ces références **de mémoire et par grille de fonctions : aucun de ces jeux n'a
été rejoué pour l'occasion**. Verdict par fonction :

| Fonction (référence du genre) | Iron Tournament |
|---|---|
| Tampon d'entrée, annulation en spécial, Ki Cancel, super | oui |
| Dégâts dégressifs en combo, garde haute/basse, grattage | oui |
| Étourdissement, esquives, projection, fatalités (Mortal Kombat) | oui |
| Punition du spam (peu courante dans le genre) | oui : parade punitive |
| Enchaînement de base léger → lourd (Alpha) | **ajouté** (un seul maillon) |
| Pression à l'impact : touches mémorisées pendant le gel | **corrigé** : elles étaient perdues |
| Liste des coups en pause, revanche immédiate, aides aux débutants | oui |
| Mode entraînement | non |
| Désamorçage de projection (throw tech), pushblock, options au relevé | non |
| Réseau avec retour arrière (rollback) | non (lockstep : bon en local, sensible à la latence) |
| Nombre de combattants | 6 (SF II : 8, KI : 10+) |

Retours à traiter ensuite : mode entraînement (le plus demandé), désamorçage de projection, rollback pour jouer à distance.


## Univers, critique et premier contact (4e sprint)
- **Romancier** : le prototype web avait tout un univers (citations d'entrée, répliques de victoire, fins) qui n'avait jamais été porté
  sur AKA. Il l'est maintenant, **texte du prototype conservé** (`tools/lore.py`, normalisé pour la police 8×8) : l'adversaire dit sa citation
  sur l'écran Versus, le vainqueur lance une réplique sur l'écran de fin, et gagner le tournoi affiche **la fin du personnage** (défilante).
  FR et EN complets ; citations traduites en DE/ES/IT ; **les paragraphes des fins restent en anglais en DE/ES/IT (à traduire)**.
  Un test (`test/lore_test.cpp`, 1258 vérifications) garantit que tout tient en 38 colonnes sans rien tronquer, dans les 5 langues.
- **Critique (jeux vidéo)** : fiche des combattants avec le libellé « Puissance » écrasé par la jauge et le nom du SUPER collé au bord
  de l'écran ; « Coups spéciaux » collé aux jauges → colonne des libellés calculée, jauges adaptées, espacements corrigés.
  Autres reproches retenus, **non traités** : 6 combattants seulement, pas de mode entraînement, réseau sans retour arrière, son jamais écouté.
- **Journaliste web** : le `README` de la racine faisait six lignes, sans capture, sans lien de téléchargement ni commandes PC. Réécrit
  (captures réelles issues de `--autotest`, « Jouer en 30 secondes »). Parcours mesuré : titre → tournoi → combattant → Versus → combat,
  quatre appuis sur A.

Non vérifié : le rendu sonore à l'oreille (synthèse écrite sans écoute) et le ressenti humain de l'aide aux débutants.

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
