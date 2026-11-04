import { soundFX } from '../audio/soundEngine';
import { FIGHTERS } from '../data/fighters';
import {
  Difficulty,
  DirectionHistoryEntry,
  FighterAction,
  FighterId,
  FighterRuntime,
  InputSnapshot,
  MatchEngineState,
  ParticleEntity,
  ProjectileEntity,
  SpecialMoveDef,
} from '../types/game';
import { computePersonalityAI } from './aiController';

export const ARENA_WIDTH = 320;
export const ARENA_HEIGHT = 240;
export const STAGE_WORLD_WIDTH = 640;
export const STAGE_MIN_X = 36;
export const STAGE_MAX_X = STAGE_WORLD_WIDTH - 36;
export const MAX_FIGHTER_SEPARATION = 268;
export const FLOOR_Y = 0;
const GRAVITY = 0.46;
const MIN_X = STAGE_MIN_X;
const MAX_X = STAGE_MAX_X;

export function computeCameraLeftX(p1X: number, p2X: number): number {
  const midX = (p1X + p2X) * 0.5;
  return Math.max(0, Math.min(STAGE_WORLD_WIDTH - ARENA_WIDTH, midX - ARENA_WIDTH * 0.5));
}

let nextProjectileId = 1;

function createFighterRuntime(
  id: FighterId,
  slot: 1 | 2,
  isBossBoosted = false
): FighterRuntime {
  const def = FIGHTERS[id];
  const maxHp = isBossBoosted ? Math.round(def.maxHp * 1.12) : def.maxHp;
  return {
    id,
    slot,
    x: slot === 1 ? 246 : 394,
    y: 0,
    vx: 0,
    vy: 0,
    facing: slot === 1 ? 1 : -1,
    hp: maxHp,
    maxHp,
    displayHp: maxHp,
    ki: 0,
    action: 'IDLE',
    actionFrame: 0,
    actionTotalFrames: 1,
    hitConfirmedThisMove: false,
    comboCount: 0,
    comboTimer: 0,
    stunGauge: 0,
    invulnFrames: 0,
    isBossBoosted,
    inputHistory: [],
    aiThought: 'Prêt au duel',
    aiCooldown: 18,
  };
}

export function createInitialMatchState(
  p1Id: FighterId,
  p2Id: FighterId,
  isFinalBossMatch = false
): MatchEngineState {
  const p1 = createFighterRuntime(p1Id, 1, false);
  const p2 = createFighterRuntime(p2Id, 2, isFinalBossMatch);

  return {
    frame: 0,
    roundNumber: 1,
    p1Wins: 0,
    p2Wins: 0,
    timerFrames: 99 * 60,
    hitstopFrames: 0,
    screenShake: 0,
    darkSkyFlash: 0,
    roundSubPhase: 'INTRO',
    subPhaseTimer: 84,
    bannerText: 'MANCHE 1',
    bannerSubtext: isFinalBossMatch ? 'DUEL FINAL — CITADELLE' : 'PRÉPAREZ-VOUS',
    bannerColor: '#F59E0B',
    bannerTimer: 84,
    finisherExecuted: 'NONE',
    winnerSlot: null,
    p1,
    p2,
    projectiles: [],
    particles: [],
    p1Habits: {
      projectilesThrown: 0,
      jumpsCount: 0,
      blockingFrames: 0,
      closeFrames: 0,
    },
    ledColors: Array(8).fill('#1E293B'),
  };
}

export function startNextRound(state: MatchEngineState): void {
  const nextRound = state.roundNumber + 1;
  const p1Ki = Math.min(100, state.p1.ki);
  const p2Ki = Math.min(100, state.p2.ki);
  const bossBoost = state.p2.isBossBoosted;

  state.roundNumber = nextRound;
  state.timerFrames = 99 * 60;
  state.hitstopFrames = 0;
  state.screenShake = 0;
  state.darkSkyFlash = 0;
  state.roundSubPhase = 'INTRO';
  state.subPhaseTimer = 80;
  state.bannerText = `MANCHE ${nextRound}`;
  state.bannerSubtext = nextRound === 3 ? 'MANCHE DÉCISIVE !' : 'EN GARDE';
  state.bannerColor = '#F59E0B';
  state.bannerTimer = 80;
  state.finisherExecuted = 'NONE';
  state.winnerSlot = null;
  state.projectiles = [];
  state.particles = [];

  state.p1 = createFighterRuntime(state.p1.id, 1, false);
  state.p1.ki = p1Ki;
  state.p2 = createFighterRuntime(state.p2.id, 2, bossBoost);
  state.p2.ki = p2Ki;
}

function spawnParticles(
  state: MatchEngineState,
  x: number,
  y: number,
  color: string,
  count: number,
  speed = 3.2,
  size = 3
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const mag = (0.35 + Math.random() * 0.85) * speed;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * mag,
      vy: Math.sin(angle) * mag - 0.8,
      size: Math.max(1, Math.round(size * (0.7 + Math.random() * 0.6))),
      color,
      life: 0,
      maxLife: 12 + Math.floor(Math.random() * 14),
      gravity: 0.14,
    });
  }
}

function getRelativeDir(
  input: InputSnapshot,
  facing: 1 | -1
): DirectionHistoryEntry['dir'] {
  const fwd = facing === 1 ? input.right : input.left;
  const back = facing === 1 ? input.left : input.right;
  if (input.down && fwd) return 'DF';
  if (input.down && back) return 'DB';
  if (input.up && fwd) return 'UF';
  if (input.up && back) return 'UB';
  if (input.down) return 'D';
  if (input.up) return 'U';
  if (fwd) return 'F';
  if (back) return 'B';
  return 'N';
}

function recordDirection(fighter: FighterRuntime, input: InputSnapshot, frame: number): void {
  const dir = getRelativeDir(input, fighter.facing);
  const last = fighter.inputHistory[fighter.inputHistory.length - 1];
  if (!last || last.dir !== dir) {
    fighter.inputHistory.push({ dir, frame });
    if (fighter.inputHistory.length > 16) {
      fighter.inputHistory.shift();
    }
  }
  // Nettoyage des entrées trop anciennes (> 26 frames)
  fighter.inputHistory = fighter.inputHistory.filter((e) => frame - e.frame <= 26);
}

function hasMotionSequence(
  history: DirectionHistoryEntry[],
  sequence: Array<DirectionHistoryEntry['dir'][]>
): boolean {
  let seqIdx = sequence.length - 1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (sequence[seqIdx].includes(history[i].dir)) {
      seqIdx--;
      if (seqIdx < 0) return true;
    }
  }
  return false;
}

function detectSpecialMove(
  fighter: FighterRuntime,
  input: InputSnapshot
): SpecialMoveDef | null {
  const def = FIGHTERS[fighter.id];
  const fwd = fighter.facing === 1 ? input.right : input.left;
  const back = fighter.facing === 1 ? input.left : input.right;

  // 1. Raccourcis ergonomiques Gamebuino AKA (Direction + A+B / Bouton Spécial)
  const specialTrigger =
    input.justPressedSpecial || (input.justPressedA && input.btnB) || (input.justPressedB && input.btnA);

  if (specialTrigger && !input.down) {
    if (input.up) {
      const found = def.specials.find((s) => s.gbShortcut === '↑ + A+B');
      if (found) return found;
    }
    if (back) {
      const found = def.specials.find((s) => s.gbShortcut === '← + A+B');
      if (found) return found;
    }
    if (fwd || (!input.up && !back)) {
      const found = def.specials.find((s) => s.gbShortcut === '→ + A+B');
      if (found) return found;
    }
  }

  // 2. Manipulations Arcade classiques (Quart de cercle, Dragon Punch, Arrière-Avant, Bas-Bas)
  if (input.justPressedA || input.justPressedB) {
    const h = fighter.inputHistory;

    // Dragon Punch : F -> D -> DF/F
    if (hasMotionSequence(h, [['F'], ['D'], ['DF', 'F']])) {
      const dp = def.specials.find((s) => s.classicInput.includes('→ ↓ →'));
      if (dp) return dp;
    }

    // Demi-cercle choppe : B -> D -> F
    if (hasMotionSequence(h, [['B', 'DB'], ['D'], ['DF', 'F']])) {
      const hcf = def.specials.find((s) => s.classicInput.includes('← ↓ →'));
      if (hcf) return hcf;
    }

    // Quart de cercle avant : D -> DF/F
    if (hasMotionSequence(h, [['D'], ['DF', 'F']])) {
      const qcf = def.specials.find((s) => s.classicInput.startsWith('↓ →'));
      if (qcf) return qcf;
    }

    // Quart de cercle arrière : D -> DB/B
    if (hasMotionSequence(h, [['D'], ['DB', 'B']])) {
      const qcb = def.specials.find((s) => s.classicInput.startsWith('↓ ←'));
      if (qcb) return qcb;
    }

    // Arrière -> Avant : B -> F
    if (hasMotionSequence(h, [['B', 'DB'], ['F']])) {
      const bf = def.specials.find((s) => s.classicInput.startsWith('← →'));
      if (bf) return bf;
    }

    // Bas -> Haut : D -> U
    if (hasMotionSequence(h, [['D', 'DB', 'DF'], ['U', 'UF']])) {
      const du = def.specials.find((s) => s.classicInput.startsWith('↓ ↑'));
      if (du) return du;
    }

    // Bas -> Bas : D -> N -> D
    if (hasMotionSequence(h, [['D'], ['N'], ['D']]) && input.justPressedB) {
      const dd = def.specials.find((s) => s.classicInput.startsWith('↓ ↓'));
      if (dd) return dd;
    }
  }

  return null;
}

function tryTriggerFinisher(
  state: MatchEngineState,
  winner: FighterRuntime,
  loser: FighterRuntime,
  input: InputSnapshot
): boolean {
  if (state.roundSubPhase !== 'FINISH_HIM' || loser.action !== 'DIZZY') return false;

  const specialPressed =
    input.justPressedSpecial ||
    (input.justPressedA && input.btnB) ||
    (input.justPressedB && input.btnA);

  if (!specialPressed) return false;

  const def = FIGHTERS[winner.id];
  const dist = Math.abs(winner.x - loser.x);

  if (def.finisher.rangeHint === 'Corps-à-corps' && dist > 62) {
    return false;
  }
  if (def.finisher.rangeHint === 'Mi-distance' && dist > 145) {
    return false;
  }

  // Déclenchement du Coup Fatal !
  state.roundSubPhase = 'FINISHER_ANIM';
  state.subPhaseTimer = 115;
  state.darkSkyFlash = 115;
  state.screenShake = 14;
  state.finisherExecuted = def.finisher.isHonorable ? 'HONOR_FINISH' : 'FATALITY';

  winner.action = 'FINISHER';
  winner.actionFrame = 0;
  winner.actionTotalFrames = 110;
  winner.vx = 0;

  loser.action = 'FINISHER_VICTIM';
  loser.actionFrame = 0;
  loser.actionTotalFrames = 110;
  loser.vx = 0;
  loser.hp = 0;

  state.bannerText = def.finisher.isHonorable ? 'SCEAU CÉLESTE !' : 'FATALITÉ !';
  state.bannerSubtext = def.finisher.name.toUpperCase();
  state.bannerColor = def.finisher.isHonorable ? '#38BDF8' : '#E11D48';
  state.bannerTimer = 115;

  soundFX.finisherImpact();
  spawnParticles(
    state,
    loser.x,
    176 + loser.y,
    def.accentColor,
    28,
    4.8,
    4
  );

  return true;
}

function startFighterAction(
  fighter: FighterRuntime,
  action: FighterAction,
  totalFrames: number
): void {
  fighter.action = action;
  fighter.actionFrame = 0;
  fighter.actionTotalFrames = totalFrames;
  fighter.hitConfirmedThisMove = false;
}

function spawnSpecialProjectile(
  state: MatchEngineState,
  fighter: FighterRuntime,
  spec: SpecialMoveDef
): void {
  const def = FIGHTERS[fighter.id];
  const dir = fighter.facing;
  const startX = fighter.x + dir * 24;
  const startY = fighter.y - 26;

  if (fighter.slot === 1) {
    state.p1Habits.projectilesThrown++;
  }

  let kind: ProjectileEntity['kind'] = 'KI_WAVE';
  let vx = dir * 4.4;
  let width = 16;
  let height = 12;
  let maxLife = 80;
  let pullsOnHit = false;

  if (fighter.id === 'krowen' && spec.type === 'HARPOON') {
    kind = 'HARPOON';
    vx = dir * 6.2;
    width = 22;
    height = 8;
    maxLife = 38;
    pullsOnHit = true;
    soundFX.specialMove('HARPOON');
  } else if (fighter.id === 'meilin') {
    kind = 'STEEL_FAN';
    vx = dir * 5.4;
    width = 14;
    height = 10;
    maxLife = 65;
    soundFX.specialMove('KI');
  } else if (fighter.id === 'nyxia' && spec.type === 'PROJECTILE') {
    kind = 'LIGHTNING_SPEAR';
    vx = dir * 6.4;
    width = 24;
    height = 8;
    maxLife = 55;
    soundFX.specialMove('LIGHTNING');
  } else if (fighter.id === 'nyxia' && spec.type === 'TRAP_ORB') {
    kind = 'STASIS_ORB';
    vx = dir * 1.65;
    width = 18;
    height = 18;
    maxLife = 115;
    soundFX.specialMove('LIGHTNING');
  } else if (fighter.id === 'malakor') {
    kind = 'DARK_WAVE';
    vx = dir * 4.7;
    width = 20;
    height = 18;
    maxLife = 72;
    soundFX.specialMove('HEAVY');
  } else {
    soundFX.specialMove('KI');
  }

  state.projectiles.push({
    id: nextProjectileId++,
    ownerSlot: fighter.slot,
    fighterId: fighter.id,
    kind,
    x: startX,
    y: startY,
    vx,
    vy: 0,
    width,
    height,
    damage: spec.damage,
    chipDamage: spec.chipDamage,
    color: def.accentColor,
    coreColor: '#FFFFFF',
    lifeFrames: 0,
    maxLifeFrames: maxLife,
    pullsOnHit,
  });
}

function canCancelOrAct(fighter: FighterRuntime): boolean {
  if (
    fighter.action === 'IDLE' ||
    fighter.action === 'WALK_FWD' ||
    fighter.action === 'WALK_BACK' ||
    fighter.action === 'CROUCH'
  ) {
    return true;
  }
  return false;
}

function updateFighterState(
  state: MatchEngineState,
  fighter: FighterRuntime,
  opp: FighterRuntime,
  input: InputSnapshot
): void {
  const def = FIGHTERS[fighter.id];
  recordDirection(fighter, input, state.frame);

  if (fighter.invulnFrames > 0) fighter.invulnFrames--;
  if (fighter.aiCooldown > 0) fighter.aiCooldown--;
  if (fighter.comboTimer > 0) {
    fighter.comboTimer--;
    if (fighter.comboTimer === 0) fighter.comboCount = 0;
  }

  // Lissage de la barre de vie rouge résiduelle
  if (fighter.displayHp > fighter.hp) {
    fighter.displayHp = Math.max(fighter.hp, fighter.displayHp - 3.2);
  } else {
    fighter.displayHp = fighter.hp;
  }

  // Suivi des habitudes du Joueur 1 pour l'IA adaptative
  if (fighter.slot === 1 && state.roundSubPhase === 'FIGHT') {
    if (fighter.action === 'BLOCK_HIGH' || fighter.action === 'BLOCK_LOW') {
      state.p1Habits.blockingFrames = Math.min(200, state.p1Habits.blockingFrames + 2);
    } else if (state.p1Habits.blockingFrames > 0) {
      state.p1Habits.blockingFrames--;
    }
    if (Math.abs(fighter.x - opp.x) < 55) {
      state.p1Habits.closeFrames++;
    }
  }

  // Auto-orientation au sol dans les états neutres
  if (
    fighter.y >= 0 &&
    (fighter.action === 'IDLE' ||
      fighter.action === 'WALK_FWD' ||
      fighter.action === 'WALK_BACK' ||
      fighter.action === 'CROUCH' ||
      fighter.action === 'DIZZY')
  ) {
    if (opp.x > fighter.x + 2) fighter.facing = 1;
    else if (opp.x < fighter.x - 2) fighter.facing = -1;
  }

  // Pendant l'intro ou les animations de fin, aucun contrôle manuel
  if (state.roundSubPhase !== 'FIGHT' && state.roundSubPhase !== 'FINISH_HIM') {
    fighter.actionFrame++;
    applyPhysics(fighter);
    return;
  }

  // Si l'adversaire est étourdi ("ACHEVEZ-LE !"), vérifier si le vainqueur lance son Coup Fatal
  if (state.roundSubPhase === 'FINISH_HIM' && opp.action === 'DIZZY') {
    if (tryTriggerFinisher(state, fighter, opp, input)) {
      return;
    }
  }

  // État étourdi ("DIZZY")
  if (fighter.action === 'DIZZY') {
    fighter.vx = 0;
    fighter.actionFrame++;
    applyPhysics(fighter);
    return;
  }

  // Avancement de l'action en cours
  fighter.actionFrame++;

  // Possibilité d'annuler un coup normal qui a touché par un Coup Spécial (2-in-1 Cancel façon SF2 !)
  const canSpecialCancel =
    (fighter.action === 'LIGHT_ATTACK' ||
      fighter.action === 'HEAVY_ATTACK' ||
      fighter.action === 'UPPERCUT_NORMAL') &&
    fighter.hitConfirmedThisMove &&
    fighter.y >= 0;

  if ((canCancelOrAct(fighter) && fighter.y >= 0) || canSpecialCancel) {
    const special = detectSpecialMove(fighter, input);
    if (special) {
      triggerSpecialAction(state, fighter, opp, special);
      applyPhysics(fighter);
      return;
    }
  }

  // Gestion des états verrouillés (attaques, hitstun, knockdown, etc.)
  if (!canCancelOrAct(fighter)) {
    // Attaque aérienne pendant un saut (A = coup sauté léger, B = coup sauté puissant JUMP_ATTACK)
    if (fighter.action === 'JUMP' && fighter.y < -8) {
      if (input.justPressedA) {
        fighter.hitConfirmedThisMove = false;
        soundFX.whiff();
        fighter.action = 'LIGHT_ATTACK';
        fighter.actionFrame = 0;
        fighter.actionTotalFrames = 20;
      } else if (input.justPressedB) {
        fighter.hitConfirmedThisMove = false;
        soundFX.whiff();
        fighter.action = 'JUMP_ATTACK';
        fighter.actionFrame = 0;
        fighter.actionTotalFrames = 24;
      }
    }

    // Exécution des effets à la frame exacte des Coups Spéciaux
    handleOngoingSpecialEffects(state, fighter, opp);

    // Fin de l'action temporisée
    if (fighter.action !== 'JUMP' && fighter.actionFrame >= fighter.actionTotalFrames) {
      if (fighter.action === 'KNOCKDOWN') {
        startFighterAction(fighter, 'WAKEUP', 14);
        fighter.invulnFrames = 18;
      } else {
        startFighterAction(fighter, fighter.y < 0 ? 'JUMP' : 'IDLE', 1);
      }
    }

    applyPhysics(fighter);
    return;
  }

  // --- ÉTAT NEUTRE AU SOL : Déplacements, Sauts, Projections & Coups Normaux ---
  const fwd = fighter.facing === 1 ? input.right : input.left;
  const back = fighter.facing === 1 ? input.left : input.right;

  // 1. Esquives actives (Haute, Moyenne, Basse) & Projection au corps-à-corps
  const bothButtonsJust =
    (input.justPressedA && input.btnB) || (input.justPressedB && input.btnA);
  const evadeTrigger = input.justPressedSpecial || bothButtonsJust;

  if (evadeTrigger && input.down) {
    soundFX.whiff();
    if (back) {
      // ↙ + A+B : Esquive Basse (impulsion jambes groupées au-dessus d'une balayette)
      fighter.vx = -fighter.facing * 1.4;
      startFighterAction(fighter, 'EVADE_LOW', 18);
    } else {
      // ↓ + A+B : Esquive Haute (flexion Bob & Weave sous projectiles et coups hauts)
      fighter.vx = fighter.facing * 0.8;
      startFighterAction(fighter, 'EVADE_HIGH', 17);
    }
    applyPhysics(fighter);
    return;
  }

  // Double-tap Arrière (← ←) : Esquive Moyenne (Pivot 3D sur l'axe Z)
  const hLen = fighter.inputHistory.length;
  if (
    hLen >= 4 &&
    fighter.inputHistory[hLen - 1].frame === state.frame &&
    fighter.inputHistory[hLen - 1].dir === 'B' &&
    fighter.inputHistory[hLen - 2].dir === 'N' &&
    fighter.inputHistory[hLen - 3].dir === 'B' &&
    state.frame - fighter.inputHistory[hLen - 3].frame <= 14
  ) {
    soundFX.whiff();
    fighter.vx = -fighter.facing * 2.2;
    startFighterAction(fighter, 'EVADE_MID', 16);
    applyPhysics(fighter);
    return;
  }

  if (bothButtonsJust && Math.abs(fighter.x - opp.x) <= 36 && opp.y >= -6 && opp.invulnFrames <= 0) {
    executeNormalThrow(state, fighter, opp);
    applyPhysics(fighter);
    return;
  }

  // 2. Coups Normaux
  const recBonus = Math.round((def.stats.recovery - 55) * 0.08);
  if (input.justPressedA) {
    fighter.vx = 0;
    soundFX.whiff();
    if (input.down) {
      startFighterAction(fighter, 'UPPERCUT_NORMAL', Math.max(14, 18 - recBonus));
    } else {
      startFighterAction(fighter, 'LIGHT_ATTACK', Math.max(12, 15 - recBonus));
    }
    applyPhysics(fighter);
    return;
  }

  if (input.justPressedB) {
    fighter.vx = 0;
    soundFX.whiff();
    if (input.down) {
      startFighterAction(fighter, 'LOW_KICK', Math.max(19, 23 - recBonus));
    } else {
      startFighterAction(fighter, 'HEAVY_ATTACK', Math.max(20, 24 - recBonus));
    }
    applyPhysics(fighter);
    return;
  }

  // 3. Saut
  if (input.up && fighter.y >= 0) {
    fighter.vy = def.jumpVelocity;
    fighter.vx = fwd ? def.walkSpeedFwd * 1.12 * fighter.facing : back ? -def.walkSpeedBack * 1.05 * fighter.facing : 0;
    startFighterAction(fighter, 'JUMP', 60);
    soundFX.jump();
    if (fighter.slot === 1) state.p1Habits.jumpsCount++;
    applyPhysics(fighter);
    return;
  }

  // 4. Accroupissement & Marche
  if (input.down) {
    fighter.vx = 0;
    fighter.action = 'CROUCH';
  } else if (fwd) {
    fighter.vx = def.walkSpeedFwd * fighter.facing;
    fighter.action = 'WALK_FWD';
  } else if (back) {
    fighter.vx = -def.walkSpeedBack * fighter.facing;
    fighter.action = 'WALK_BACK';
  } else {
    fighter.vx = 0;
    fighter.action = 'IDLE';
  }

  applyPhysics(fighter);
}

function triggerSpecialAction(
  state: MatchEngineState,
  fighter: FighterRuntime,
  opp: FighterRuntime,
  spec: SpecialMoveDef
): void {
  const totalFrames = spec.startupFrames + spec.activeFrames + spec.recoveryFrames;
  startFighterAction(fighter, spec.id, totalFrames);
  fighter.vx = 0;
  fighter.ki = Math.min(100, fighter.ki + 10);

  const def = FIGHTERS[fighter.id];
  spawnParticles(state, fighter.x, 184 + fighter.y, def.accentColor, 8, 2.6, 2);

  if (spec.type === 'ANTI_AIR' && fighter.id === 'kenji') {
    // Dragon Ascendant : invulnérabilité au démarrage + impulsion verticale !
    fighter.invulnFrames = 10;
    fighter.vy = -7.2;
    fighter.vx = fighter.facing * 1.8;
    soundFX.specialMove('KI');
  } else if (spec.type === 'ANTI_AIR' && fighter.id === 'titan') {
    // Lariat Blindé : détruit les projectiles proches
    soundFX.specialMove('HEAVY');
  } else if (spec.type === 'DASH_STRIKE') {
    fighter.vx = fighter.facing * (fighter.id === 'malakor' ? 5.2 : 4.2);
    if (fighter.id === 'kenji') fighter.vy = -2.4;
    soundFX.specialMove(fighter.id === 'nyxia' ? 'LIGHTNING' : 'HEAVY');
  } else if (spec.type === 'OVERHEAD') {
    fighter.vy = fighter.id === 'meilin' ? -5.8 : -4.6;
    fighter.vx = fighter.facing * 3.6;
    soundFX.specialMove('HEAVY');
  } else if (spec.type === 'TELEPORT') {
    soundFX.specialMove('TELEPORT');
    spawnParticles(state, fighter.x, 175 + fighter.y, '#F97316', 16, 3.6, 3);
  } else if (spec.type === 'COMMAND_GRAB') {
    soundFX.whiff();
  } else if (spec.type === 'QUAKE') {
    soundFX.specialMove('HEAVY');
  }
}

function handleOngoingSpecialEffects(
  state: MatchEngineState,
  fighter: FighterRuntime,
  opp: FighterRuntime
): void {
  if (
    fighter.action !== 'SPECIAL_1' &&
    fighter.action !== 'SPECIAL_2' &&
    fighter.action !== 'SPECIAL_3'
  ) {
    return;
  }

  const def = FIGHTERS[fighter.id];
  const spec = def.specials.find((s) => s.id === fighter.action);
  if (!spec) return;

  // Tir de projectile au frame exact de startup
  if (
    (spec.type === 'PROJECTILE' || spec.type === 'HARPOON' || spec.type === 'TRAP_ORB') &&
    fighter.actionFrame === spec.startupFrames
  ) {
    spawnSpecialProjectile(state, fighter, spec);
  }

  // Téléportation de Krowen dans le dos de l'adversaire
  if (spec.type === 'TELEPORT' && fighter.actionFrame === spec.startupFrames) {
    const targetX = opp.x - opp.facing * 34;
    fighter.x = Math.max(MIN_X + 6, Math.min(MAX_X - 6, targetX));
    fighter.facing = opp.x >= fighter.x ? 1 : -1;
    spawnParticles(state, fighter.x, 175 + fighter.y, '#F97316', 16, 3.8, 3);
  }

  // Lariat Blindé de Titan : pulvérise les projectiles ennemis proches
  if (fighter.id === 'titan' && spec.type === 'ANTI_AIR') {
    const inActive =
      fighter.actionFrame >= spec.startupFrames &&
      fighter.actionFrame <= spec.startupFrames + spec.activeFrames;
    if (inActive) {
      state.projectiles = state.projectiles.filter((p) => {
        if (p.ownerSlot !== fighter.slot && Math.abs(p.x - fighter.x) < 42) {
          spawnParticles(state, p.x, 200 + p.y, '#F59E0B', 10, 3.2, 2);
          soundFX.blockHit();
          return false;
        }
        return true;
      });
    }
  }

  // Brise-Vertèbres de Titan (Command Grab imblocable !)
  if (
    spec.type === 'COMMAND_GRAB' &&
    fighter.actionFrame === spec.startupFrames &&
    !fighter.hitConfirmedThisMove
  ) {
    if (Math.abs(fighter.x - opp.x) <= 50 && opp.y >= -14 && opp.invulnFrames <= 0) {
      fighter.hitConfirmedThisMove = true;
      applyDamageToOpponent(state, fighter, opp, spec.damage, true, true, 'BRISE-VERTÈBRES !');
      soundFX.throwSlam();
    }
  }

  // Séisme d'Oural de Titan (touche tout adversaire au sol à portée large)
  if (
    spec.type === 'QUAKE' &&
    fighter.actionFrame === spec.startupFrames &&
    !fighter.hitConfirmedThisMove
  ) {
    state.screenShake = 10;
    spawnParticles(state, fighter.x + fighter.facing * 28, 202, '#F59E0B', 18, 3.5, 3);
    if (Math.abs(fighter.x - opp.x) <= 105 && opp.y >= -4 && opp.invulnFrames <= 0) {
      fighter.hitConfirmedThisMove = true;
      resolveStrikeHit(state, fighter, opp, spec.damage, spec.chipDamage, 'LOW', true);
    }
  }

  // Freinage progressif après la phase active des charges
  if (
    (spec.type === 'DASH_STRIKE' || spec.type === 'OVERHEAD') &&
    fighter.actionFrame > spec.startupFrames + spec.activeFrames
  ) {
    fighter.vx *= 0.65;
  }
}

function executeNormalThrow(
  state: MatchEngineState,
  attacker: FighterRuntime,
  defender: FighterRuntime
): void {
  startFighterAction(attacker, 'THROW', 26);
  attacker.vx = 0;
  attacker.hitConfirmedThisMove = true;

  const baseThrowDmg = Math.round(92 * (FIGHTERS[attacker.id].stats.power / 62));
  applyDamageToOpponent(state, attacker, defender, baseThrowDmg, true, true, 'PROJECTION !');
  soundFX.throwSlam();
}

function isBlockingCorrectly(
  defender: FighterRuntime,
  defenderInput: InputSnapshot,
  hitHeight: 'MID' | 'LOW' | 'OVERHEAD'
): boolean {
  if (defender.y < 0) return false; // Pas de garde en l'air
  if (
    defender.action !== 'IDLE' &&
    defender.action !== 'WALK_BACK' &&
    defender.action !== 'CROUCH' &&
    defender.action !== 'BLOCK_HIGH' &&
    defender.action !== 'BLOCK_LOW'
  ) {
    return false;
  }

  const holdingBack = defender.facing === 1 ? defenderInput.left : defenderInput.right;
  if (!holdingBack) return false;

  if (hitHeight === 'LOW') {
    return defenderInput.down;
  }
  if (hitHeight === 'OVERHEAD') {
    return !defenderInput.down;
  }
  return true;
}

function applyDamageToOpponent(
  state: MatchEngineState,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  rawDamage: number,
  causesKnockdown: boolean,
  unblockable = false,
  specialBanner = ''
): void {
  const atkDef = FIGHTERS[attacker.id];
  const defDef = FIGHTERS[defender.id];

  // Formule d'équilibrage : Puissance de l'attaquant vs Défense du défenseur + dégressivité de combo
  const powerScale = 0.82 + (atkDef.stats.power / 100) * 0.34;
  const bossScale = attacker.isBossBoosted ? 1.08 : 1.0;
  const defenseMitigation = 1.14 - (defDef.stats.defense / 100) * 0.26;
  const comboScaling = Math.max(0.55, 1 - defender.comboCount * 0.12);

  const finalDamage = Math.max(
    8,
    Math.round(rawDamage * powerScale * bossScale * defenseMitigation * comboScaling)
  );

  const wasAttacking =
    defender.action === 'LIGHT_ATTACK' ||
    defender.action === 'HEAVY_ATTACK' ||
    defender.action === 'LOW_KICK' ||
    defender.action === 'SPECIAL_1' ||
    defender.action === 'SPECIAL_2' ||
    defender.action === 'SPECIAL_3' ||
    defender.action === 'TAUNT';

  defender.hp = Math.max(0, defender.hp - finalDamage);
  defender.comboCount++;
  defender.comboTimer = 42;
  attacker.ki = Math.min(100, attacker.ki + 14);
  defender.ki = Math.min(100, defender.ki + 8);

  if (wasAttacking && !unblockable && state.bannerTimer <= 0) {
    state.bannerText = 'CONTRE !';
    state.bannerSubtext = `${atkDef.shortName} PUNIT L'OUVERTURE`;
    state.bannerColor = '#38BDF8';
    state.bannerTimer = 34;
  } else if (specialBanner) {
    state.bannerText = specialBanner;
    state.bannerSubtext = '';
    state.bannerColor = '#F59E0B';
    state.bannerTimer = 36;
  }

  state.hitstopFrames = causesKnockdown ? 7 : 4;
  state.screenShake = causesKnockdown ? 9 : 4;

  const sparkX = (attacker.x + defender.x) * 0.5;
  const sparkY = 175 + defender.y;
  spawnParticles(state, sparkX, sparkY, atkDef.accentColor, causesKnockdown ? 16 : 9, 3.6, 3);
  spawnParticles(state, sparkX, sparkY, '#FACC15', 5, 2.4, 2);

  if (causesKnockdown || defender.y < 0) {
    startFighterAction(defender, 'KNOCKDOWN', 38);
    defender.vx = -defender.facing * 3.4;
    defender.vy = -4.2;
  } else {
    const gutHit = attacker.action === 'LIGHT_ATTACK' || attacker.action === 'UPPERCUT_NORMAL';
    startFighterAction(defender, gutHit ? 'HITSTUN_GUT' : 'HITSTUN', 16);
    defender.vx = -defender.facing * 2.1;
  }

  checkRoundFinishCondition(state, attacker, defender);
}

function resolveStrikeHit(
  state: MatchEngineState,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  baseDamage: number,
  chipDamage: number,
  hitHeight: 'MID' | 'LOW' | 'OVERHEAD',
  causesKnockdown: boolean,
  defenderInput?: InputSnapshot
): void {
  if (defender.invulnFrames > 0) return;

  // Vérification des Esquives Actives (Haute, Moyenne, Basse)
  if (
    (defender.action === 'EVADE_HIGH' && hitHeight !== 'LOW') ||
    (defender.action === 'EVADE_MID' && hitHeight === 'MID') ||
    (defender.action === 'EVADE_LOW' && hitHeight === 'LOW')
  ) {
    spawnParticles(state, defender.x, 178 + defender.y, '#38BDF8', 5, 2.0, 2);
    return;
  }

  const blocked =
    defenderInput !== undefined && isBlockingCorrectly(defender, defenderInput, hitHeight);

  if (blocked) {
    // Dégâts de gratte (Chip Damage) : ne peut pas mettre K.O. sur un coup normal, mais un spécial le peut sauf en FINISH_HIM
    const chip = Math.max(0, chipDamage);
    defender.hp = Math.max(1, defender.hp - chip);
    startFighterAction(
      defender,
      defenderInput.down ? 'BLOCK_LOW' : 'BLOCK_HIGH',
      12
    );
    defender.vx = -defender.facing * 1.9;
    attacker.ki = Math.min(100, attacker.ki + 6);
    state.hitstopFrames = 3;
    soundFX.blockHit();
    spawnParticles(
      state,
      defender.x + defender.facing * 10,
      174 + defender.y,
      '#93C5FD',
      7,
      2.4,
      2
    );
    return;
  }

  if (
    hitHeight === 'OVERHEAD' &&
    defenderInput?.down &&
    (defenderInput.left || defenderInput.right)
  ) {
    state.bannerText = 'BRISE-GARDE !';
    state.bannerSubtext = 'FRAPPE HAUTE';
    state.bannerColor = '#F97316';
    state.bannerTimer = 34;
  }

  if (causesKnockdown || baseDamage >= 85) {
    soundFX.heavyHit();
  } else {
    soundFX.lightHit();
  }

  applyDamageToOpponent(state, attacker, defender, baseDamage, causesKnockdown);
}

function checkMeleeHitbox(
  state: MatchEngineState,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  defenderInput: InputSnapshot
): void {
  if (attacker.hitConfirmedThisMove || state.roundSubPhase === 'FINISHER_ANIM') return;

  const def = FIGHTERS[attacker.id];
  const reachBonus = Math.round((def.stats.reach - 55) * 0.35);

  let activeStart = -1;
  let activeEnd = -1;
  let reachPx = 0;
  let baseDamage = 0;
  let chipDamage = 0;
  let hitHeight: 'MID' | 'LOW' | 'OVERHEAD' = 'MID';
  let knockdown = false;

  if (attacker.action === 'LIGHT_ATTACK') {
    activeStart = 4;
    activeEnd = 9;
    reachPx = 42 + reachBonus;
    baseDamage = 46;
    chipDamage = 0;
    hitHeight = attacker.y < -6 ? 'OVERHEAD' : 'MID';
  } else if (attacker.action === 'UPPERCUT_NORMAL') {
    activeStart = 4;
    activeEnd = 10;
    reachPx = 40 + reachBonus;
    baseDamage = 58;
    chipDamage = 0;
    hitHeight = 'MID';
    knockdown = defender.y < -8; // Anti-air knockdown !
  } else if (attacker.action === 'HEAVY_ATTACK') {
    activeStart = 7;
    activeEnd = 13;
    reachPx = 54 + reachBonus;
    baseDamage = 82;
    chipDamage = 4;
    hitHeight = attacker.y < -6 ? 'OVERHEAD' : 'MID';
  } else if (attacker.action === 'JUMP_ATTACK') {
    activeStart = 4;
    activeEnd = 16;
    reachPx = 56 + reachBonus;
    baseDamage = 84;
    chipDamage = 4;
    hitHeight = 'OVERHEAD';
  } else if (attacker.action === 'LOW_KICK') {
    activeStart = 6;
    activeEnd = 12;
    reachPx = 52 + reachBonus;
    baseDamage = 72;
    chipDamage = 3;
    hitHeight = 'LOW';
    knockdown = true;
  } else if (
    attacker.action === 'SPECIAL_1' ||
    attacker.action === 'SPECIAL_2' ||
    attacker.action === 'SPECIAL_3'
  ) {
    const spec = def.specials.find((s) => s.id === attacker.action);
    if (
      spec &&
      (spec.type === 'ANTI_AIR' ||
        spec.type === 'DASH_STRIKE' ||
        spec.type === 'OVERHEAD' ||
        spec.type === 'TELEPORT')
    ) {
      activeStart = spec.startupFrames;
      activeEnd = spec.startupFrames + spec.activeFrames;
      reachPx = 52 + Math.max(0, reachBonus);
      baseDamage = spec.damage;
      chipDamage = spec.chipDamage;
      hitHeight = spec.type === 'OVERHEAD' ? 'OVERHEAD' : 'MID';
      knockdown = true;
    }
  }

  if (activeStart < 0 || attacker.actionFrame < activeStart || attacker.actionFrame > activeEnd) {
    return;
  }

  const dx = (defender.x - attacker.x) * attacker.facing;
  const dy = Math.abs(defender.y - attacker.y);

  if (dx >= -8 && dx <= reachPx && dy <= 42) {
    attacker.hitConfirmedThisMove = true;

    // Si on est déjà dans la fenêtre "ACHEVEZ-LE !" et qu'on tape normalement, K.O. final immédiat
    if (state.roundSubPhase === 'FINISH_HIM' && defender.action === 'DIZZY') {
      defender.hp = 0;
      triggerStandardKO(state, attacker, defender);
      return;
    }

    resolveStrikeHit(
      state,
      attacker,
      defender,
      baseDamage,
      chipDamage,
      hitHeight,
      knockdown,
      defenderInput
    );
  }
}

function updateProjectiles(
  state: MatchEngineState,
  p1Input: InputSnapshot,
  p2Input: InputSnapshot
): void {
  const remaining: ProjectileEntity[] = [];
  const camLeftX = computeCameraLeftX(state.p1.x, state.p2.x);

  for (const proj of state.projectiles) {
    proj.x += proj.vx;
    proj.y += proj.vy;
    proj.lifeFrames++;

    if (
      proj.x < camLeftX - 36 ||
      proj.x > camLeftX + ARENA_WIDTH + 36 ||
      proj.x < 0 ||
      proj.x > STAGE_WORLD_WIDTH ||
      proj.lifeFrames >= proj.maxLifeFrames
    ) {
      continue;
    }

    // Collision projectile vs projectile adverse !
    const clashIdx = remaining.findIndex(
      (other) =>
        other.ownerSlot !== proj.ownerSlot &&
        Math.abs(other.x - proj.x) < (other.width + proj.width) * 0.6
    );
    if (clashIdx !== -1) {
      const other = remaining[clashIdx];
      spawnParticles(state, (proj.x + other.x) * 0.5, 195 + proj.y, '#FFFFFF', 14, 3.6, 3);
      soundFX.blockHit();
      remaining.splice(clashIdx, 1);
      continue;
    }

    const attacker = proj.ownerSlot === 1 ? state.p1 : state.p2;
    const defender = proj.ownerSlot === 1 ? state.p2 : state.p1;
    const defInput = proj.ownerSlot === 1 ? p2Input : p1Input;

    const hitX = Math.abs(proj.x - defender.x) <= proj.width * 0.5 + 14;
    const hitY = Math.abs(proj.y - (defender.y - 24)) <= proj.height * 0.5 + 22;

    if (
      hitX &&
      hitY &&
      defender.invulnFrames <= 0 &&
      defender.action !== 'KNOCKDOWN' &&
      defender.action !== 'EVADE_HIGH' &&
      defender.action !== 'EVADE_MID'
    ) {
      if (state.roundSubPhase === 'FINISH_HIM' && defender.action === 'DIZZY') {
        defender.hp = 0;
        triggerStandardKO(state, attacker, defender);
        continue;
      }

      if (proj.pullsOnHit && !isBlockingCorrectly(defender, defInput, 'MID')) {
        // Harpon de Krowen : "VIENS ICI !" -> attire la cible étourdie devant Krowen !
        defender.x = attacker.x + attacker.facing * 32;
        defender.x = Math.max(MIN_X, Math.min(MAX_X, defender.x));
        startFighterAction(defender, 'HITSTUN', 28);
        defender.hp = Math.max(0, defender.hp - proj.damage);
        state.bannerText = 'VIENS ICI !';
        state.bannerSubtext = 'HARPON DES ENFERS';
        state.bannerColor = '#F97316';
        state.bannerTimer = 38;
        soundFX.heavyHit();
        spawnParticles(state, defender.x, 176, '#F97316', 14, 3.4, 3);
        checkRoundFinishCondition(state, attacker, defender);
        continue;
      }

      resolveStrikeHit(
        state,
        attacker,
        defender,
        proj.damage,
        proj.chipDamage,
        'MID',
        false,
        defInput
      );
      continue;
    }

    remaining.push(proj);
  }

  state.projectiles = remaining;
}

function checkRoundFinishCondition(
  state: MatchEngineState,
  attacker: FighterRuntime,
  defender: FighterRuntime
): void {
  if (defender.hp > 0 || state.roundSubPhase !== 'FIGHT') return;

  const currentWins = attacker.slot === 1 ? state.p1Wins : state.p2Wins;

  // Si c'est la manche décisive (2e manche gagnante), déclencher "ACHEVEZ-LE !" façon Mortal Kombat !
  if (currentWins >= 1) {
    defender.hp = 1;
    defender.vx = 0;
    defender.vy = 0;
    defender.y = 0;
    startFighterAction(defender, 'DIZZY', 270);
    state.roundSubPhase = 'FINISH_HIM';
    state.subPhaseTimer = 260;
    state.darkSkyFlash = 260;
    state.bannerText = 'ACHEVEZ-LE !';
    state.bannerSubtext = `${FIGHTERS[attacker.id].finisher.gbShortcut} : ${FIGHTERS[attacker.id].finisher.name.toUpperCase()}`;
    state.bannerColor = '#E11D48';
    state.bannerTimer = 140;
    soundFX.finishHimSting();
    return;
  }

  triggerStandardKO(state, attacker, defender);
}

function triggerStandardKO(
  state: MatchEngineState,
  winner: FighterRuntime,
  loser: FighterRuntime
): void {
  loser.hp = 0;
  startFighterAction(loser, 'DEFEAT', 120);
  loser.vx = -loser.facing * 3.8;
  loser.vy = -5.0;

  if (winner.slot === 1) state.p1Wins++;
  else state.p2Wins++;

  state.winnerSlot = winner.slot;
  state.roundSubPhase = 'KO_SLOWMO';
  state.subPhaseTimer = 95;
  state.screenShake = 12;

  const isPerfect = winner.hp === winner.maxHp;
  state.bannerText = isPerfect ? 'PARFAIT !' : 'K.O. !';
  state.bannerSubtext = `${FIGHTERS[winner.id].shortName} REMPORTE LA MANCHE`;
  state.bannerColor = isPerfect ? '#FACC15' : '#EF4444';
  state.bannerTimer = 95;

  soundFX.koBlast();
  spawnParticles(state, loser.x, 176 + loser.y, '#EF4444', 22, 4.2, 4);
}

function applyPhysics(fighter: FighterRuntime): void {
  fighter.x += fighter.vx;
  fighter.y += fighter.vy;

  if (fighter.y < FLOOR_Y) {
    fighter.vy += GRAVITY;
  }
  if (fighter.y >= FLOOR_Y) {
    const wasAirborne = fighter.y > 0.01 || fighter.vy > 0.5;
    fighter.y = FLOOR_Y;
    fighter.vy = 0;
    if (
      wasAirborne &&
      (fighter.action === 'JUMP' ||
        ((fighter.action === 'LIGHT_ATTACK' || fighter.action === 'HEAVY_ATTACK') &&
          fighter.actionFrame > 4))
    ) {
      startFighterAction(fighter, 'IDLE', 1);
      fighter.vx = 0;
    }
  }

  // Friction au sol en hitstun / bloc
  if (
    fighter.y >= FLOOR_Y &&
    (fighter.action === 'HITSTUN' ||
      fighter.action === 'BLOCK_HIGH' ||
      fighter.action === 'BLOCK_LOW' ||
      fighter.action === 'KNOCKDOWN' ||
      fighter.action === 'DEFEAT')
  ) {
    fighter.vx *= 0.82;
  }

  fighter.x = Math.max(MIN_X, Math.min(MAX_X, fighter.x));
}

function resolvePushboxCollision(p1: FighterRuntime, p2: FighterRuntime): void {
  const minSeparation = 25;
  const dx = p2.x - p1.x;
  const absDx = Math.abs(dx);
  const dy = Math.abs(p2.y - p1.y);

  if (absDx < minSeparation && dy < 36) {
    const overlap = (minSeparation - absDx) * 0.5 + 0.5;
    if (dx >= 0) {
      p1.x = Math.max(MIN_X, p1.x - overlap);
      p2.x = Math.min(MAX_X, p2.x + overlap);
    } else {
      p1.x = Math.min(MAX_X, p1.x + overlap);
      p2.x = Math.max(MIN_X, p2.x - overlap);
    }
  }
}

function enforceCameraTether(p1: FighterRuntime, p2: FighterRuntime): void {
  const dx = p2.x - p1.x;
  const absDx = Math.abs(dx);
  if (absDx > MAX_FIGHTER_SEPARATION) {
    const excess = (absDx - MAX_FIGHTER_SEPARATION) * 0.5;
    if (dx >= 0) {
      p1.x = Math.min(MAX_X, p1.x + excess);
      p2.x = Math.max(MIN_X, p2.x - excess);
    } else {
      p1.x = Math.max(MIN_X, p1.x - excess);
      p2.x = Math.min(MAX_X, p2.x + excess);
    }
  }
}

function updateHardwareLEDs(state: MatchEngineState): void {
  const p1Def = FIGHTERS[state.p1.id];
  const p2Def = FIGHTERS[state.p2.id];

  if (state.roundSubPhase === 'FINISH_HIM' || state.roundSubPhase === 'FINISHER_ANIM') {
    const flash = Math.floor(state.frame / 6) % 2 === 0;
    state.ledColors = state.ledColors.map((_, idx) =>
      flash
        ? idx % 2 === 0
          ? '#E11D48'
          : '#F59E0B'
        : '#3B0764'
    );
    return;
  }

  if (state.hitstopFrames > 0) {
    state.ledColors = Array(8).fill('#FFFFFF');
    return;
  }

  const p1Ratio = state.p1.hp / state.p1.maxHp;
  const p2Ratio = state.p2.hp / state.p2.maxHp;

  for (let i = 0; i < 4; i++) {
    const threshold = (3 - i) * 0.25;
    state.ledColors[i] =
      p1Ratio > threshold
        ? state.p1.action.startsWith('SPECIAL')
          ? p1Def.accentColor
          : p1Ratio < 0.28
          ? '#EF4444'
          : p1Def.accentColor
        : '#18202F';
  }

  for (let i = 0; i < 4; i++) {
    const threshold = (3 - i) * 0.25;
    state.ledColors[4 + i] =
      p2Ratio > threshold
        ? state.p2.action.startsWith('SPECIAL')
          ? p2Def.accentColor
          : p2Ratio < 0.28
          ? '#EF4444'
          : p2Def.accentColor
        : '#18202F';
  }
}

export function stepMatchEngine(
  state: MatchEngineState,
  p1HumanInput: InputSnapshot,
  p2HumanInput: InputSnapshot | null, // null = contrôlé par l'IA Personnalité !
  difficulty: Difficulty
): void {
  state.frame++;

  if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - 1);
  if (state.darkSkyFlash > 0) state.darkSkyFlash--;
  if (state.bannerTimer > 0) state.bannerTimer--;

  // Mise à jour des particules même pendant le hitstop léger
  state.particles = state.particles.filter((pt) => {
    pt.x += pt.vx;
    pt.y += pt.vy;
    if (pt.gravity) pt.vy += pt.gravity;
    pt.life++;
    return pt.life < pt.maxLife;
  });

  updateHardwareLEDs(state);

  // Hitstop : gel d'impact authentique Street Fighter II
  if (state.hitstopFrames > 0) {
    state.hitstopFrames--;
    return;
  }

  // Gestion des sous-phases de manche
  if (state.roundSubPhase === 'INTRO') {
    state.subPhaseTimer--;
    if (state.subPhaseTimer === 26) {
      state.bannerText = 'COMBATTEZ !';
      state.bannerSubtext = '';
      state.bannerColor = '#10B981';
      state.bannerTimer = 34;
      soundFX.roundBell();
    }
    if (state.subPhaseTimer <= 0) {
      state.roundSubPhase = 'FIGHT';
    }
    return;
  }

  if (state.roundSubPhase === 'FINISHER_ANIM') {
    state.subPhaseTimer--;
    state.p1.actionFrame++;
    state.p2.actionFrame++;
    if (state.subPhaseTimer % 12 === 0) {
      const loser = state.p1.action === 'FINISHER_VICTIM' ? state.p1 : state.p2;
      const winner = loser.slot === 1 ? state.p2 : state.p1;
      spawnParticles(
        state,
        loser.x + (Math.random() - 0.5) * 28,
        168 + (Math.random() - 0.5) * 26,
        FIGHTERS[winner.id].accentColor,
        10,
        3.5,
        3
      );
    }
    if (state.subPhaseTimer <= 0) {
      const winner = state.p1.action === 'FINISHER' ? state.p1 : state.p2;
      if (winner.slot === 1) state.p1Wins++;
      else state.p2Wins++;
      state.winnerSlot = winner.slot;
      startFighterAction(winner, 'VICTORY', 90);
      state.roundSubPhase = 'ROUND_END';
      soundFX.victoryFanfare();
    }
    return;
  }

  if (state.roundSubPhase === 'KO_SLOWMO') {
    state.subPhaseTimer--;
    // Ralenti dramatique 1 frame sur 2
    if (state.frame % 2 === 0) {
      applyPhysics(state.p1);
      applyPhysics(state.p2);
      enforceCameraTether(state.p1, state.p2);
    }
    if (state.subPhaseTimer <= 0) {
      const winner = state.winnerSlot === 1 ? state.p1 : state.p2;
      startFighterAction(winner, 'VICTORY', 90);
      state.roundSubPhase = 'ROUND_END';
      soundFX.victoryFanfare();
    }
    return;
  }

  if (state.roundSubPhase === 'ROUND_END') {
    state.p1.actionFrame++;
    state.p2.actionFrame++;
    return;
  }

  // Fenêtre "ACHEVEZ-LE !" qui expire si le vainqueur n'achève pas sa cible
  if (state.roundSubPhase === 'FINISH_HIM') {
    state.subPhaseTimer--;
    if (state.subPhaseTimer <= 0) {
      const winner = state.p1.action === 'DIZZY' ? state.p2 : state.p1;
      const loser = winner.slot === 1 ? state.p2 : state.p1;
      triggerStandardKO(state, winner, loser);
      return;
    }
  }

  // Chronomètre de la manche (99 secondes)
  if (state.roundSubPhase === 'FIGHT') {
    if (state.timerFrames > 0) {
      state.timerFrames--;
    } else {
      // Temps écoulé : victoire au pourcentage de vitalité restant
      const r1 = state.p1.hp / state.p1.maxHp;
      const r2 = state.p2.hp / state.p2.maxHp;
      const winner = r1 >= r2 ? state.p1 : state.p2;
      if (winner.slot === 1) state.p1Wins++;
      else state.p2Wins++;
      state.winnerSlot = winner.slot;
      startFighterAction(winner, 'VICTORY', 90);
      state.bannerText = 'TEMPS ÉCOULÉ !';
      state.bannerSubtext = `${FIGHTERS[winner.id].shortName} L'EMPORTE AUX POINTS`;
      state.bannerColor = '#F59E0B';
      state.bannerTimer = 90;
      state.roundSubPhase = 'ROUND_END';
      soundFX.victoryFanfare();
      return;
    }
  }

  // Calcul des entrées Joueur 2 ou IA à personnalité
  const p2EffectiveInput =
    p2HumanInput !== null
      ? p2HumanInput
      : computePersonalityAI(state, state.p2, state.p1, difficulty);

  // Mise à jour des deux combattants
  updateFighterState(state, state.p1, state.p2, p1HumanInput);
  updateFighterState(state, state.p2, state.p1, p2EffectiveInput);

  // Collisions physiques (pushbox) & laisse de caméra 320px dans l'arène large 640px
  resolvePushboxCollision(state.p1, state.p2);
  enforceCameraTether(state.p1, state.p2);

  // Vérification des coups de mêlée et des projectiles
  checkMeleeHitbox(state, state.p1, state.p2, p2EffectiveInput);
  checkMeleeHitbox(state, state.p2, state.p1, p1HumanInput);
  updateProjectiles(state, p1HumanInput, p2EffectiveInput);
}
