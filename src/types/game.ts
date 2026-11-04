export type FighterId = 'kenji' | 'krowen' | 'meilin' | 'titan' | 'nyxia' | 'malakor';

export type GameMode = 'STORY' | 'VERSUS_CPU' | 'VERSUS_2P';

export type ScreenPhase =
  | 'TITLE_MENU'
  | 'OPTIONS_MENU'
  | 'CHARACTER_SELECT'
  | 'PRE_MATCH_DIALOGUE'
  | 'PLAYING'
  | 'PAUSED'
  | 'ROUND_SUMMARY'
  | 'STORY_ENDING'
  | 'GAME_OVER';

export type Difficulty = 'NOVICE' | 'ARCADE' | 'MAITRE';

export type RenderEngineMode = 'HYBRID_25D_PRO' | 'SPRITE_2D_PRO' | 'FULL_3D_PRO';

export type RoundDurationOption = 60 | 99 | 0; // 0 = Infini
export type RoundsToWinOption = 1 | 2 | 3;
export type GameSpeedOption = 'NORMAL' | 'TURBO';

export interface GameOptions {
  soundEnabled: boolean;
  bgmVolume: number; // 0..100
  sfxVolume: number; // 0..100
  difficulty: Difficulty;
  roundDuration: RoundDurationOption;
  roundsToWin: RoundsToWinOption;
  gameSpeed: GameSpeedOption;
  renderMode: RenderEngineMode;
  scanlines: boolean;
  chassisLeds: boolean;
  showHitboxes: boolean;
}

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  soundEnabled: true,
  bgmVolume: 70,
  sfxVolume: 85,
  difficulty: 'ARCADE',
  roundDuration: 99,
  roundsToWin: 2,
  gameSpeed: 'NORMAL',
  renderMode: 'SPRITE_2D_PRO',
  scanlines: false,
  chassisLeds: true,
  showHitboxes: false,
};

export type FighterArchetype =
  | 'Équilibré (Shoto)'
  | 'Traqueur (Mix-up)'
  | 'Vélocité (Rushdown)'
  | 'Choppeur (Grappler)'
  | 'Contrôle (Zoner)'
  | 'Seigneur (Pression)';

export type FighterAction =
  | 'IDLE'
  | 'WALK_FWD'
  | 'WALK_BACK'
  | 'CROUCH'
  | 'JUMP'
  | 'JUMP_ATTACK'
  | 'EVADE_HIGH'
  | 'EVADE_MID'
  | 'EVADE_LOW'
  | 'LIGHT_ATTACK'
  | 'HEAVY_ATTACK'
  | 'LOW_KICK'
  | 'UPPERCUT_NORMAL'
  | 'THROW'
  | 'SPECIAL_1'
  | 'SPECIAL_2'
  | 'SPECIAL_3'
  | 'BLOCK_HIGH'
  | 'BLOCK_LOW'
  | 'HITSTUN'
  | 'HITSTUN_GUT'
  | 'KNOCKDOWN'
  | 'WAKEUP'
  | 'TAUNT'
  | 'DIZZY'
  | 'FINISHER'
  | 'FINISHER_VICTIM'
  | 'VICTORY'
  | 'DEFEAT';

export interface SpecialMoveDef {
  id: 'SPECIAL_1' | 'SPECIAL_2' | 'SPECIAL_3';
  name: string;
  classicInput: string;
  gbShortcut: string;
  damage: number;
  chipDamage: number;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  type: 'PROJECTILE' | 'ANTI_AIR' | 'DASH_STRIKE' | 'TELEPORT' | 'HARPOON' | 'COMMAND_GRAB' | 'QUAKE' | 'TRAP_ORB' | 'OVERHEAD';
  description: string;
}

export interface FinisherDef {
  name: string;
  classicInput: string;
  gbShortcut: string;
  rangeHint: 'Corps-à-corps' | 'Mi-distance' | 'Toute distance';
  isHonorable?: boolean;
  description: string;
}

export interface AIPersonalityProfile {
  archetypeLabel: string;
  temperament: string;
  preferredRangePx: number;
  aggression: number;        // 0..1
  patience: number;          // 0..1
  antiAirReflex: number;     // 0..1
  projectileTendency: number;// 0..1
  teleportCounter: number;   // 0..1
  grappleTendency: number;   // 0..1
  arroganceTaunt: number;    // 0..1 (Malakor taunts when ahead!)
  finisherRuthlessness: number; // 0..1
  behaviorSummary: string;
  signatureHabit: string;
}

export interface FighterStats {
  vitality: number;    // Out of 100 -> maps to HP (920 - 1180)
  speed: number;       // Out of 100 -> maps to walk/jump speed
  power: number;       // Out of 100 -> damage multiplier
  defense: number;     // Out of 100 -> incoming damage mitigation
  reach: number;       // Out of 100 -> normal hitbox reach
  recovery: number;    // Out of 100 -> frame recovery agility
}

export interface StageDefinition {
  id: string;
  name: string;
  location: string;
  bgImageUrl: string;
  skyTop: string;
  skyBottom: string;
  floorMain: string;
  floorTrim: string;
  accentHex: string;
  weatherType: 'EMBERS' | 'RAIN' | 'SNOW_SPARKS' | 'LIGHTNING' | 'HELLFIRE' | 'VOID_TORCHES';
}

export interface FighterDefinition {
  id: FighterId;
  name: string;
  shortName: string;
  title: string;
  origin: string;
  fightingStyle: string;
  archetype: FighterArchetype;
  portraitUrl: string;
  portraitCropClass: string;
  primaryColor: string;
  secondaryColor: string;
  skinColor: string;
  accentColor: string;
  rivalId: FighterId;
  stats: FighterStats;
  maxHp: number;
  walkSpeedFwd: number;
  walkSpeedBack: number;
  jumpVelocity: number;
  loreBackground: string;
  personalityDescription: string;
  introQuote: string;
  winQuotes: string[];
  rivalDialogue: {
    playerLine: string;
    rivalReply: string;
  };
  bossChallengeLine: string;
  bossReplyLine: string;
  storyEndingTitle: string;
  storyEndingParagraphs: string[];
  aiProfile: AIPersonalityProfile;
  specials: [SpecialMoveDef, SpecialMoveDef, SpecialMoveDef];
  finisher: FinisherDef;
  stage: StageDefinition;
}

export interface InputSnapshot {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  btnA: boolean;       // Poing / Rapide
  btnB: boolean;       // Pied / Lourd
  btnSpecial: boolean; // Raccourci Gamebuino A+B
  justPressedA: boolean;
  justPressedB: boolean;
  justPressedSpecial: boolean;
}

export interface DirectionHistoryEntry {
  dir: 'N' | 'F' | 'B' | 'U' | 'D' | 'DF' | 'DB' | 'UF' | 'UB';
  frame: number;
}

export interface FighterRuntime {
  id: FighterId;
  slot: 1 | 2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1; // 1 = right, -1 = left
  hp: number;
  maxHp: number;
  displayHp: number; // Trailing red bar
  ki: number;        // 0..100 Super / EX gauge
  action: FighterAction;
  actionFrame: number;
  actionTotalFrames: number;
  hitConfirmedThisMove: boolean;
  comboCount: number;
  comboTimer: number;
  stunGauge: number; // Reaches 100 -> brief stun
  invulnFrames: number;
  isBossBoosted: boolean;
  inputHistory: DirectionHistoryEntry[];
  aiThought: string;
  aiCooldown: number;
}

export interface ProjectileEntity {
  id: number;
  ownerSlot: 1 | 2;
  fighterId: FighterId;
  kind: 'KI_WAVE' | 'HARPOON' | 'STEEL_FAN' | 'LIGHTNING_SPEAR' | 'STASIS_ORB' | 'DARK_WAVE';
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  damage: number;
  chipDamage: number;
  color: string;
  coreColor: string;
  lifeFrames: number;
  maxLifeFrames: number;
  pullsOnHit?: boolean;
}

export interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  gravity?: number;
}

export interface PlayerHabitTracker {
  projectilesThrown: number;
  jumpsCount: number;
  blockingFrames: number;
  closeFrames: number;
}

export interface MatchEngineState {
  frame: number;
  roundNumber: number;
  p1Wins: number;
  p2Wins: number;
  roundsToWin: RoundsToWinOption;
  roundDurationSec: RoundDurationOption;
  timerFrames: number; // 99 seconds * 60 fps (or custom)
  hitstopFrames: number;
  screenShake: number;
  darkSkyFlash: number; // For Finishers & Specials
  roundSubPhase: 'INTRO' | 'FIGHT' | 'FINISH_HIM' | 'FINISHER_ANIM' | 'KO_SLOWMO' | 'ROUND_END';
  subPhaseTimer: number;
  bannerText: string;
  bannerSubtext: string;
  bannerColor: string;
  bannerTimer: number;
  finisherExecuted: 'NONE' | 'FATALITY' | 'HONOR_FINISH';
  winnerSlot: 1 | 2 | null;
  p1: FighterRuntime;
  p2: FighterRuntime;
  projectiles: ProjectileEntity[];
  particles: ParticleEntity[];
  p1Habits: PlayerHabitTracker;
  ledColors: string[]; // 8 RGB LEDs for Gamebuino AKA hardware shell
}
