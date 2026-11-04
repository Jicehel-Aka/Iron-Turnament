import { FighterId, FighterRuntime } from '../types/game';

export interface Joint3D {
  x: number; // + avant (vers l'adversaire), - arrière
  y: number; // + vers le haut depuis le sol (0 = plante des pieds)
  z: number; // + vers la caméra (jambe/bras avant), - vers l'arrière-plan
}

export type TrackedStrikePart =
  | 'WRIST_R'
  | 'WRIST_L'
  | 'BOTH_WRISTS'
  | 'TOE_R'
  | 'TOE_L'
  | 'KATANA_TIP'
  | 'FAN_EDGE';

export interface ProgressiveTrailSpec {
  part: TrackedStrikePart;
  swingStart: number; // Début effectif du mouvement offensif (après l'armement)
  swingEnd: number;   // Pleine extension / impact (la traînée ne dépasse jamais ce point)
  fadeEnd: number;    // Extinction complète de la traînée avant le retour en garde
  span?: number;      // Longueur temporelle de la traînée derrière le membre
  width: number;      // Épaisseur maximale au contact du poing/pied/arme
  color: string;
}

export interface ProgressiveTrailData {
  points: Joint3D[];  // De la queue [0] jusqu'à la position EXACTE actuelle du membre [last]
  width: number;
  color: string;
  alpha: number;
  isWeapon: boolean;
}

export interface FighterPoseSkeleton {
  // Transformations globales 3D (utilisées à la fois par la projection 2D et par le moteur 3D Pro)
  spinY: number;  // Rotation autour de l'axe vertical Y (radians)
  rollX: number;  // Rotation tonneau autour de X (radians)
  pitchZ: number; // Inclinaison avant/arrière / salto autour de Z (radians)

  // Articulations anatomiques principales (échelle native 320x240, taille guerrier ~ 62px)
  pelvis: Joint3D;
  waist: Joint3D;
  chest: Joint3D;
  neck: Joint3D;
  head: Joint3D;

  // Bras Arrière (L = côté éloigné caméra, z < 0 par défaut)
  shoulderL: Joint3D;
  elbowL: Joint3D;
  wristL: Joint3D;

  // Bras Avant (R = côté proche caméra, z > 0 par défaut)
  shoulderR: Joint3D;
  elbowR: Joint3D;
  wristR: Joint3D;

  // Jambe Arrière (L)
  hipL: Joint3D;
  kneeL: Joint3D;
  ankleL: Joint3D;
  toeL: Joint3D;

  // Jambe Avant (R)
  hipR: Joint3D;
  kneeR: Joint3D;
  ankleR: Joint3D;
  toeR: Joint3D;

  // Effets visuels synchronisés
  auraRadius: number;
  weaponDrawn: 'NONE' | 'KATANA' | 'FAN_OPEN' | 'FAN_CLOSED' | 'CHAIN' | 'KI_CHARGE' | 'LIGHTNING_SPEAR';
  progressiveTrail: ProgressiveTrailData | null;
  teleportFade: number; // 0 = opaque, >0 = dissolution d'ombre (Krowen)
  emberDissolve: boolean; // Braises montantes pendant la disparition du Pas de Brume
  xrayShock: boolean;   // Éclair squelette pendant un Coup Fatal
}

function j(x: number, y: number, z: number): Joint3D {
  return { x, y, z };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function lerpJ(a: Joint3D, b: Joint3D, t: number): Joint3D {
  const c = clamp01(t);
  return {
    x: a.x + (b.x - a.x) * c,
    y: a.y + (b.y - a.y) * c,
    z: a.z + (b.z - a.z) * c,
  };
}

// Courbe Bézier quadratique 3D fluide pour les trajectoires circulaires (crochets, mawashi-geri, axe kick, sabre)
function bezierJ(a: Joint3D, ctrl: Joint3D, b: Joint3D, t: number): Joint3D {
  const u = clamp01(t);
  const inv = 1 - u;
  const w0 = inv * inv;
  const w1 = 2 * inv * u;
  const w2 = u * u;
  return {
    x: a.x * w0 + ctrl.x * w1 + b.x * w2,
    y: a.y * w0 + ctrl.y * w1 + b.y * w2,
    z: a.z * w0 + ctrl.z * w1 + b.z * w2,
  };
}

// Accélération martiale vive mais fluide (permet de voir nettement la progression du coup)
function easeStrike(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 2.2);
}

function smoothStep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/**
 * Calcule l'enveloppe 3 phases d'une frappe (Armement -> Frappe Active -> Maintien court -> Retour en garde)
 * Retourne { phase: 'WINDUP' | 'SWING' | 'RECOVERY', u: [0..1] }
 */
function strikeEnvelope(
  progress: number,
  windupEnd: number,
  swingEnd: number,
  holdEnd: number
): { windupU: number; ext: number; inSwing: boolean } {
  if (progress <= windupEnd) {
    return {
      windupU: smoothStep(progress / Math.max(0.01, windupEnd)),
      ext: 0,
      inSwing: false,
    };
  }
  if (progress <= swingEnd) {
    const raw = (progress - windupEnd) / Math.max(0.01, swingEnd - windupEnd);
    return {
      windupU: 1,
      ext: easeStrike(raw),
      inSwing: true,
    };
  }
  if (progress <= holdEnd) {
    return {
      windupU: 1,
      ext: 1,
      inSwing: false,
    };
  }
  const rec = (progress - holdEnd) / Math.max(0.01, 1 - holdEnd);
  return {
    windupU: 1 - smoothStep(rec),
    ext: 1 - smoothStep(rec),
    inSwing: false,
  };
}

function createBaseMartialPose(id: FighterId, phaseRad: number): FighterPoseSkeleton {
  const breath = Math.sin(phaseRad) * 1.2;
  const sway = Math.cos(phaseRad) * 0.9;

  const scaleH = id === 'titan' ? 1.12 : id === 'malakor' ? 1.08 : id === 'meilin' ? 0.95 : 1.0;
  const shoulderZ = id === 'titan' ? 10.5 : id === 'malakor' ? 9.2 : 7.2;

  const base: FighterPoseSkeleton = {
    spinY: 0,
    rollX: 0,
    pitchZ: 0,
    pelvis: j(sway * 0.5, 31 * scaleH + breath * 0.4, 0),
    waist: j(1 + sway * 0.6, 39 * scaleH + breath * 0.6, 0),
    chest: j(2 + sway * 0.7, 48 * scaleH + breath, 0),
    neck: j(2.5 + sway * 0.7, 53 * scaleH + breath, 0),
    head: j(3 + sway * 0.7, 60 * scaleH + breath, 0),

    shoulderL: j(-1, 47 * scaleH + breath, -shoulderZ),
    elbowL: j(-6, 37 * scaleH + breath, -shoulderZ - 2),
    wristL: j(6, 42 * scaleH + breath * 1.2, -shoulderZ * 0.6),

    shoulderR: j(3, 47 * scaleH + breath, shoulderZ),
    elbowR: j(8, 38 * scaleH + breath, shoulderZ + 2),
    wristR: j(15, 45 * scaleH + breath * 1.3, shoulderZ * 0.65),

    hipL: j(-5, 30 * scaleH, -4.5),
    kneeL: j(-10, 16 * scaleH, -5.5),
    ankleL: j(-13, 3, -5),
    toeL: j(-7.5, 1, -5),

    hipR: j(5, 30 * scaleH, 4.5),
    kneeR: j(11, 16 * scaleH, 5.5),
    ankleR: j(12, 3, 5),
    toeR: j(17.5, 1, 5),

    auraRadius: 0,
    weaponDrawn: id === 'meilin' ? 'FAN_CLOSED' : 'NONE',
    progressiveTrail: null,
    teleportFade: 0,
    emberDissolve: false,
    xrayShock: false,
  };

  if (id === 'kenji') {
    base.wristR = j(16, 45 + breath, 4.5);
    base.elbowL = j(-8, 36 + breath, -8);
    base.wristL = j(2, 38 + breath, -5);
  } else if (id === 'krowen') {
    base.pelvis.y -= 2;
    base.waist.x += 1;
    base.waist.y -= 1;
    base.chest.x += 2;
    base.shoulderR.x = base.chest.x + 1.5;
    base.shoulderL.x = base.chest.x - 2;
    base.wristR = j(18, 43 + breath, 5);
    base.wristL = j(-6, 44 + breath, -7);
  } else if (id === 'meilin') {
    base.wristR = j(16, 49 + breath * 1.3, 5);
    base.elbowL = j(-9, 46 + breath, -7);
    base.wristL = j(-4, 54 + breath, -4);
    base.weaponDrawn = 'FAN_OPEN';
  } else if (id === 'titan') {
    base.pelvis.y = 29 + breath * 0.4;
    base.waist = j(2.5, 38.5 + breath * 0.7, 0);
    base.chest = j(5, 48 + breath, 0);
    base.neck = j(6, 53.5 + breath, 0);
    base.head = j(7, 59 + breath, 0);
    base.shoulderR = j(6.5, 47 + breath, shoulderZ);
    base.shoulderL = j(2.5, 47 + breath, -shoulderZ);
    base.hipR = j(5, 28 + breath * 0.4, 5);
    base.hipL = j(-5, 28 + breath * 0.4, -5);
    base.elbowR = j(12, 38 + breath, 12);
    base.wristR = j(19, 46 + breath, 8);
    base.elbowL = j(4, 39 + breath, -12);
    base.wristL = j(14, 47 + breath, -7);
  } else if (id === 'nyxia') {
    const floatY = Math.sin(phaseRad * 1.2) * 2.0;
    base.pelvis.y += floatY;
    base.waist.y += floatY;
    base.chest.y += floatY;
    base.neck.y += floatY;
    base.head.y += floatY;
    base.shoulderR.y += floatY;
    base.shoulderL.y += floatY;
    base.elbowR.y += floatY;
    base.elbowL.y += floatY;
    base.hipR.y += floatY;
    base.hipL.y += floatY;
    base.wristR = j(17, 47 + floatY, 6);
    base.wristL = j(-7, 48 + floatY, -7);
  } else if (id === 'malakor') {
    base.waist = j(0.5, 41 + breath * 0.7, 0);
    base.chest = j(1, 51 + breath, 0);
    base.neck = j(1.5, 57 + breath, 0);
    base.head = j(2, 64 + breath, 0);
    base.shoulderR = j(2.5, 50 + breath, shoulderZ);
    base.shoulderL = j(-1.5, 50 + breath, -shoulderZ);
    base.elbowR = j(8, 40 + breath, shoulderZ + 2);
    base.elbowL = j(-6, 40 + breath, -shoulderZ - 2);
    base.wristL = j(-8, 37 + breath, -8);
    base.wristR = j(15, 48 + breath, 7);
  }

  return base;
}

/**
 * Garantit l'intégrité anatomique stricte avant et après transformation :
 * aucun pied (ankle -> toe) ne peut jamais s'étirer au-delà de sa vraie longueur anatomique (~6.2px).
 */
function clampFootLength(ankle: Joint3D, toe: Joint3D, maxLen = 6.5): Joint3D {
  const dx = toe.x - ankle.x;
  const dy = toe.y - ankle.y;
  const dz = toe.z - ankle.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= maxLen && d >= 2.5) return toe;
  if (d < 0.01) {
    return { x: ankle.x + 5.5, y: ankle.y - 1.5, z: ankle.z };
  }
  const target = d > maxLen ? maxLen : 4.5;
  const s = target / d;
  return {
    x: ankle.x + dx * s,
    y: ankle.y + dy * s,
    z: ankle.z + dz * s,
  };
}

function clampSegment3D(anchor: Joint3D, target: Joint3D, maxLen: number, minLen = 0): Joint3D {
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const dz = target.z - anchor.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= maxLen && d >= minLen) return target;
  if (d < 0.001) return target;
  const clamped = d > maxLen ? maxLen : minLen;
  const s = clamped / d;
  return {
    x: anchor.x + dx * s,
    y: anchor.y + dy * s,
    z: anchor.z + dz * s,
  };
}

function clampSocketXY(anchor: Joint3D, joint: Joint3D, idealDx: number, idealDy: number, maxRadius: number): Joint3D {
  const targetX = anchor.x + idealDx;
  const targetY = anchor.y + idealDy;
  const dx = joint.x - targetX;
  const dy = joint.y - targetY;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxRadius) return joint;
  const s = maxRadius / dist;
  return {
    x: targetX + dx * s,
    y: targetY + dy * s,
    z: joint.z,
  };
}

function weldArmChain(
  shoulder: Joint3D,
  elbow: Joint3D,
  wrist: Joint3D,
  maxUpper = 15.0,
  maxFore = 16.0
): { elbow: Joint3D; wrist: Joint3D } {
  const clampedWrist = clampSegment3D(shoulder, wrist, maxUpper + maxFore - 0.5, 3.0);
  let nextElbow = elbow;
  const dUpper = Math.hypot(nextElbow.x - shoulder.x, nextElbow.y - shoulder.y, nextElbow.z - shoulder.z);
  const dFore = Math.hypot(clampedWrist.x - nextElbow.x, clampedWrist.y - nextElbow.y, clampedWrist.z - nextElbow.z);

  if (dUpper > maxUpper || dFore > maxFore) {
    // Re-centre le coude entre l'épaule soudée et le poignet avec flexion naturelle vers le bas/extérieur
    const mid: Joint3D = {
      x: (shoulder.x + clampedWrist.x) * 0.5 + (nextElbow.x - (shoulder.x + clampedWrist.x) * 0.5) * 0.45,
      y: (shoulder.y + clampedWrist.y) * 0.5 - 2.2 + (nextElbow.y - (shoulder.y + clampedWrist.y) * 0.5) * 0.35,
      z: (shoulder.z + clampedWrist.z) * 0.5 + Math.sign(shoulder.z || 1) * 1.5,
    };
    nextElbow = clampSegment3D(shoulder, mid, maxUpper, 4.0);
    nextElbow = clampSegment3D(clampedWrist, nextElbow, maxFore, 4.0);
    nextElbow = clampSegment3D(shoulder, nextElbow, maxUpper, 4.0);
  }

  const finalWrist = clampSegment3D(nextElbow, clampedWrist, maxFore, 3.5);
  return { elbow: nextElbow, wrist: finalWrist };
}

/**
 * Soude anatomiquement la colonne vertébrale, les épaules au torse, les hanches au bassin
 * et la chaîne bras/avant-bras AVANT rotation 3D globale : aucun membre ne peut jamais flotter détaché.
 */
function weldPreTransformAnatomy(pose: FighterPoseSkeleton): FighterPoseSkeleton {
  // 1. Continuité de la colonne (taille entre bassin et torse, cou entre torse et tête)
  const idealWaistX = (pose.pelvis.x + pose.chest.x) * 0.5;
  const idealWaistY = (pose.pelvis.y + pose.chest.y) * 0.5;
  if (Math.hypot(pose.waist.x - idealWaistX, pose.waist.y - idealWaistY) > 4.2) {
    pose.waist = {
      x: lerp(idealWaistX, pose.waist.x, 0.35),
      y: lerp(idealWaistY, pose.waist.y, 0.35),
      z: (pose.pelvis.z + pose.chest.z) * 0.5,
    };
  }

  const idealNeckX = pose.chest.x * 0.62 + pose.head.x * 0.38;
  const idealNeckY = pose.chest.y * 0.58 + pose.head.y * 0.42;
  if (Math.hypot(pose.neck.x - idealNeckX, pose.neck.y - idealNeckY) > 3.5) {
    pose.neck = {
      x: idealNeckX,
      y: idealNeckY,
      z: (pose.chest.z + pose.head.z) * 0.5,
    };
  }

  // 2. Soudure stricte des épaules sur la cage thoracique (deltoïdes ancrés au buste)
  pose.shoulderR = clampSocketXY(pose.chest, pose.shoulderR, 1.5, -0.8, 3.6);
  pose.shoulderL = clampSocketXY(pose.chest, pose.shoulderL, -1.8, -1.0, 3.6);

  // 3. Soudure stricte des hanches sur le bassin
  pose.hipR = clampSocketXY(pose.pelvis, pose.hipR, 4.2, -1.0, 3.8);
  pose.hipL = clampSocketXY(pose.pelvis, pose.hipL, -4.2, -1.0, 3.8);

  // 4. Continuité des deux bras (épaule -> coude -> poignet)
  const armR = weldArmChain(pose.shoulderR, pose.elbowR, pose.wristR, 15.2, 16.2);
  pose.elbowR = armR.elbow;
  pose.wristR = armR.wrist;

  const armL = weldArmChain(pose.shoulderL, pose.elbowL, pose.wristL, 15.2, 16.2);
  pose.elbowL = armL.elbow;
  pose.wristL = armL.wrist;

  pose.toeL = clampFootLength(pose.ankleL, pose.toeL, 6.5);
  pose.toeR = clampFootLength(pose.ankleR, pose.toeR, 6.5);
  return pose;
}

function enforceAnatomicalIntegrity(pose: FighterPoseSkeleton): FighterPoseSkeleton {
  return weldPreTransformAnatomy(pose);
}

function clampPostTransformFeet(pose: FighterPoseSkeleton): FighterPoseSkeleton {
  pose.toeL = clampFootLength(pose.ankleL, pose.toeL, 6.5);
  pose.toeR = clampFootLength(pose.ankleR, pose.toeR, 6.5);
  return pose;
}

function applyFullBodyTransform(pose: FighterPoseSkeleton): FighterPoseSkeleton {
  weldPreTransformAnatomy(pose);
  if (pose.spinY === 0 && pose.rollX === 0 && pose.pitchZ === 0) {
    return pose;
  }

  const pivotY = pose.pelvis.y;
  const cy = Math.cos(pose.spinY);
  const sy = Math.sin(pose.spinY);
  const cz = Math.cos(pose.pitchZ);
  const sz = Math.sin(pose.pitchZ);
  const cx = Math.cos(pose.rollX);
  const sx = Math.sin(pose.rollX);

  const transformJoint = (pt: Joint3D): Joint3D => {
    let x = pt.x;
    let y = pt.y - pivotY;
    let z = pt.z;

    if (pose.spinY !== 0) {
      const nx = x * cy + z * sy;
      const nz = -x * sy + z * cy;
      x = nx;
      z = nz;
    }

    if (pose.rollX !== 0) {
      const ny = y * cx - z * sx;
      const nz = y * sx + z * cx;
      y = ny;
      z = nz;
    }

    if (pose.pitchZ !== 0) {
      const nx = x * cz - y * sz;
      const ny = x * sz + y * cz;
      x = nx;
      y = ny;
    }

    return { x, y: y + pivotY, z };
  };

  return clampPostTransformFeet({
    ...pose,
    pelvis: transformJoint(pose.pelvis),
    waist: transformJoint(pose.waist),
    chest: transformJoint(pose.chest),
    neck: transformJoint(pose.neck),
    head: transformJoint(pose.head),
    shoulderL: transformJoint(pose.shoulderL),
    elbowL: transformJoint(pose.elbowL),
    wristL: transformJoint(pose.wristL),
    shoulderR: transformJoint(pose.shoulderR),
    elbowR: transformJoint(pose.elbowR),
    wristR: transformJoint(pose.wristR),
    hipL: transformJoint(pose.hipL),
    kneeL: transformJoint(pose.kneeL),
    ankleL: transformJoint(pose.ankleL),
    toeL: transformJoint(pose.toeL),
    hipR: transformJoint(pose.hipR),
    kneeR: transformJoint(pose.kneeR),
    ankleR: transformJoint(pose.ankleR),
    toeR: transformJoint(pose.toeR),
  });
}

/**
 * Extrait la coordonnée 3D exacte de l'extrémité frappante APRÈS transformation du squelette.
 * La tête de la traînée est ancrée exactement sur ce point : jamais devant le poing, le pied ou la lame.
 */
function getStrikeExtremityPoint(pose: FighterPoseSkeleton, part: TrackedStrikePart): Joint3D {
  switch (part) {
    case 'WRIST_R':
      return pose.wristR;
    case 'WRIST_L':
      return pose.wristL;
    case 'BOTH_WRISTS':
      return {
        x: (pose.wristR.x + pose.wristL.x) * 0.5,
        y: (pose.wristR.y + pose.wristL.y) * 0.5,
        z: (pose.wristR.z + pose.wristL.z) * 0.5,
      };
    case 'TOE_R':
      return pose.toeR;
    case 'TOE_L':
      return pose.toeL;
    case 'KATANA_TIP': {
      // Suit l'orientation réelle de l'avant-bras droit jusqu'à la pointe de la lame courbe !
      const dx = pose.wristR.x - pose.elbowR.x;
      const dy = pose.wristR.y - pose.elbowR.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // La lame prolonge l'axe du poignet avec une légère courbure vers l'avant
      return {
        x: pose.wristR.x + ux * 17 + 5,
        y: pose.wristR.y + uy * 17 + 3,
        z: pose.wristR.z,
      };
    }
    case 'FAN_EDGE':
      return {
        x: pose.wristR.x + 8,
        y: pose.wristR.y + 4,
        z: pose.wristR.z,
      };
  }
}

/**
 * Calcule la posture anatomique pure à un instant normalisé `progress` [0..1]
 * ainsi que la spécification de traînée progressive éventuelle.
 */
function computePoseCore(
  f: FighterRuntime,
  progress: number,
  globalFrame: number,
  accentColor: string
): { pose: FighterPoseSkeleton; trailSpec: ProgressiveTrailSpec | null } {
  const idlePhase = globalFrame * 0.14 + f.slot * 1.7;
  const p = createBaseMartialPose(f.id, idlePhase);

  switch (f.action) {
    case 'IDLE':
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };

    case 'WALK_FWD':
    case 'WALK_BACK': {
      const dirSign = f.action === 'WALK_FWD' ? 1 : -1;
      const cycle = globalFrame * 0.26 * dirSign;
      const s1 = Math.sin(cycle);
      const c1 = Math.cos(cycle);
      const liftL = Math.max(0, -c1) * 6.5;
      const liftR = Math.max(0, c1) * 6.5;

      p.spinY = s1 * 0.18;
      p.pelvis.y = 30 + Math.abs(s1) * 1.8;
      p.waist.x += dirSign * 1.2;
      p.chest.x += dirSign * 2.2;
      p.neck.x += dirSign * 2.2;
      p.head.x += dirSign * 2.2;
      p.shoulderR.x = p.chest.x + 1.5;
      p.shoulderL.x = p.chest.x - 2.0;
      p.elbowR.x += dirSign * 1.8 - s1 * 2.0;
      p.wristR.x += dirSign * 1.8 - s1 * 2.4;
      p.elbowL.x += dirSign * 1.5 + s1 * 2.0;
      p.wristL.x += dirSign * 1.5 + s1 * 2.4;

      p.hipL = j(-s1 * 4.5, 29, -4.5);
      p.kneeL = j(-s1 * 9.5 + 3, 15.5 + liftL * 0.6, -5);
      p.ankleL = j(-s1 * 13, 2.8 + liftL, -5);
      p.toeL = j(-s1 * 13 + 5.6, 1.0 + liftL * 0.82, -5);

      p.hipR = j(s1 * 4.5, 29, 4.5);
      p.kneeR = j(s1 * 9.5 + 3, 15.5 + liftR * 0.6, 5);
      p.ankleR = j(s1 * 13, 2.8 + liftR, 5);
      p.toeR = j(s1 * 13 + 5.6, 1.0 + liftR * 0.82, 5);

      if (f.action === 'WALK_BACK') {
        p.elbowR = j(p.shoulderR.x + 5, p.shoulderR.y - 8, p.shoulderR.z + 1.5);
        p.wristR = j(p.shoulderR.x + 12, p.shoulderR.y + 1, 5);
        p.elbowL = j(p.shoulderL.x - 4, p.shoulderL.y - 8, p.shoulderL.z - 1.5);
        p.wristL = j(p.shoulderL.x + 8, p.shoulderL.y - 2, -4);
      }
      return { pose: applyFullBodyTransform(p), trailSpec: null };
    }

    case 'CROUCH': {
      p.pelvis = j(-1, 18, 0);
      p.waist = j(2, 25, 0);
      p.chest = j(5, 33, 0);
      p.neck = j(6, 38, 0);
      p.head = j(7, 44, 0);

      p.shoulderL = j(3, 32, -7.5);
      p.elbowL = j(-2, 23, -8.5);
      p.wristL = j(9, 28, -5);

      p.shoulderR = j(6.5, 32, 7.5);
      p.elbowR = j(11, 24, 8.5);
      p.wristR = j(17, 31, 5);

      p.hipL = j(-4, 17, -4.5);
      p.kneeL = j(-11, 6, -5.5);
      p.ankleL = j(-16, 3, -5);
      p.toeL = j(-10.5, 1, -5);

      p.hipR = j(4, 17, 4.5);
      p.kneeR = j(15, 13, 5.5);
      p.ankleR = j(11, 3, 5);
      p.toeR = j(16.5, 1, 5);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'JUMP': {
      const isFlipping = Math.abs(f.vx) > 1.2 && f.y < -28;
      if (isFlipping) {
        p.pitchZ = -Math.sign(f.vx * f.facing) * (progress * Math.PI * 1.8);
      }
      p.pelvis = j(0, 32, 0);
      p.waist = j(2, 39, 0);
      p.chest = j(4, 47, 0);
      p.neck = j(5, 52, 0);
      p.head = j(6, 58, 0);

      p.shoulderR = j(5.5, 46, p.shoulderR.z);
      p.elbowR = j(10, 38, p.shoulderR.z + 1.5);
      p.wristR = j(15, 48, 6);

      p.shoulderL = j(2, 46, p.shoulderL.z);
      p.elbowL = j(-4, 38, p.shoulderL.z - 1.5);
      p.wristL = j(-3, 46, -6);

      p.hipR = j(4, 31, 4.5);
      p.kneeR = j(14, 28, 5.5);
      p.ankleR = j(6, 17, 5);
      p.toeR = j(11, 14, 5);

      p.hipL = j(-4, 31, -4.5);
      p.kneeL = j(-4, 24, -5.5);
      p.ankleL = j(-12, 14, -5);
      p.toeL = j(-7.5, 10.5, -5);

      return { pose: applyFullBodyTransform(p), trailSpec: null };
    }

    case 'JUMP_ATTACK': {
      // Coup sauté aérien : armement net [0..0.22], extension progressive [0.22..0.56], maintien & retour !
      const env = strikeEnvelope(progress, 0.22, 0.56, 0.72);

      // Jambe arrière toujours repliée proprement en l'air (jamais étirée vers le sol)
      p.hipL = j(-4, 31, -4.5);
      p.kneeL = j(-9, 23, -5);
      p.ankleL = j(-15, 15, -5);
      p.toeL = j(-11, 11.5, -5);

      if (f.id === 'krowen') {
        // Entaille aérienne plongeante au sabre d'obsidienne
        p.weaponDrawn = 'KATANA';
        p.pitchZ = -0.22 * env.ext;
        p.pelvis = j(2, 33, 0);
        p.waist = j(4.5, 40, 0);
        p.chest = j(7, 47, 0);
        p.neck = j(8, 52, 0);
        p.head = j(9, 57, 0);

        p.hipR = j(5, 31, 4.5);
        p.kneeR = j(15, 27, 5);
        p.ankleR = j(8, 17, 5);
        p.toeR = j(12.5, 13.5, 5);

        p.shoulderR = j(8.5, 47, 7);
        p.shoulderL = j(5, 46, -7);
        p.elbowL = j(-1, 39, -8);
        p.wristL = j(3, 45, -6);
        const elChamber = lerpJ(p.elbowR, j(3, 58, 8), env.windupU);
        const wrChamber = lerpJ(p.wristR, j(6, 66, 6), env.windupU);
        p.elbowR = bezierJ(elChamber, j(18, 54, 7), j(19, 41, 5), env.ext);
        p.wristR = bezierJ(wrChamber, j(25, 52, 4), j(27, 32, 2), env.ext);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'KATANA_TIP',
            swingStart: 0.22,
            swingEnd: 0.56,
            fadeEnd: 0.70,
            width: 5.2,
            color: '#F97316',
          },
        };
      }

      if (f.id === 'titan') {
        // Double masse hydraulique plongeante (Meteor Smash)
        p.pitchZ = -0.28 * env.ext;
        p.pelvis = j(-2, 34, 0);
        p.waist = j(3, 40, 0);
        p.chest = j(8, 46, 0);
        p.neck = j(9, 51, 0);
        p.head = j(10, 56, 0);

        p.shoulderR = j(9.5, 46, 10.5);
        p.shoulderL = j(6.5, 46, -10.5);

        p.hipR = j(4, 32, 6);
        p.kneeR = j(12, 24, 7);
        p.ankleR = j(5, 15, 7);
        p.toeR = j(9.5, 11.5, 7);

        p.hipL = j(-2, 32, -6);
        p.kneeL = j(8, 23, -7);
        p.ankleL = j(1, 14, -7);
        p.toeL = j(5.5, 10.5, -7);

        const wrRStart = lerpJ(p.wristR, j(8, 66, 8), env.windupU);
        const wrLStart = lerpJ(p.wristL, j(6, 66, -8), env.windupU);
        p.elbowR = bezierJ(j(7, 57, 11), j(19, 53, 10), j(20, 39, 8), env.ext);
        p.wristR = bezierJ(wrRStart, j(27, 50, 7), j(28, 28, 5), env.ext);
        p.elbowL = bezierJ(j(5, 57, -11), j(17, 53, -10), j(18, 39, -8), env.ext);
        p.wristL = bezierJ(wrLStart, j(25, 50, -7), j(26, 28, -5), env.ext);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.22,
            swingEnd: 0.56,
            fadeEnd: 0.70,
            width: 5.5,
            color: accentColor,
          },
        };
      }

      // Tobi-Geri (Coup de pied volant profilé : genou armé vers la poitrine -> détente vive du pied)
      p.pitchZ = 0.20 * env.ext;
      p.pelvis = j(2, 33, 0);
      p.waist = j(lerp(1, -1, env.ext), 40, 0);
      p.chest = j(lerp(2, -4, env.ext), 47, 0);
      p.neck = j(lerp(2, -4, env.ext), 52, 0);
      p.head = j(lerp(3, -3, env.ext), 58, 0);

      p.shoulderR = j(p.chest.x + 1.5, 46, p.shoulderR.z);
      p.elbowR = j(lerp(8, -8, env.ext), 39, p.shoulderR.z + 1.5);
      p.wristR = j(lerp(14, -5, env.ext), 46, 7);

      p.shoulderL = j(p.chest.x - 1.5, 46, p.shoulderL.z);
      p.elbowL = j(lerp(-4, 4, env.ext), 40, p.shoulderL.z - 1);
      p.wristL = j(lerp(6, 12, env.ext), 45, -5);

      p.hipR = j(6, 32, 4);
      const kneeChamber = lerpJ(j(11, 22, 5), j(13, 33, 5), env.windupU);
      const ankleChamber = lerpJ(j(8, 15, 5), j(6, 23, 5), env.windupU);
      const toeChamber = lerpJ(j(13, 13, 5), j(11, 21, 5), env.windupU);

      p.kneeR = bezierJ(kneeChamber, j(20, 31, 4), j(22, 27, 3), env.ext);
      p.ankleR = bezierJ(ankleChamber, j(24, 28, 3), j(36, 22, 1), env.ext);
      p.toeR = bezierJ(toeChamber, j(29, 29, 3), j(41.5, 24, 1), env.ext);

      if (f.id === 'meilin') p.weaponDrawn = 'FAN_OPEN';

      return {
        pose: applyFullBodyTransform(p),
        trailSpec: {
          part: 'TOE_R',
          swingStart: 0.22,
          swingEnd: 0.56,
          fadeEnd: 0.70,
          width: 4.2,
          color: accentColor,
        },
      };
    }

    case 'EVADE_HIGH': {
      const weave = Math.sin(progress * Math.PI);
      const bobX = Math.cos(progress * Math.PI * 2) * 3.5;
      p.pelvis = j(-3 + bobX * 0.4, lerp(30, 19, weave), 2 * weave);
      p.waist = j(0 + bobX * 0.6, lerp(38, 25, weave), 3 * weave);
      p.chest = j(4 + bobX, lerp(47, 31, weave), 4 * weave);
      p.neck = j(6 + bobX, lerp(52, 35, weave), 4 * weave);
      p.head = j(8 + bobX, lerp(59, 40, weave), 5 * weave);

      p.shoulderR = j(6 + bobX, lerp(46, 31, weave), 8);
      p.elbowR = j(11 + bobX, lerp(37, 23, weave), 9);
      p.wristR = j(16 + bobX, lerp(44, 34, weave), 6);

      p.shoulderL = j(2 + bobX, lerp(46, 30, weave), -6);
      p.elbowL = j(5 + bobX, lerp(36, 22, weave), -7);
      p.wristL = j(12 + bobX, lerp(43, 33, weave), -4);

      p.hipL = j(-7, lerp(29, 18, weave), -4.5);
      p.kneeL = j(-12, lerp(15, 9, weave), -5.5);
      p.ankleL = j(-15, 3, -5);
      p.toeL = j(-9.5, 1, -5);

      p.hipR = j(4, lerp(29, 18, weave), 4.5);
      p.kneeR = j(14, lerp(15, 11, weave), 5.5);
      p.ankleR = j(12, 3, 5);
      p.toeR = j(17.5, 1, 5);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'EVADE_MID': {
      const slip = Math.sin(progress * Math.PI);
      const zShift = -15 * slip;
      p.spinY = 1.10 * slip;

      p.pelvis = j(-4 * slip, 30, zShift);
      p.waist = j(-3 * slip, 38, zShift);
      p.chest = j(-2 * slip, 47, zShift);
      p.neck = j(-2 * slip, 52, zShift);
      p.head = j(-1 * slip, 59, zShift);

      p.shoulderL = j(-4, 46, -7.5 + zShift);
      p.elbowL = j(-9, 38, -9 + zShift);
      p.wristL = j(-2, 43, -6 + zShift);

      p.shoulderR = j(2, 47, 7.5 + zShift);
      p.elbowR = j(8, 39, 9 + zShift);
      p.wristR = j(15, 45, 5 + zShift);

      p.hipL = j(-7, 29, -4.5 + zShift);
      p.kneeL = j(-11, 15, -5.5 + zShift);
      p.ankleL = j(-14, 3, -5 + zShift);
      p.toeL = j(-8.5, 1, -5 + zShift);

      p.hipR = j(3, 29, 4.5 + zShift);
      p.kneeR = j(9, 16, 5.5 + zShift);
      p.ankleR = j(10, 3, 5 + zShift);
      p.toeR = j(15.5, 1, 5 + zShift);
      return { pose: applyFullBodyTransform(p), trailSpec: null };
    }

    case 'EVADE_LOW': {
      const hop = Math.sin(progress * Math.PI);
      const liftY = hop * 18;

      p.pelvis = j(-2 * hop, 31 + liftY * 0.75, 0);
      p.waist = j(0, 39 + liftY * 0.75, 0);
      p.chest = j(3, 47 + liftY * 0.72, 0);
      p.neck = j(4, 52 + liftY * 0.72, 0);
      p.head = j(5, 59 + liftY * 0.72, 0);

      p.hipR = j(4, 30 + liftY * 0.75, 5);
      p.kneeR = j(14, 16 + liftY * 1.25, 6);
      p.ankleR = j(5, 3 + liftY * 1.15, 5);
      p.toeR = j(10.5, 1 + liftY * 1.12, 5);

      p.hipL = j(-4, 30 + liftY * 0.75, -5);
      p.kneeL = j(6, 16 + liftY * 1.2, -6);
      p.ankleL = j(-4, 3 + liftY * 1.15, -5);
      p.toeL = j(1.5, 1 + liftY * 1.12, -5);

      p.shoulderR = j(5, 47 + liftY * 0.72, 7.5);
      p.elbowR = j(11, 41 + liftY * 0.72, 8.5);
      p.wristR = j(18, 47 + liftY * 0.72, 5);

      p.shoulderL = j(-1, 47 + liftY * 0.72, -7.5);
      p.elbowL = j(-7, 40 + liftY * 0.72, -8.5);
      p.wristL = j(4, 45 + liftY * 0.72, -5);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'LIGHT_ATTACK': {
      const env = strikeEnvelope(progress, 0.20, 0.52, 0.64);

      if (f.y < -6) {
        // Coup sauté rapide aérien : armement à l'épaule -> frappe diagonale du poing
        p.pelvis = j(2, 32, 0);
        p.waist = j(4.5, 39, 0);
        p.chest = j(7, 46, 0);
        p.neck = j(8, 51.5, 0);
        p.head = j(9, 57, 0);

        p.hipR = j(5, 31, 4.5);
        p.kneeR = j(17, 28, 5);
        p.ankleR = j(10, 17, 5);
        p.toeR = j(14.5, 13.5, 5);

        p.hipL = j(-4, 31, -4.5);
        p.kneeL = j(-8, 22, -5);
        p.ankleL = j(-14, 14, -5);
        p.toeL = j(-9.5, 10.5, -5);

        p.shoulderR = j(8.5, 46, 7);
        p.shoulderL = j(5, 45, -7);
        p.elbowL = j(-1, 38, -8);
        p.wristL = j(4, 43, -5);
        const wrStart = lerpJ(p.wristR, j(11, 52, 7), env.windupU);
        p.elbowR = lerpJ(j(7, 48, 8), j(19, 41, 5), env.ext);
        p.wristR = bezierJ(wrStart, j(22, 46, 5), j(29, 34, 2), env.ext);

        return {
          pose: enforceAnatomicalIntegrity(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.20,
            swingEnd: 0.52,
            fadeEnd: 0.64,
            width: 3.4,
            color: accentColor,
          },
        };
      }

      // Direct rapide au sol : armement Hikite -> extension directe du poing -> retour
      p.spinY = lerp(0.14 * env.windupU, -0.36, env.ext);
      p.waist = j(1 + env.ext * 2.5, 39, 0);
      p.chest = j(2 + env.ext * 5, 48, 0);
      p.neck = j(3 + env.ext * 4.5, 54, 0);
      p.head = j(4 + env.ext * 4, 60, 0);
      p.shoulderR = j(p.chest.x + 2, 47.5, 7);
      p.shoulderL = j(p.chest.x - 2, 47, -7);

      const elChamber = lerpJ(p.elbowR, j(3, 39, 9), env.windupU);
      const wrChamber = lerpJ(p.wristR, j(9, 43, 7), env.windupU);

      p.elbowR = lerpJ(elChamber, j(20, 48, 4), env.ext);
      p.wristR = bezierJ(wrChamber, j(22, 49, 4), j(32, 48, 1), env.ext);

      p.elbowL = j(p.shoulderL.x - 6, 38, -8);
      p.wristL = j(p.shoulderL.x + 1, 40, -5);

      return {
        pose: applyFullBodyTransform(p),
        trailSpec: {
          part: 'WRIST_R',
          swingStart: 0.20,
          swingEnd: 0.52,
          fadeEnd: 0.64,
          width: 3.4,
          color: '#E2E8F0',
        },
      };
    }

    case 'UPPERCUT_NORMAL': {
      // Uppercut anti-air : flexion basse d'armement -> montée circulaire du poing
      const env = strikeEnvelope(progress, 0.22, 0.56, 0.70);

      p.spinY = lerp(0.25 * env.windupU, -0.45, env.ext);
      const dipY = lerp(31, 22, env.windupU);
      p.pelvis = j(2, lerp(dipY, 33, env.ext), 0);
      p.waist = j(4, lerp(dipY + 8, 42, env.ext), 0);
      p.chest = j(6, lerp(dipY + 16, 51, env.ext), 0);
      p.neck = j(6, lerp(dipY + 21, 56, env.ext), 0);
      p.head = j(7, lerp(dipY + 27, 63, env.ext), 0);

      p.hipL = j(-4, p.pelvis.y - 1, -4.5);
      p.kneeL = j(-10, lerp(11, 16, env.ext), -5.5);
      p.hipR = j(5, p.pelvis.y - 1, 4.5);
      p.kneeR = j(12, lerp(12, 17, env.ext), 5.5);

      p.shoulderR = j(p.chest.x + 2, p.chest.y - 0.5, 7);
      p.shoulderL = j(p.chest.x - 2, p.chest.y - 1, -7);
      p.elbowL = j(p.shoulderL.x - 5, p.shoulderL.y - 9, -8);
      p.wristL = j(p.shoulderL.x + 3, p.shoulderL.y - 4, -5);

      const wrLow = lerpJ(p.wristR, j(9, p.shoulderR.y - 11, 8), env.windupU);
      p.elbowR = bezierJ(j(7, p.shoulderR.y - 13, 9), j(19, 42, 6), j(15, 58, 4), env.ext);
      p.wristR = bezierJ(wrLow, j(25, 47, 4), j(18, 70, 2), env.ext);

      return {
        pose: applyFullBodyTransform(p),
        trailSpec: {
          part: 'WRIST_R',
          swingStart: 0.22,
          swingEnd: 0.56,
          fadeEnd: 0.70,
          width: 4.4,
          color: accentColor,
        },
      };
    }

    case 'HEAVY_ATTACK': {
      const env = strikeEnvelope(progress, 0.24, 0.58, 0.72);

      if (f.y < -6) {
        // Coup lourd sauté aérien
        p.pitchZ = 0.20 * env.ext;
        p.pelvis = j(0, 32, 0);
        p.waist = j(-1.5 * env.ext, 39, 0);
        p.chest = j(-3 * env.ext, 46, 0);
        p.neck = j(-2.5 * env.ext, 51.5, 0);
        p.head = j(-2 * env.ext, 57, 0);

        p.shoulderR = j(p.chest.x + 1.5, 45.5, p.shoulderR.z);
        p.elbowR = j(p.chest.x - 4, 39, p.shoulderR.z + 1.5);
        p.wristR = j(-5, 46, 7);

        p.shoulderL = j(p.chest.x - 1.5, 45.5, p.shoulderL.z);
        p.elbowL = j(p.chest.x + 4, 39, p.shoulderL.z - 1);
        p.wristL = j(12, 44, -6);

        p.hipR = j(5, 31, 4);
        p.kneeR = lerpJ(j(13, 30, 5), j(20, 27, 3), env.ext);
        p.ankleR = bezierJ(j(7, 21, 5), j(22, 26, 3), j(34, 22, 1), env.ext);
        p.toeR = bezierJ(j(12, 19, 5), j(27, 27, 3), j(39.5, 24, 1), env.ext);

        p.hipL = j(-4, 31, -4.5);
        p.kneeL = j(-9, 22, -5);
        p.ankleL = j(-15, 14, -5);
        p.toeL = j(-10.5, 10.5, -5);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'TOE_R',
            swingStart: 0.24,
            swingEnd: 0.58,
            fadeEnd: 0.72,
            width: 4.2,
            color: accentColor,
          },
        };
      }

      if (f.id === 'titan' || f.id === 'malakor') {
        // Crochet lourd dévastateur : armement franc du buste -> arc horizontal puissant du poing
        p.spinY = lerp(0.45 * env.windupU, -0.62, env.ext);
        p.waist = j(1 + env.ext * 4, 40, 0);
        p.chest = j(2 + env.ext * 7, 49, 0);
        p.neck = j(3 + env.ext * 6.5, 55, 0);
        p.head = j(4 + env.ext * 6, 61, 0);
        p.shoulderR = j(p.chest.x + 2, 49, 9);
        p.shoulderL = j(p.chest.x - 2, 48.5, -9);
        p.elbowL = j(p.shoulderL.x - 5, 40, -10);
        p.wristL = j(p.shoulderL.x + 2, 44, -7);

        const elBack = lerpJ(p.elbowR, j(-5, 47, 13), env.windupU);
        const wrBack = lerpJ(p.wristR, j(-2, 51, 15), env.windupU);

        p.elbowR = bezierJ(elBack, j(13, 50, 13), j(22, 49, 6), env.ext);
        p.wristR = bezierJ(wrBack, j(23, 52, 13), j(35, 48, 0), env.ext);

        p.hipR = j(6, 30, 5);
        p.kneeR = j(14, 16, 5.5);
        p.ankleR = j(17, 3, 5);
        p.toeR = j(22.5, 1, 5);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.24,
            swingEnd: 0.58,
            fadeEnd: 0.72,
            width: 5.4,
            color: accentColor,
          },
        };
      }

      if (f.id === 'krowen') {
        // Entaille diagonale lourde au sabre d'obsidienne
        p.weaponDrawn = 'KATANA';
        p.spinY = lerp(0.42 * env.windupU, -0.55, env.ext);
        p.waist = j(2 + env.ext * 3.5, 39, 0);
        p.chest = j(3 + env.ext * 6, 47, 0);
        p.neck = j(4 + env.ext * 5.5, 52, 0);
        p.head = j(5 + env.ext * 5, 58, 0);
        p.shoulderR = j(p.chest.x + 2, 47, 7);
        p.shoulderL = j(p.chest.x - 2, 46.5, -7);
        p.elbowL = j(p.shoulderL.x - 5, 39, -8);
        p.wristL = j(p.shoulderL.x - 1, 43, -6);

        const elHigh = lerpJ(p.elbowR, j(-1, 56, 8), env.windupU);
        const wrHigh = lerpJ(p.wristR, j(4, 64, 6), env.windupU);

        p.elbowR = bezierJ(elHigh, j(17, 54, 7), j(20, 43, 5), env.ext);
        p.wristR = bezierJ(wrHigh, j(25, 53, 4), j(28, 36, 2), env.ext);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'KATANA_TIP',
            swingStart: 0.24,
            swingEnd: 0.58,
            fadeEnd: 0.72,
            width: 5.0,
            color: '#F97316',
          },
        };
      }

      // Mawashi-Geri (High Roundhouse Kick) fluide : levée du genou -> fouetté circulaire haut -> retour
      p.spinY = -env.ext * 0.34;
      p.pelvis = j(2, 32, 0);
      p.waist = j(lerp(1, -2, env.ext), 40, 0);
      p.chest = j(lerp(2, -5, env.ext), 47, 0);
      p.neck = j(lerp(2.5, -6, env.ext), 52, 0);
      p.head = j(lerp(3, -5, env.ext), 58, 0);

      p.shoulderR = j(p.chest.x + 1.5, 46, p.shoulderR.z);
      p.elbowR = j(lerp(8, -6, env.ext), 38, p.shoulderR.z + 1.5);
      p.wristR = j(lerp(15, -2, env.ext), 44, 8);

      p.shoulderL = j(p.chest.x - 1.5, 46, p.shoulderL.z);
      p.elbowL = j(lerp(-5, 2, env.ext), 39, p.shoulderL.z - 1);
      p.wristL = j(10, 45, -6);

      p.hipL = j(-2, 31, -3);
      p.kneeL = j(-3, 16, -3);
      p.ankleL = j(-3, 3, -3);
      p.toeL = j(2.5, 1, -3);

      p.hipR = j(5, 32, 4);
      const knChamber = lerpJ(p.kneeR, j(12, 28, 7), env.windupU);
      const akChamber = lerpJ(p.ankleR, j(6, 17, 7), env.windupU);
      const toChamber = lerpJ(p.toeR, j(11, 15, 7), env.windupU);

      p.kneeR = bezierJ(knChamber, j(21, 37, 6), j(20, 44, 4), env.ext);
      p.ankleR = bezierJ(akChamber, j(29, 34, 6), j(35, 52, 1), env.ext);
      p.toeR = bezierJ(toChamber, j(34.5, 36, 6), j(40, 55.5, 1), env.ext);

      return {
        pose: applyFullBodyTransform(p),
        trailSpec: {
          part: 'TOE_R',
          swingStart: 0.24,
          swingEnd: 0.58,
          fadeEnd: 0.72,
          width: 4.5,
          color: accentColor,
        },
      };
    }

    case 'LOW_KICK': {
      // Balayette basse circulaire au ras du tapis : épaules, coudes et mains d'appui soudés au buste fléchi !
      const env = strikeEnvelope(progress, 0.22, 0.58, 0.72);

      const crouchT = Math.max(env.windupU, env.ext);
      const shZ = Math.abs(p.shoulderR.z);
      p.pelvis = j(lerp(0, -2, crouchT), lerp(30, 14, crouchT), 0);
      p.waist = j(lerp(1, -4, crouchT), lerp(38, 21, crouchT), 0);
      p.chest = j(lerp(2, -6, crouchT), lerp(47, 28, crouchT), 0);
      p.neck = j(lerp(2.5, -6, crouchT), lerp(52, 33, crouchT), 0);
      p.head = j(lerp(3, -5, crouchT), lerp(59, 39, crouchT), 0);

      // Épaule, coude et avant-bras avant parfaitement rattachés au torse fléchi en garde basse
      p.shoulderR = j(p.chest.x + 2, p.chest.y - 1, shZ);
      p.elbowR = lerpJ(p.elbowR, j(1, 20, shZ + 1.5), crouchT);
      p.wristR = lerpJ(p.wristR, j(8, 25, shZ * 0.75), crouchT);

      // Bras arrière d'équilibre au sol rattaché à l'épaule arrière
      p.shoulderL = j(p.chest.x - 2, p.chest.y - 1, -shZ);
      p.elbowL = lerpJ(p.elbowL, j(-13, 17, -shZ - 1), crouchT);
      p.wristL = lerpJ(p.wristL, j(-16, 7, -shZ * 0.85), crouchT);

      p.hipL = j(-5, p.pelvis.y - 1, -5);
      p.kneeL = j(-13, lerp(15, 6, crouchT), -7);
      p.ankleL = j(-8, 3, -6);
      p.toeL = j(-2.5, 1, -6);

      p.hipR = j(4, p.pelvis.y - 1, 4);
      const knStart = lerpJ(p.kneeR, j(9, 12, 6), env.windupU);
      const akStart = lerpJ(p.ankleR, j(8, 4, 7), env.windupU);
      const toStart = lerpJ(p.toeR, j(13.5, 2, 7), env.windupU);

      p.kneeR = bezierJ(knStart, j(17, 9, 6), j(21, 7, 3), env.ext);
      p.ankleR = bezierJ(akStart, j(23, 5, 7), j(35, 4, 1), env.ext);
      p.toeR = bezierJ(toStart, j(28.5, 5, 7), j(40.5, 5.5, 1), env.ext);

      return {
        pose: enforceAnatomicalIntegrity(p),
        trailSpec: {
          part: 'TOE_R',
          swingStart: 0.22,
          swingEnd: 0.58,
          fadeEnd: 0.72,
          width: 3.8,
          color: accentColor,
        },
      };
    }

    case 'THROW': {
      const shZ = Math.abs(p.shoulderR.z);
      if (progress < 0.38) {
        const t = smoothStep(progress / 0.38);
        p.waist = j(1 + 3.5 * t, 38, 0);
        p.chest = j(2 + 7 * t, 46, 0);
        p.neck = j(2.5 + 7 * t, 51.5, 0);
        p.head = j(3 + 7 * t, 58, 0);
        p.shoulderR = j(p.chest.x + 2, 45.5, shZ);
        p.shoulderL = j(p.chest.x - 1.5, 45.5, -shZ);
        p.elbowR = lerpJ(p.elbowR, j(17, 44, shZ * 0.85), t);
        p.wristR = lerpJ(p.wristR, j(24, 46, 5), t);
        p.elbowL = lerpJ(p.elbowL, j(15, 43, -shZ * 0.85), t);
        p.wristL = lerpJ(p.wristL, j(22, 45, -5), t);
        return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
      }
      const t = easeStrike((progress - 0.38) / 0.44);
      p.spinY = -t * Math.PI * 0.85;
      p.pitchZ = t * 0.28;
      p.waist = j(4, 38, 0);
      p.chest = j(7, 46, 0);
      p.neck = j(8, 51.5, 0);
      p.head = j(8.5, 58, 0);
      p.shoulderR = j(8.5, 45.5, shZ);
      p.shoulderL = j(5.5, 45.5, -shZ);
      p.elbowR = bezierJ(j(17, 44, shZ * 0.85), j(13, 53, 8), j(15, 35, 7), t);
      p.wristR = bezierJ(j(24, 46, 5), j(16, 58, 8), j(20, 26, 6), t);
      p.elbowL = bezierJ(j(15, 43, -shZ * 0.85), j(11, 52, -8), j(13, 34, -7), t);
      p.wristL = bezierJ(j(22, 45, -5), j(14, 57, -8), j(18, 24, -6), t);
      return {
        pose: applyFullBodyTransform(p),
        trailSpec: {
          part: 'WRIST_R',
          swingStart: 0.38,
          swingEnd: 0.78,
          fadeEnd: 0.90,
          width: 4.2,
          color: accentColor,
        },
      };
    }

    case 'SPECIAL_1': {
      if (f.id === 'kenji') {
        // Onde Céleste : concentration du Ki aux hanches [0..0.28] -> poussée des paumes [0.28..0.54]
        if (progress <= 0.28) {
          const c = smoothStep(progress / 0.28);
          p.spinY = 0.44 * c;
          p.elbowR = lerpJ(p.elbowR, j(-8, 36, 7), c);
          p.elbowL = lerpJ(p.elbowL, j(-10, 38, -7), c);
          p.wristR = lerpJ(p.wristR, j(-6, 36, 4), c);
          p.wristL = lerpJ(p.wristL, j(-8, 38, -4), c);
          p.weaponDrawn = 'KI_CHARGE';
          return { pose: applyFullBodyTransform(p), trailSpec: null };
        }
        const env = strikeEnvelope(progress, 0.28, 0.52, 0.78);
        p.spinY = lerp(0.44, -0.22, env.ext);
        p.pelvis = j(lerp(0, 4, env.ext), lerp(31, 27, env.ext), 0);
        p.waist = j(lerp(1, 7, env.ext), lerp(39, 35.5, env.ext), 0);
        p.chest = j(lerp(2, 10, env.ext), lerp(48, 44, env.ext), 0);
        p.neck = j(lerp(2.5, 11, env.ext), lerp(53, 49.5, env.ext), 0);
        p.head = j(lerp(3, 12, env.ext), lerp(60, 55, env.ext), 0);
        p.shoulderR = j(p.chest.x + 1.5, p.chest.y - 1, 7);
        p.shoulderL = j(p.chest.x - 1.5, p.chest.y - 1, -7);
        p.elbowR = lerpJ(j(-8, 36, 7), j(19, 42, 6), env.ext);
        p.elbowL = lerpJ(j(-10, 38, -7), j(18, 43, -6), env.ext);
        p.wristR = lerpJ(j(-6, 36, 4), j(29, 43, 2.5), env.ext);
        p.wristL = lerpJ(j(-8, 38, -4), j(29, 45, -2.5), env.ext);
        p.hipR = j(5 + env.ext * 2, p.pelvis.y - 1, 4.5);
        p.kneeR = j(11 + env.ext * 4, 15, 5);
        p.ankleR = j(12 + env.ext * 6, 3, 5);
        p.toeR = j(17.5 + env.ext * 6, 1, 5);
        p.auraRadius = env.ext > 0.4 ? 14 : 0;

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'BOTH_WRISTS',
            swingStart: 0.28,
            swingEnd: 0.52,
            fadeEnd: 0.64,
            width: 4.8,
            color: '#38BDF8',
          },
        };
      }

      if (f.id === 'krowen') {
        // Harpon des Enfers : armement arrière [0..0.24] -> jet fulgurant de la chaîne [0.24..0.52]
        const env = strikeEnvelope(progress, 0.24, 0.52, 0.80);
        p.weaponDrawn = 'CHAIN';
        p.spinY = lerp(0.35 * env.windupU, -0.32, env.ext);
        p.waist = j(1 + env.ext * 3.5, 38, 0);
        p.chest = j(2 + env.ext * 6, 46, 0);
        p.neck = j(3 + env.ext * 5.5, 51.5, 0);
        p.head = j(4 + env.ext * 5, 58, 0);
        p.shoulderR = j(p.chest.x + 1.5, 45.5, 6.5);
        p.shoulderL = j(p.chest.x - 2, 45, -6.5);
        p.elbowL = j(p.shoulderL.x - 5, 38, -7.5);
        p.wristL = j(p.shoulderL.x - 2, 42, -7);
        const wrBack = lerpJ(p.wristR, j(-6, 44, 9), env.windupU);
        p.elbowR = lerpJ(j(-7, 42, 10), j(20, 46, 4), env.ext);
        p.wristR = bezierJ(wrBack, j(15, 49, 6), j(32, 45, 1), env.ext);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.24,
            swingEnd: 0.52,
            fadeEnd: 0.64,
            width: 4.2,
            color: '#F97316',
          },
        };
      }

      if (f.id === 'meilin') {
        // Éventail d'Acier : pirouette Wushu + lancer de l'éventail
        const env = strikeEnvelope(progress, 0.20, 0.50, 0.72);
        p.spinY = smoothStep(progress) * Math.PI * 2;
        p.weaponDrawn = progress < 0.46 ? 'FAN_OPEN' : 'NONE';
        p.shoulderR = j(p.chest.x + 1.5, p.chest.y - 1, 7);
        p.shoulderL = j(p.chest.x - 1.5, p.chest.y - 1, -7);
        const wrBack = lerpJ(p.wristR, j(-5, 48, 8), env.windupU);
        p.elbowR = lerpJ(j(-3, 44, 9), j(17, 47, 5), env.ext);
        p.wristR = bezierJ(wrBack, j(16, 52, 7), j(28, 47, 2), env.ext);
        p.elbowL = j(-8, 44, -7.5);
        p.wristL = j(-12, 49, -6);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'FAN_EDGE',
            swingStart: 0.20,
            swingEnd: 0.50,
            fadeEnd: 0.62,
            width: 4.5,
            color: '#34D399',
          },
        };
      }

      if (f.id === 'titan') {
        // Brise-Vertèbres (Spinning Piledriver) : jambes groupées qui montent AVEC le bassin !
        const lift = Math.sin(progress * Math.PI) * 18;
        const spinT = clamp01((progress - 0.14) / 0.72);
        p.spinY = spinT * Math.PI * 4;
        const py = 31 + lift;
        p.pelvis = j(3, py, 0);
        p.waist = j(4, py + 9, 0);
        p.chest = j(5, py + 18, 0);
        p.neck = j(5, py + 23, 0);
        p.head = j(5, py + 30, 0);

        p.shoulderR = j(6.5, py + 17.5, 10.5);
        p.elbowR = j(16, py + 13, 12);
        p.wristR = j(22, py + 8, 6);
        p.shoulderL = j(3, py + 17.5, -10.5);
        p.elbowL = j(15, py + 13, -12);
        p.wristL = j(21, py + 8, -6);

        // Jambes fléchies qui accompagnent le saut sans aucun étirement !
        const tuck = Math.sin(progress * Math.PI);
        p.hipR = j(5, py - 1, 5);
        p.kneeR = j(13, py - 13 + tuck * 4, 6);
        p.ankleR = j(9, py - 26 + tuck * 6, 5);
        p.toeR = j(14.5, py - 28 + tuck * 6, 5);

        p.hipL = j(-4, py - 1, -5);
        p.kneeL = j(-9, py - 13 + tuck * 4, -6);
        p.ankleL = j(-11, py - 26 + tuck * 6, -5);
        p.toeL = j(-5.5, py - 28 + tuck * 6, -5);

        p.auraRadius = spinT > 0 && spinT < 1 ? 18 : 0;
        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.16,
            swingEnd: 0.80,
            fadeEnd: 0.88,
            span: 0.14,
            width: 4.8,
            color: '#EF4444',
          },
        };
      }

      if (f.id === 'nyxia') {
        // Lance Foudroyante : armement d'archère d'orage -> jet de lance électrique
        const env = strikeEnvelope(progress, 0.24, 0.52, 0.78);
        p.weaponDrawn = progress < 0.50 ? 'LIGHTNING_SPEAR' : 'NONE';
        const floatLift = Math.sin(progress * Math.PI) * 5;
        p.pelvis = j(0, 31 + floatLift, 0);
        p.waist = j(1.5 + env.ext * 2, 39 + floatLift, 0);
        p.chest = j(3 + env.ext * 4, 48 + floatLift, 0);
        p.neck = j(4 + env.ext * 4, 53 + floatLift, 0);
        p.head = j(5 + env.ext * 4, 60 + floatLift, 0);

        p.shoulderR = j(p.chest.x + 1.5, 47 + floatLift, 7);
        p.shoulderL = j(p.chest.x - 1.5, 47 + floatLift, -7);

        p.hipR.y += floatLift;
        p.kneeR.y += floatLift * 0.8;
        p.ankleR.y += floatLift * 0.6;
        p.toeR.y += floatLift * 0.6;
        p.hipL.y += floatLift;
        p.kneeL.y += floatLift * 0.8;
        p.ankleL.y += floatLift * 0.6;
        p.toeL.y += floatLift * 0.6;

        const wrBack = lerpJ(p.wristR, j(-6, 56 + floatLift, 7), env.windupU);
        p.elbowR = lerpJ(j(-7, 52 + floatLift, 8), j(19, 50 + floatLift, 4), env.ext);
        p.wristR = bezierJ(wrBack, j(15, 58 + floatLift, 5), j(30, 50 + floatLift, 2), env.ext);
        p.elbowL = j(p.shoulderL.x - 5, 45 + floatLift, -8);
        p.wristL = j(p.shoulderL.x - 9, 50 + floatLift, -7);
        p.auraRadius = env.ext > 0.2 ? 15 : 0;

        return {
          pose: enforceAnatomicalIntegrity(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.24,
            swingEnd: 0.52,
            fadeEnd: 0.64,
            width: 4.4,
            color: '#22D3EE',
          },
        };
      }

      // Malakor : Torpille Pourpre (Vrille horizontale Psycho Crusher anatomiquement cohérente)
      const activeT =
        progress < 0.16
          ? smoothStep(progress / 0.16)
          : progress > 0.84
          ? 1 - smoothStep((progress - 0.84) / 0.16)
          : 1;
      const drillPhase = clamp01((progress - 0.14) / 0.72);

      p.pitchZ = -Math.PI * 0.46 * activeT;
      p.rollX = drillPhase * Math.PI * 4;
      p.pelvis = j(lerp(0, -6, activeT), lerp(31, 36, activeT), 0);
      p.waist = j(lerp(1, -6, activeT), lerp(39, 45, activeT), 0);
      p.chest = j(lerp(1, -6, activeT), lerp(51, 55, activeT), 0);
      p.neck = j(lerp(2, -6, activeT), lerp(56, 60, activeT), 0);
      p.head = j(lerp(2, -6, activeT), lerp(64, 66, activeT), 0);

      p.shoulderR = j(lerp(3, -5, activeT), lerp(49, 55, activeT), 8);
      p.elbowR = j(lerp(8, -5, activeT), lerp(42, 66, activeT), 6);
      p.wristR = j(lerp(15, -4, activeT), lerp(48, 77, activeT), 3.5);

      p.shoulderL = j(lerp(-1, -5, activeT), lerp(49, 55, activeT), -8);
      p.elbowL = j(lerp(-6, -5, activeT), lerp(40, 66, activeT), -6);
      p.wristL = j(lerp(-8, -4, activeT), lerp(37, 77, activeT), -3.5);

      // Jambes profilées dans l'axe avec pieds correctement positionnés !
      p.hipR = j(lerp(5, -6, activeT), lerp(30, 35, activeT), 4);
      p.kneeR = j(lerp(11, -6, activeT), lerp(16, 22, activeT), 4);
      p.ankleR = j(lerp(12, -6, activeT), lerp(3, 10, activeT), 3.5);
      p.toeR = j(lerp(17.5, -5, activeT), lerp(1, 4.5, activeT), 3.5);

      p.hipL = j(lerp(-5, -6, activeT), lerp(30, 35, activeT), -4);
      p.kneeL = j(lerp(-10, -6, activeT), lerp(16, 22, activeT), -4);
      p.ankleL = j(lerp(-13, -6, activeT), lerp(3, 10, activeT), -3.5);
      p.toeL = j(lerp(-7.5, -5, activeT), lerp(1, 4.5, activeT), -3.5);

      p.auraRadius = activeT > 0.5 ? 20 : 0;
      return {
        pose: applyFullBodyTransform(p),
        trailSpec: {
          part: 'WRIST_R',
          swingStart: 0.16,
          swingEnd: 0.82,
          fadeEnd: 0.88,
          span: 0.14,
          width: 5.0,
          color: '#C084FC',
        },
      };
    }

    case 'SPECIAL_2': {
      if (f.id === 'kenji') {
        // Dragon Ascendant (Shoryuken) : flexion d'impulsion [0..0.16] -> uppercut céleste vrillé [0.16..0.60]
        const env = strikeEnvelope(progress, 0.16, 0.58, 0.76);
        p.spinY = env.ext * Math.PI * 1.15;

        const coilY = lerp(31, 22, env.windupU);
        p.pelvis = j(2, lerp(coilY, 35, env.ext), 0);
        p.waist = j(3, lerp(coilY + 8, 44, env.ext), 0);
        p.chest = j(4, lerp(coilY + 16, 53, env.ext), 0);
        p.neck = j(4, lerp(coilY + 21, 58, env.ext), 0);
        p.head = j(5, lerp(coilY + 27, 64, env.ext), 0);

        p.shoulderR = j(p.chest.x + 2, p.chest.y + 0.5, 6);
        p.shoulderL = j(p.chest.x - 2, p.chest.y - 1, -6.5);
        p.elbowL = j(p.shoulderL.x - 5, p.shoulderL.y - 9, -8);
        p.wristL = j(p.shoulderL.x + 2, p.shoulderL.y - 5, -5);

        const wrCoil = lerpJ(p.wristR, j(7, p.shoulderR.y - 11, 7), env.windupU);
        p.elbowR = bezierJ(j(6, p.shoulderR.y - 13, 8), j(18, 45, 6), j(10, 65, 4), env.ext);
        p.wristR = bezierJ(wrCoil, j(24, 51, 4), j(12, 77, 1), env.ext);

        // Genou droit haut fendant l'air + jambe gauche tendue dessous avec pied propre
        p.hipR = j(5, p.pelvis.y - 1, 4.5);
        p.kneeR = lerpJ(j(11, 13, 5), j(16, 33, 5), env.ext);
        p.ankleR = lerpJ(j(11, 3, 5), j(8, 21, 5), env.ext);
        p.toeR = lerpJ(j(16.5, 1, 5), j(12, 16.5, 5), env.ext);

        p.hipL = j(-4, p.pelvis.y - 1, -4.5);
        p.kneeL = lerpJ(j(-10, 12, -5), j(-6, 19, -4), env.ext);
        p.ankleL = lerpJ(j(-13, 3, -5), j(-8, 7, -4), env.ext);
        p.toeL = lerpJ(j(-7.5, 1, -5), j(-5, 2, -4), env.ext);

        p.auraRadius = env.ext > 0.35 ? 15 : 0;
        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.16,
            swingEnd: 0.58,
            fadeEnd: 0.72,
            width: 5.0,
            color: '#38BDF8',
          },
        };
      }

      if (f.id === 'krowen') {
        // Pas de Brume :
        // Acte 1 [0..0.36] : Sceau ninja immobile + dissolution dans la brume ardente (ZÉRO trace de coup !)
        if (progress < 0.36) {
          const sealT = smoothStep(progress / 0.22);
          p.weaponDrawn = 'NONE';
          p.chest = j(2, 47, 0);
          p.head = j(3, 59, 0);
          p.shoulderR = j(3.5, 46, 7);
          p.shoulderL = j(0.5, 46, -7);
          // Mains jointes en sceau Kuji-kiri devant le masque
          p.elbowR = lerpJ(p.elbowR, j(9, 39, 8), sealT);
          p.wristR = lerpJ(p.wristR, j(11, 50, 3), sealT);
          p.elbowL = lerpJ(p.elbowL, j(5, 39, -7), sealT);
          p.wristL = lerpJ(p.wristL, j(9, 50, -2), sealT);
          p.teleportFade = smoothStep(Math.max(0, (progress - 0.10) / 0.26)) * 0.92;
          p.emberDissolve = progress > 0.08;
          return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
        }

        // Acte 2 [0.36..0.50] : Réapparition rapide sabre armé au-dessus de l'épaule (toujours ZÉRO trace !)
        if (progress < 0.50) {
          const matT = smoothStep((progress - 0.36) / 0.14);
          p.weaponDrawn = 'KATANA';
          p.teleportFade = (1 - matT) * 0.92;
          p.emberDissolve = matT < 0.5;
          p.spinY = 0.36 * matT;
          p.chest = j(4, 47, 0);
          p.shoulderR = j(5.5, 47, 7);
          p.shoulderL = j(2, 46.5, -7);
          p.elbowR = lerpJ(j(9, 44, 7), j(0, 57, 8), matT);
          p.wristR = lerpJ(j(11, 50, 3), j(4, 65, 6), matT);
          p.elbowL = j(-4, 39, -8);
          p.wristL = j(-6, 43, -7);
          return { pose: applyFullBodyTransform(p), trailSpec: null };
        }

        // Acte 3 [0.50..1.00] : Entaille fulgurante du sabre à la réapparition (la trace suit la lame !)
        const env = strikeEnvelope((progress - 0.50) / 0.50, 0.02, 0.52, 0.68);
        p.weaponDrawn = 'KATANA';
        p.spinY = lerp(0.36, -0.52, env.ext);
        p.waist = j(2.5 + env.ext * 3, 38.5, 0);
        p.chest = j(4 + env.ext * 5, 46, 0);
        p.neck = j(5 + env.ext * 4.5, 51.5, 0);
        p.head = j(5.5 + env.ext * 4, 57.5, 0);
        p.shoulderR = j(p.chest.x + 1.5, 46, 7);
        p.shoulderL = j(p.chest.x - 2, 45.5, -7);
        p.elbowR = bezierJ(j(0, 57, 8), j(17, 54, 7), j(20, 42, 5), env.ext);
        p.wristR = bezierJ(j(4, 65, 6), j(26, 52, 4), j(28, 33, 2), env.ext);
        p.elbowL = j(p.shoulderL.x - 5, 39, -8);
        p.wristL = j(p.shoulderL.x - 3, 42, -7);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'KATANA_TIP',
            swingStart: 0.51,
            swingEnd: 0.76,
            fadeEnd: 0.86,
            span: 0.16,
            width: 5.2,
            color: '#F97316',
          },
        };
      }

      if (f.id === 'meilin') {
        // Cent Éclairs : équilibre sur la jambe gauche + rafale de coups de pied progressifs !
        p.pelvis = j(0, 32, 0);
        p.waist = j(-2, 40, 0);
        p.chest = j(-5, 48, 0);
        p.neck = j(-5, 53, 0);
        p.head = j(-4, 59, 0);

        p.shoulderR = j(-3.5, 47, 6.8);
        p.elbowR = j(3, 43, 7.5);
        p.wristR = j(11, 50, 6);

        p.shoulderL = j(-6.5, 47, -6.8);
        p.elbowL = j(-11, 44, -7.5);
        p.wristL = j(-12, 50, -6);

        p.hipL = j(-2, 31, -3);
        p.kneeL = j(-3, 16, -3);
        p.ankleL = j(-3, 3, -3);
        p.toeL = j(2.5, 1, -3);

        p.hipR = j(4, 32, 4);
        if (progress < 0.14 || progress > 0.86) {
          const c = progress < 0.14 ? smoothStep(progress / 0.14) : 1 - smoothStep((progress - 0.86) / 0.14);
          p.kneeR = lerpJ(p.kneeR, j(15, 34, 5), c);
          p.ankleR = lerpJ(p.ankleR, j(10, 24, 5), c);
          p.toeR = lerpJ(p.toeR, j(15, 22, 5), c);
          return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
        }

        const flurryU = (progress - 0.14) / 0.72;
        const cycle = flurryU * 3; // 3 coups de pied supersoniques consécutifs lisibles
        const sub = cycle - Math.floor(cycle);
        const kickIdx = Math.floor(cycle);
        const targetY = kickIdx === 0 ? 34 : kickIdx === 1 ? 46 : 55;
        const ext = sub < 0.58 ? easeStrike(sub / 0.58) : 1 - smoothStep((sub - 0.58) / 0.42);

        p.kneeR = lerpJ(j(14, 33, 5), j(21, 35 + (targetY - 40) * 0.4, 4), ext);
        p.ankleR = lerpJ(j(9, 25, 5), j(35, targetY, 2), ext);
        p.toeR = lerpJ(j(14, 23, 5), j(40.5, targetY + 2, 2), ext);

        const segStart = 0.14 + kickIdx * (0.72 / 3);
        const segSwingEnd = segStart + (0.72 / 3) * 0.58;
        const segFadeEnd = segStart + (0.72 / 3) * 0.80;

        return {
          pose: enforceAnatomicalIntegrity(p),
          trailSpec: {
            part: 'TOE_R',
            swingStart: segStart,
            swingEnd: segSwingEnd,
            fadeEnd: segFadeEnd,
            span: 0.10,
            width: 4.0,
            color: '#34D399',
          },
        };
      }

      if (f.id === 'titan') {
        // Lariat Blindé : ouverture des bras [0..0.15] -> rotation 360° progressive [0.15..0.85]
        const active =
          progress < 0.15
            ? smoothStep(progress / 0.15)
            : progress > 0.85
            ? 1 - smoothStep((progress - 0.85) / 0.15)
            : 1;
        const spinU = clamp01((progress - 0.14) / 0.72);
        p.spinY = spinU * Math.PI * 4;
        p.waist = j(0, 40, 0);
        p.chest = j(0, 50, 0);
        p.neck = j(0, 56, 0);
        p.head = j(0, 62, 0);
        p.shoulderR = j(0.5, 49.5, 11);
        p.elbowR = lerpJ(p.elbowR, j(0.5, 50, 22), active);
        p.wristR = lerpJ(p.wristR, j(0.5, 50, 33), active);
        p.shoulderL = j(-0.5, 49.5, -11);
        p.elbowL = lerpJ(p.elbowL, j(-0.5, 50, -22), active);
        p.wristL = lerpJ(p.wristL, j(-0.5, 50, -33), active);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.15,
            swingEnd: 0.84,
            fadeEnd: 0.90,
            span: 0.14,
            width: 4.8,
            color: '#F59E0B',
          },
        };
      }

      if (f.id === 'nyxia') {
        // Sphère de Stase : concentration entre les paumes -> projection de l'orbe
        const env = strikeEnvelope(progress, 0.30, 0.58, 0.78);
        p.weaponDrawn = progress < 0.56 ? 'KI_CHARGE' : 'NONE';
        p.shoulderR = j(p.chest.x + 1.5, p.chest.y - 1, 7);
        p.shoulderL = j(p.chest.x - 1.5, p.chest.y - 1, -7);
        const wrCharge = lerpJ(p.wristR, j(8, 48, 5), env.windupU);
        const wlCharge = lerpJ(p.wristL, j(8, 50, -5), env.windupU);
        p.elbowR = lerpJ(j(4, 41, 8), j(15, 46, 6), env.ext);
        p.elbowL = lerpJ(j(3, 42, -8), j(15, 47, -6), env.ext);
        p.wristR = lerpJ(wrCharge, j(25, 48, 4), env.ext);
        p.wristL = lerpJ(wlCharge, j(25, 50, -4), env.ext);
        p.auraRadius = progress > 0.15 && progress < 0.75 ? 16 : 0;

        return {
          pose: enforceAnatomicalIntegrity(p),
          trailSpec: {
            part: 'BOTH_WRISTS',
            swingStart: 0.30,
            swingEnd: 0.58,
            fadeEnd: 0.68,
            width: 4.2,
            color: '#22D3EE',
          },
        };
      }

      // Malakor : Marteau de l'Empereur (Armement haut au-dessus du heaume [0..0.38] -> fracas descendant [0.38..0.66])
      const env = strikeEnvelope(progress, 0.38, 0.66, 0.82);
      p.waist = j(lerp(1, 5, env.ext), lerp(41, 36, env.ext), 0);
      p.chest = j(lerp(2, 9, env.ext), lerp(52, 43, env.ext), 0);
      p.neck = j(lerp(2.5, 9.5, env.ext), lerp(58, 48.5, env.ext), 0);
      p.head = j(lerp(3, 10, env.ext), lerp(64, 54, env.ext), 0);

      p.shoulderR = j(p.chest.x + 1.5, p.chest.y - 0.5, 9);
      p.shoulderL = j(p.chest.x - 1.5, p.chest.y - 0.5, -9);

      const elHigh = lerpJ(p.elbowR, j(6, 62, 9), env.windupU);
      const wrHigh = lerpJ(p.wristR, j(8, 73, 3), env.windupU);
      const elLHigh = lerpJ(p.elbowL, j(5, 62, -9), env.windupU);
      const wrLHigh = lerpJ(p.wristL, j(7, 73, -3), env.windupU);

      p.elbowR = bezierJ(elHigh, j(21, 54, 8), j(18, 32, 7), env.ext);
      p.wristR = bezierJ(wrHigh, j(28, 52, 4), j(25, 22, 3), env.ext);
      p.elbowL = bezierJ(elLHigh, j(20, 54, -8), j(17, 32, -7), env.ext);
      p.wristL = bezierJ(wrLHigh, j(27, 52, -4), j(24, 22, -3), env.ext);

      // Pied avant et pied arrière cohérents (aucun pied étiré !)
      p.hipR = j(6, 30, 4.5);
      p.kneeR = lerpJ(j(11, 16, 5.5), j(16, 21, 5), env.windupU * (1 - env.ext * 0.5));
      p.ankleR = lerpJ(j(12, 3, 5), j(14, 8, 5), env.windupU * (1 - env.ext));
      p.toeR = j(p.ankleR.x + 5.5, Math.max(1, p.ankleR.y - 2), 5);

      p.auraRadius = env.ext > 0.3 ? 18 : 0;
      return {
        pose: enforceAnatomicalIntegrity(p),
        trailSpec: {
          part: 'BOTH_WRISTS',
          swingStart: 0.38,
          swingEnd: 0.66,
          fadeEnd: 0.78,
          width: 6.0,
          color: '#C084FC',
        },
      };
    }

    case 'SPECIAL_3': {
      if (f.id === 'kenji') {
        // Ouragan Écarlate (Tatsumaki Senpukyaku 360° en l'air !)
        // Décollage [0..0.14] -> Rotation 360° jambe droite tendue & jambe gauche REPLIÉE [0.14..0.86] -> Réception [0.86..1.0]
        const airBlend =
          progress < 0.14
            ? smoothStep(progress / 0.14)
            : progress > 0.86
            ? 1 - smoothStep((progress - 0.86) / 0.14)
            : 1;
        const spinU = clamp01((progress - 0.14) / 0.72);

        p.spinY = spinU * Math.PI * 4; // 2 tours complets fluides !
        p.pelvis = j(0, lerp(31, 36, airBlend), 0);
        p.waist = j(0, lerp(39, 44, airBlend), 0);
        p.chest = j(0, lerp(48, 52, airBlend), 0);
        p.neck = j(0, lerp(53, 57, airBlend), 0);
        p.head = j(0, lerp(60, 63, airBlend), 0);

        // Garde martiale serrée près du buste pendant la toupie
        p.shoulderR = j(2, p.chest.y - 1, 7);
        p.elbowR = lerpJ(p.elbowR, j(8, p.chest.y - 7, 7), airBlend);
        p.wristR = lerpJ(p.wristR, j(12, p.chest.y - 2, 4), airBlend);

        p.shoulderL = j(-2, p.chest.y - 1, -7);
        p.elbowL = lerpJ(p.elbowL, j(-8, p.chest.y - 7, -7), airBlend);
        p.wristL = lerpJ(p.wristL, j(-4, p.chest.y - 2, -4), airBlend);

        // Jambe droite tendue horizontalement à hauteur de hanche !
        p.hipR = j(4, p.pelvis.y, 2.5);
        p.kneeR = lerpJ(j(11, 16, 5), j(19, 37, 1.5), airBlend);
        p.ankleR = lerpJ(j(12, 3, 5), j(34, 38, 0), airBlend);
        p.toeR = lerpJ(j(17.5, 1, 5), j(39.5, 40, 0), airBlend);

        // Jambe gauche proprement repliée sous le bassin AVEC son pied (toeL) replié aussi (ZÉRO trait rose !)
        p.hipL = j(-3.5, p.pelvis.y - 1, -3);
        p.kneeL = lerpJ(j(-10, 16, -5), j(-7, 25, -3.5), airBlend);
        p.ankleL = lerpJ(j(-13, 3, -5), j(-2, 19, -2.5), airBlend);
        p.toeL = lerpJ(j(-7.5, 1, -5), j(2.5, 17, -2.5), airBlend);

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'TOE_R',
            swingStart: 0.14,
            swingEnd: 0.85,
            fadeEnd: 0.91,
            span: 0.13,
            width: 4.4,
            color: '#EF4444',
          },
        };
      }

      if (f.id === 'krowen') {
        // Souffle Calciné : Coup de talon marteau enflammé (Axe Kick overhead !)
        const env = strikeEnvelope(progress, 0.36, 0.66, 0.80);

        p.pelvis = j(1, 32, 0);
        p.waist = j(lerp(1, -2, env.windupU), 40, 0);
        p.chest = j(lerp(2, -4, env.windupU * (1 - env.ext * 0.5)), 47, 0);
        p.neck = j(p.chest.x, 52, 0);
        p.head = j(p.chest.x + 1, 58, 0);

        p.shoulderR = j(p.chest.x + 1.5, 46, 7);
        p.elbowR = j(p.chest.x - 4, 39, 8);
        p.wristR = j(-4, 45, 7);

        p.shoulderL = j(p.chest.x - 1.5, 46, -7);
        p.elbowL = j(p.chest.x + 3, 39, -7.5);
        p.wristL = j(11, 46, -6);

        p.hipL = j(-3, 31, -3.5);
        p.kneeL = j(-5, 16, -4);
        p.ankleL = j(-6, 3, -4);
        p.toeL = j(-0.5, 1, -4);

        p.hipR = j(5, 32, 4);
        const knHigh = lerpJ(p.kneeR, j(13, 48, 5), env.windupU);
        const akHigh = lerpJ(p.ankleR, j(18, 67, 2), env.windupU);
        const toHigh = lerpJ(p.toeR, j(22, 71.5, 2), env.windupU);

        p.kneeR = bezierJ(knHigh, j(24, 38, 4), j(17, 19, 4), env.ext);
        p.ankleR = bezierJ(akHigh, j(36, 45, 1), j(27, 10, 1), env.ext);
        p.toeR = bezierJ(toHigh, j(41.5, 47, 1), j(32.5, 11.5, 1), env.ext);

        p.auraRadius = env.ext > 0.25 ? 16 : 0;

        return {
          pose: enforceAnatomicalIntegrity(p),
          trailSpec: {
            part: 'TOE_R',
            swingStart: 0.36,
            swingEnd: 0.66,
            fadeEnd: 0.78,
            span: 0.20,
            width: 5.2,
            color: '#F97316',
          },
        };
      }

      if (f.id === 'meilin') {
        // Flèche du Phénix : Saut groupé [0..0.24] -> Piqué aérien diagonal profilé [0.24..0.74]
        const env = strikeEnvelope(progress, 0.24, 0.72, 0.84);
        p.pitchZ = -0.52 * env.ext;
        p.pelvis = j(3, 34, 0);
        p.waist = j(4, 41, 0);
        p.chest = j(5, 48, 0);
        p.neck = j(5, 53, 0);
        p.head = j(6, 59, 0);

        p.shoulderR = j(6.5, 47, 6.8);
        p.elbowR = lerpJ(p.elbowR, j(-2, 49, 7.5), env.ext);
        p.wristR = lerpJ(p.wristR, j(-9, 52, 6), env.ext);

        p.shoulderL = j(3.5, 47, -6.8);
        p.elbowL = lerpJ(p.elbowL, j(-4, 48, -7.5), env.ext);
        p.wristL = lerpJ(p.wristL, j(-11, 50, -6), env.ext);

        p.hipR = j(5, 33, 4);
        const knTuck = lerpJ(p.kneeR, j(12, 31, 5), env.windupU);
        const akTuck = lerpJ(p.ankleR, j(6, 22, 5), env.windupU);
        const toTuck = lerpJ(p.toeR, j(11, 20, 5), env.windupU);

        p.kneeR = lerpJ(knTuck, j(20, 24, 3), env.ext);
        p.ankleR = lerpJ(akTuck, j(35, 14, 1), env.ext);
        p.toeR = lerpJ(toTuck, j(40.5, 12, 1), env.ext);

        p.hipL = j(-1, 33, -4);
        p.kneeL = j(4, 24, -5);
        p.ankleL = j(-4, 16, -5);
        p.toeL = j(1, 13.5, -5);

        p.auraRadius = env.ext > 0.3 ? 15 : 0;

        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'TOE_R',
            swingStart: 0.24,
            swingEnd: 0.72,
            fadeEnd: 0.84,
            width: 4.5,
            color: '#34D399',
          },
        };
      }

      if (f.id === 'titan') {
        // Séisme d'Oural : lève ses deux gantelets géants [0..0.40] -> fracasse le sol [0.40..0.66]
        const env = strikeEnvelope(progress, 0.40, 0.66, 0.84);

        p.pelvis = j(lerp(0, 2, env.ext), lerp(29, 19, env.ext), 0);
        p.waist = j(lerp(1, 7, env.ext), lerp(39, 24, env.ext), 0);
        p.chest = j(lerp(-2 * env.windupU, 12, env.ext), lerp(49, 29, env.ext), 0);
        p.neck = j(p.chest.x + 2, p.chest.y + 4.5, 0);
        p.head = j(p.chest.x + 4, p.chest.y + 9.5, 0);

        p.shoulderR = j(p.chest.x + 2, p.chest.y - 0.5, 10.5);
        p.shoulderL = j(p.chest.x - 1, p.chest.y - 0.5, -10.5);

        p.hipL = j(-4, p.pelvis.y - 1, -5);
        p.kneeL = j(-11, lerp(16, 10, env.ext), -6);
        p.ankleL = j(-14, 3, -5);
        p.toeL = j(-8.5, 1, -5);

        p.hipR = j(5, p.pelvis.y - 1, 5);
        p.kneeR = j(14, lerp(16, 12, env.ext), 6);
        p.ankleR = j(13, 3, 5);
        p.toeR = j(18.5, 1, 5);

        const wrHighR = lerpJ(p.wristR, j(6, 73, 8), env.windupU);
        const wrHighL = lerpJ(p.wristL, j(5, 73, -8), env.windupU);

        p.elbowR = bezierJ(j(4, 60, 11), j(21, 47, 10), j(18, 18, 10), env.ext);
        p.wristR = bezierJ(wrHighR, j(29, 43, 7), j(24, 6, 6), env.ext);
        p.elbowL = bezierJ(j(2, 60, -11), j(19, 47, -10), j(17, 18, -10), env.ext);
        p.wristL = bezierJ(wrHighL, j(27, 43, -7), j(23, 6, -6), env.ext);

        p.auraRadius = env.ext > 0.7 ? 20 : 0;
        return {
          pose: enforceAnatomicalIntegrity(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.40,
            swingEnd: 0.66,
            fadeEnd: 0.78,
            width: 6.0,
            color: '#EF4444',
          },
        };
      }

      if (f.id === 'nyxia') {
        // Torpille d'Orage : impulsion électrique horizontale profilée
        const env = strikeEnvelope(progress, 0.18, 0.74, 0.86);
        const tilt = Math.max(env.windupU * 0.3, env.ext);
        p.pitchZ = -Math.PI * 0.40 * env.ext;

        p.pelvis = j(-4 * tilt, 34, 0);
        p.waist = j(-4 * tilt, 42, 0);
        p.chest = j(-3 * tilt, 50, 0);
        p.neck = j(-3 * tilt, 55, 0);
        p.head = j(-2 * tilt, 61, 0);

        p.shoulderR = j(-1.5 * tilt, 49.5, 7);
        p.shoulderL = j(-4.5 * tilt, 49.5, -7);
        p.elbowR = lerpJ(p.elbowR, j(0, 62, 5), env.ext);
        p.wristR = lerpJ(p.wristR, j(3, 74, 3), env.ext);
        p.elbowL = lerpJ(p.elbowL, j(-7, 42, -7.5), env.ext);
        p.wristL = lerpJ(p.wristL, j(-8, 42, -6), env.ext);

        p.hipR = j(-4 * tilt + 3, 33, 4);
        p.kneeR = lerpJ(p.kneeR, j(-4, 20, 4), env.ext);
        p.ankleR = lerpJ(p.ankleR, j(-5, 8, 3.5), env.ext);
        p.toeR = lerpJ(p.toeR, j(-4, 2.5, 3.5), env.ext);

        p.hipL = j(-4 * tilt - 3, 33, -4);
        p.kneeL = lerpJ(p.kneeL, j(-5, 20, -4), env.ext);
        p.ankleL = lerpJ(p.ankleL, j(-6, 8, -3.5), env.ext);
        p.toeL = lerpJ(p.toeL, j(-5, 2.5, -3.5), env.ext);

        p.auraRadius = env.ext > 0.25 ? 18 : 0;
        return {
          pose: applyFullBodyTransform(p),
          trailSpec: {
            part: 'WRIST_R',
            swingStart: 0.18,
            swingEnd: 0.74,
            fadeEnd: 0.84,
            width: 4.8,
            color: '#22D3EE',
          },
        };
      }

      // Malakor : Égide Noire (Armement sous la cape [0..0.24] -> large revers impérial [0.24..0.58])
      const env = strikeEnvelope(progress, 0.24, 0.58, 0.78);
      p.spinY = lerp(0.40 * env.windupU, -0.48, env.ext);
      p.waist = j(0.5 + env.ext * 3, 41, 0);
      p.chest = j(1 + env.ext * 5, 51, 0);
      p.neck = j(1.5 + env.ext * 4.5, 57, 0);
      p.head = j(2 + env.ext * 4, 63, 0);
      p.shoulderR = j(p.chest.x + 2, 50, 9.2);
      p.shoulderL = j(p.chest.x - 2, 50, -9.2);
      const wrCoil = lerpJ(p.wristR, j(-4, 46, 10), env.windupU);
      p.elbowR = bezierJ(j(-3, 43, 11), j(15, 50, 10), j(19, 48, 7), env.ext);
      p.wristR = bezierJ(wrCoil, j(20, 52, 11), j(30, 46, 4), env.ext);
      p.elbowL = j(p.shoulderL.x - 5, 44, -10);
      p.wristL = j(p.shoulderL.x - 9, 50, -9);
      p.auraRadius = env.ext > 0.35 ? 18 : 0;

      return {
        pose: applyFullBodyTransform(p),
        trailSpec: {
          part: 'WRIST_R',
          swingStart: 0.24,
          swingEnd: 0.58,
          fadeEnd: 0.70,
          width: 5.2,
          color: '#C084FC',
        },
      };
    }

    case 'BLOCK_HIGH': {
      const shZ = Math.abs(p.shoulderR.z);
      p.pelvis = j(-3, 30, 0);
      p.waist = j(-3.5, 38, 0);
      p.chest = j(-4, 46, 0);
      p.neck = j(-3.5, 51.5, 0);
      p.head = j(-3, 57, 0);
      p.shoulderR = j(-2, 45.5, shZ);
      p.elbowR = j(7, 40, 7);
      p.wristR = j(10, 54, 3);
      p.shoulderL = j(-5.5, 45.5, -shZ);
      p.elbowL = j(5, 39, -5);
      p.wristL = j(9, 53, -2);
      p.ankleL = j(-16, 3, -5);
      p.toeL = j(-10.5, 1, -5);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'BLOCK_LOW': {
      const shZ = Math.abs(p.shoulderR.z);
      p.pelvis = j(-3, 18, 0);
      p.waist = j(-1, 25, 0);
      p.chest = j(1, 33, 0);
      p.neck = j(2, 38, 0);
      p.head = j(3, 44, 0);
      p.shoulderR = j(3, 32.5, shZ);
      p.elbowR = j(10, 25, 6.5);
      p.wristR = j(12, 37, 3);
      p.shoulderL = j(-1, 32.5, -shZ);
      p.elbowL = j(8, 24, -5.5);
      p.wristL = j(11, 36, -2);

      p.hipL = j(-5, 17, -4.5);
      p.kneeL = j(-12, 6, -5);
      p.ankleL = j(-17, 3, -5);
      p.toeL = j(-11.5, 1, -5);

      p.hipR = j(4, 17, 4.5);
      p.kneeR = j(13, 13, 5);
      p.ankleR = j(11, 3, 5);
      p.toeR = j(16.5, 1, 5);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'HITSTUN': {
      const snap = Math.sin(Math.min(1, progress * 1.5) * Math.PI);
      const shZ = Math.abs(p.shoulderR.z);
      p.pelvis = j(-4 * snap, 30, 0);
      p.waist = j(-8 * snap, 38, 0);
      p.chest = j(-12 * snap, 46, 0);
      p.neck = j(-14 * snap, 51, 0);
      p.head = j(-17 * snap, 57, 0);
      p.shoulderR = j(p.chest.x + 1.5, 45.5, shZ);
      p.elbowR = j(p.chest.x + 6, 42, shZ + 2);
      p.wristR = j(p.chest.x + 13, 51, shZ + 4);
      p.shoulderL = j(p.chest.x - 1.5, 45.5, -shZ);
      p.elbowL = j(p.chest.x - 5, 41, -shZ - 2);
      p.wristL = j(p.chest.x - 8, 50, -shZ - 3);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'HITSTUN_GUT': {
      const crunch = Math.sin(Math.min(1, progress * 1.5) * Math.PI);
      p.pelvis = j(-8 * crunch, 28, 0);
      p.waist = j(-3 * crunch, 34, 0);
      p.chest = j(3 * crunch, 40, 0);
      p.neck = j(6 * crunch, 44, 0);
      p.head = j(8 * crunch, 48, 0);

      p.shoulderR = j(3 * crunch + 1.5, 39.5, 7.5);
      p.elbowR = j(6, 31, 9);
      p.wristR = j(1, 33, 4);

      p.shoulderL = j(3 * crunch - 1.5, 39.5, -7.5);
      p.elbowL = j(-5, 31, -9);
      p.wristL = j(-2, 23, -7);

      p.hipR = j(p.pelvis.x + 4, 27, 4.5);
      p.hipL = j(p.pelvis.x - 4, 27, -4.5);
      p.kneeR = j(8, 14, 5);
      p.kneeL = j(-11, 14, -5);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'KNOCKDOWN':
    case 'DEFEAT': {
      const shZ = Math.abs(p.shoulderR.z);
      if (f.y < -3) {
        p.pitchZ = Math.min(Math.PI * 0.46, progress * Math.PI * 0.9);
        p.pelvis = j(0, 28, 0);
        p.waist = j(-4, 34, 0);
        p.chest = j(-8, 40, 0);
        p.neck = j(-11, 44, 0);
        p.head = j(-14, 48, 0);

        p.shoulderR = j(-6.5, 39.5, shZ);
        p.elbowR = j(-2, 34, shZ + 2);
        p.wristR = j(5, 39, shZ + 3);

        p.shoulderL = j(-9.5, 39.5, -shZ);
        p.elbowL = j(-14, 34, -shZ - 2);
        p.wristL = j(-18, 39, -shZ - 3);

        p.hipR = j(3, 27, 4.5);
        p.kneeR = j(12, 24, 5);
        p.ankleR = j(18, 16, 5);
        p.toeR = j(22.5, 13, 5);

        p.hipL = j(-3, 27, -4.5);
        p.kneeL = j(6, 21, -5);
        p.ankleL = j(12, 13, -5);
        p.toeL = j(16.5, 10, -5);
        return { pose: applyFullBodyTransform(p), trailSpec: null };
      }

      p.pelvis = j(-4, 6, 0);
      p.waist = j(-12, 6.5, 0);
      p.chest = j(-21, 7, 0);
      p.neck = j(-26, 7.5, 0);
      p.head = j(-32, 8, 0);

      p.shoulderR = j(-20, 8, 7);
      p.elbowR = j(-15, 5, 11);
      p.wristR = j(-9, 3, 12);

      p.shoulderL = j(-21, 7, -7);
      p.elbowL = j(-26, 4, -11);
      p.wristL = j(-32, 3, -10);

      p.hipR = j(-2, 6, 4);
      p.kneeR = j(10, 9, 5);
      p.ankleR = j(21, 4, 4);
      p.toeR = j(25, 8.5, 4);

      p.hipL = j(-3, 5, -4);
      p.kneeL = j(8, 5, -6);
      p.ankleL = j(19, 3, -5);
      p.toeL = j(23, 7, -5);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'WAKEUP': {
      const shZ = Math.abs(p.shoulderR.z);
      p.pitchZ = (1 - progress) * Math.PI * 1.5;
      const py = lerp(16, 31, progress);
      p.pelvis = j(0, py, 0);
      p.waist = j(1, py + 8, 0);
      p.chest = j(2, py + 16, 0);
      p.neck = j(2, py + 21, 0);
      p.head = j(3, py + 27, 0);

      p.shoulderR = j(3.5, py + 15.5, shZ);
      p.elbowR = j(8, py + 8, shZ + 1.5);
      p.wristR = j(13, py + 14, shZ * 0.7);

      p.shoulderL = j(0.5, py + 15.5, -shZ);
      p.elbowL = j(-5, py + 8, -shZ - 1.5);
      p.wristL = j(1, py + 13, -shZ * 0.7);

      p.hipR = j(4, py - 1, 4.5);
      p.kneeR = j(12, py - 8, 5);
      p.ankleR = j(8, Math.max(3, py - 18), 5);
      p.toeR = j(13.5, Math.max(1, py - 20), 5);

      p.hipL = j(-4, py - 1, -4.5);
      p.kneeL = j(-8, py - 10, -5);
      p.ankleL = j(-11, Math.max(3, py - 18), -5);
      p.toeL = j(-5.5, Math.max(1, py - 20), -5);
      return { pose: applyFullBodyTransform(p), trailSpec: null };
    }

    case 'TAUNT': {
      const wave = Math.sin(f.actionFrame * 0.32);
      if (f.id === 'malakor') {
        p.chest = j(3, 53 + wave * 1.5, 0);
        p.head = j(1, 66 + wave * 2, 0);
        p.shoulderR = j(4.5, 52 + wave * 1.5, 9.2);
        p.shoulderL = j(1.5, 52 + wave * 1.5, -9.2);
        p.elbowR = j(6, 54, 14);
        p.wristR = j(12, 64, 18);
        p.elbowL = j(-4, 54, -14);
        p.wristL = j(-8, 64, -18);
        p.auraRadius = 15;
      } else if (f.id === 'titan') {
        p.spinY = -0.35;
        p.elbowR = j(4, 52, 15);
        p.wristR = j(4, 64, 12);
        p.elbowL = j(-2, 52, -15);
        p.wristL = j(-2, 64, -12);
      } else {
        p.elbowR = j(12, 43, 6);
        p.wristR = j(21 + wave * 2.5, 50, 4);
        p.wristL = j(-4, 44, -6);
      }
      return { pose: applyFullBodyTransform(p), trailSpec: null };
    }

    case 'DIZZY': {
      const shZ = Math.abs(p.shoulderR.z);
      const swayX = Math.sin(globalFrame * 0.18) * 5.5;
      const swayZ = Math.cos(globalFrame * 0.18) * 3.5;
      p.pelvis = j(swayX * 0.4, 28, swayZ * 0.4);
      p.waist = j(swayX * 0.7, 36, swayZ * 0.7);
      p.chest = j(swayX, 44, swayZ);
      p.neck = j(swayX * 1.2, 49, swayZ);
      p.head = j(swayX * 1.5, 55, swayZ * 1.2);

      p.shoulderR = j(swayX + 1.5, 43.5, shZ + swayZ);
      p.elbowR = j(swayX + 6, 34, 9);
      p.wristR = j(swayX + 9, 24, 10);
      p.shoulderL = j(swayX - 1.5, 43.5, -shZ + swayZ);
      p.elbowL = j(swayX - 6, 34, -9);
      p.wristL = j(swayX - 9, 24, -10);
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'FINISHER': {
      const shZ = Math.abs(p.shoulderR.z);
      p.auraRadius = 26;
      p.waist = j(3, 41, 0);
      p.chest = j(6, 52, 0);
      p.neck = j(6.5, 58, 0);
      p.head = j(7, 64, 0);
      p.shoulderR = j(7.5, 51, shZ);
      p.shoulderL = j(4.5, 51, -shZ);
      p.elbowR = j(18, 50, 6);
      p.wristR = j(29, 50, 4);
      p.elbowL = j(17, 51, -6);
      p.wristL = j(27, 52, -4);
      if (f.id === 'krowen') p.weaponDrawn = 'KATANA';
      if (f.id === 'meilin') p.weaponDrawn = 'FAN_OPEN';
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'FINISHER_VICTIM': {
      const lift = Math.min(22, f.actionFrame * 0.35);
      const jitter = Math.sin(globalFrame * 1.7) * 2.5;
      p.xrayShock = globalFrame % 6 < 3;
      const py = 32 + lift;
      p.pelvis = j(jitter, py, 0);
      p.waist = j(jitter - 3, py + 8, 0);
      p.chest = j(jitter - 6, py + 17, 0);
      p.neck = j(jitter - 8, py + 22, 0);
      p.head = j(jitter - 11, py + 29, 0);

      p.shoulderR = j(jitter - 5, py + 17, 8);
      p.elbowR = j(jitter - 6, py + 23, 12);
      p.wristR = j(jitter - 8, py + 30, 14);

      p.shoulderL = j(jitter - 7, py + 17, -8);
      p.elbowL = j(jitter - 10, py + 23, -12);
      p.wristL = j(jitter - 12, py + 30, -14);

      p.hipR = j(jitter + 3, py - 1, 5);
      p.kneeR = j(jitter + 5, py - 13, 6);
      p.ankleR = j(jitter + 3, py - 24, 6);
      p.toeR = j(jitter + 7.5, py - 27, 6);

      p.hipL = j(jitter - 4, py - 1, -5);
      p.kneeL = j(jitter - 5, py - 13, -6);
      p.ankleL = j(jitter - 7, py - 24, -6);
      p.toeL = j(jitter - 2.5, py - 27, -6);

      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
    }

    case 'VICTORY': {
      p.spinY = -0.32;
      if (f.id === 'kenji') {
        p.elbowR = j(8, 58, 8);
        p.wristR = j(9, 75, 5);
        p.wristL = j(-6, 38, -7);
      } else if (f.id === 'meilin') {
        p.weaponDrawn = 'FAN_OPEN';
        p.wristR = j(18, 58, 6);
        p.hipR = j(4, 30, 4.5);
        p.kneeR = j(14, 28, 5);
        p.ankleR = j(8, 18, 5);
        p.toeR = j(12.5, 14.5, 5);
      } else {
        p.elbowR = j(8, 58, 10);
        p.wristR = j(12, 73, 8);
        p.elbowL = j(-6, 56, -10);
        p.wristL = j(-8, 71, -8);
        p.auraRadius = 14;
      }
      return { pose: applyFullBodyTransform(p), trailSpec: null };
    }

    default:
      return { pose: enforceAnatomicalIntegrity(p), trailSpec: null };
  }
}

/**
 * Génère la posture squelettique 3D/2D complète ET échantillonne dynamiquement la vraie trajectoire
 * progressive parcourue par le poing, le pied ou la lame (jamais devant le membre, jamais statique).
 */
export function computeFighterPose(
  f: FighterRuntime,
  globalFrame: number,
  accentColor: string
): FighterPoseSkeleton {
  const progress = f.actionTotalFrames > 0 ? clamp01(f.actionFrame / f.actionTotalFrames) : 0;
  const { pose, trailSpec } = computePoseCore(f, progress, globalFrame, accentColor);

  if (
    trailSpec &&
    progress > trailSpec.swingStart + 0.015 &&
    progress < trailSpec.fadeEnd
  ) {
    const headP = Math.min(progress, trailSpec.swingEnd);
    const fadeRatio =
      progress <= trailSpec.swingEnd
        ? 1.0
        : clamp01(1 - (progress - trailSpec.swingEnd) / Math.max(0.01, trailSpec.fadeEnd - trailSpec.swingEnd));

    const maxSpan = trailSpec.span ?? 0.22;
    const activeSpan = maxSpan * (0.35 + 0.65 * fadeRatio);
    const tailP = Math.max(trailSpec.swingStart, headP - activeSpan);

    if (headP - tailP > 0.012 && fadeRatio > 0.06) {
      const sampleCount = 7;
      const pts: Joint3D[] = [];
      for (let i = 0; i <= sampleCount; i++) {
        const s = tailP + ((headP - tailP) * i) / sampleCount;
        const sub =
          i === sampleCount && progress <= trailSpec.swingEnd
            ? pose
            : computePoseCore(f, s, globalFrame, accentColor).pose;
        pts.push(getStrikeExtremityPoint(sub, trailSpec.part));
      }

      // Vérifie qu'il y a un vrai déplacement spatial avant d'afficher la traînée
      const first = pts[0];
      const last = pts[pts.length - 1];
      const travelDist = Math.hypot(last.x - first.x, last.y - first.y, (last.z - first.z) * 0.4);
      if (travelDist >= 2.2) {
        pose.progressiveTrail = {
          points: pts,
          width: trailSpec.width,
          color: trailSpec.color,
          alpha: fadeRatio,
          isWeapon: trailSpec.part === 'KATANA_TIP' || trailSpec.part === 'FAN_EDGE',
        };
      }
    }
  }

  return pose;
}
