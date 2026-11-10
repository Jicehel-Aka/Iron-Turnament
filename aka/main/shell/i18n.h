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
    STR_NETWORK,
    STR_NET_HOST_USB,
    STR_NET_JOIN_USB,
    STR_NET_HOST_WIFI,
    STR_NET_JOIN_WIFI,
    STR_NET_WAIT_HOST,
    STR_NET_WAIT_JOIN,
    STR_NET_STALL,
    STR_NET_ERR_OPEN,
    STR_NET_ERR_TIMEOUT,
    STR_NET_ERR_VERSION,
    STR_NET_ERR_DESYNC,
    STR_NET_ERR_LEFT,
    STR_NET_ERR_LINK,
    STR_RULES,
    STR_MOVES,
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
    STR_ROUNDS,
    STR_TIME_LIMIT,
    STR_UNLIMITED,
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
    STR_PARRY,
    STR_REMATCH,
    STR_RETRY,
    STR_RIPOSTE,
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
    STR_LORE_KENJI_INTRO,
    STR_LORE_KENJI_WIN1,
    STR_LORE_KENJI_WIN2,
    STR_LORE_KENJI_WIN3,
    STR_LORE_KENJI_TITLE,
    STR_LORE_KENJI_END1,
    STR_LORE_KENJI_END2,
    STR_LORE_KENJI_END3,
    STR_LORE_KROWEN_INTRO,
    STR_LORE_KROWEN_WIN1,
    STR_LORE_KROWEN_WIN2,
    STR_LORE_KROWEN_WIN3,
    STR_LORE_KROWEN_TITLE,
    STR_LORE_KROWEN_END1,
    STR_LORE_KROWEN_END2,
    STR_LORE_KROWEN_END3,
    STR_LORE_MEILIN_INTRO,
    STR_LORE_MEILIN_WIN1,
    STR_LORE_MEILIN_WIN2,
    STR_LORE_MEILIN_WIN3,
    STR_LORE_MEILIN_TITLE,
    STR_LORE_MEILIN_END1,
    STR_LORE_MEILIN_END2,
    STR_LORE_MEILIN_END3,
    STR_LORE_TITAN_INTRO,
    STR_LORE_TITAN_WIN1,
    STR_LORE_TITAN_WIN2,
    STR_LORE_TITAN_WIN3,
    STR_LORE_TITAN_TITLE,
    STR_LORE_TITAN_END1,
    STR_LORE_TITAN_END2,
    STR_LORE_TITAN_END3,
    STR_LORE_NYXIA_INTRO,
    STR_LORE_NYXIA_WIN1,
    STR_LORE_NYXIA_WIN2,
    STR_LORE_NYXIA_WIN3,
    STR_LORE_NYXIA_TITLE,
    STR_LORE_NYXIA_END1,
    STR_LORE_NYXIA_END2,
    STR_LORE_NYXIA_END3,
    STR_LORE_MALAKOR_INTRO,
    STR_LORE_MALAKOR_WIN1,
    STR_LORE_MALAKOR_WIN2,
    STR_LORE_MALAKOR_WIN3,
    STR_LORE_MALAKOR_TITLE,
    STR_LORE_MALAKOR_END1,
    STR_LORE_MALAKOR_END2,
    STR_LORE_MALAKOR_END3,
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
// Univers : 0 citation d'entree, 1..3 citations de victoire, 4 titre de la fin, 5..7 paragraphes de la fin.
constexpr uint8_t LORE_PER_FIGHTER = 8;
const char* lore(uint8_t fighter, uint8_t k);

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
