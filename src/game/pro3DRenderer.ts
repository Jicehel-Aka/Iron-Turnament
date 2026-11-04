import { FIGHTERS } from '../data/fighters';
import {
  FighterDefinition,
  FighterRuntime,
  MatchEngineState,
  StageDefinition,
} from '../types/game';
import { ARENA_HEIGHT, ARENA_WIDTH, STAGE_WORLD_WIDTH } from './engine';
import { FighterPoseSkeleton, Joint3D, computeFighterPose } from './poseRig';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface PolyFace3D {
  pts: Array<{ sx: number; sy: number }>;
  depth: number;
  fillStyle: string;
  strokeStyle?: string;
}

const FOV_3D = 235;
const CAM_Y_3D = 44;
const CAM_Z_3D = -18;
const FIGHTER_PLANE_Z = 148;
const HORIZON_SCREEN_Y = 122;

function parseHexRGB(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) || 128,
    parseInt(clean.slice(2, 4), 16) || 128,
    parseInt(clean.slice(4, 6), 16) || 128,
  ];
}

// Quantifie une couleur RGB888 en vrai BGR565 16-bit de la Gamebuino AKA (ESP32-S3)
function toBGR565Css(r: number, g: number, b: number, alpha = 1): string {
  const r5 = Math.min(255, Math.max(0, Math.round(r))) & 0xf8;
  const g6 = Math.min(255, Math.max(0, Math.round(g))) & 0xfc;
  const b5 = Math.min(255, Math.max(0, Math.round(b))) & 0xf8;
  if (alpha < 0.99) {
    return `rgba(${r5},${g6},${b5},${alpha.toFixed(2)})`;
  }
  return `rgb(${r5},${g6},${b5})`;
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function projectWorld(
  p: Vec3,
  camX: number,
  camY: number
): { sx: number; sy: number; dz: number } | null {
  const dz = p.z - CAM_Z_3D;
  if (dz <= 14) return null;
  const scale = FOV_3D / dz;
  return {
    sx: ARENA_WIDTH * 0.5 + (p.x - camX) * scale,
    sy: HORIZON_SCREEN_Y - (p.y - camY) * scale,
    dz,
  };
}

const KEY_LIGHT = normalize3({ x: -0.36, y: 0.78, z: -0.51 });
const RIM_LIGHT = normalize3({ x: 0.48, y: 0.34, z: 0.81 });

function shadePolygonBGR565(
  normal: Vec3,
  baseHex: string,
  accentHex: string,
  metallic = 0.15,
  alpha = 1
): { fill: string; creaseStroke: string } {
  const [br, bg, bb] = parseHexRGB(baseHex);
  const [ar, ag, ab] = parseHexRGB(accentHex);

  const ndotl = Math.max(0, dot3(normal, KEY_LIGHT));
  const rim = Math.pow(Math.max(0, dot3(normal, RIM_LIGHT)), 2.4) * (0.16 + metallic * 0.28);
  const spec = metallic > 0.28 ? Math.pow(ndotl, 7) * metallic * 75 : 0;

  // Ombrage doux et progressif sans contraste brutal sur les tranches
  const viewDot = Math.abs(normal.z);
  const edgeContour = 0.82 + viewDot * 0.18;

  const hemi = 0.50 + Math.max(0, normal.y) * 0.16;
  const diff = (hemi + ndotl * 0.50) * edgeContour;

  const r = br * diff + ar * rim + spec;
  const g = bg * diff + ag * rim + spec;
  const b = bb * diff + ab * rim + spec;

  return {
    fill: toBGR565Css(r, g, b, alpha),
    creaseStroke: toBGR565Css(r * 0.72, g * 0.72, b * 0.76, alpha),
  };
}

function pushQuad3D(
  faces: PolyFace3D[],
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  camX: number,
  camY: number,
  baseHex: string,
  accentHex: string,
  metallic = 0.15,
  alpha = 1,
  doubleSided = false,
  withCrease = false
): void {
  const s0 = projectWorld(p0, camX, camY);
  const s1 = projectWorld(p1, camX, camY);
  const s2 = projectWorld(p2, camX, camY);
  const s3 = projectWorld(p3, camX, camY);
  if (!s0 || !s1 || !s2 || !s3) return;

  const area2D =
    (s1.sx - s0.sx) * (s2.sy - s0.sy) - (s1.sy - s0.sy) * (s2.sx - s0.sx);
  if (!doubleSided && area2D > 0.5) return;

  const e1 = sub3(p1, p0);
  const e2 = sub3(p2, p0);
  let normal = normalize3(cross3(e1, e2));
  if (doubleSided && area2D > 0) {
    normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  }

  const shaded = shadePolygonBGR565(normal, baseHex, accentHex, metallic, alpha);
  const depth = (s0.dz + s1.dz + s2.dz + s3.dz) * 0.25;

  faces.push({
    pts: [
      { sx: s0.sx, sy: s0.sy },
      { sx: s1.sx, sy: s1.sy },
      { sx: s2.sx, sy: s2.sy },
      { sx: s3.sx, sy: s3.sy },
    ],
    depth,
    fillStyle: shaded.fill,
    strokeStyle: withCrease ? shaded.creaseStroke : undefined,
  });
}

/**
 * Segment anatomique 3D à profil galbé (2 anneaux intermédiaires ou fuselés) sans couture aux articulations.
 */
function push3DTaperedLimb(
  faces: PolyFace3D[],
  a: Vec3,
  b: Vec3,
  rA: number,
  rB: number,
  sides: number,
  camX: number,
  camY: number,
  baseHex: string,
  accentHex: string,
  metallic = 0.15,
  alpha = 1,
  scaleZ = 1.0,
  midBulge = 1.04
): void {
  const dir = sub3(b, a);
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < 0.35) return;

  const T = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const ref = Math.abs(T.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const N = normalize3(cross3(T, ref));
  const B = normalize3(cross3(T, N));

  const mid: Vec3 = {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
  };
  const rM = (rA + rB) * 0.5 * midBulge;

  const ringA: Vec3[] = [];
  const ringM: Vec3[] = [];
  const ringB: Vec3[] = [];

  for (let i = 0; i < sides; i++) {
    const ang = (i / sides) * Math.PI * 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang) * scaleZ;
    const ox = N.x * ca + B.x * sa;
    const oy = N.y * ca + B.y * sa;
    const oz = N.z * ca + B.z * sa;

    ringA.push({ x: a.x + ox * rA, y: a.y + oy * rA, z: a.z + oz * rA });
    ringM.push({ x: mid.x + ox * rM, y: mid.y + oy * rM, z: mid.z + oz * rM });
    ringB.push({ x: b.x + ox * rB, y: b.y + oy * rB, z: b.z + oz * rB });
  }

  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    pushQuad3D(faces, ringA[i], ringA[next], ringM[next], ringM[i], camX, camY, baseHex, accentHex, metallic, alpha, true);
    pushQuad3D(faces, ringM[i], ringM[next], ringB[next], ringB[i], camX, camY, baseHex, accentHex, metallic, alpha, true);
  }
}

/**
 * Rotule sphérique octogonale 3D fermant proprement les épaules, genoux et coudes lors des fortes flexions.
 */
function push3DJointCap(
  faces: PolyFace3D[],
  center: Vec3,
  radius: number,
  camX: number,
  camY: number,
  baseHex: string,
  accentHex: string,
  metallic = 0.14,
  alpha = 1
): void {
  const bot = { x: center.x, y: center.y - radius * 0.72, z: center.z };
  const top = { x: center.x, y: center.y + radius * 0.72, z: center.z };
  push3DTaperedLimb(faces, bot, top, radius * 0.68, radius * 0.68, 8, camX, camY, baseHex, accentHex, metallic, alpha, 1.0, 1.22);
}

/**
 * Construit le maillage 3D Volumétrique Pro d'un combattant (Zéro reflet fantôme inversé !).
 */
function appendFighter3DMesh(
  faces: PolyFace3D[],
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  camX: number,
  camY: number,
  globalFrame: number
): void {
  const worldOriginX = (f.x - STAGE_WORLD_WIDTH * 0.5) * 1.05;
  const jumpHeight = -f.y * 0.92;
  const alpha = pose.teleportFade > 0 ? 0.35 : 1.0;

  const toW = (j: Joint3D): Vec3 => ({
    x: worldOriginX + j.x * f.facing * 0.92,
    y: jumpHeight + j.y * 0.92,
    z: FIGHTER_PLANE_Z - j.z * 0.95,
  });

  const isTitan = f.id === 'titan';
  const isMalakor = f.id === 'malakor';

  const pantsCol =
    pose.xrayShock
      ? '#38BDF8'
      : isTitan
      ? '#334155'
      : f.id === 'meilin'
      ? '#065F46'
      : f.id === 'nyxia'
      ? '#78350F'
      : f.id === 'krowen'
      ? '#1E293B'
      : def.primaryColor;

  const torsoCol = pose.xrayShock
    ? '#E0F2FE'
    : isTitan
    ? def.skinColor
    : def.primaryColor;

  const sleeveCol =
    pose.xrayShock
      ? '#38BDF8'
      : f.id === 'kenji' || isTitan || f.id === 'nyxia'
      ? def.skinColor
      : def.primaryColor;

  const bootCol =
    f.id === 'kenji'
      ? def.skinColor
      : f.id === 'meilin'
      ? '#F8FAFC'
      : isMalakor
      ? '#B45309'
      : '#1E293B';

  const greaveCol =
    f.id === 'kenji'
      ? pantsCol
      : f.id === 'krowen' || f.id === 'nyxia'
      ? '#B45309'
      : isMalakor
      ? '#D97706'
      : isTitan
      ? '#475569'
      : bootCol;

  const legSides = 8;
  const thighR = isTitan ? 5.8 : isMalakor ? 5.1 : 4.3;
  const shinR = isTitan ? 4.7 : 3.5;
  const armR = isTitan ? 5.1 : isMalakor ? 4.3 : 3.4;

  // 1. Jambes 3D complètes avec rotules de genoux et grèves/bottes
  for (const leg of [
    { hip: pose.hipL, knee: pose.kneeL, ankle: pose.ankleL, toe: pose.toeL },
    { hip: pose.hipR, knee: pose.kneeR, ankle: pose.ankleR, toe: pose.toeR },
  ]) {
    const wHip = toW(leg.hip);
    const wKnee = toW(leg.knee);
    const wAnkle = toW(leg.ankle);
    const wToe = toW(leg.toe);
    const wMidShin: Vec3 = {
      x: (wKnee.x + wAnkle.x) * 0.5,
      y: (wKnee.y + wAnkle.y) * 0.5,
      z: (wKnee.z + wAnkle.z) * 0.5,
    };

    push3DTaperedLimb(faces, toW(pose.pelvis), wHip, thighR * 1.08, thighR, 6, camX, camY, pantsCol, def.accentColor, 0.12, alpha);
    push3DTaperedLimb(faces, wHip, wKnee, thighR, shinR * 1.04, legSides, camX, camY, pantsCol, def.accentColor, 0.12, alpha, 1.0, 1.12);
    push3DJointCap(faces, wKnee, shinR * 0.98, camX, camY, pantsCol, def.accentColor, 0.18, alpha);
    push3DTaperedLimb(faces, wKnee, wMidShin, shinR, shinR * 1.02, legSides, camX, camY, pantsCol, def.accentColor, 0.15, alpha);
    push3DTaperedLimb(faces, wMidShin, wAnkle, shinR * 1.0, shinR * 0.78, legSides, camX, camY, greaveCol, def.accentColor, 0.45, alpha);
    push3DTaperedLimb(faces, wAnkle, wToe, shinR * 0.9, shinR * 0.68, 6, camX, camY, bootCol, def.accentColor, 0.35, alpha);
  }

  // 2. Bassin, Ceinture & Torse Sculpté en V
  const hipR3D = isTitan ? 9.0 : isMalakor ? 7.8 : f.id === 'meilin' ? 6.0 : 6.4;
  const waistR3D = hipR3D * 0.86;
  const chestR3D = isTitan ? 12.8 : isMalakor ? 11.0 : f.id === 'meilin' ? 7.6 : 9.2;

  push3DTaperedLimb(
    faces,
    toW(pose.pelvis),
    toW(pose.waist),
    hipR3D,
    waistR3D,
    8,
    camX,
    camY,
    f.id === 'meilin' ? '#DC2626' : def.secondaryColor,
    def.accentColor,
    0.45,
    alpha,
    0.72
  );

  push3DTaperedLimb(
    faces,
    toW(pose.waist),
    toW(pose.chest),
    waistR3D * 1.02,
    chestR3D,
    10,
    camX,
    camY,
    torsoCol,
    def.accentColor,
    isMalakor ? 0.58 : 0.16,
    alpha,
    0.66,
    1.08
  );

  // Pan de tunique 3D pour Mei-Lin ou Nyxia
  if (f.id === 'meilin' || f.id === 'nyxia') {
    const pelW = toW(pose.pelvis);
    const wave = Math.sin(globalFrame * 0.24) * 2.5;
    const sTopL = { x: pelW.x - 4, y: pelW.y + 1, z: pelW.z - 4.5 };
    const sTopR = { x: pelW.x + 4, y: pelW.y + 1, z: pelW.z - 4.5 };
    const sBotR = { x: pelW.x + 5 + wave, y: pelW.y - 12, z: pelW.z - 5.5 };
    const sBotL = { x: pelW.x - 4 + wave * 0.5, y: pelW.y - 12, z: pelW.z - 5.5 };
    pushQuad3D(faces, sTopL, sTopR, sBotR, sBotL, camX, camY, f.id === 'meilin' ? def.primaryColor : '#0E7490', '#FBBF24', 0.25, alpha, true);
  }

  // Épaulières 3D métalliques / Deltoïdes sculptés
  const shLW = toW(pose.shoulderL);
  const shRW = toW(pose.shoulderR);
  if (isMalakor || f.id === 'nyxia' || f.id === 'krowen') {
    const pCol = isMalakor ? '#D97706' : '#B45309';
    push3DJointCap(faces, shLW, isMalakor ? 5.6 : 4.6, camX, camY, pCol, def.accentColor, 0.8, alpha);
    push3DJointCap(faces, shRW, isMalakor ? 5.6 : 4.6, camX, camY, pCol, def.accentColor, 0.8, alpha);
    if (isMalakor) {
      // Cornes sur les spallières 3D de Malakor !
      push3DTaperedLimb(faces, shLW, { x: shLW.x - 2, y: shLW.y + 8, z: shLW.z - 3 }, 1.6, 0.3, 5, camX, camY, '#FDE68A', '#C084FC', 0.85, alpha);
      push3DTaperedLimb(faces, shRW, { x: shRW.x - 2, y: shRW.y + 8, z: shRW.z + 3 }, 1.6, 0.3, 5, camX, camY, '#FDE68A', '#C084FC', 0.85, alpha);
    }
  } else {
    push3DJointCap(faces, shLW, armR * 1.12, camX, camY, f.id === 'kenji' ? def.primaryColor : sleeveCol, def.accentColor, 0.15, alpha);
    push3DJointCap(faces, shRW, armR * 1.12, camX, camY, f.id === 'kenji' ? def.primaryColor : sleeveCol, def.accentColor, 0.15, alpha);
  }

  // Cape royale 3D articulée à 2 segments (Malakor & Krowen)
  if (isMalakor || f.id === 'krowen') {
    const cL = toW({ x: pose.chest.x - 4, y: pose.chest.y, z: -7 });
    const cR = toW({ x: pose.chest.x - 4, y: pose.chest.y, z: 7 });
    const wave = Math.sin(globalFrame * 0.2) * 5;
    const mL = toW({ x: pose.waist.x - 10 - wave * 0.4, y: pose.waist.y - 4, z: -9 });
    const mR = toW({ x: pose.waist.x - 10 - wave * 0.4, y: pose.waist.y - 4, z: 9 });
    const bL = toW({ x: pose.pelvis.x - 17 - wave, y: Math.max(4, pose.pelvis.y - 21), z: -11 });
    const bR = toW({ x: pose.pelvis.x - 17 - wave, y: Math.max(4, pose.pelvis.y - 21), z: 11 });
    const capeHex = isMalakor ? '#7F1D1D' : '#1E293B';
    pushQuad3D(faces, cL, cR, mR, mL, camX, camY, capeHex, def.accentColor, 0.12, alpha, true);
    pushQuad3D(faces, mL, mR, bR, bL, camX, camY, capeHex, def.accentColor, 0.12, alpha, true);
  }

  // 3. Bras, Coudes, Brassards & Gantelets / Poings 3D
  const gloveCol =
    isTitan
      ? '#64748B'
      : f.id === 'kenji'
      ? '#DC2626'
      : isMalakor
      ? '#7E22CE'
      : f.id === 'krowen'
      ? '#B45309'
      : def.skinColor;
  const gloveR = isTitan ? 6.2 : 3.8;
  const gloveMetal = isTitan || isMalakor ? 0.82 : 0.25;

  for (const arm of [
    { sh: shLW, el: toW(pose.elbowL), wr: toW(pose.wristL), lead: false },
    { sh: shRW, el: toW(pose.elbowR), wr: toW(pose.wristR), lead: true },
  ]) {
    push3DTaperedLimb(faces, toW(pose.chest), arm.sh, armR * 1.14, armR * 1.05, 6, camX, camY, sleeveCol, def.accentColor, 0.14, alpha);
    push3DTaperedLimb(faces, arm.sh, arm.el, armR * 1.05, armR * 0.88, legSides, camX, camY, sleeveCol, def.accentColor, 0.15, alpha, 1.0, 1.12);
    push3DJointCap(faces, arm.el, armR * 0.88, camX, camY, sleeveCol, def.accentColor, 0.15, alpha);
    push3DTaperedLimb(
      faces,
      arm.el,
      arm.wr,
      armR * 0.9,
      isTitan ? armR * 1.25 : armR * 0.78,
      legSides,
      camX,
      camY,
      isTitan ? '#475569' : sleeveCol,
      def.accentColor,
      isTitan ? 0.75 : 0.2,
      alpha
    );
    push3DTaperedLimb(
      faces,
      arm.wr,
      { x: arm.wr.x + f.facing * 3.8, y: arm.wr.y, z: arm.wr.z },
      gloveR,
      gloveR * 0.82,
      7,
      camX,
      camY,
      arm.lead && pose.auraRadius > 0 ? def.accentColor : gloveCol,
      def.accentColor,
      gloveMetal,
      alpha
    );
  }

  // Arme 3D en main droite
  const wR = toW(pose.wristR);
  if (pose.weaponDrawn === 'KATANA') {
    const guard = { x: wR.x + f.facing * 1.5, y: wR.y + 1, z: wR.z };
    const tip = toW({
      x: pose.wristR.x + 25,
      y: pose.wristR.y + 14,
      z: pose.wristR.z,
    });
    push3DJointCap(faces, guard, 2.8, camX, camY, '#F59E0B', '#F97316', 0.85, 1);
    push3DTaperedLimb(faces, guard, tip, 1.5, 0.35, 4, camX, camY, '#F8FAFC', '#F97316', 0.92, 1);
  } else if (pose.weaponDrawn === 'FAN_OPEN') {
    const f1 = toW({ x: pose.wristR.x + 10, y: pose.wristR.y + 9, z: pose.wristR.z - 2 });
    const f2 = toW({ x: pose.wristR.x + 12, y: pose.wristR.y + 2, z: pose.wristR.z + 2 });
    const f3 = toW({ x: pose.wristR.x + 9, y: pose.wristR.y - 4, z: pose.wristR.z + 4 });
    pushQuad3D(faces, wR, f1, f2, f3, camX, camY, '#E2E8F0', '#10B981', 0.85, 1, true, true);
  }

  // 4. Tête Sculptée 3D + Visage / Masque / Casque / Coiffure
  const neckW = toW(pose.neck);
  const headCenter = toW(pose.head);
  const headTop = { x: headCenter.x, y: headCenter.y + 5.2, z: headCenter.z };
  const headChin = { x: headCenter.x + f.facing * 1.4, y: headCenter.y - 4.4, z: headCenter.z };

  push3DTaperedLimb(faces, neckW, headChin, 3.1, 3.8, 7, camX, camY, def.skinColor, def.accentColor, 0.1, alpha);
  push3DTaperedLimb(
    faces,
    headChin,
    headTop,
    5.1,
    5.6,
    9,
    camX,
    camY,
    f.id === 'krowen' ? '#D97706' : def.skinColor,
    def.accentColor,
    f.id === 'krowen' ? 0.65 : 0.15,
    alpha,
    0.86,
    1.08
  );

  // Coiffure / Capuche / Heaume 3D
  const crownTop = { x: headTop.x - f.facing * 1.4, y: headTop.y + 3.8, z: headTop.z };
  const hairCol =
    f.id === 'nyxia'
      ? '#F1F5F9'
      : isMalakor
      ? '#B45309'
      : f.id === 'titan'
      ? '#27170F'
      : '#0F172A';

  push3DTaperedLimb(faces, headTop, crownTop, 5.9, 3.2, 8, camX, camY, hairCol, def.accentColor, isMalakor ? 0.82 : 0.2, alpha);

  if (f.id === 'kenji') {
    const bandMid = { x: headTop.x, y: headTop.y - 1.3, z: headTop.z };
    push3DTaperedLimb(faces, bandMid, headTop, 6.0, 6.0, 8, camX, camY, '#DC2626', '#EF4444', 0.2, 1);
    const tailTip = toW({
      x: pose.head.x - 16,
      y: pose.head.y + Math.sin(globalFrame * 0.25) * 3.5,
      z: pose.head.z + 2.5,
    });
    push3DTaperedLimb(faces, bandMid, tailTip, 1.7, 0.5, 4, camX, camY, '#DC2626', '#DC2626', 0.1, 1);
  } else if (f.id === 'meilin') {
    const bun = toW({ x: pose.head.x - 5, y: pose.head.y + 4, z: pose.head.z });
    const tail = toW({ x: pose.head.x - 15, y: pose.head.y - 4 + Math.sin(globalFrame * 0.24) * 3, z: pose.head.z + 2 });
    push3DJointCap(faces, bun, 3.2, camX, camY, '#0F172A', '#FBBF24', 0.2, 1);
    push3DTaperedLimb(faces, bun, tail, 2.2, 0.5, 5, camX, camY, '#0F172A', '#0F172A', 0.15, 1);
  } else if (isMalakor) {
    const hornL = { x: headTop.x - 2, y: headTop.y + 11.5, z: headTop.z - 6 };
    const hornR = { x: headTop.x - 2, y: headTop.y + 11.5, z: headTop.z + 6 };
    push3DTaperedLimb(faces, headTop, hornL, 2.0, 0.35, 5, camX, camY, '#FDE68A', '#C084FC', 0.88, 1);
    push3DTaperedLimb(faces, headTop, hornR, 2.0, 0.35, 5, camX, camY, '#FDE68A', '#C084FC', 0.88, 1);
  }

  // 5. Ruban 3D progressif de traînée d'attaque (suit strictement la trajectoire parcourue derrière le membre)
  if (pose.progressiveTrail && pose.progressiveTrail.points.length >= 2) {
    const tr = pose.progressiveTrail;
    const ptsW = tr.points.map(toW);
    for (let i = 0; i < ptsW.length - 1; i++) {
      const t0 = i / (ptsW.length - 1);
      const t1 = (i + 1) / (ptsW.length - 1);
      const w0 = tr.width * 0.45 * Math.sin(t0 * Math.PI * 0.85);
      const w1 = tr.width * 0.45 * Math.sin(t1 * Math.PI * 0.85);
      const a0 = ptsW[i];
      const a1 = ptsW[i + 1];
      const q0 = { x: a0.x, y: a0.y + w0, z: a0.z + 2 };
      const q1 = { x: a1.x, y: a1.y + w1, z: a1.z + 2 };
      const q2 = { x: a1.x, y: a1.y - w1, z: a1.z + 2 };
      const q3 = { x: a0.x, y: a0.y - w0, z: a0.z + 2 };
      pushQuad3D(faces, q0, q1, q2, q3, camX, camY, tr.color, '#FFFFFF', 0.6, 0.72 * tr.alpha * t1, true);
    }
  }
}

/**
 * Construit le décor architectural 3D complet de l'arène (Dalles 3D, Bordure de Ring, Colonnes Octogonales & Braseros).
 */
function append3DStageArchitecture(
  faces: PolyFace3D[],
  stage: StageDefinition,
  camX: number,
  camY: number,
  frame: number
): void {
  const zNear = 104;
  const zFar = 244;
  const rows = 5;
  const cols = 16;
  const halfArenaW = 385;

  const [mr, mg, mb] = parseHexRGB(stage.floorMain);
  const [tr, tg, tb] = parseHexRGB(stage.floorTrim);

  for (let r = 0; r < rows; r++) {
    const z0 = zNear + ((zFar - zNear) * r) / rows;
    const z1 = zNear + ((zFar - zNear) * (r + 1)) / rows;
    const fogFactor = 1 - (r / rows) * 0.42;

    for (let c = 0; c < cols; c++) {
      const x0 = -halfArenaW + ((halfArenaW * 2) * c) / cols;
      const x1 = -halfArenaW + ((halfArenaW * 2) * (c + 1)) / cols;

      const s0 = projectWorld({ x: x0, y: 0, z: z0 }, camX, camY);
      const s1 = projectWorld({ x: x1, y: 0, z: z0 }, camX, camY);
      const s2 = projectWorld({ x: x1, y: 0, z: z1 }, camX, camY);
      const s3 = projectWorld({ x: x0, y: 0, z: z1 }, camX, camY);
      if (!s0 || !s1 || !s2 || !s3) continue;

      const isBorder = r === 1;
      const checker = (r + c) % 2 === 0 ? 1.06 : 0.88;

      const fill = isBorder
        ? toBGR565Css(
            (mr * 0.72 + tr * 0.28) * fogFactor,
            (mg * 0.72 + tg * 0.28) * fogFactor,
            (mb * 0.72 + tb * 0.28) * fogFactor,
            0.92
          )
        : toBGR565Css(mr * checker * fogFactor, mg * checker * fogFactor, mb * checker * fogFactor, 0.92);

      faces.push({
        pts: [
          { sx: s0.sx, sy: s0.sy },
          { sx: s1.sx, sy: s1.sy },
          { sx: s2.sx, sy: s2.sy },
          { sx: s3.sx, sy: s3.sy },
        ],
        depth: (z0 + z1) * 0.5 + 40,
        fillStyle: fill,
        strokeStyle: toBGR565Css(tr * 0.45, tg * 0.45, tb * 0.45, 0.32),
      });
    }
  }

  const pillarPositions = [
    { x: -275, z: 186, h: 90 },
    { x: 275, z: 186, h: 90 },
    { x: -165, z: 194, h: 94 },
    { x: 165, z: 194, h: 94 },
    { x: -82, z: 228, h: 105 },
    { x: 82, z: 228, h: 105 },
  ];

  const colHex =
    stage.id === 'kyoto_dojo'
      ? '#7C2D12'
      : stage.id === 'brass_citadel'
      ? '#44403C'
      : stage.id === 'atacama_sanctuary'
      ? '#92400E'
      : '#334155';

  for (const pil of pillarPositions) {
    push3DTaperedLimb(faces, { x: pil.x, y: 0, z: pil.z }, { x: pil.x, y: 12, z: pil.z }, 13, 10, 6, camX, camY, stage.floorTrim, stage.accentHex, 0.45);
    push3DTaperedLimb(faces, { x: pil.x, y: 12, z: pil.z }, { x: pil.x, y: pil.h, z: pil.z }, 9.5, 8.5, 8, camX, camY, colHex, stage.accentHex, 0.3);
    push3DTaperedLimb(faces, { x: pil.x, y: pil.h, z: pil.z }, { x: pil.x, y: pil.h + 9, z: pil.z }, 9, 13.5, 6, camX, camY, stage.floorTrim, stage.accentHex, 0.55);
  }

  const flamePulse = 10 + Math.sin(frame * 0.35) * 3;
  for (const bx of [-225, -115, 115, 225]) {
    push3DTaperedLimb(faces, { x: bx, y: 0, z: 175 }, { x: bx, y: 20, z: 175 }, 5, 9, 6, camX, camY, '#475569', stage.accentHex, 0.7);
    push3DTaperedLimb(faces, { x: bx, y: 20, z: 175 }, { x: bx, y: 20 + flamePulse, z: 175 }, 6.5, 1.2, 5, camX, camY, stage.accentHex, '#FFFFFF', 0.9);
  }
}

/**
 * Rend toute la scène en Vraie 3D Volumétrique Pro 320x240 BGR565 (ESP32-S3) — Zéro reflet fantôme !
 */
export function renderFull3DProScene(
  ctx: CanvasRenderingContext2D,
  state: MatchEngineState,
  stage: StageDefinition,
  backdropImg: HTMLImageElement | null
): void {
  const midX = (state.p1.x + state.p2.x) * 0.5;
  const minFighterY = Math.min(state.p1.y, state.p2.y);
  const camX = (midX - STAGE_WORLD_WIDTH * 0.5) * 0.88;
  const camY = CAM_Y_3D + Math.max(0, -minFighterY * 0.28);

  if (state.darkSkyFlash > 0) {
    ctx.fillStyle = state.frame % 12 === 0 ? '#2E1065' : '#05060B';
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  } else if (backdropImg && backdropImg.complete && backdropImg.naturalWidth > 0) {
    const panX = ((midX / STAGE_WORLD_WIDTH) - 0.5) * 64;
    ctx.drawImage(backdropImg, -44 - panX, -10, ARENA_WIDTH + 88, 178);
    const horizonGrad = ctx.createLinearGradient(0, 118, 0, ARENA_HEIGHT);
    horizonGrad.addColorStop(0, 'rgba(9, 12, 20, 0.15)');
    horizonGrad.addColorStop(0.28, stage.skyBottom);
    horizonGrad.addColorStop(1, '#07090F');
    ctx.fillStyle = horizonGrad;
    ctx.fillRect(0, 118, ARENA_WIDTH, ARENA_HEIGHT - 118);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, ARENA_HEIGHT);
    sky.addColorStop(0, stage.skyTop);
    sky.addColorStop(1, stage.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  }

  const stageFaces: PolyFace3D[] = [];
  const fighterFaces: PolyFace3D[] = [];

  append3DStageArchitecture(stageFaces, stage, camX, camY, state.frame);

  const p1Def = FIGHTERS[state.p1.id];
  const p2Def = FIGHTERS[state.p2.id];
  const pose1 = computeFighterPose(state.p1, state.frame, p1Def.accentColor);
  const pose2 = computeFighterPose(state.p2, state.frame, p2Def.accentColor);

  stageFaces.sort((a, b) => b.depth - a.depth);
  for (let i = 0; i < stageFaces.length; i++) {
    const face = stageFaces[i];
    const pts = face.pts;
    ctx.fillStyle = face.fillStyle;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].sx, pts[k].sy);
    ctx.closePath();
    ctx.fill();
    if (face.strokeStyle) {
      ctx.strokeStyle = face.strokeStyle;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  }

  // Ombres de contact elliptiques ancrées au sol (sans reflet doublon !)
  for (const f of [state.p1, state.p2]) {
    const wx = (f.x - STAGE_WORLD_WIDTH * 0.5) * 1.05;
    const footProj = projectWorld({ x: wx, y: 0.2, z: FIGHTER_PLANE_Z }, camX, camY);
    if (footProj) {
      const shScale = Math.max(0.35, 1 + f.y / 115);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
      ctx.beginPath();
      ctx.ellipse(footProj.sx, footProj.sy, 18 * shScale, 4.4 * shScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  appendFighter3DMesh(fighterFaces, state.p1, p1Def, pose1, camX, camY, state.frame);
  appendFighter3DMesh(fighterFaces, state.p2, p2Def, pose2, camX, camY, state.frame);

  fighterFaces.sort((a, b) => b.depth - a.depth);
  for (let i = 0; i < fighterFaces.length; i++) {
    const face = fighterFaces[i];
    const pts = face.pts;
    ctx.fillStyle = face.fillStyle;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].sx, pts[k].sy);
    ctx.closePath();
    ctx.fill();
    if (face.strokeStyle) {
      ctx.strokeStyle = face.strokeStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  for (const f of [state.p1, state.p2]) {
    if (f.action === 'FINISHER' && f.actionFrame > 16) {
      const wx = (f.x - STAGE_WORLD_WIDTH * 0.5) * 1.05;
      const def = FIGHTERS[f.id];
      const chestProj = projectWorld(
        { x: wx + f.facing * 20, y: 44 - f.y * 0.9, z: FIGHTER_PLANE_Z },
        camX,
        camY
      );
      if (chestProj) {
        const beamH = 14 + Math.sin(state.frame * 0.9) * 4;
        ctx.fillStyle = def.accentColor;
        ctx.fillRect(
          f.facing === 1 ? chestProj.sx : chestProj.sx - 210,
          chestProj.sy - beamH * 0.5,
          210,
          beamH
        );
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(
          f.facing === 1 ? chestProj.sx : chestProj.sx - 210,
          chestProj.sy - beamH * 0.22,
          210,
          beamH * 0.44
        );
      }
    }
  }
}

/**
 * Rend un combattant 3D Volumétrique Pro isolé sur une vignette d'animation (Fiche Personnage)
 * avec rotules articulées et éclairage spéculaire BGR565, sans reflet parasite.
 */
export function drawStandalone3DFighter(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  targetCenterX: number,
  targetGroundY: number,
  globalFrame: number
): void {
  const def = FIGHTERS[f.id];
  const virtualFighter: FighterRuntime = {
    ...f,
    x: STAGE_WORLD_WIDTH * 0.5,
  };
  const pose = computeFighterPose(virtualFighter, globalFrame, def.accentColor);
  const faces: PolyFace3D[] = [];
  appendFighter3DMesh(faces, virtualFighter, def, pose, 0, CAM_Y_3D, globalFrame);
  faces.sort((a, b) => b.depth - a.depth);

  const footRef = projectWorld({ x: 0, y: 0, z: FIGHTER_PLANE_Z }, 0, CAM_Y_3D);
  const refSx = footRef ? footRef.sx : 160;
  const refSy = footRef ? footRef.sy : 184;

  ctx.save();
  ctx.translate(targetCenterX - refSx, targetGroundY - refSy);

  const shScale = Math.max(0.35, 1 + f.y / 115);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.beginPath();
  ctx.ellipse(refSx, refSy, 17 * shScale, 4.2 * shScale, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const pts = face.pts;
    ctx.fillStyle = face.fillStyle;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].sx, pts[k].sy);
    ctx.closePath();
    ctx.fill();
    if (face.strokeStyle) {
      ctx.strokeStyle = face.strokeStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  ctx.restore();
}
