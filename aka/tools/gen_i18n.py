#!/usr/bin/env python3
"""
 gen_i18n.py — Textes d'Iron Tournament AKA (5 langues latines)

 Les noms propres (combattants, coups spéciaux, coups fatals) restent en français,
 comme dans le prototype : ce sont des noms d'attaques, pas des phrases.
 Tout le reste est ici. Règles : lignes de 38 colonnes max, barres d'aide 40 max.
"""
import os, sys

LANGS = ['fr', 'en', 'de', 'es', 'it']
LANG_NAMES = ['Français', 'English', 'Deutsch', 'Español', 'Italiano']

S = [
 # --- coquille ---------------------------------------------------------------
 ('TITLE',        "Iron Tournament",       "Iron Tournament",      "Iron Tournament",     "Iron Tournament",     "Iron Tournament"),
 ('SUBTITLE',     "Combat 1 contre 1",     "One-on-one fighting",  "Zweikampf",           "Lucha 1 contra 1",    "Lotta 1 contro 1"),
 ('PRESS_A',      "Appuyez sur A",         "Press A",              "Drücke A",            "Pulsa A",             "Premi A"),
 ('MODE_TOURNAMENT', "Tournoi",            "Tournament",           "Turnier",             "Torneo",              "Torneo"),
 ('MODE_DUEL',    "Duel",                  "Duel",                 "Duell",               "Duelo",               "Duello"),
 ('RULES',        "Règles du jeu",         "Rules",                "Spielregeln",         "Reglas",              "Regole"),
 ('CONTROLS',     "Commandes",             "Controls",             "Steuerung",           "Controles",           "Comandi"),
 ('OPTIONS',      "Options",               "Options",              "Optionen",            "Opciones",            "Opzioni"),
 ('QUIT',         "Quitter",               "Quit",                 "Beenden",             "Salir",               "Esci"),
 ('BACK',         "Retour",                "Back",                 "Zurück",              "Volver",              "Indietro"),
 ('RESUME',       "Reprendre",             "Resume",               "Weiter",              "Continuar",           "Riprendi"),
 ('QUIT_MATCH',   "Abandonner le match",   "Leave the match",      "Kampf verlassen",     "Abandonar combate",   "Lascia l'incontro"),
 ('LEVEL',        "Niveau",                "Level",                "Stufe",               "Nivel",               "Livello"),
 ('LVL_1',        "Novice",                "Novice",               "Anfänger",            "Novato",              "Novizio"),
 ('LVL_2',        "Arcade",                "Arcade",               "Arcade",              "Arcade",              "Arcade"),
 ('LVL_3',        "Maître",                "Master",               "Meister",             "Maestro",             "Maestro"),
 ('LANG',         "Langue",                "Language",             "Sprache",             "Idioma",              "Lingua"),
 ('MUSIC',        "Musique",               "Music",                "Musik",               "Música",              "Musica"),
 ('SFX',          "Effets",                "Effects",              "Effekte",             "Efectos",             "Effetti"),
 ('ZOOM',         "Zoom",                  "Zoom",                 "Zoom",                "Zoom",                "Zoom"),
 ('FULLSCREEN',   "Plein écran",           "Fullscreen",           "Vollbild",            "Pantalla completa",  "Schermo intero"),
 ('CALIB',        "Recalibrer joystick",   "Recalibrate joystick", "Joystick kalibrieren","Calibrar joystick",   "Calibra joystick"),
 ('YES',          "OUI",                   "YES",                  "JA",                  "SI",                  "SI"),
 ('NO',           "NON",                   "NO",                   "NEIN",                "NO",                  "NO"),
 ('QUIT_CONFIRM', "Quitter le jeu ?",      "Quit the game?",       "Spiel beenden?",      "¿Salir del juego?",   "Uscire dal gioco?"),
 ('QUIT_MATCH_CONFIRM', "Abandonner ?",    "Give up?",             "Aufgeben?",           "¿Abandonar?",         "Abbandonare?"),
 ('THINKING',     "Réflexion",             "Thinking",             "Denkt",               "Pensando",            "Pensa"),
 ('YOU_WIN',      "VOUS GAGNEZ !",         "YOU WIN!",             "DU GEWINNST!",        "¡GANAS!",             "HAI VINTO!"),
 ('YOU_LOSE',     "VOUS PERDEZ",           "YOU LOSE",             "DU VERLIERST",        "PIERDES",             "HAI PERSO"),
 ('CHAMPION',     "CHAMPION DU TOURNOI !", "TOURNAMENT CHAMPION!", "TURNIERSIEGER!",      "¡CAMPEON DEL TORNEO!","CAMPIONE DEL TORNEO!"),
 ('BOUT_NO',      "Combat %d / 5",         "Bout %d / 5",          "Kampf %d / 5",        "Combate %d / 5",      "Incontro %d / 5"),
 ('MORE',         "Suite : bas",           "More: down",           "Weiter: unten",       "Más: abajo",          "Altro: giù"),
 ('SCREENSHOT',   "Capture d'écran",       "Screenshot",           "Screenshot",          "Captura",             "Screenshot"),
 ('SHOT_OK',      "Capture enregistrée",   "Screenshot saved",     "Screenshot gespeich.","Captura guardada",    "Screenshot salvato"),
 # --- barres d'aide (40 caracteres MAXIMUM) -------------------------------------
 ('HELP_GAME',    "A:poing B:pied C:special MENU:pause",
                  "A:punch B:kick C:special MENU:pause",
                  "A:Faust B:Tritt C:Spezial MENU:Pause",
                  "A:punch B:patada C:espec. MENU:pausa",
                  "A:pugno B:calcio C:spec. MENU:pausa"),
 ('HELP_MENU',    "A: valider     B: retour",
                  "A: confirm     B: back",
                  "A: bestätigen  B: zurück",
                  "A: aceptar     B: volver",
                  "A: conferma    B: indietro"),
 ('HELP_SELECT',  "<> choisir   A: valider   B: retour",
                  "<> choose   A: confirm   B: back",
                  "<> wählen   A: ok   B: zurück",
                  "<> elegir   A: aceptar   B: volver",
                  "<> scegli   A: conferma   B: indietro"),
 # --- selection ------------------------------------------------------------------
 ('CHOOSE_YOU',   "Votre combattant",      "Your fighter",         "Dein Kämpfer",        "Tu luchador",         "Il tuo lottatore"),
 ('CHOOSE_FOE',   "Votre adversaire",      "Your opponent",        "Dein Gegner",         "Tu rival",            "Il tuo avversario"),
 ('SPECIALS',     "Coups spéciaux",        "Special moves",        "Spezialzüge",         "Golpes especiales",   "Mosse speciali"),
 ('ST_VITALITY',  "Vitalité",              "Vitality",             "Vitalität",           "Vitalidad",           "Vitalità"),
 ('ST_SPEED',     "Vitesse",               "Speed",                "Tempo",               "Velocidad",           "Velocità"),
 ('ST_POWER',     "Puissance",             "Power",                "Kraft",               "Potencia",            "Potenza"),
 ('ST_DEFENSE',   "Défense",               "Defense",              "Abwehr",              "Defensa",             "Difesa"),
 ('ST_REACH',     "Allonge",               "Reach",                "Reichweite",          "Alcance",             "Portata"),
 # --- bandeaux de combat ---------------------------------------------------------
 ('ROUND',        "MANCHE",                "ROUND",                "RUNDE",               "ASALTO",              "ROUND"),
 ('FIGHT',        "COMBATTEZ !",           "FIGHT!",               "KAMPF!",              "¡LUCHA!",             "COMBATTI!"),
 ('COUNTER',      "CONTRE !",              "COUNTER!",             "KONTER!",             "¡CONTRA!",            "CONTRO!"),
 ('THROW',        "PROJECTION !",          "THROW!",               "WURF!",               "¡PROYECCION!",        "PROIEZIONE!"),
 ('GUARD_BREAK',  "BRISE-GARDE !",         "GUARD BREAK!",         "DECKUNG GEBROCHEN!",  "¡GUARDIA ROTA!",      "GUARDIA ROTTA!"),
 ('PULL',         "VIENS ICI !",           "GET OVER HERE!",       "KOMM HER!",           "¡VEN AQUI!",          "VIENI QUI!"),
 ('FINISH_HIM',   "ACHEVEZ-LE !",          "FINISH HIM!",          "GIB ES IHM!",         "¡ACABALO!",           "FINISCILO!"),
 ('FATALITY',     "FATALITE !",            "FATALITY!",            "FATALITY!",           "¡FATALITY!",          "FATALITY!"),
 ('HONOR',        "SCEAU D'HONNEUR !",     "SEAL OF HONOR!",       "EHRENSIEGEL!",        "¡SELLO DE HONOR!",    "SIGILLO D'ONORE!"),
 ('KO',           "K.O. !",                "K.O.!",                "K.O.!",               "¡K.O.!",              "K.O.!"),
 ('PERFECT',      "PARFAIT !",             "PERFECT!",             "PERFEKT!",            "¡PERFECTO!",          "PERFETTO!"),
 ('TIME_OVER',    "TEMPS ECOULE !",        "TIME OVER!",           "ZEIT ABGELAUFEN!",    "¡TIEMPO!",            "TEMPO SCADUTO!"),
 ('GET_READY',    "Préparez-vous",         "Get ready",            "Mach dich bereit",    "Prepárate",           "Preparati"),
 ('DECISIVE',     "Manche décisive",       "Deciding round",       "Entscheidungsrunde",  "Asalto decisivo",     "Round decisivo"),
 ('FINAL_DUEL',   "Duel final",            "Final duel",           "Finalduell",          "Duelo final",         "Duello finale"),
 ('EN_GARDE',     "En garde",              "On guard",             "En garde",            "En guardia",          "In guardia"),
 ('OVERHEAD',     "Frappe plongeante",     "Overhead strike",      "Ueberkopfschlag",      "Golpe desde arriba",  "Colpo dall'alto"),
 ('PUNISHES',     "%s punit",              "%s punishes",          "%s bestraft",         "%s castiga",          "%s punisce"),
 ('WINS_ROUND',   "%s gagne la manche",    "%s wins the round",    "%s gewinnt die Runde","%s gana el asalto",   "%s vince il round"),
 ('WINS_POINTS',  "%s gagne aux points",   "%s wins on points",    "%s siegt nach Punkten","%s gana por puntos", "%s vince ai punti"),
 # --- titres des combattants -----------------------------------------------------
 ('FT_KENJI',     "Dragon Céleste",        "Celestial Dragon",     "Himmelsdrache",       "Dragón Celeste",      "Drago Celeste"),
 ('FT_KROWEN',    "Ombre de Brume",        "Shadow of Mist",       "Nebelschatten",       "Sombra de Bruma",     "Ombra di Nebbia"),
 ('FT_MEILIN',    "Phénix d'Eclairs",      "Lightning Phoenix",    "Blitzphönix",         "Fénix del Rayo",      "Fenice del Lampo"),
 ('FT_TITAN',     "Colosse d'Oural",       "Colossus of the Urals","Koloss des Urals",    "Coloso de los Urales","Colosso degli Urali"),
 ('FT_NYXIA',     "Reine de l'Orage",      "Storm Queen",          "Sturmkönigin",        "Reina de la Tormenta","Regina della Tempesta"),
 ('FT_MALAKOR',   "Roi Pourpre",           "Crimson King",         "Purpurkönig",         "Rey Carmesí",         "Re Cremisi"),
]

# --- REGLES : une chaine par ligne (38 colonnes MAX) ------------------------------
RULES = {
 'FIGHT': [
  ("Deux manches gagnantes. 99 secondes",  "Win two rounds. 99 seconds",          "Zwei Runden gewinnen. 99 Sekunden",   "Gana dos asaltos. 99 segundos",      "Vinci due round. 99 secondi"),
  ("par manche : a zero, le plus en",      "per round: at zero, whoever has",     "pro Runde: bei null gewinnt, wer",    "por asalto: a cero gana quien",      "a round: a zero vince chi ha"),
  ("forme gagne aux points.",              "more health wins on points.",         "mehr Leben hat.",                     "tenga más vida.",                    "più energia."),
  ("",                                     "",                                    "",                                    "",                                   ""),
  ("Parez en reculant : garde haute",      "Hold back to block: high guard",      "Zurück halten blockt: hohe Deckung", "Retrocede para parar: guardia alta", "Indietro per parare: guardia alta"),
  ("(debout) ou basse (accroupi).",        "(standing) or low (crouching).",      "(stehend) oder tiefe (geduckt).",     "(de pie) o baja (agachado).",        "(in piedi) o bassa (accosciato)."),
  ("Les speciaux entament meme la garde,", "Specials chip away at your guard,",   "Spezialzüge schädigen die Deckung,","Los especiales hieren la guardia,",  "Le speciali feriscono la guardia,"),
  ("et certains coups la brisent.",        "and some strikes break it.",          "manche Schlaege durchbrechen sie.",   "y algunos golpes la rompen.",        "e alcuni colpi la rompono."),
  ("",                                     "",                                    "",                                    "",                                   ""),
  ("Chaque maitre a 3 coups speciaux :",   "Each master has 3 special moves:",    "Jeder Meister hat 3 Spezialzüge:",   "Cada maestro tiene 3 especiales:",   "Ogni maestro ha 3 mosse speciali:"),
  ("avant+C, arriere+C, haut+C.",          "forward+C, back+C, up+C.",            "vor+C, zurück+C, hoch+C.",           "adelante+C, atras+C, arriba+C.",     "avanti+C, indietro+C, su+C."),
  ("",                                     "",                                    "",                                    "",                                   ""),
  ("Le coup qui gagne le match etourdit :","The blow that wins the match stuns:", "Der matchentscheidende Treffer",       "El golpe que gana el combate",       "Il colpo che vince l'incontro"),
  ("ACHEVEZ-LE ! Appuyez sur C pres de",   "FINISH HIM! Press C next to the",     "betäubt: GIB ES IHM! Drücke C",     "aturde: ¡ACABALO! Pulsa C junto",    "stordisce: FINISCILO! Premi C"),
  ("lui : coup final (fatalite/honneur).", "foe: finisher (fatality or honor).",  "nahe am Gegner: Finisher.",           "al rival: remate (fatality/honor).", "vicino: finale (fatality/onore)."),
  ("",                                     "",                                    "",                                    "",                                   ""),
  ("Tournoi : 5 combats, le rival jure,",  "Tournament: 5 bouts, your sworn",     "Turnier: 5 Kämpfe, dein Erzrivale,", "Torneo: 5 combates, tu rival",       "Torneo: 5 incontri, il rivale"),
  ("puis Malakor, le Roi Pourpre.",        "rival, then Malakor, Crimson King.",  "dann Malakor, der Purpurkönig.",     "jurado y Malakor, el Rey Carmesí.",  "giurato e Malakor, il Re Cremisi."),
 ],
}

CONTROLS = {
 'FR': ["D-Pad : < > avancer / reculer",
        "         ^ sauter   v s'accroupir",
        "A : poing    (v+A : uppercut)",
        "B : pied     (v+B : balayette)",
        "C : coup special",
        "   >+C  <+C  ^+C : les 3 speciaux",
        "   v+C : esquive   2x < : recul vif",
        "En l'air : A ou B pour frapper",
        "MENU : pause    MENU long : capture",
        "RUN + MENU (500 ms) : retour loader"],
 'EN': ["D-Pad: < > walk / back away",
        "        ^ jump   v crouch",
        "A: punch   (v+A: uppercut)",
        "B: kick    (v+B: low sweep)",
        "C: special move",
        "   >+C  <+C  ^+C: the 3 specials",
        "   v+C: dodge   2x <: quick step back",
        "Airborne: A or B to strike",
        "MENU: pause    long MENU: screenshot",
        "RUN + MENU (500 ms): back to loader"],
 'DE': ["D-Pad: < > vor / zurück",
        "        ^ springen   v ducken",
        "A: Faust   (v+A: Aufwärtshaken)",
        "B: Tritt   (v+B: Fußfeger)",
        "C: Spezialzug",
        "   >+C  <+C  ^+C: die 3 Spezials",
        "   v+C: Ausweichen  2x <: Rückschritt",
        "In der Luft: A oder B schlägt zu",
        "MENU: Pause   MENU lang: Screenshot",
        "RUN + MENU (500 ms): zum Loader"],
 'ES': ["D-Pad: < > avanzar / retroceder",
        "        ^ saltar   v agacharse",
        "A: puñetazo (v+A: gancho)",
        "B: patada   (v+B: barrido)",
        "C: golpe especial",
        "   >+C  <+C  ^+C: los 3 especiales",
        "   v+C: esquiva   2x <: paso atras",
        "En el aire: A o B para golpear",
        "MENU: pausa   MENU largo: captura",
        "RUN + MENU (500 ms): volver al loader"],
 'IT': ["D-Pad: < > avanza / indietreggia",
        "        ^ salta   v abbassati",
        "A: pugno   (v+A: montante)",
        "B: calcio  (v+B: spazzata)",
        "C: mossa speciale",
        "   >+C  <+C  ^+C: le 3 speciali",
        "   v+C: schivata   2x <: indietro",
        "In aria: A o B per colpire",
        "MENU: pausa   MENU lungo: screenshot",
        "RUN + MENU (500 ms): torna al loader"],
}



# --- CLAVIER (version PC) : s'ajoute a la page Commandes quand la version PC tourne --------
KEYS = {
 'FR': ["",
        "CLAVIER (version PC)",
        "Fleches ou WASD : D-Pad",
        "J : poing (A)    K : pied (B)",
        "L : coup special (C)",
        "Entree : A   Retour arriere : B",
        "Echap : pause (maintenu : capture)",
        "F11 : plein ecran",
        "Manette : A, B, X, Start, croix"],
 'EN': ["",
        "KEYBOARD (PC version)",
        "Arrows or WASD: D-Pad",
        "J: punch (A)    K: kick (B)",
        "L: special move (C)",
        "Enter: A   Backspace: B",
        "Esc: pause (hold: screenshot)",
        "F11: fullscreen",
        "Gamepad: A, B, X, Start, D-pad"],
 'DE': ["",
        "TASTATUR (PC-Version)",
        "Pfeile oder WASD: D-Pad",
        "J: Faust (A)    K: Tritt (B)",
        "L: Spezialzug (C)",
        "Enter: A   Rueckschritt: B",
        "Esc: Pause (halten: Screenshot)",
        "F11: Vollbild",
        "Gamepad: A, B, X, Start, Kreuz"],
 'ES': ["",
        "TECLADO (version PC)",
        "Flechas o WASD: D-Pad",
        "J: punetazo (A)  K: patada (B)",
        "L: golpe especial (C)",
        "Enter: A   Retroceso: B",
        "Esc: pausa (mantener: captura)",
        "F11: pantalla completa",
        "Mando: A, B, X, Start, cruz"],
 'IT': ["",
        "TASTIERA (versione PC)",
        "Frecce o WASD: D-Pad",
        "J: pugno (A)    K: calcio (B)",
        "L: mossa speciale (C)",
        "Invio: A   Backspace: B",
        "Esc: pausa (tenuto: screenshot)",
        "F11: schermo intero",
        "Gamepad: A, B, X, Start, croce"],
}


def esc(t):
    return t.replace('\\', '\\\\').replace('"', '\\"')


def main(out):
    os.makedirs(out, exist_ok=True)
    games = list(RULES.keys())

    with open(os.path.join(out, 'i18n.h'), 'w', encoding='utf-8') as f:
        f.write("/*\n  i18n.h — GENERE par tools/gen_i18n.py, ne pas editer.\n"
                "  5 langues latines. Les REGLES de chaque jeu sont ici aussi : ce sont\n"
                "  des chaines comme les autres, et elles doivent tenir en 38 colonnes.\n*/\n"
                "#pragma once\n#include <cstdint>\n\nnamespace i18n {\n\n")
        f.write("enum Lang : uint8_t {\n")
        for i, l in enumerate(LANGS):
            f.write(f"    LANG_{l.upper()} = {i},\n")
        f.write("    LANG_COUNT\n};\n\nenum StrId : uint16_t {\n")
        for k, *_ in S:
            f.write(f"    STR_{k},\n")
        f.write("    STR_COUNT\n};\n\n")
        f.write("enum GameId : uint8_t {\n")
        for g in games:
            f.write(f"    GAME_{g},\n")
        f.write("    GAME_COUNT\n};\n\n")
        f.write("void  set_lang(Lang l);\nLang  lang();\n"
                "const char* T(StrId id);\n"
                "const char* lang_name(Lang l);\n"
                "const char* title_of(uint8_t fighter);   // titre du combattant (FighterId)\n\n"
                "// Regles d'un jeu : `n` lignes, recuperees une par une.\n"
                "int         rules_lines(GameId g);\n"
                "const char* rules_line(GameId g, int i);\n\n"
                "// Commandes (identiques pour tous les jeux).\n"
                "int         controls_lines();\n"
                "const char* controls_line(int i);\n\n"
                "// Touches du clavier (version PC), a la suite des commandes.\n"
                "int         keys_lines();\n"
                "const char* keys_line(int i);\n\n"
                "} // namespace i18n\n")

    with open(os.path.join(out, 'i18n.cpp'), 'w', encoding='utf-8') as f:
        f.write('#include "i18n.h"\n\nnamespace i18n {\n\n')
        f.write("static const char* const NAMES[LANG_COUNT] = {\n")
        for n in LANG_NAMES:
            f.write(f'    "{esc(n)}",\n')
        f.write("};\n\n")

        f.write("static const char* const TABLE[LANG_COUNT][STR_COUNT] = {\n")
        for li in range(len(LANGS)):
            f.write(f"    {{ // {LANG_NAMES[li]}\n")
            for row in S:
                f.write(f'        "{esc(row[1 + li])}",\n')
            f.write("    },\n")
        f.write("};\n\n")

        for g in games:
            rows = RULES[g]
            f.write(f"static const char* const RULES_{g}[LANG_COUNT][{len(rows)}] = {{\n")
            for li in range(len(LANGS)):
                f.write("    {\n")
                for r in rows:
                    f.write(f'        "{esc(r[li])}",\n')
                f.write("    },\n")
            f.write("};\n")
            f.write(f"constexpr int RULES_{g}_N = {len(rows)};\n\n")

        f.write(f"static const char* const CONTROLS[LANG_COUNT][{len(CONTROLS['FR'])}] = {{\n")
        for l in LANGS:
            f.write("    {\n")
            for line in CONTROLS[l.upper()]:
                f.write(f'        "{esc(line)}",\n')
            f.write("    },\n")
        f.write("};\n")
        f.write(f"constexpr int CONTROLS_N = {len(CONTROLS['FR'])};\n\n")

        f.write(f"static const char* const KEYS[LANG_COUNT][{len(KEYS['FR'])}] = {{\n")
        for l in LANGS:
            f.write("    {\n")
            for line in KEYS[l.upper()]:
                f.write(f'        "{esc(line)}",\n')
            f.write("    },\n")
        f.write("};\n")
        f.write(f"constexpr int KEYS_N = {len(KEYS['FR'])};\n\n")

        f.write("""static Lang g_lang = LANG_FR;

void set_lang(Lang l) { if (l < LANG_COUNT) g_lang = l; }
Lang lang()           { return g_lang; }

const char* T(StrId id)        { return (id < STR_COUNT) ? TABLE[g_lang][id] : "?"; }
const char* lang_name(Lang l)  { return (l < LANG_COUNT) ? NAMES[l] : "?"; }

const char* title_of(uint8_t f) { return (f < 6) ? TABLE[g_lang][STR_FT_KENJI + f] : ""; }

int rules_lines(GameId g) {
    switch (g) {
""")
        for g in games:
            f.write(f"        case GAME_{g}: return RULES_{g}_N;\n")
        f.write("        default: return 0;\n    }\n}\n\n")

        f.write("const char* rules_line(GameId g, int i) {\n    switch (g) {\n")
        for g in games:
            f.write(f"        case GAME_{g}: return (i < RULES_{g}_N) ? RULES_{g}[g_lang][i] : \"\";\n")
        f.write("        default: return \"\";\n    }\n}\n\n")

        f.write("int         controls_lines()      { return CONTROLS_N; }\n"
                "const char* controls_line(int i)  { return (i < CONTROLS_N) ? CONTROLS[g_lang][i] : \"\"; }\n"
                "int         keys_lines()          { return KEYS_N; }\n"
                "const char* keys_line(int i)      { return (i < KEYS_N) ? KEYS[g_lang][i] : \"\"; }\n\n"
                "} // namespace i18n\n")

    print(f"genere -> {out}/i18n.{{h,cpp}}  ({len(S)} chaines + regles de {len(games)} jeux, "
          f"x {len(LANGS)} langues)")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'main/shell')
