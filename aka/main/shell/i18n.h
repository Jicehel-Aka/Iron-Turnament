/*
  i18n.h — GENERE par tools/gen_i18n.py, ne pas editer.
  5 langues latines. Les REGLES de chaque jeu sont ici aussi : ce sont
  des chaines comme les autres, et elles doivent tenir en 38 colonnes.
*/
#pragma once
#include <cstdint>

namespace i18n {

enum Lang : uint8_t {
    LANG_FR = 0,
    LANG_EN = 1,
    LANG_DE = 2,
    LANG_ES = 3,
    LANG_IT = 4,
    LANG_COUNT
};

enum StrId : uint16_t {
    STR_TITLE,
    STR_SUBTITLE,
    STR_PRESS_A,
    STR_MODE_TOURNAMENT,
    STR_MODE_DUEL,
    STR_RULES,
    STR_CONTROLS,
    STR_OPTIONS,
    STR_QUIT,
    STR_BACK,
    STR_RESUME,
    STR_QUIT_MATCH,
    STR_LEVEL,
    STR_LVL_1,
    STR_LVL_2,
    STR_LVL_3,
    STR_LANG,
    STR_MUSIC,
    STR_SFX,
    STR_ZOOM,
    STR_FULLSCREEN,
    STR_CALIB,
    STR_YES,
    STR_NO,
    STR_QUIT_CONFIRM,
    STR_QUIT_MATCH_CONFIRM,
    STR_THINKING,
    STR_YOU_WIN,
    STR_YOU_LOSE,
    STR_CHAMPION,
    STR_BOUT_NO,
    STR_MORE,
    STR_SCREENSHOT,
    STR_SHOT_OK,
    STR_HELP_GAME,
    STR_HELP_MENU,
    STR_HELP_SELECT,
    STR_CHOOSE_YOU,
    STR_CHOOSE_FOE,
    STR_SPECIALS,
    STR_ST_VITALITY,
    STR_ST_SPEED,
    STR_ST_POWER,
    STR_ST_DEFENSE,
    STR_ST_REACH,
    STR_ROUND,
    STR_FIGHT,
    STR_COUNTER,
    STR_THROW,
    STR_GUARD_BREAK,
    STR_PULL,
    STR_FINISH_HIM,
    STR_FATALITY,
    STR_HONOR,
    STR_KO,
    STR_PERFECT,
    STR_TIME_OVER,
    STR_GET_READY,
    STR_DECISIVE,
    STR_FINAL_DUEL,
    STR_EN_GARDE,
    STR_OVERHEAD,
    STR_PUNISHES,
    STR_WINS_ROUND,
    STR_WINS_POINTS,
    STR_FT_KENJI,
    STR_FT_KROWEN,
    STR_FT_MEILIN,
    STR_FT_TITAN,
    STR_FT_NYXIA,
    STR_FT_MALAKOR,
    STR_COUNT
};

enum GameId : uint8_t {
    GAME_FIGHT,
    GAME_COUNT
};

void  set_lang(Lang l);
Lang  lang();
const char* T(StrId id);
const char* lang_name(Lang l);
const char* title_of(uint8_t fighter);   // titre du combattant (FighterId)

// Regles d'un jeu : `n` lignes, recuperees une par une.
int         rules_lines(GameId g);
const char* rules_line(GameId g, int i);

// Commandes (identiques pour tous les jeux).
int         controls_lines();
const char* controls_line(int i);

// Touches du clavier (version PC), a la suite des commandes.
int         keys_lines();
const char* keys_line(int i);

} // namespace i18n
