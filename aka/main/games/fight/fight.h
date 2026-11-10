/*
===============================================================================
  fight.h — Iron Tournament AKA : types, données et API du moteur de combat
-------------------------------------------------------------------------------
  Port C++ du moteur du prototype web (engine.ts / aiController.ts / fighters.ts).

  CE MOTEUR N'INCLUT AUCUN EN-TETE MATERIEL (ni graphics.h, ni FreeRTOS) : il se
  compile et se teste tel quel sur PC (cf. test/fight_rules.cpp). Le rendu, le son
  et les entrees vivent dans fight_view.cpp / fight_module.cpp.

  CADENCE : la logique tourne a 60 Hz (c'est a cette cadence que sont exprimees
  toutes les durees en images : startup, active, recovery, hitstop...). La tache
  de jeu AKA tourne a 30 fps : elle appelle donc step_match() DEUX FOIS par image
  affichee. L'equilibrage est ainsi strictement celui du prototype.

  Hasard : generateur xorshift32 embarque dans l'etat -> parties reproductibles.
===============================================================================
*/
#pragma once
#include <cstdint>

namespace fight {

// -----------------------------------------------------------------------------
// Constantes d'arene (pixels du monde ; l'ecran fait 320x240)
// -----------------------------------------------------------------------------
constexpr int   ARENA_W   = 320;
constexpr int   WORLD_W   = 640;
constexpr float MIN_X     = 36.0f;
constexpr float MAX_X     = WORLD_W - 36.0f;
constexpr float MAX_SEP   = 268.0f;     // distance maxi entre les deux combattants
constexpr float GRAVITY   = 0.46f;
constexpr int   ROUND_SEC = 99;          // valeurs par defaut ; reglables par match (MatchRules)
constexpr int   ROUNDS_TO_WIN = 2;

float camera_left_x(float p1x, float p2x);

// -----------------------------------------------------------------------------
// Combattants
// -----------------------------------------------------------------------------
enum FighterId : uint8_t { KENJI, KROWEN, MEILIN, TITAN, NYXIA, MALAKOR, FIGHTER_COUNT };

enum Action : uint8_t {
    A_IDLE, A_WALK_FWD, A_WALK_BACK, A_CROUCH, A_JUMP, A_JUMP_ATTACK,
    A_EVADE_HIGH, A_EVADE_MID, A_EVADE_LOW,
    A_LIGHT, A_HEAVY, A_LOW_KICK, A_UPPERCUT, A_THROW,
    A_SPECIAL_1, A_SPECIAL_2, A_SPECIAL_3,
    A_BLOCK_HIGH, A_BLOCK_LOW, A_HITSTUN, A_HITSTUN_GUT, A_KNOCKDOWN, A_WAKEUP,
    A_TAUNT, A_DIZZY, A_FINISHER, A_FINISHER_VICTIM, A_VICTORY, A_DEFEAT,
    ACTION_COUNT
};

enum SpecialType : uint8_t {
    SP_PROJECTILE, SP_ANTI_AIR, SP_DASH_STRIKE, SP_TELEPORT, SP_HARPOON,
    SP_COMMAND_GRAB, SP_QUAKE, SP_TRAP_ORB, SP_OVERHEAD
};

// Mouvement « arcade » qui declenche un special (en plus du raccourci direction + A+B).
enum Motion : uint8_t {
    MO_QCF,   // ↓ →
    MO_QCB,   // ↓ ←
    MO_DP,    // → ↓ →
    MO_HCF,   // ← ↓ →
    MO_BF,    // ← →
    MO_DU,    // ↓ ↑
    MO_DD     // ↓ ↓   (avec B)
};

// Raccourci ergonomique AKA : direction + A+B (ou touche C).
enum Shortcut : uint8_t { SC_FWD, SC_BACK, SC_UP };

enum Range : uint8_t { RANGE_CLOSE, RANGE_MID, RANGE_ANY };

struct Rgb { uint8_t r, g, b; };

struct SpecialDef {
    const char* name;
    Motion      motion;
    Shortcut    shortcut;
    int16_t     damage, chip;
    uint8_t     startup, active, recovery;
    SpecialType type;
};

struct FinisherDef {
    const char* name;          // deja en MAJUSCULES (affiche tel quel)
    Range       range;
    bool        honorable;
};

struct AiProfile {
    uint8_t preferred_range;   // px
    float aggression, patience, anti_air, projectile, teleport,
          grapple, arrogance, ruthless;
};

struct FighterDef {
    const char* short_name;
    int16_t     max_hp;
    uint8_t     power, defense, reach, recovery;     // budget 360 points, cf. fighters.ts
    float       walk_fwd, walk_back, jump_vel;
    Rgb         primary, secondary, skin, accent;
    FighterId   rival;
    AiProfile   ai;
    SpecialDef  specials[3];
    FinisherDef finisher;
    const char* super_name;                          // nom du SUPER (100 Ki), deja en MAJUSCULES
    Rgb         floor_main, floor_trim;              // sol procedural du decor
};

const FighterDef& def(FighterId id);

// Coefficients d'equilibrage des degats infliges (1.0 = neutre), regles par la simulation IA contre IA
// (test/balance.cpp --tune). Le joueur humain utilise toujours la ligne Maitre (reference) ; un combattant
// pilote par l'IA utilise la ligne de son niveau (cf. set_ai_level) : a chaque niveau, les six combattants
// ont ainsi des chances egales face a l'IA du meme niveau.
extern float g_dmg_scale[3][FIGHTER_COUNT];   // [niveau Novice/Arcade/Maitre][combattant]
// Clemence du mode facile (set_ai_level) : l'IA fait moins de degats, le joueur (P1) un peu plus. Les tests
// d'equilibrage IA contre IA utilisent g_dmg_scale seul et ne sont pas touches.
extern float g_level_ai_mult[3];      // multiplicateur des degats de l'IA par niveau
extern float g_level_human_mult[3];   // multiplicateur des degats du joueur par niveau

// Echelle du mode Tournoi : 3 adversaires, le rival jure, puis Malakor (boss).
// Ecrit 5 identifiants dans `out`.
void build_ladder(FighterId player, FighterId out[5]);

// -----------------------------------------------------------------------------
// Etat d'un match
// -----------------------------------------------------------------------------
enum Difficulty : uint8_t { DIFF_NOVICE = 0, DIFF_ARCADE = 1, DIFF_MASTER = 2 };

// Regles du Ki : la jauge se remplit en frappant (+14), en encaissant (+8) et en gardant (+4 / +6 pour
// l'attaquant). Elle est CONSERVEE d'une manche a l'autre et se depense ainsi :
//   - EX    (50 Ki) : special + C maintenu avec A ou B -> degats x1.4, depart plus vif, invulnerable au depart ;
//   - CANCEL (50 Ki) : un EX annule la fin d'un special qui a touche ou ete garde ;
//   - SUPER (100 Ki) : bas + C -> charge imblocable, un coup unique par combattant.
// Tampon d'entree : duree (images logiques a 60 Hz, ~83 ms) pendant laquelle une pression est memorisee.
constexpr int INPUT_BUFFER = 5;

// Coups repetes : le (REPEAT_LIMIT + 1)e coup identique d'affilee (meme touche, serie de moins de REPEAT_WINDOW
// images entre deux lancers) est PARE automatiquement par l'adversaire s'il est libre ou en garde : l'attaquant est
// etourdi PARRY_STUN images et le parant obtient une riposte. Aucun effet sur les projections ni les SUPER.
constexpr int REPEAT_LIMIT  = 3;
constexpr int REPEAT_WINDOW = 150;
constexpr int PARRY_STUN    = 30;
constexpr int PARRY_BLOCK   = 7;
// Garde : la garde dure BLOCKSTUN images (12 avant) et ouvre RIPOSTE_FRAMES images pendant lesquelles le
// prochain coup qui touche fait +25 % de degats (RIPOSTE !).
constexpr int BLOCKSTUN        = 9;
constexpr int RIPOSTE_FRAMES   = 30;
constexpr float RIPOSTE_BONUS  = 1.25f;
// Aide aux debutants (niveau Novice seulement) : chaque manche perdue par le joueur rend la suivante un peu plus
// douce (l'IA cogne moins, le joueur plus), chaque manche gagnee reprend une partie de l'aide.
constexpr int   ASSIST_MAX = 3;
constexpr float MERCY_SCALE = 0.75f;    // Novice : degats de l'IA contre un joueur sous 25 % de vie
constexpr float ASSIST_AI = 0.78f, ASSIST_HUMAN = 1.12f;
// Arcade : meme principe en plus leger (2 paliers au plus). Maitre : jamais d'aide.
constexpr int   ASSIST_MAX_ARCADE = 2;
constexpr float ASSIST_AI_ARCADE = 0.92f, ASSIST_HUMAN_ARCADE = 1.04f;
constexpr int KI_MAX = 100, KI_EX_COST = 50, KI_SUPER_COST = 100;
constexpr int SUPER_STARTUP = 16, SUPER_ACTIVE = 8, SUPER_RECOVERY = 30;   // images logiques du SUPER

struct Input {
    bool left = false, right = false, up = false, down = false;
    bool a = false, b = false, special = false;          // etat maintenu
    bool jp_a = false, jp_b = false, jp_special = false; // front montant
};

enum Dir : uint8_t { D_N, D_F, D_B, D_U, D_D, D_DF, D_DB, D_UF, D_UB };
struct DirEntry { uint8_t dir; int32_t frame; };

struct Fighter {
    FighterId id;
    uint8_t   slot;               // 1 ou 2
    float     x, y, vx, vy;       // y : 0 au sol, NEGATIF en l'air
    int8_t    facing;             // +1 droite, -1 gauche
    int16_t   hp, max_hp;
    float     display_hp;         // barre rouge residuelle
    uint8_t   ki;                 // jauge de Ki 0..KI_MAX (cf. regles du Ki ci-dessous)
    uint8_t   power;              // puissance du special en cours : 0 normal, 1 EX (50 Ki), 2 SUPER (100 Ki)
    Action    action;
    int16_t   action_frame, action_total;
    bool      hit_confirmed;
    uint8_t   combo_count;
    int16_t   combo_timer;
    int16_t   invuln;
    bool      boss;
    DirEntry  hist[16];
    uint8_t   hist_len;
    int16_t   ai_cooldown;
    float     dmg_scale;          // coefficient d'equilibrage des degats infliges (cf. g_dmg_scale)
    float     walk_dist;          // distance cumulee a la marche : pilote le cycle de pas (pas de glissement)
    uint8_t   buf_a, buf_b, buf_sp;   // tampon d'entree : images restantes pour une pression A / B / C deja faite
    uint8_t   rep_kind, rep_count;    // dernier coup lance et nombre de lancers identiques d'affilee
    uint8_t   rep_timer;              // images avant l'oubli de la serie
    bool      spam;                   // le coup en cours est un 4e (ou plus) identique : parade punitive possible
    uint8_t   riposte;                // images restantes de la fenetre de riposte (apres une garde ou une parade)
};

enum ProjKind : uint8_t { PK_KI_WAVE, PK_HARPOON, PK_STEEL_FAN, PK_LIGHTNING, PK_STASIS_ORB, PK_DARK_WAVE };

struct Projectile {
    bool     alive;
    uint8_t  owner;               // 1 ou 2
    FighterId fighter;
    ProjKind kind;
    float    x, y, vx, vy;
    float    w, h;
    int16_t  damage, chip;
    int16_t  life, max_life;
    bool     pulls;
    bool     spam;                // lance par un coup repete : pare s'il touche un adversaire libre
};

struct Particle {
    float   x, y, vx, vy;
    uint8_t size;
    Rgb     color;
    uint8_t life, max_life;
};

enum SubPhase : uint8_t { PH_INTRO, PH_FIGHT, PH_FINISH_HIM, PH_FINISHER_ANIM, PH_KO_SLOWMO, PH_ROUND_END };

// Bandeaux : le moteur ne contient AUCUN texte (i18n oblige) ; la vue compose le
// libelle a partir de l'identifiant et de `arg` (un FighterId).
enum BannerId : uint8_t {
    BN_NONE,
    BN_ROUND_READY,     // MANCHE n / PREPAREZ-VOUS
    BN_ROUND_FINAL,     // MANCHE n / MANCHE DECISIVE
    BN_ROUND_BOSS,      // MANCHE 1 / DUEL FINAL
    BN_ROUND_NEXT,      // MANCHE n / EN GARDE
    BN_FIGHT,           // COMBATTEZ !
    BN_COUNTER,         // CONTRE !
    BN_THROW,           // PROJECTION !
    BN_GRAB,            // nom du special 1 de `arg`
    BN_GUARD_BREAK,     // BRISE-GARDE !
    BN_PULL,            // VIENS ICI !
    BN_FINISH_HIM,      // ACHEVEZ-LE !
    BN_FATALITY,        // FATALITE ! / nom du coup fatal de `arg`
    BN_HONOR,           // SCEAU D'HONNEUR ! / nom du coup de `arg`
    BN_KO,              // K.O. ! / `arg` remporte la manche
    BN_PERFECT,         // PARFAIT ! / `arg` remporte la manche
    BN_TIME,            // TEMPS ECOULE ! / `arg` l'emporte aux points
    BN_SUPER,           // nom du SUPER de `arg`
    BN_EX,              // EX ! / nom du special de `arg`
    BN_PARRY,           // PARADE ! (parade punitive d'un coup repete)
    BN_RIPOSTE          // RIPOSTE ! (coup apres une garde)
};

// Evenements sonores de la derniere image (OR de bits) ; la vue les consomme.
enum SfxBit : uint16_t {
    SFX_WHIFF = 1, SFX_LIGHT = 2, SFX_HEAVY = 4, SFX_BLOCK = 8, SFX_SPECIAL = 16,
    SFX_THROW = 32, SFX_JUMP = 64, SFX_KO = 128, SFX_FINISH_STING = 256,
    SFX_FINISHER = 512, SFX_BELL = 1024, SFX_VICTORY = 2048, SFX_TELEPORT = 4096, SFX_SUPER = 8192, SFX_PARRY = 16384
};

constexpr int MAX_PROJ = 8;
constexpr int MAX_PART = 64;

struct Habits { int16_t blocking; int32_t close; int16_t projectiles; int16_t jumps; };

enum Finisher : uint8_t { FIN_NONE, FIN_FATALITY, FIN_HONOR };

struct Match {
    int32_t   frame;
    uint8_t   round;                 // 1, 2, 3...
    uint8_t   wins[2];               // victoires de P1, P2
    int32_t   timer_frames;
    int16_t   hitstop;
    int16_t   shake;
    int16_t   dark_flash;
    SubPhase  phase;
    int16_t   phase_timer;
    BannerId  banner;
    uint8_t   banner_arg;
    int16_t   banner_timer;
    Finisher  finisher_done;
    uint8_t   winner_slot;           // 0 = personne, 1 ou 2
    bool      boss_match;
    Fighter   f[2];                  // f[0] = P1 (humain), f[1] = P2 (IA)
    Projectile proj[MAX_PROJ];
    Particle  part[MAX_PART];
    uint8_t   part_count;
    Habits    habits;                // habitudes de P1, lues par l'IA
    uint32_t  rng;
    uint16_t  sfx;                   // evenements sonores accumules
    uint8_t   rounds_to_win;         // 1, 2 ou 3 (option)
    uint16_t  round_sec;             // duree d'une manche en secondes ; 0 = illimitee (option)
    bool      leveled;               // set_ai_level a ete appele (les coefficients de niveau et l'aide s'appliquent)
    uint8_t   ai_level;              // niveau choisi (Difficulty)
    uint8_t   assist;                // paliers d'aide en cours, 0..ASSIST_MAX
};

// Reglages d'un match (options du jeu).
struct MatchRules {
    uint8_t  rounds_to_win = ROUNDS_TO_WIN;   // 1, 2 ou 3
    uint16_t round_sec     = ROUND_SEC;       // 30, 60, 99 ; 0 = pas de limite de temps
};
void init_match(Match& m, FighterId p1, FighterId p2, bool boss_match, uint32_t seed,
                const MatchRules& rules = MatchRules());
void start_next_round(Match& m);
// Applique le coefficient du niveau `diff` au combattant de P2 (pilote par l'IA).
void set_ai_level(Match& m, Difficulty diff, int assist = 0);

// Images actives (premiere, derniere incluses) d'une attaque ; faux si l'action n'est pas une attaque.
bool attack_window(const Fighter& f, int& a0, int& a1);

// Colonne (0..5) de la planche pour une attaque : armement 0..2 pendant l'amorce, extension 3..4 pendant les
// images actives (le coup touche quand le membre est tendu), retour 5 pendant la retombee.
inline int attack_col(int af, int a0, int a1) {
    if (af < a0) return a0 > 0 ? af * 3 / a0 : 0;
    if (af <= a1) return 3 + (af - a0) * 2 / (a1 - a0 + 1);
    return 5;
}

// Recul visuel (en pixels, vers l'arriere) du combattant touche, sur les premieres images : le corps encaisse.
inline int hit_recoil(int af, bool gut) {
    const int len = 8;
    if (af < 0 || af >= len) return 0;
    return ((gut ? 3 : 5) * (len - af) + len - 1) / len;
}

// UNE image logique a 60 Hz. `p1_in` : entrees du joueur. P2 est pilote par l'IA.
void step_match(Match& m, const Input& p1_in, Difficulty diff);

// Variante a deux jeux d'entrees explicites (tests ; ouvre la porte au mode 2 joueurs).
void step_match_2p(Match& m, const Input& p1_in, const Input& p2_in);

// IA a personnalite (fight_ai.cpp).
Input ai_decide(Match& m, Fighter& ai, const Fighter& opp, Difficulty diff);

// Hasard du moteur.
float rnd(Match& m);

} // namespace fight
