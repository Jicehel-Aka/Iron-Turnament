import { FIGHTERS } from '../data/fighters';
import { FighterDefinition, FighterRuntime } from '../types/game';
import {
  FighterPoseSkeleton,
  Joint3D,
  ProgressiveTrailData,
  computeFighterPose,
} from './poseRig';

// Dimensions FIXES universelles de chaque cellule de sprite (alignées sur 16 pixels pour le DMA ESP32-S3)
// Garantit 0 pixel coupé sur les 6 combattants et les 29 animations (sauts, katanas, lariats, K.O. inclus).
export const SPRITE_CELL_W = 128;
export const SPRITE_CELL_H = 112;
export const SPRITE_ORIGIN_X = 60;
export const SPRITE_ORIGIN_Y = 98;
export const MAGENTA_KEY_HEX = '#FF00FF';

// Sur-échantillonnage interne 4x (512x448 -> 256x224 -> 128x112) : intégration de boîte 16 échantillons
const SS = 4;
const MID_W = SPRITE_CELL_W * 2;
const MID_H = SPRITE_CELL_H * 2;
const HI_W = SPRITE_CELL_W * SS;
const HI_H = SPRITE_CELL_H * SS;

let hiCanvas: HTMLCanvasElement | null = null;
let midCanvas: HTMLCanvasElement | null = null;
let midOutCanvas: HTMLCanvasElement | null = null;
let cellRawCanvas: HTMLCanvasElement | null = null;
let cellOutCanvas: HTMLCanvasElement | null = null;
let cachedCellImgData: ImageData | null = null;
let cachedMidImgData: ImageData | null = null;

function ensureSpriteBuffers(): {
  hiCtx: CanvasRenderingContext2D;
  hiEl: HTMLCanvasElement;
  midCtx: CanvasRenderingContext2D;
  midEl: HTMLCanvasElement;
  midOutCtx: CanvasRenderingContext2D;
  midOutEl: HTMLCanvasElement;
  cellRawCtx: CanvasRenderingContext2D;
  cellRawEl: HTMLCanvasElement;
  cellOutCtx: CanvasRenderingContext2D;
  cellOutEl: HTMLCanvasElement;
} | null {
  if (!hiCanvas) {
    hiCanvas = document.createElement('canvas');
    hiCanvas.width = HI_W;
    hiCanvas.height = HI_H;
  }
  if (!midCanvas) {
    midCanvas = document.createElement('canvas');
    midCanvas.width = MID_W;
    midCanvas.height = MID_H;
  }
  if (!midOutCanvas) {
    midOutCanvas = document.createElement('canvas');
    midOutCanvas.width = MID_W;
    midOutCanvas.height = MID_H;
  }
  if (!cellRawCanvas) {
    cellRawCanvas = document.createElement('canvas');
    cellRawCanvas.width = SPRITE_CELL_W;
    cellRawCanvas.height = SPRITE_CELL_H;
  }
  if (!cellOutCanvas) {
    cellOutCanvas = document.createElement('canvas');
    cellOutCanvas.width = SPRITE_CELL_W;
    cellOutCanvas.height = SPRITE_CELL_H;
  }

  const hiCtx = hiCanvas.getContext('2d');
  const midCtx = midCanvas.getContext('2d', { willReadFrequently: true });
  const midOutCtx = midOutCanvas.getContext('2d');
  const cellRawCtx = cellRawCanvas.getContext('2d', { willReadFrequently: true });
  const cellOutCtx = cellOutCanvas.getContext('2d');
  if (!hiCtx || !midCtx || !midOutCtx || !cellRawCtx || !cellOutCtx) return null;

  return {
    hiCtx,
    hiEl: hiCanvas,
    midCtx,
    midEl: midCanvas,
    midOutCtx,
    midOutEl: midOutCanvas,
    cellRawCtx,
    cellRawEl: cellRawCanvas,
    cellOutCtx,
    cellOutEl: cellOutCanvas,
  };
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function rgbCss(r: number, g: number, b: number, a = 1): string {
  const cr = Math.min(255, Math.max(0, Math.round(r)));
  const cg = Math.min(255, Math.max(0, Math.round(g)));
  const cb = Math.min(255, Math.max(0, Math.round(b)));
  return a < 0.999 ? `rgba(${cr},${cg},${cb},${a.toFixed(3)})` : `rgb(${cr},${cg},${cb})`;
}

function tintHex(hex: string, factor: number, add = 0, alpha = 1): string {
  const [r, g, b] = parseHex(hex);
  return rgbCss(r * factor + add, g * factor + add, b * factor + add, alpha);
}

/**
 * Génère une rampe d'ombrage arcade 6 tons à glissement chromatique (Hue-Shifting CPS-3 / SNK) :
 * - Ombres décalées vers l'indigo/prune frais ou la terre de Sienne chaude (jamais de gris terne).
 * - Hautes lumières décalées vers l'ivoire doré solaire.
 */
function buildSmoothRamp(baseHex: string, dimFactor = 1): {
  contour: string;
  deepShadow: string;
  shadow: string;
  halftone: string;
  mid: string;
  light: string;
  specular: string;
} {
  const [r0, g0, b0] = parseHex(baseHex);
  const r = r0 * dimFactor;
  const g = g0 * dimFactor;
  const b = b0 * dimFactor;
  const lum = (r + g + b) / 3;

  // Tissus très clairs / blancs (Kimono de Kenji, chaussons de Mei-Lin, chevelure argent de Nyxia)
  if (lum > 212 && Math.abs(r - b) < 30) {
    return {
      contour: rgbCss(r * 0.34, g * 0.40, b * 0.54 + 12),
      deepShadow: rgbCss(r * 0.62, g * 0.69, b * 0.82 + 10),
      shadow: rgbCss(r * 0.76, g * 0.81, b * 0.91 + 6),
      halftone: rgbCss(r * 0.89, g * 0.92, b * 0.97 + 2),
      mid: rgbCss(r, g, b),
      light: rgbCss(r * 1.03 + 7, g * 1.03 + 7, b * 1.02 + 6),
      specular: '#FFFFFF',
    };
  }

  // Tons chair / peau : sous-diffusion sanguine chaude dans les demi-teintes, ombre ambrée-prune
  if (r > g + 14 && g > b + 10 && lum > 105) {
    return {
      contour: rgbCss(r * 0.40, g * 0.27, b * 0.26 + 6),
      deepShadow: rgbCss(r * 0.68, g * 0.54, b * 0.52 + 6),
      shadow: rgbCss(r * 0.81, g * 0.70, b * 0.66 + 4),
      halftone: rgbCss(r * 0.93 + 2, g * 0.86, b * 0.82),
      mid: rgbCss(r, g, b),
      light: rgbCss(r * 1.08 + 10, g * 1.08 + 9, b * 1.05 + 6),
      specular: rgbCss(r * 1.15 + 22, g * 1.14 + 20, b * 1.10 + 16),
    };
  }

  // Tissus colorés, cuirs et armures métalliques : ombres riches tirant vers le bleu nuit
  return {
    contour: rgbCss(r * 0.30, g * 0.31, b * 0.40 + 10),
    deepShadow: rgbCss(r * 0.58, g * 0.60, b * 0.69 + 8),
    shadow: rgbCss(r * 0.73, g * 0.75, b * 0.82 + 5),
    halftone: rgbCss(r * 0.88, g * 0.89, b * 0.93 + 2),
    mid: rgbCss(r, g, b),
    light: rgbCss(r * 1.13 + 12, g * 1.12 + 11, b * 1.09 + 8),
    specular: rgbCss(r * 1.24 + 28, g * 1.23 + 26, b * 1.18 + 20),
  };
}

function toS(pt: Joint3D): { x: number; y: number } {
  return {
    x: SPRITE_ORIGIN_X + pt.x,
    y: SPRITE_ORIGIN_Y - pt.y + pt.z * 0.05,
  };
}

interface ChainSegmentSpec {
  a: Joint3D;
  b: Joint3D;
  rA: number;
  rMid: number;
  rB: number;
  color: string;
}

function traceCurvedCapsule(
  ctx: CanvasRenderingContext2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  rA: number,
  rMid: number,
  rB: number
): void {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);

  ctx.beginPath();
  ctx.arc(p1.x, p1.y, rA, 0, Math.PI * 2);
  ctx.arc(p2.x, p2.y, rB, 0, Math.PI * 2);
  ctx.fill();

  if (len < 0.25) return;

  const nx = -dy / len;
  const ny = dx / len;
  const mx = (p1.x + p2.x) * 0.5;
  const my = (p1.y + p2.y) * 0.5;

  ctx.beginPath();
  ctx.moveTo(p1.x + nx * rA, p1.y + ny * rA);
  ctx.quadraticCurveTo(mx + nx * rMid, my + ny * rMid, p2.x + nx * rB, p2.y + ny * rB);
  ctx.lineTo(p2.x - nx * rB, p2.y - ny * rB);
  ctx.quadraticCurveTo(mx - nx * rMid, my - ny * rMid, p1.x - nx * rA, p1.y - ny * rA);
  ctx.closePath();
  ctx.fill();
}

/**
 * Dessine une chaîne anatomique CONTINUE (ex: hanche -> genou -> cheville -> pied, ou épaule -> coude -> poignet) :
 * 1) Un seul liseré extérieur fin sur le périmètre complet du membre (ZÉRO trait noir en travers du genou ou du coude !)
 * 2) Dégradé cylindrique 5 tons ultra-lisse par segment
 * 3) Fondu radial aux articulations de même matériau pour supprimer tout effet "poupée articulée"
 */
function drawSeamlessLimbChain(
  ctx: CanvasRenderingContext2D,
  segments: ChainSegmentSpec[],
  dimFactor: number,
  outerRimWidth = 0.62
): void {
  if (segments.length === 0) return;

  // PASSE 1 : Silhouette extérieure unifiée (aucune couture interne car la Passe 2 recouvre tout l'intérieur)
  if (outerRimWidth > 0) {
    for (const seg of segments) {
      const ramp = buildSmoothRamp(seg.color, dimFactor);
      ctx.fillStyle = ramp.contour;
      traceCurvedCapsule(
        ctx,
        toS(seg.a),
        toS(seg.b),
        seg.rA + outerRimWidth,
        seg.rMid + outerRimWidth,
        seg.rB + outerRimWidth
      );
    }
  }

  // PASSE 2 : Volume intérieur à dégradé cylindrique doux (lumière zénithale avant-gauche constante)
  const lightNormals: Array<{ nx: number; ny: number }> = [];

  for (const seg of segments) {
    const p1 = toS(seg.a);
    const p2 = toS(seg.b);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;

    // Oriente systématiquement +N vers la source lumineuse (-Y haut, +X avant)
    if (nx * 0.36 - ny * 0.93 < 0) {
      nx = -nx;
      ny = -ny;
    }
    lightNormals.push({ nx, ny });

    const mx = (p1.x + p2.x) * 0.5;
    const my = (p1.y + p2.y) * 0.5;
    const span = Math.max(seg.rA, seg.rMid, seg.rB);
    const ramp = buildSmoothRamp(seg.color, dimFactor);

    const grad = ctx.createLinearGradient(
      mx - nx * span,
      my - ny * span,
      mx + nx * span,
      my + ny * span
    );
    grad.addColorStop(0.0, ramp.deepShadow);
    grad.addColorStop(0.18, ramp.shadow);
    grad.addColorStop(0.42, ramp.halftone);
    grad.addColorStop(0.68, ramp.mid);
    grad.addColorStop(0.88, ramp.light);
    grad.addColorStop(1.0, ramp.specular);

    ctx.fillStyle = grad;
    traceCurvedCapsule(ctx, p1, p2, seg.rA, seg.rMid, seg.rB);
  }

  // PASSE 3 : Soudure radiale invisible sur chaque articulation interne partageant le même matériau (genou, coude...)
  for (let i = 0; i < segments.length - 1; i++) {
    const s1 = segments[i];
    const s2 = segments[i + 1];
    if (s1.color.toLowerCase() !== s2.color.toLowerCase()) continue;

    const jt = toS(s1.b);
    const rJ = Math.min(s1.rB, s2.rA) * 0.96;
    const n1 = lightNormals[i];
    const n2 = lightNormals[i + 1];
    const ax = n1.nx + n2.nx;
    const ay = n1.ny + n2.ny;
    const alen = Math.hypot(ax, ay) || 1;
    const lx = ax / alen;
    const ly = ay / alen;

    const ramp = buildSmoothRamp(s1.color, dimFactor);
    const weld = ctx.createRadialGradient(
      jt.x + lx * rJ * 0.38,
      jt.y + ly * rJ * 0.38,
      rJ * 0.08,
      jt.x,
      jt.y,
      rJ
    );
    weld.addColorStop(0.0, ramp.light);
    weld.addColorStop(0.55, ramp.mid);
    weld.addColorStop(0.88, ramp.halftone);
    weld.addColorStop(1.0, tintHex(s1.color, dimFactor * 0.88, 0, 0));

    ctx.fillStyle = weld;
    ctx.beginPath();
    ctx.arc(jt.x, jt.y, rJ, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dessine des plis de tension textile façon Capcom CPS-3 (sillon d'ombre + crête lumineuse adjacente)
 * pour transformer les pantalons et manches en vrai tissu drapé.
 */
function drawClothCreases(
  ctx: CanvasRenderingContext2D,
  a: Joint3D,
  b: Joint3D,
  radius: number,
  fabricHex: string,
  dim: number,
  creaseCount = 2
): void {
  const p1 = toS(a);
  const p2 = toS(b);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 5.5) return;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const ramp = buildSmoothRamp(fabricHex, dim);

  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < creaseCount; i++) {
    const t = 0.28 + (i / Math.max(1, creaseCount)) * 0.44;
    const cx = p1.x + dx * t;
    const cy = p1.y + dy * t;
    const w = radius * 0.66;

    ctx.strokeStyle = ramp.deepShadow;
    ctx.lineWidth = 0.72;
    ctx.beginPath();
    ctx.moveTo(cx - nx * w - ux * 1.1, cy - ny * w - uy * 1.1);
    ctx.quadraticCurveTo(cx + ux * 0.9, cy + uy * 0.9, cx + nx * w * 0.75 - ux * 0.4, cy + ny * w * 0.75 - uy * 0.4);
    ctx.stroke();

    ctx.strokeStyle = ramp.specular;
    ctx.lineWidth = 0.48;
    ctx.beginPath();
    ctx.moveTo(cx - nx * w * 0.65 - ux * 0.3, cy - ny * w * 0.65 - uy * 0.3);
    ctx.quadraticCurveTo(cx + ux * 1.4, cy + uy * 1.4, cx + nx * w * 0.7 + ux * 0.3, cy + ny * w * 0.7 + uy * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Souligne le galbe musculaire (biceps, avant-bras, quadriceps) sur peau nue sans trait noir dur.
 */
function drawMuscleSculptLine(
  ctx: CanvasRenderingContext2D,
  a: Joint3D,
  b: Joint3D,
  radius: number,
  skinHex: string,
  dim: number
): void {
  const p1 = toS(a);
  const p2 = toS(b);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 5.0) return;

  let nx = -dy / len;
  let ny = dx / len;
  if (nx * 0.36 - ny * 0.93 < 0) {
    nx = -nx;
    ny = -ny;
  }
  const ramp = buildSmoothRamp(skinHex, dim);
  const mx = (p1.x + p2.x) * 0.5;
  const my = (p1.y + p2.y) * 0.5;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = ramp.specular;
  ctx.lineWidth = 0.78;
  ctx.beginPath();
  ctx.moveTo(p1.x + dx * 0.22 + nx * radius * 0.42, p1.y + dy * 0.22 + ny * radius * 0.42);
  ctx.quadraticCurveTo(
    mx + nx * radius * 0.62,
    my + ny * radius * 0.62,
    p1.x + dx * 0.78 + nx * radius * 0.32,
    p1.y + dy * 0.78 + ny * radius * 0.32
  );
  ctx.stroke();

  ctx.strokeStyle = ramp.deepShadow;
  ctx.lineWidth = 0.58;
  ctx.beginPath();
  ctx.moveTo(p1.x + dx * 0.26 - nx * radius * 0.18, p1.y + dy * 0.26 - ny * radius * 0.18);
  ctx.quadraticCurveTo(
    mx - nx * radius * 0.05,
    my - ny * radius * 0.05,
    p1.x + dx * 0.72 - nx * radius * 0.22,
    p1.y + dy * 0.72 - ny * radius * 0.22
  );
  ctx.stroke();
  ctx.restore();
}

/**
 * Pied / Botte / Tabi / Sabaton sculpté anatomiquement avec talon, cou-de-pied, semelle et orteils/coque.
 */
function drawSculptedFoot(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  ankle: Joint3D,
  toe: Joint3D,
  shinThick: number,
  bootColor: string,
  dim: number
): void {
  const ak = toS(ankle);
  const to = toS(toe);
  let dx = to.x - ak.x;
  let dy = to.y - ak.y;
  const rawLen = Math.hypot(dx, dy);
  if (rawLen < 2.2) {
    dx = 6.2;
    dy = 0.8;
  }
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Normale orientée vers le DESSUS du pied (cou-de-pied)
  let upX = uy;
  let upY = -ux;
  if (upY > 0.25 && ankle.y < 14) {
    upX = -upX;
    upY = -upY;
  }

  const footLen = Math.min(10.2, Math.max(6.4, len * 1.08));
  const ramp = buildSmoothRamp(bootColor, dim);

  const heelX = ak.x - ux * 2.6 - upX * 2.1;
  const heelY = ak.y - uy * 2.6 - upY * 2.1;
  const soleTipX = ak.x + ux * footLen - upX * 1.9;
  const soleTipY = ak.y + uy * footLen - upY * 1.9;
  const toeTopX = ak.x + ux * (footLen + 0.5) + upX * 0.5;
  const toeTopY = ak.y + uy * (footLen + 0.5) + upY * 0.5;
  const instepX = ak.x + ux * (footLen * 0.38) + upX * (shinThick * 0.62);
  const instepY = ak.y + uy * (footLen * 0.38) + upY * (shinThick * 0.62);
  const collarBackX = ak.x - ux * 2.2 + upX * (shinThick * 0.48);
  const collarBackY = ak.y - uy * 2.2 + upY * (shinThick * 0.48);

  const traceBoot = (inf: number) => {
    ctx.beginPath();
    ctx.moveTo(collarBackX - ux * inf + upX * inf, collarBackY - uy * inf + upY * inf);
    ctx.quadraticCurveTo(
      instepX + upX * inf,
      instepY + upY * inf,
      toeTopX + ux * inf + upX * inf * 0.5,
      toeTopY + uy * inf + upY * inf * 0.5
    );
    ctx.quadraticCurveTo(
      soleTipX + ux * (0.9 + inf),
      soleTipY + uy * (0.9 + inf) - upY * inf * 0.6,
      soleTipX - upX * inf,
      soleTipY - upY * inf
    );
    ctx.lineTo(heelX - ux * inf * 0.5 - upX * inf, heelY - uy * inf * 0.5 - upY * inf);
    ctx.quadraticCurveTo(
      ak.x - ux * (2.8 + inf),
      ak.y - uy * (2.8 + inf),
      collarBackX - ux * inf + upX * inf,
      collarBackY - uy * inf + upY * inf
    );
    ctx.closePath();
  };

  ctx.fillStyle = ramp.contour;
  traceBoot(0.58);
  ctx.fill();

  const bGrad = ctx.createLinearGradient(instepX, instepY, heelX, soleTipY);
  bGrad.addColorStop(0.0, ramp.specular);
  bGrad.addColorStop(0.35, ramp.light);
  bGrad.addColorStop(0.72, ramp.mid);
  bGrad.addColorStop(1.0, ramp.deepShadow);
  ctx.fillStyle = bGrad;
  traceBoot(0);
  ctx.fill();

  if (f.id === 'kenji') {
    // Bandelette martiale blanche de cheville + séparation fine des orteils de karatéka
    ctx.strokeStyle = dim > 0.9 ? '#F8FAFC' : '#CBD5E1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ak.x - ux * 1.6 + upX * 1.4, ak.y - uy * 1.6 + upY * 1.4);
    ctx.lineTo(ak.x + ux * 1.8 - upX * 0.2, ak.y + uy * 1.8 - upY * 0.2);
    ctx.stroke();

    ctx.strokeStyle = ramp.deepShadow;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(toeTopX - ux * 1.8, toeTopY - uy * 1.8);
    ctx.lineTo(soleTipX - ux * 0.6, soleTipY - uy * 0.6);
    ctx.stroke();
  } else {
    // Semelle structurée contrastée (botte de combat, chausson Kung-Fu, Tabi ou Sabaton d'armure)
    ctx.strokeStyle = f.id === 'meilin' ? '#1E293B' : f.id === 'malakor' ? '#451A03' : '#090D16';
    ctx.lineWidth = f.id === 'titan' ? 1.55 : 1.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(heelX + ux * 0.4, heelY + uy * 0.4);
    ctx.lineTo(soleTipX, soleTipY);
    ctx.stroke();

    if (f.id === 'meilin') {
      // Liseré d'or sur le chausson blanc de Kung-Fu
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(collarBackX, collarBackY);
      ctx.lineTo(instepX, instepY);
      ctx.stroke();
    } else if (f.id === 'titan') {
      // Coque d'acier rivée à l'avant de la botte lourde
      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.arc(toeTopX - ux * 1.2 - upX * 0.6, toeTopY - uy * 1.2 - upY * 0.6, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.id === 'krowen' || f.id === 'nyxia' || f.id === 'malakor') {
      // Attache dorée / lame d'armure sur le cou-de-pied
      ctx.strokeStyle = f.id === 'nyxia' ? '#22D3EE' : '#FBBF24';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(instepX - ux * 1.2, instepY - uy * 1.2);
      ctx.lineTo(instepX + ux * 0.6 - upX * 1.8, instepY + uy * 0.6 - upY * 1.8);
      ctx.stroke();
    }
  }
}

/**
 * Jambe complète sculptée (cuisse + genou soudé + plis textiles / grèves d'armure + pied/botte anatomique).
 */
function drawFighterLeg(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  hip: Joint3D,
  knee: Joint3D,
  ankle: Joint3D,
  toe: Joint3D,
  legThick: number,
  shinThick: number,
  pantsColor: string,
  bootColor: string,
  isFront: boolean
): void {
  const dim = isFront ? 1.0 : 0.80;
  const pelvisSocket: Joint3D = {
    x: pose.pelvis.x * 0.58 + hip.x * 0.42,
    y: pose.pelvis.y * 0.58 + hip.y * 0.42,
    z: hip.z * 0.55,
  };

  if (f.id === 'kenji') {
    const cuff: Joint3D = {
      x: knee.x + (ankle.x - knee.x) * 0.78,
      y: knee.y + (ankle.y - knee.y) * 0.78,
      z: ankle.z,
    };

    // 1) Cheville nue et pied de karatéka sculpté dessinés sous l'ourlet évasé du pantalon Dogi
    drawSeamlessLimbChain(
      ctx,
      [
        {
          a: cuff,
          b: ankle,
          rA: shinThick * 0.66,
          rMid: shinThick * 0.64,
          rB: shinThick * 0.66,
          color: def.skinColor,
        },
      ],
      dim,
      0.52
    );
    drawSculptedFoot(ctx, f, def, ankle, toe, shinThick, def.skinColor, dim);

    // 2) Pantalon de Dogi blanc ample avec ourlet évasé et plis de drapé CPS-3
    drawSeamlessLimbChain(
      ctx,
      [
        {
          a: pelvisSocket,
          b: hip,
          rA: legThick * 1.06,
          rMid: legThick * 1.06,
          rB: legThick * 1.05,
          color: pantsColor,
        },
        {
          a: hip,
          b: knee,
          rA: legThick * 1.05,
          rMid: legThick * 1.18,
          rB: shinThick * 1.16,
          color: pantsColor,
        },
        {
          a: knee,
          b: cuff,
          rA: shinThick * 1.16,
          rMid: shinThick * 1.34,
          rB: shinThick * 1.18,
          color: pantsColor,
        },
      ],
      dim,
      0.58
    );

    drawClothCreases(ctx, hip, knee, legThick, pantsColor, dim, 2);
    drawClothCreases(ctx, knee, cuff, shinThick * 1.2, pantsColor, dim, 2);

    // Ouverture ombrée de l'ourlet du Dogi autour de la cheville
    const cf = toS(cuff);
    const ak = toS(ankle);
    const cdx = ak.x - cf.x;
    const cdy = ak.y - cf.y;
    const clen = Math.hypot(cdx, cdy) || 1;
    const cnx = -cdy / clen;
    const cny = cdx / clen;
    ctx.strokeStyle = dim > 0.9 ? '#475569' : '#334155';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(cf.x - cnx * shinThick * 1.05, cf.y - cny * shinThick * 1.05);
    ctx.quadraticCurveTo(cf.x + (cdx / clen) * 0.8, cf.y + (cdy / clen) * 0.8, cf.x + cnx * shinThick * 1.05, cf.y + cny * shinThick * 1.05);
    ctx.stroke();
    return;
  }

  // Autres combattants : cuisse drapée + grève / jambière ciselée + botte sculptée
  const greaveTop: Joint3D = {
    x: knee.x + (ankle.x - knee.x) * 0.42,
    y: knee.y + (ankle.y - knee.y) * 0.42,
    z: ankle.z,
  };

  const greaveCol =
    f.id === 'krowen' || f.id === 'nyxia'
      ? '#B45309'
      : f.id === 'malakor'
      ? '#D97706'
      : f.id === 'titan'
      ? '#475569'
      : bootColor;

  drawSeamlessLimbChain(
    ctx,
    [
      {
        a: pelvisSocket,
        b: hip,
        rA: legThick * 1.04,
        rMid: legThick * 1.02,
        rB: legThick,
        color: pantsColor,
      },
      {
        a: hip,
        b: knee,
        rA: legThick,
        rMid: legThick * 1.12,
        rB: shinThick * 1.04,
        color: pantsColor,
      },
      {
        a: knee,
        b: greaveTop,
        rA: shinThick * 1.04,
        rMid: shinThick * 1.06,
        rB: shinThick * 0.96,
        color: pantsColor,
      },
      {
        a: greaveTop,
        b: ankle,
        rA: shinThick * 1.04,
        rMid: shinThick * 1.02,
        rB: shinThick * 0.84,
        color: greaveCol,
      },
    ],
    dim,
    0.58
  );

  drawClothCreases(ctx, hip, knee, legThick * 0.92, pantsColor, dim, 2);

  // Genouillère / détail de jambière sur Titan, Malakor, Nyxia et Krowen
  if (f.id === 'titan' || f.id === 'malakor' || f.id === 'nyxia' || f.id === 'krowen') {
    const kn = toS(knee);
    const gt = toS(greaveTop);
    ctx.fillStyle = f.id === 'titan' ? '#94A3B8' : '#FDE68A';
    ctx.beginPath();
    ctx.arc((kn.x + gt.x) * 0.5 + 0.8, (kn.y + gt.y) * 0.5 - 1.2, f.id === 'titan' ? 2.1 : 1.5, 0, Math.PI * 2);
    ctx.fill();

    if (f.id === 'krowen') {
      // Bandages croisés Kyahan sur le mollet ninja
      const ak = toS(ankle);
      ctx.strokeStyle = '#991B1B';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(gt.x - 2, gt.y + 1.5);
      ctx.lineTo(ak.x + 2, ak.y - 2.5);
      ctx.moveTo(gt.x + 2, gt.y + 1.5);
      ctx.lineTo(ak.x - 2, ak.y - 2.5);
      ctx.stroke();
    }
  }

  drawSculptedFoot(ctx, f, def, ankle, toe, shinThick, bootColor, dim);
}

/**
 * Poing / Gant / Gantelet orienté selon l'avant-bras avec phalanges éclairées, pouce replié et bandages.
 */
function drawSculptedHand(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  elbow: Joint3D,
  wrist: Joint3D,
  dim: number,
  isFront: boolean
): void {
  const el = toS(elbow);
  const w = toS(wrist);
  let dx = w.x - el.x;
  let dy = w.y - el.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const nx = -dy;
  const ny = dx;

  const isTitan = f.id === 'titan';
  const gloveCol =
    isTitan
      ? '#94A3B8'
      : f.id === 'kenji'
      ? '#2563EB'
      : f.id === 'malakor'
      ? '#7E22CE'
      : f.id === 'krowen'
      ? '#1E293B'
      : def.skinColor;

  const ramp = buildSmoothRamp(gloveCol, dim);
  const fistLen = isTitan ? 5.8 : 3.9;
  const fistHalfW = isTitan ? 4.8 : 3.2;
  const cx = w.x + dx * (fistLen * 0.35);
  const cy = w.y + dy * (fistLen * 0.35);

  // Bandage de poignet blanc pour Kenji ou manchette dorée pour Malakor/Mei-Lin
  if (f.id === 'kenji' || f.id === 'meilin' || f.id === 'malakor') {
    ctx.strokeStyle = f.id === 'kenji' ? '#F8FAFC' : '#FBBF24';
    ctx.lineWidth = 1.65;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w.x - dx * 1.1 - nx * 2.5, w.y - dy * 1.1 - ny * 2.5);
    ctx.lineTo(w.x - dx * 1.1 + nx * 2.5, w.y - dy * 1.1 + ny * 2.5);
    ctx.stroke();
  }

  // Paume ouverte martiale lors d'une concentration de Ki (Hadouken / Orbe)
  if (isFront && (pose.weaponDrawn === 'KI_CHARGE' || f.action === 'TAUNT') && !isTitan) {
    ctx.fillStyle = ramp.contour;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ramp.mid;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Doigts tendus en griffe/paume de Ki
    ctx.strokeStyle = def.skinColor;
    ctx.lineWidth = 1.05;
    ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + nx * k * 1.3, cy + ny * k * 1.3);
      ctx.lineTo(cx + dx * 3.4 + nx * k * 1.9, cy + dy * 3.4 + ny * k * 1.9 - 1.2);
      ctx.stroke();
    }
    return;
  }

  // Silhouette orientée du poing fermé (trapèze anatomique des métacarpes + phalanges)
  const traceFist = (inf: number) => {
    const fl = fistLen + inf;
    const fw = fistHalfW + inf;
    ctx.beginPath();
    ctx.moveTo(w.x - dx * (1.2 + inf) + nx * (fw * 0.82), w.y - dy * (1.2 + inf) + ny * (fw * 0.82));
    ctx.lineTo(w.x + dx * fl + nx * (fw * 0.95), w.y + dy * fl + ny * (fw * 0.95));
    ctx.quadraticCurveTo(
      w.x + dx * (fl + 1.1),
      w.y + dy * (fl + 1.1),
      w.x + dx * fl - nx * (fw * 0.92),
      w.y + dy * fl - ny * (fw * 0.92)
    );
    ctx.lineTo(w.x - dx * (1.2 + inf) - nx * (fw * 0.82), w.y - dy * (1.2 + inf) - ny * (fw * 0.82));
    ctx.closePath();
  };

  ctx.fillStyle = ramp.contour;
  traceFist(0.55);
  ctx.fill();

  const fGrad = ctx.createRadialGradient(
    cx - dx * 0.5 - 0.8,
    cy - 1.4,
    0.5,
    cx,
    cy,
    fistLen * 1.15
  );
  fGrad.addColorStop(0.0, ramp.specular);
  fGrad.addColorStop(0.52, ramp.mid);
  fGrad.addColorStop(1.0, ramp.deepShadow);
  ctx.fillStyle = fGrad;
  traceFist(0);
  ctx.fill();

  // Crête des 3-4 phalanges éclairées à l'avant du poing + repli du pouce
  ctx.fillStyle = ramp.specular;
  const knuckleCount = isTitan ? 4 : 3;
  for (let k = 0; k < knuckleCount; k++) {
    const u = ((k / (knuckleCount - 1)) - 0.5) * 1.45 * (fistHalfW * 0.65);
    const kx = w.x + dx * (fistLen * 0.78) + nx * u;
    const ky = w.y + dy * (fistLen * 0.78) + ny * u;
    ctx.beginPath();
    ctx.arc(kx, ky, isTitan ? 0.95 : 0.68, 0, Math.PI * 2);
    ctx.fill();
  }

  // Repli du pouce verrouillant le poing
  ctx.strokeStyle = ramp.contour;
  ctx.lineWidth = 0.58;
  ctx.beginPath();
  ctx.moveTo(cx - dx * 0.6 + nx * (fistHalfW * 0.2), cy - dy * 0.6 + ny * (fistHalfW * 0.2));
  ctx.lineTo(cx + dx * 1.4 + nx * (fistHalfW * 0.55), cy + dy * 1.4 + ny * (fistHalfW * 0.55));
  ctx.stroke();

  if (isTitan) {
    // Évent thermique orange incandescent sur le gantelet hydraulique de Titan
    ctx.fillStyle = '#F97316';
    ctx.fillRect(cx - 2.1, cy - 1.1, 4.0, 2.2);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(cx - 1.1, cy - 0.6, 2.0, 1.1);
  }
}

/**
 * Bras complet en une seule chaîne fluide (clavicule -> deltoïde -> biceps/manche -> avant-bras -> poing/arme).
 */
function drawFighterArm(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  shoulder: Joint3D,
  elbow: Joint3D,
  wrist: Joint3D,
  armThick: number,
  sleeveColor: string,
  isFront: boolean,
  frame: number
): void {
  const dim = isFront ? 1.0 : 0.78;
  const w = toS(wrist);
  const el = toS(elbow);
  const clavicleSocket: Joint3D = {
    x: pose.chest.x * 0.62 + shoulder.x * 0.38,
    y: pose.chest.y * 0.62 + shoulder.y * 0.38,
    z: shoulder.z * 0.55,
  };

  if (f.id === 'titan') {
    const midFore: Joint3D = {
      x: (elbow.x + wrist.x) * 0.5,
      y: (elbow.y + wrist.y) * 0.5,
      z: wrist.z,
    };
    drawSeamlessLimbChain(
      ctx,
      [
        {
          a: clavicleSocket,
          b: shoulder,
          rA: armThick * 1.12,
          rMid: armThick * 1.10,
          rB: armThick * 1.06,
          color: sleeveColor,
        },
        {
          a: shoulder,
          b: elbow,
          rA: armThick * 1.06,
          rMid: armThick * 1.18,
          rB: armThick * 0.94,
          color: sleeveColor,
        },
        {
          a: elbow,
          b: midFore,
          rA: armThick * 0.94,
          rMid: armThick * 0.98,
          rB: armThick * 0.94,
          color: sleeveColor,
        },
        {
          a: midFore,
          b: wrist,
          rA: armThick * 1.24,
          rMid: armThick * 1.30,
          rB: armThick * 1.18,
          color: '#64748B',
        },
      ],
      dim,
      0.60
    );

    drawMuscleSculptLine(ctx, shoulder, elbow, armThick * 1.1, sleeveColor, dim);
    drawSculptedHand(ctx, f, def, pose, elbow, wrist, dim, isFront);
    return;
  }

  const bracerStart: Joint3D = {
    x: elbow.x + (wrist.x - elbow.x) * 0.64,
    y: elbow.y + (wrist.y - elbow.y) * 0.64,
    z: wrist.z,
  };
  const bracerCol =
    f.id === 'kenji'
      ? '#DC2626'
      : f.id === 'krowen' || f.id === 'nyxia'
      ? '#B45309'
      : f.id === 'meilin'
      ? '#FBBF24'
      : '#D97706';

  drawSeamlessLimbChain(
    ctx,
    [
      {
        a: clavicleSocket,
        b: shoulder,
        rA: armThick * 1.08,
        rMid: armThick * 1.06,
        rB: armThick * 1.02,
        color: sleeveColor,
      },
      {
        a: shoulder,
        b: elbow,
        rA: armThick * 1.02,
        rMid: armThick * 1.12,
        rB: armThick * 0.88,
        color: sleeveColor,
      },
      {
        a: elbow,
        b: bracerStart,
        rA: armThick * 0.88,
        rMid: armThick * 0.90,
        rB: armThick * 0.76,
        color: sleeveColor,
      },
      {
        a: bracerStart,
        b: wrist,
        rA: armThick * 0.84,
        rMid: armThick * 0.82,
        rB: armThick * 0.74,
        color: bracerCol,
      },
    ],
    dim,
    0.56
  );

  if (f.id === 'kenji' || f.id === 'nyxia') {
    drawMuscleSculptLine(ctx, shoulder, elbow, armThick, sleeveColor, dim);
  } else {
    drawClothCreases(ctx, shoulder, elbow, armThick * 0.9, sleeveColor, dim, 2);
  }

  // Lame d'avant-bras Tekkō pour Krowen
  if (f.id === 'krowen') {
    const bs = toS(bracerStart);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(bs.x - 1, bs.y - 2.4);
    ctx.lineTo(w.x + 1, w.y - 2.4);
    ctx.stroke();
  }

  // Épaulière / revers d'épaule déchiré du Dogi par-dessus l'attache haute
  drawShoulderDetail(ctx, f, def, shoulder, isFront);

  // Poing / gant sculpté orienté
  drawSculptedHand(ctx, f, def, pose, elbow, wrist, dim, isFront);

  if (!isFront) return;

  // Arme orientée dynamiquement selon l'axe réel de l'avant-bras
  if (pose.weaponDrawn === 'KATANA') {
    const fdx = w.x - el.x;
    const fdy = w.y - el.y;
    const flen = Math.hypot(fdx, fdy) || 1;
    const ux = fdx / flen;
    const uy = fdy / flen;
    const px = -uy;
    const py = ux;

    // Poignée Tsuka tressée derrière le poing
    ctx.strokeStyle = '#7F1D1D';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(w.x - ux * 5.2, w.y - uy * 5.2);
    ctx.lineTo(w.x + ux * 0.8, w.y + uy * 0.8);
    ctx.stroke();

    const tipX = w.x + ux * 17.5 + 4.8;
    const tipY = w.y + uy * 17.5 - 3.0;
    const ctrlX = (w.x + tipX) * 0.5 + px * 2.4;
    const ctrlY = (w.y + tipY) * 0.5 + py * 2.4;

    // Garde d'or ciselée (Tsuba)
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(w.x - px * 3.8, w.y - py * 3.8);
    ctx.lineTo(w.x + px * 3.8, w.y + py * 3.8);
    ctx.stroke();

    // Dos de lame acier bleuté + tranchant Hamon blanc pur
    const bladeGrad = ctx.createLinearGradient(w.x, w.y, tipX, tipY);
    bladeGrad.addColorStop(0.0, '#94A3B8');
    bladeGrad.addColorStop(0.45, '#F8FAFC');
    bladeGrad.addColorStop(1.0, '#FFFFFF');
    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(w.x + px * 1.5, w.y + py * 1.5);
    ctx.quadraticCurveTo(ctrlX + px * 1.15, ctrlY + py * 1.15, tipX, tipY);
    ctx.quadraticCurveTo(ctrlX - px * 0.95, ctrlY - py * 0.95, w.x - px * 1.15, w.y - py * 1.15);
    ctx.closePath();
    ctx.fill();

    // Gorge de sang / fil ardent sur le tranchant
    ctx.strokeStyle = '#FB923C';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(w.x + px * 1.25, w.y + py * 1.25);
    ctx.quadraticCurveTo(ctrlX + px * 1.0, ctrlY + py * 1.0, tipX, tipY);
    ctx.stroke();
  } else if (pose.weaponDrawn === 'FAN_OPEN') {
    const fanGrad = ctx.createRadialGradient(w.x, w.y, 1.8, w.x, w.y, 11.5);
    fanGrad.addColorStop(0.0, '#78350F');
    fanGrad.addColorStop(0.24, '#047857');
    fanGrad.addColorStop(0.76, '#10B981');
    fanGrad.addColorStop(0.90, '#E2E8F0');
    fanGrad.addColorStop(1.0, '#FFFFFF');

    ctx.fillStyle = fanGrad;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    ctx.arc(w.x, w.y, 11.4, -1.46, 0.28);
    ctx.closePath();
    ctx.fill();

    // Baleines d'or et pointes d'acier tranchantes de l'éventail de Mei-Lin
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 0.65;
    for (let r = 0; r < 5; r++) {
      const a = -1.36 + r * 0.38;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(w.x + Math.cos(a) * 11.1, w.y + Math.sin(a) * 11.1);
      ctx.stroke();
    }
  } else if (pose.weaponDrawn === 'FAN_CLOSED') {
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 2.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    ctx.lineTo(w.x + 8.5, w.y - 7.2);
    ctx.stroke();
    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(w.x + 2, w.y - 1.7);
    ctx.lineTo(w.x + 8.5, w.y - 7.2);
    ctx.stroke();
  } else if (pose.weaponDrawn === 'KI_CHARGE' || pose.weaponDrawn === 'LIGHTNING_SPEAR') {
    const r = 5.4 + Math.sin(frame * 0.45) * 1.4;
    const orbGrad = ctx.createRadialGradient(w.x + 3.4, w.y, 0.5, w.x + 3.4, w.y, r);
    orbGrad.addColorStop(0, '#FFFFFF');
    orbGrad.addColorStop(0.45, def.accentColor);
    orbGrad.addColorStop(1, tintHex(def.accentColor, 0.8, 0, 0));
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(w.x + 3.4, w.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShoulderDetail(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  sh: Joint3D,
  isFront: boolean
): void {
  const s = toS(sh);
  const dim = isFront ? 1.0 : 0.80;

  if (f.id === 'malakor') {
    const ramp = buildSmoothRamp('#D97706', dim);
    ctx.fillStyle = ramp.contour;
    ctx.beginPath();
    ctx.arc(s.x, s.y - 0.4, 5.0, 0, Math.PI * 2);
    ctx.fill();

    const pGrad = ctx.createRadialGradient(s.x - 1.0, s.y - 2.0, 0.5, s.x, s.y - 0.4, 4.6);
    pGrad.addColorStop(0, ramp.specular);
    pGrad.addColorStop(0.55, ramp.mid);
    pGrad.addColorStop(1, ramp.deepShadow);
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(s.x, s.y - 0.4, 4.4, 0, Math.PI * 2);
    ctx.fill();

    // Lame d'épaulière segmentée impériale
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.6, 0.15, Math.PI - 0.15);
    ctx.stroke();

    // Corne d'ivoire galbée orientée vers l'extérieur (sans empiéter sur le menton ou le cou)
    const hornDir = isFront ? 1.0 : -1.0;
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.moveTo(s.x - hornDir * 1.5, s.y - 3.2);
    ctx.quadraticCurveTo(s.x + hornDir * 2.8, s.y - 5.2, s.x + hornDir * 3.8, s.y - 6.5);
    ctx.lineTo(s.x + hornDir * 0.8, s.y - 3.6);
    ctx.closePath();
    ctx.fill();

    if (isFront) {
      ctx.fillStyle = '#E879F9';
      ctx.fillRect(s.x - 1.2, s.y - 1.2, 1.4, 1.4);
      ctx.fillRect(s.x + 0.8, s.y - 1.2, 1.4, 1.4);
    }
  } else if (f.id === 'nyxia' || f.id === 'krowen') {
    const ramp = buildSmoothRamp('#B45309', dim);
    ctx.fillStyle = ramp.contour;
    ctx.beginPath();
    ctx.arc(s.x, s.y - 0.8, 5.0, Math.PI * 0.88, Math.PI * 2.12);
    ctx.fill();
    ctx.fillStyle = ramp.mid;
    ctx.beginPath();
    ctx.arc(s.x, s.y - 0.8, 4.5, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 0.85;
    ctx.stroke();
  } else if (f.id === 'kenji') {
    // Manches courtes nettes du kimono blanc (couture soignée, pas de déchirures)
    const ramp = buildSmoothRamp(def.primaryColor, dim);
    ctx.fillStyle = ramp.contour;
    ctx.beginPath();
    ctx.arc(s.x, s.y - 0.4, 5.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ramp.light;
    ctx.beginPath();
    ctx.arc(s.x, s.y - 0.4, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ramp.shadow;
    ctx.lineWidth = 0.85;
    ctx.stroke();
  }
}

function drawTorsoAndArmor(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  frame: number
): void {
  const pel = toS(pose.pelvis);
  const wst = toS(pose.waist);
  const chs = toS(pose.chest);
  const floorRestY = SPRITE_ORIGIN_Y + 1.2;

  const isTitan = f.id === 'titan';
  const isMalakor = f.id === 'malakor';
  const hipHalf =
    f.id === 'titan' ? 9.8 :
    f.id === 'malakor' ? 8.2 :
    f.id === 'kenji' ? 6.5 :
    f.id === 'nyxia' ? 6.2 :
    f.id === 'krowen' ? 5.8 : 5.4;

  const waistHalf =
    f.id === 'titan' ? 9.0 :
    f.id === 'malakor' ? 7.6 :
    f.id === 'kenji' ? 5.8 :
    f.id === 'nyxia' ? 5.0 :
    f.id === 'krowen' ? 5.2 : 4.6;

  const chestHalf =
    f.id === 'titan' ? 13.5 :
    f.id === 'malakor' ? 11.5 :
    f.id === 'kenji' ? 9.2 :
    f.id === 'krowen' ? 8.4 :
    f.id === 'nyxia' ? 7.8 : 7.2;

  const torsoBase = isTitan ? def.skinColor : def.primaryColor;

  // Bassin + Torse soudés en une seule chaîne anatomique continue (zéro coupure à la taille !)
  drawSeamlessLimbChain(
    ctx,
    [
      {
        a: pose.pelvis,
        b: pose.waist,
        rA: hipHalf,
        rMid: (hipHalf + waistHalf) * 0.5,
        rB: waistHalf,
        color: def.primaryColor,
      },
      {
        a: pose.waist,
        b: pose.chest,
        rA: waistHalf,
        rMid: (waistHalf + chestHalf) * 0.53,
        rB: chestHalf,
        color: torsoBase,
      },
    ],
    1.0,
    0.65
  );

  if (f.id === 'kenji') {
    // Plis de tension textile sur la veste du kimono (Uwagi)
    drawClothCreases(ctx, pose.waist, pose.chest, waistHalf * 0.92, def.primaryColor, 1.0, 2);

    // Pans inférieurs évasés de la veste Dogi sous la ceinture noire (style Street Fighter III)
    const giRamp = buildSmoothRamp(def.primaryColor, 1.0);
    const hemY = Math.min(floorRestY, pel.y + 6.8);
    if (hemY > pel.y + 2.0) {
      const skirtGrad = ctx.createLinearGradient(pel.x - hipHalf, pel.y, pel.x + hipHalf, hemY);
      skirtGrad.addColorStop(0, giRamp.light);
      skirtGrad.addColorStop(0.55, giRamp.mid);
      skirtGrad.addColorStop(1, giRamp.deepShadow);
      ctx.fillStyle = skirtGrad;
      ctx.beginPath();
      ctx.moveTo(pel.x - hipHalf - 0.3, pel.y + 0.5);
      ctx.lineTo(pel.x + hipHalf + 0.4, pel.y + 0.5);
      ctx.lineTo(pel.x + hipHalf + 1.5, hemY - 0.4);
      ctx.lineTo(pel.x + 1.4, hemY);
      ctx.lineTo(pel.x + 0.4, pel.y + 3.2);
      ctx.lineTo(pel.x - 0.8, hemY - 0.2);
      ctx.lineTo(pel.x - hipHalf - 1.2, hemY - 0.8);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = giRamp.contour;
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }

    // Ouverture en V du kimono avec clavicules et sillon pectoral sculptés
    const skinRamp = buildSmoothRamp(def.skinColor, 1.0);
    const chestGrad = ctx.createLinearGradient(chs.x - 4, chs.y - 5, chs.x + 5, wst.y + 1.4);
    chestGrad.addColorStop(0, skinRamp.specular);
    chestGrad.addColorStop(0.45, skinRamp.light);
    chestGrad.addColorStop(0.78, skinRamp.mid);
    chestGrad.addColorStop(1, skinRamp.deepShadow);

    ctx.fillStyle = chestGrad;
    ctx.beginPath();
    ctx.moveTo(chs.x - 3.5, chs.y - 5.2);
    ctx.lineTo(wst.x + 1.8, wst.y + 1.2);
    ctx.lineTo(chs.x + 4.5, chs.y - 5.2);
    ctx.closePath();
    ctx.fill();

    // Sillon sternal et relief claviculaire subtil
    ctx.strokeStyle = skinRamp.deepShadow;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(chs.x + 0.8, chs.y - 3.6);
    ctx.lineTo(wst.x + 1.5, wst.y - 0.6);
    ctx.stroke();

    ctx.strokeStyle = skinRamp.specular;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(chs.x - 2.0, chs.y - 4.0);
    ctx.lineTo(chs.x + 3.2, chs.y - 4.0);
    ctx.stroke();

    // Double revers croisé épais du kimono (ombre ardoise + arête blanche lumineuse)
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(chs.x - 4.1, chs.y - 4.9);
    ctx.lineTo(wst.x + 1.8, wst.y + 1.5);
    ctx.lineTo(chs.x + 5.1, chs.y - 4.9);
    ctx.stroke();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(chs.x - 3.6, chs.y - 4.9);
    ctx.lineTo(wst.x + 1.6, wst.y + 1.1);
    ctx.lineTo(chs.x + 4.6, chs.y - 4.9);
    ctx.stroke();

    // Ceinture noire (Obi) tissée + nœud central sculpté + deux pans flottants distincts
    const obiGrad = ctx.createLinearGradient(pel.x, pel.y - 2.6, pel.x, pel.y + 2.0);
    obiGrad.addColorStop(0, '#475569');
    obiGrad.addColorStop(0.38, '#1E293B');
    obiGrad.addColorStop(0.8, '#0F172A');
    obiGrad.addColorStop(1, '#020617');
    ctx.fillStyle = obiGrad;
    ctx.beginPath();
    ctx.roundRect(pel.x - hipHalf - 0.4, pel.y - 2.4, hipHalf * 2 + 0.8, 4.1, 1.2);
    ctx.fill();

    const beltWave = Math.sin(frame * 0.20) * 1.9;
    const tail1Y = Math.min(floorRestY, pel.y + 11.0 + beltWave * 0.35);
    const tail2Y = Math.min(floorRestY, pel.y + 9.6 - beltWave * 0.25);

    // Pan arrière de l'Obi
    ctx.fillStyle = '#090D16';
    ctx.beginPath();
    ctx.moveTo(pel.x + 1.2, pel.y - 0.5);
    ctx.quadraticCurveTo(pel.x - 2.6, pel.y + 4.8, pel.x - 5.2, tail1Y - 0.4);
    ctx.lineTo(pel.x - 2.6, tail1Y);
    ctx.quadraticCurveTo(pel.x + 0.4, pel.y + 5.2, pel.x + 3.2, pel.y + 0.9);
    ctx.closePath();
    ctx.fill();

    // Pan avant de l'Obi avec reflet de soie usée
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(pel.x + 2.2, pel.y - 0.4);
    ctx.quadraticCurveTo(pel.x + 4.4, pel.y + 4.4, pel.x + 5.6 + beltWave * 0.25, tail2Y - 0.5);
    ctx.lineTo(pel.x + 3.3 + beltWave * 0.25, tail2Y);
    ctx.quadraticCurveTo(pel.x + 1.8, pel.y + 4.8, pel.x + 0.8, pel.y + 1.0);
    ctx.closePath();
    ctx.fill();

    // Nœud carré central de maître karatéka
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(pel.x + 0.4, pel.y - 2.7, 3.8, 4.5, 1.0);
    ctx.fill();
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 0.55;
    ctx.stroke();
  } else if (f.id === 'krowen') {
    // Plastron matelassé Shinobi à coutures losanges + baudrier croisé à boucles de laiton
    const vestGrad = ctx.createLinearGradient(chs.x - 8, chs.y - 5, chs.x + 8, pel.y + 2);
    vestGrad.addColorStop(0, '#334155');
    vestGrad.addColorStop(0.5, '#1E293B');
    vestGrad.addColorStop(1, '#090D16');
    ctx.fillStyle = vestGrad;
    ctx.beginPath();
    ctx.moveTo(chs.x - 7.8, chs.y - 5.2);
    ctx.lineTo(wst.x - 5.2, wst.y + 0.8);
    ctx.lineTo(pel.x, pel.y + 2.6);
    ctx.lineTo(wst.x + 5.6, wst.y + 0.8);
    ctx.lineTo(chs.x + 7.8, chs.y - 5.2);
    ctx.closePath();
    ctx.fill();

    // Surpiqûres tactiques matelassées
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(chs.x - 4.5, chs.y - 3.8);
    ctx.lineTo(wst.x + 2.2, wst.y - 0.2);
    ctx.moveTo(chs.x + 4.5, chs.y - 3.8);
    ctx.lineTo(wst.x - 2.2, wst.y - 0.2);
    ctx.stroke();

    // Sangles croisées cuir & or avec anneau central
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(chs.x - 7.0, chs.y - 4.4);
    ctx.lineTo(pel.x + 5.0, pel.y + 0.4);
    ctx.moveTo(chs.x + 7.0, chs.y - 4.4);
    ctx.lineTo(pel.x - 5.0, pel.y + 0.4);
    ctx.stroke();

    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 0.95;
    ctx.stroke();

    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(chs.x + 0.4, (chs.y + pel.y) * 0.5 - 1.6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Ceinture cramoisie Shinobi + étui à Kunai sur la hanche
    const sashGrad = ctx.createLinearGradient(pel.x, pel.y - 2.2, pel.x, pel.y + 1.8);
    sashGrad.addColorStop(0, '#DC2626');
    sashGrad.addColorStop(0.55, '#991B1B');
    sashGrad.addColorStop(1, '#450A0A');
    ctx.fillStyle = sashGrad;
    ctx.beginPath();
    ctx.roundRect(pel.x - hipHalf - 0.2, pel.y - 2.2, hipHalf * 2 + 0.4, 3.8, 1.0);
    ctx.fill();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.roundRect(pel.x - 2.1, pel.y - 2.2, 4.4, 3.8, 0.6);
    ctx.fill();
    ctx.fillStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.arc(pel.x - hipHalf + 1.4, pel.y + 1.6, 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.id === 'meilin') {
    // Plis soyeux subtils sur le buste du Qipao
    drawClothCreases(ctx, pose.waist, pose.chest, waistHalf * 0.85, def.primaryColor, 1.0, 1);

    const skirtWave = Math.sin(frame * 0.22) * 2.0;
    const qipaoRamp = buildSmoothRamp(def.primaryColor, 1.0);
    const apronBottomY = Math.min(floorRestY, pel.y + 13.6);
    const skGrad = ctx.createLinearGradient(pel.x - 5, pel.y, pel.x + 7, apronBottomY);
    skGrad.addColorStop(0, qipaoRamp.specular);
    skGrad.addColorStop(0.28, qipaoRamp.light);
    skGrad.addColorStop(0.68, qipaoRamp.mid);
    skGrad.addColorStop(1, qipaoRamp.deepShadow);

    // Doublure intérieure carmin visible dans la fente latérale du Qipao (couche d'arrière-plan sous les jambes)
    if (apronBottomY > pel.y + 4) {
      ctx.fillStyle = '#991B1B';
      ctx.beginPath();
      ctx.moveTo(pel.x - 4.5, pel.y + 0.5);
      ctx.lineTo(pel.x - 1.2, pel.y + 0.5);
      ctx.lineTo(pel.x - 2.8, apronBottomY - 1.2);
      ctx.lineTo(pel.x - 5.2, apronBottomY - 2.4);
      ctx.closePath();
      ctx.fill();
    }

    // Col Mandarin + ouverture diagonale + 3 brandebourgs dorés (Pankou)
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(chs.x - 2.9, chs.y - 5.3);
    ctx.quadraticCurveTo(chs.x + 1.5, chs.y - 3.8, chs.x + 4.0, chs.y - 1.8);
    ctx.lineTo(wst.x + 3.9, wst.y + 1.8);
    ctx.stroke();

    ctx.fillStyle = '#FEF08A';
    for (let b = 0; b < 3; b++) {
      const bx = chs.x - 0.8 + b * 2.1;
      const by = chs.y - 4.2 + b * 1.4;
      ctx.beginPath();
      ctx.arc(bx, by, 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (isTitan) {
    // Anatomie lourde sculptée : plaques pectorales, sillon sternal et abdominaux (sans trait noir dur)
    const skinRamp = buildSmoothRamp(def.skinColor, 1.0);
    const torsoFacing = Math.cos(pose.spinY ?? 0);

    if (torsoFacing > 0.05) {
      // Reflets supérieurs des pectoraux positionnés rigoureusement sur le torse antérieur (zéro reflet dorsal)
      ctx.fillStyle = skinRamp.specular;
      ctx.beginPath();
      ctx.ellipse(chs.x - 0.6, chs.y - 2.4, 2.6, 1.4, -0.12, 0, Math.PI * 2);
      ctx.ellipse(chs.x + 4.4, chs.y - 2.4, 3.6, 1.5, 0.12, 0, Math.PI * 2);
      ctx.fill();

      // Ombre sous-pectorale et ligne blanche abdominale
      ctx.strokeStyle = skinRamp.deepShadow;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(chs.x - 5.5, chs.y + 0.8);
      ctx.quadraticCurveTo(chs.x - 2.2, chs.y + 2.2, chs.x + 0.6, chs.y + 0.7);
      ctx.quadraticCurveTo(chs.x + 4.6, chs.y + 2.4, chs.x + 8.8, chs.y + 0.5);
      ctx.moveTo(chs.x + 0.6, chs.y - 3.6);
      ctx.lineTo(wst.x + 0.6, wst.y + 1.8);
      ctx.stroke();
    } else {
      // Vue dorsale pendant la rotation 360° : trapèzes et grand dorsal sans reflets pectoraux
      ctx.strokeStyle = skinRamp.deepShadow;
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(chs.x, chs.y - 4.5);
      ctx.lineTo(chs.x, wst.y);
      ctx.moveTo(chs.x - 5.0, chs.y - 2.0);
      ctx.quadraticCurveTo(chs.x, chs.y - 0.5, chs.x + 5.0, chs.y - 2.0);
      ctx.stroke();
    }

    // Sangles de fonderie rivetées + réacteur thermique incandescent au plexus
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 2.9;
    ctx.beginPath();
    ctx.moveTo(chs.x - 8.6, chs.y - 5.0);
    ctx.lineTo(pel.x + 4.8, pel.y - 0.4);
    ctx.moveTo(chs.x + 8.6, chs.y - 5.0);
    ctx.lineTo(pel.x - 4.8, pel.y - 0.4);
    ctx.stroke();

    ctx.strokeStyle = '#9A3412';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Rivets d'acier sur les sangles
    ctx.fillStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.arc(chs.x - 6.6, chs.y - 3.4, 0.95, 0, Math.PI * 2);
    ctx.arc(chs.x + 6.6, chs.y - 3.4, 0.95, 0, Math.PI * 2);
    ctx.fill();

    // Noyau de fonderie cyber-thermique au croisement du baudrier
    const coreX = (chs.x + wst.x) * 0.5 + 0.4;
    const coreY = (chs.y + wst.y) * 0.5 - 1.2;
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(coreX, coreY, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.arc(coreX, coreY, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(coreX + 0.3, coreY - 0.3, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Ceinture blindée de champion des forges
    const beltGrad = ctx.createLinearGradient(pel.x, pel.y - 3.2, pel.x, pel.y + 2.4);
    beltGrad.addColorStop(0, '#94A3B8');
    beltGrad.addColorStop(0.5, '#475569');
    beltGrad.addColorStop(1, '#1E293B');
    ctx.fillStyle = beltGrad;
    ctx.beginPath();
    ctx.roundRect(pel.x - hipHalf - 0.3, pel.y - 3.0, hipHalf * 2 + 0.6, 5.4, 1.3);
    ctx.fill();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.roundRect(pel.x - 3.6, pel.y - 2.6, 7.4, 4.6, 0.9);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(pel.x - 2.2, pel.y - 1.6, 4.6, 1.4);
  } else if (f.id === 'nyxia') {
    // Cuirasse astrale d'Atacama turquoise & or ciselé
    const nyxGrad = ctx.createLinearGradient(chs.x - 6, chs.y - 4.5, chs.x + 6, wst.y + 2.5);
    nyxGrad.addColorStop(0, '#22D3EE');
    nyxGrad.addColorStop(0.45, '#0891B2');
    nyxGrad.addColorStop(1, '#164E63');
    ctx.fillStyle = nyxGrad;
    ctx.beginPath();
    ctx.moveTo(chs.x - 6.6, chs.y - 4.4);
    ctx.lineTo(wst.x - 3.2, wst.y + 1.8);
    ctx.lineTo(wst.x + 0.5, wst.y + 3.0);
    ctx.lineTo(wst.x + 4.0, wst.y + 1.8);
    ctx.lineTo(chs.x + 7.0, chs.y - 4.4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 0.95;
    ctx.stroke();

    // Base de la ceinture de bronze (le pagne frontal d'Atacama est dessiné en premier plan)
    ctx.fillStyle = '#92400E';
    ctx.beginPath();
    ctx.roundRect(pel.x - hipHalf - 0.2, pel.y - 2.2, hipHalf * 2 + 0.4, 3.6, 0.9);
    ctx.fill();

    // Cœur runique stellaire ardent + conduits bio-électriques
    ctx.fillStyle = '#06B6D4';
    ctx.beginPath();
    ctx.arc(chs.x + 0.8, chs.y - 1.1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ECFEFF';
    ctx.beginPath();
    ctx.arc(chs.x + 0.9, chs.y - 1.2, 1.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (isMalakor) {
    // Plastron impérial d'airain à côtes d'or et Crâne Souverain en relief (fidèle au trône et au portrait)
    const armorGrad = ctx.createLinearGradient(chs.x - 8, chs.y - 5, chs.x + 8, wst.y + 2);
    armorGrad.addColorStop(0, '#581C87');
    armorGrad.addColorStop(0.5, '#3B0764');
    armorGrad.addColorStop(1, '#1E1B4B');
    ctx.fillStyle = armorGrad;
    ctx.beginPath();
    ctx.moveTo(chs.x - 8.4, chs.y - 4.6);
    ctx.lineTo(wst.x - 4.8, wst.y + 1.8);
    ctx.lineTo(wst.x + 5.2, wst.y + 1.8);
    ctx.lineTo(chs.x + 8.8, chs.y - 4.6);
    ctx.closePath();
    ctx.fill();

    // Côtes d'or ciselées du plastron
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(chs.x - 8.0, chs.y - 4.2);
    ctx.lineTo(wst.x + 0.8, wst.y + 2.2);
    ctx.lineTo(chs.x + 8.4, chs.y - 4.2);
    ctx.moveTo(chs.x - 6.2, chs.y - 1.2);
    ctx.lineTo(wst.x + 0.8, wst.y + 0.4);
    ctx.lineTo(chs.x + 6.6, chs.y - 1.2);
    ctx.stroke();

    // Crâne d'airain en haut-relief au centre du buste avec orbites violettes incandescentes
    const skX = chs.x + 0.8;
    const skY = chs.y - 1.6;
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(skX, skY, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.arc(skX + 0.3, skY - 0.6, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#E879F9';
    ctx.fillRect(skX - 1.4, skY - 0.6, 1.1, 1.0);
    ctx.fillRect(skX + 0.5, skY - 0.6, 1.1, 1.0);

    // Ceinturon royal d'airain + gemme d'Égide Noire
    const beltGrad = ctx.createLinearGradient(pel.x, pel.y - 3, pel.x, pel.y + 2.2);
    beltGrad.addColorStop(0, '#F59E0B');
    beltGrad.addColorStop(0.55, '#B45309');
    beltGrad.addColorStop(1, '#78350F');
    ctx.fillStyle = beltGrad;
    ctx.beginPath();
    ctx.roundRect(pel.x - hipHalf - 0.3, pel.y - 2.8, hipHalf * 2 + 0.6, 4.9, 1.2);
    ctx.fill();

    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.roundRect(pel.x - 2.8, pel.y - 2.4, 5.8, 4.0, 0.8);
    ctx.fill();
    ctx.fillStyle = '#E879F9';
    ctx.beginPath();
    ctx.arc(pel.x + 0.1, pel.y - 0.4, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Tête sculptée haute finesse avec plans faciaux 3D (arête nasale, pommette, ombre sous-mentonnière),
 * expressions réactives à l'action (cri Kiai, grimace d'impact, K.O., sourire de victoire) et coiffure fidèle.
 */
function drawDetailedHead(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  frame: number
): void {
  const hd = toS(pose.head);
  const nk = toS(pose.neck);
  const floorRestY = SPRITE_ORIGIN_Y + 1.2;
  const skinRamp = buildSmoothRamp(def.skinColor, 1.0);

  // 1) Cou anatomique fondu + ombre portée douce sous la mâchoire
  drawSeamlessLimbChain(
    ctx,
    [
      {
        a: pose.neck,
        b: pose.head,
        rA: 3.3,
        rMid: 3.4,
        rB: 3.6,
        color: def.skinColor,
      },
    ],
    0.90,
    0.50
  );

  ctx.fillStyle = skinRamp.deepShadow;
  ctx.beginPath();
  ctx.ellipse(
    (nk.x + hd.x) * 0.5 + 0.6,
    hd.y + 4.9,
    3.1,
    1.35,
    0.12,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // 2) Orientation 3D continue de la tête (rotation Y continue sur 360°)
  // faceFacing : +1.0 (profil droit franc), 0.0 (face caméra), -1.0 (vue arrière complète)
  const faceFacing = Math.cos(pose.spinY ?? 0);
  const frontFactor = Math.max(0, Math.min(1, (faceFacing + 0.18) / 0.78));
  const backFactor = Math.max(0, Math.min(1, (-faceFacing + 0.22) / 0.78));
  const noseExtend = Math.max(0, Math.min(1.0, faceFacing));

  // Silhouette extérieure ciselée : transition progressive entre profil 3/4 et crâne occipital galbé
  const traceHeadPath = (inflate: number) => {
    ctx.beginPath();
    // Saillie progressive du nez qui rentre harmonieusement dans le crâne quand la tête pivote vers l'arrière
    const noseProtrusion = (5.0 + 1.85 * noseExtend) * frontFactor + 5.6 * (1 - frontFactor);
    ctx.moveTo(hd.x - 5.6 - inflate - backFactor * 0.4, hd.y - 3.4);
    ctx.quadraticCurveTo(
      hd.x - 6.0 - inflate,
      hd.y - 7.2 - inflate,
      hd.x + 0.5,
      hd.y - 7.2 - inflate
    );
    ctx.quadraticCurveTo(
      hd.x + 5.9 + inflate,
      hd.y - 6.8 - inflate,
      hd.x + (5.6 + 0.5 * frontFactor) + inflate,
      hd.y - 1.5
    );
    // Saillie nette du nez 3/4 profilée selon l'angle de rotation Y, disparaissant de dos
    ctx.lineTo(hd.x + noseProtrusion + inflate, hd.y + 0.65);
    ctx.lineTo(hd.x + (5.6 + 0.55 * frontFactor) + inflate, hd.y + 1.45);
    ctx.quadraticCurveTo(
      hd.x + (5.5 + 0.5 * frontFactor) + inflate,
      hd.y + 4.8 + inflate,
      hd.x + (3.8 + 0.7 * frontFactor),
      hd.y + 5.35 + inflate
    );
    ctx.quadraticCurveTo(
      hd.x - 0.5,
      hd.y + 5.6 + inflate,
      hd.x - 5.0 - inflate,
      hd.y + 2.2
    );
    ctx.closePath();
  };

  ctx.fillStyle = skinRamp.contour;
  traceHeadPath(0.60);
  ctx.fill();

  // Dégradé facial multi-plans fluide (dérive progressivement selon l'angle de rotation Y)
  const faceGrad = ctx.createRadialGradient(
    hd.x + 2.3 * faceFacing - 1.2 * backFactor,
    hd.y - 2.1,
    0.9,
    hd.x + 0.4 * faceFacing,
    hd.y + 0.2,
    7.6
  );
  faceGrad.addColorStop(0.0, skinRamp.specular);
  faceGrad.addColorStop(0.42, skinRamp.light);
  faceGrad.addColorStop(0.76, skinRamp.mid);
  faceGrad.addColorStop(1.0, skinRamp.deepShadow);

  ctx.fillStyle = faceGrad;
  traceHeadPath(0);
  ctx.fill();

  // Éclat de pommette zygomatique et arête lumineuse du nez (fondu progressif)
  if (frontFactor > 0.05 && f.id !== 'malakor') {
    ctx.save();
    ctx.globalAlpha = frontFactor;
    ctx.fillStyle = skinRamp.specular;
    ctx.beginPath();
    ctx.ellipse(hd.x + 2.1 * frontFactor, hd.y + 0.55, 1.35 * frontFactor, 0.7, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = skinRamp.specular;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(hd.x + 3.8 + 1.5 * frontFactor, hd.y - 1.6);
    ctx.lineTo(hd.x + 4.6 + 1.9 * frontFactor, hd.y + 0.55);
    ctx.stroke();

    ctx.fillStyle = skinRamp.deepShadow;
    ctx.beginPath();
    ctx.arc(hd.x + 4.0 + 1.5 * frontFactor, hd.y + 1.15, 0.55 * frontFactor, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Oreille sculptée (pavillon + conque interne, visible de profil et s'estompant de face/dos)
  if (frontFactor > 0.08) {
    ctx.save();
    ctx.globalAlpha = frontFactor;
    ctx.fillStyle = skinRamp.halftone;
    ctx.beginPath();
    ctx.ellipse(hd.x - 2.6 * faceFacing, hd.y + 0.4, 1.15, 1.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skinRamp.deepShadow;
    ctx.beginPath();
    ctx.ellipse(hd.x - 2.5 * faceFacing, hd.y + 0.45, 0.55, 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // États expressifs dynamiques selon l'animation en cours
  const isKO = f.action === 'DEFEAT';
  const isPain =
    f.action === 'HITSTUN' ||
    f.action === 'HITSTUN_GUT' ||
    f.action === 'KNOCKDOWN' ||
    f.action === 'FINISHER_VICTIM' ||
    f.action === 'DIZZY';
  const isFierce =
    f.action.includes('ATTACK') ||
    f.action === 'LOW_KICK' ||
    f.action === 'UPPERCUT_NORMAL' ||
    f.action === 'THROW' ||
    f.action.startsWith('SPECIAL') ||
    f.action === 'FINISHER' ||
    f.action === 'TAUNT';
  const isPowerGlow =
    f.action.startsWith('SPECIAL') || f.action === 'FINISHER' || f.action === 'TAUNT';

  // 3) Traits faciaux expressifs (arcade sourcilière, regard, bouche) : fondu 3D progressif
  if (frontFactor > 0.05) {
    ctx.save();
    ctx.globalAlpha = frontFactor;

    // Arcade sourcilière expressive
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    if (isPain) {
      ctx.moveTo(hd.x + 0.5 + 0.6 * frontFactor, hd.y - 2.5);
      ctx.lineTo(hd.x + 1.2 + 4.0 * frontFactor, hd.y - 1.5);
    } else if (isFierce) {
      ctx.moveTo(hd.x + 0.5 + 0.5 * frontFactor, hd.y - 2.3);
      ctx.lineTo(hd.x + 1.2 + 4.2 * frontFactor, hd.y - 1.65);
    } else {
      ctx.moveTo(hd.x + 0.5 + 0.7 * frontFactor, hd.y - 2.1);
      ctx.lineTo(hd.x + 1.2 + 4.0 * frontFactor, hd.y - 1.9);
    }
    ctx.stroke();

    // Regard (fermé en K.O., plissé sous l'impact, étincelant en attaque spéciale)
    if (isKO && f.id !== 'malakor') {
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(hd.x + 1.8 * frontFactor, hd.y - 0.9);
      ctx.quadraticCurveTo(hd.x + 3.4 * frontFactor, hd.y - 0.3, hd.x + 4.9 * frontFactor, hd.y - 0.95);
      ctx.stroke();
    } else {
      const eyeGlow =
        f.id === 'krowen'
          ? '#FACC15'
          : f.id === 'malakor'
          ? '#E879F9'
          : f.id === 'nyxia'
          ? '#67E8F9'
          : '#F8FAFC';

      const eyeCenterX = hd.x + 1.2 + 2.15 * frontFactor;
      ctx.fillStyle = eyeGlow;
      ctx.beginPath();
      ctx.ellipse(
        eyeCenterX,
        hd.y - 0.9,
        1.65 * (0.35 + 0.65 * frontFactor),
        isPain ? 0.62 : 0.88,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      if (f.id !== 'krowen' && f.id !== 'malakor' && f.id !== 'nyxia') {
        ctx.fillStyle = isPowerGlow ? def.accentColor : '#0F172A';
        ctx.beginPath();
        ctx.arc(eyeCenterX + 0.6 * frontFactor, hd.y - 0.9, 0.74 * frontFactor, 0, Math.PI * 2);
        ctx.fill();

        // Éclat cornéen blanc pur (donne vie au regard en pixel-art)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(eyeCenterX + 0.3 * frontFactor, hd.y - 1.15, 0.34 * frontFactor, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Expressions buccales (visages découverts : Kenji, Mei-Lin, Titan, Nyxia)
    if (f.id !== 'krowen' && f.id !== 'malakor') {
      const mouthY = f.id === 'titan' ? hd.y + 2.4 : hd.y + 2.65;
      const mouthX = hd.x + 1.2 + 2.0 * frontFactor;
      const mouthW = Math.max(0.8, 2.5 * frontFactor);
      if (isFierce) {
        // Cri martial Kiai : bouche ouverte + éclat des dents supérieures
        ctx.fillStyle = '#450A0A';
        ctx.beginPath();
        ctx.roundRect(mouthX, mouthY - 0.55, mouthW, 1.75, 0.55);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(mouthX + 0.2, mouthY - 0.45, Math.max(0.6, mouthW - 0.5), 0.65);
      } else if (isPain) {
        // Grimace dents serrées sous le choc
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect(mouthX - 0.4, mouthY - 0.45, mouthW + 0.3, 1.4, 0.4);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(mouthX - 0.2, mouthY - 0.2, mouthW, 0.9);
      } else if (f.action === 'VICTORY') {
        // Sourire confiant de vainqueur
        ctx.strokeStyle = skinRamp.contour;
        ctx.lineWidth = 0.78;
        ctx.beginPath();
        ctx.moveTo(mouthX - 0.5, mouthY - 0.1);
        ctx.quadraticCurveTo(mouthX + mouthW * 0.5, mouthY + 0.55, mouthX + mouthW, mouthY - 0.2);
        ctx.stroke();
      } else {
        // Ligne labiale martiale déterminée + reflet de lèvre inférieure
        ctx.strokeStyle = skinRamp.contour;
        ctx.lineWidth = 0.72;
        ctx.beginPath();
        ctx.moveTo(mouthX, mouthY + 0.1);
        ctx.lineTo(mouthX + mouthW, mouthY + 0.05);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Coiffures, Bandeaux, Capuches & Heaumes haute précision
  const isJumping = f.vy < -0.4;
  const isFalling = f.vy > 0.4;
  // Cinématique réactive : les rubans et mèches s'élèvent en chute, descendent en saut, et traînent en course
  const liftY = -f.vy * 1.85;
  const dragX = -f.vx * 2.5 - (f.action.includes('ATTACK') || f.action === 'LOW_KICK' ? 4.0 : 0);
  const flutterRate = isJumping || isFalling || Math.abs(f.vx) > 0.4 ? 0.38 : 0.20;
  const ribbonWave1 = Math.sin(frame * flutterRate) * (isFalling ? 5.2 : 2.8);
  const ribbonWave2 = Math.cos(frame * (flutterRate * 0.9) + 0.8) * (isFalling ? 4.2 : 2.2);

  if (f.id === 'kenji') {
    const hairGrad = ctx.createLinearGradient(hd.x, hd.y - 10.5, hd.x, hd.y - 2);
    hairGrad.addColorStop(0, '#475569');
    hairGrad.addColorStop(0.45, '#1E293B');
    hairGrad.addColorStop(1, '#020617');

    ctx.fillStyle = hairGrad;
    ctx.beginPath();
    ctx.moveTo(hd.x - 6.3 - backFactor * 0.5, hd.y - 1.5);
    ctx.lineTo(hd.x - 8.2, hd.y - 7.2);
    ctx.lineTo(hd.x - 4.4, hd.y - 6.6);
    ctx.lineTo(hd.x - 3.3, hd.y - 10.2);
    ctx.lineTo(hd.x + 0.5, hd.y - 7.6);
    ctx.lineTo(hd.x + 3.2, hd.y - 9.8);
    ctx.lineTo(hd.x + (5.0 + 1.5 * frontFactor), hd.y - 5.8);
    ctx.lineTo(hd.x + (5.0 + 1.0 * frontFactor), hd.y - 3.2);
    ctx.closePath();
    ctx.fill();

    // Volume dorsal qui s'étoffe progressivement de façon continue lors des rotations 360° (jusqu'à 180°)
    if (backFactor > 0.05) {
      ctx.save();
      ctx.globalAlpha = backFactor;
      ctx.fillStyle = hairGrad;
      ctx.beginPath();
      ctx.ellipse(hd.x + 0.2, hd.y - 3.2, 6.2, 6.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Mèches lumineuses bleutées style anime / CPS-3
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hd.x - 3.1, hd.y - 9.4);
    ctx.lineTo(hd.x - 2.2, hd.y - 5.5);
    ctx.moveTo(hd.x + 2.8 * frontFactor, hd.y - 9.0);
    ctx.lineTo(hd.x + 2.0 * frontFactor, hd.y - 5.3);
    ctx.stroke();

    // Bandeau Hachimaki bleu roi avec reflet de soie céleste
    const bandGrad = ctx.createLinearGradient(hd.x - 6, hd.y - 4.6, hd.x + 6, hd.y - 2.0);
    bandGrad.addColorStop(0, '#1E3A8A');
    bandGrad.addColorStop(0.45, '#2563EB');
    bandGrad.addColorStop(0.7, '#93C5FD');
    bandGrad.addColorStop(1, '#1D4ED8');
    ctx.fillStyle = bandGrad;
    ctx.beginPath();
    ctx.roundRect(hd.x - 6.2, hd.y - 4.6, 12.6, 2.65, 0.9);
    ctx.fill();

    // Nœud latéral 3D qui tourne autour de la tête et pans cinétiques bleu roi réactifs aux sauts
    const knotX = hd.x - 5.8 * faceFacing;
    const knotY = hd.y - 3.2;

    ctx.fillStyle = '#1E40AF';
    ctx.beginPath();
    ctx.moveTo(knotX, knotY);
    ctx.quadraticCurveTo(
      knotX - 6.0 + dragX * 0.5,
      knotY + 2.0 + liftY * 0.6 + ribbonWave1 * 0.7,
      knotX - 11.5 + dragX,
      Math.min(floorRestY, knotY + 6.5 + liftY + ribbonWave1)
    );
    ctx.lineTo(knotX - 10.0 + dragX, Math.min(floorRestY, knotY + 8.2 + liftY + ribbonWave1));
    ctx.quadraticCurveTo(
      knotX - 4.8 + dragX * 0.4,
      knotY + 4.2 + liftY * 0.4 + ribbonWave1 * 0.4,
      knotX + 0.4,
      knotY + 1.2
    );
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.moveTo(knotX, knotY - 1.0);
    ctx.quadraticCurveTo(
      knotX - 7.5 + dragX * 0.6,
      knotY - 2.5 + liftY * 0.5 + ribbonWave2,
      knotX - 13.5 + dragX * 1.1,
      Math.min(floorRestY, knotY + 2.0 + liftY + ribbonWave2)
    );
    ctx.lineTo(knotX - 11.8 + dragX * 1.1, Math.min(floorRestY, knotY + 3.8 + liftY + ribbonWave2));
    ctx.quadraticCurveTo(
      knotX - 6.0 + dragX * 0.5,
      knotY - 0.5 + liftY * 0.3 + ribbonWave2 * 0.5,
      knotX,
      knotY + 0.5
    );
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#60A5FA';
    ctx.beginPath();
    ctx.arc(knotX, knotY, 1.55, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.id === 'krowen') {
    const hoodGrad = ctx.createLinearGradient(hd.x - 7, hd.y - 9, hd.x + 6, hd.y + 4);
    hoodGrad.addColorStop(0, '#475569');
    hoodGrad.addColorStop(0.45, '#1E293B');
    hoodGrad.addColorStop(1, '#030712');
    ctx.fillStyle = hoodGrad;
    ctx.beginPath();
    ctx.moveTo(hd.x - 7.0, hd.y + 4.2);
    ctx.quadraticCurveTo(hd.x - 7.4, hd.y - 6.8, hd.x + 0.5, hd.y - 9.2);
    ctx.quadraticCurveTo(hd.x + 6.4, hd.y - 7.0, hd.x + 6.7, hd.y - 3.5);
    ctx.lineTo(hd.x + 5.6, hd.y - 2.1);
    ctx.lineTo(hd.x - 1.4, hd.y - 2.8);
    ctx.lineTo(hd.x - 2.8, hd.y + 3.4);
    ctx.closePath();
    ctx.fill();

    // Couture frontale métallique de la capuche Shinobi
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(hd.x - 3.8, hd.y - 6.8);
    ctx.quadraticCurveTo(hd.x + 1.5, hd.y - 6.2, hd.x + 5.8, hd.y - 3.2);
    ctx.stroke();

    // Masque démon Menpo doré ciselé avec ouïes de respiration et crocs d'ivoire (fondu progressif 3D)
    if (frontFactor > 0.05) {
      ctx.save();
      ctx.globalAlpha = frontFactor;
      const maskGrad = ctx.createLinearGradient(hd.x - 1, hd.y, hd.x + 6.5, hd.y + 5.5);
      maskGrad.addColorStop(0, '#FBBF24');
      maskGrad.addColorStop(0.55, '#B45309');
      maskGrad.addColorStop(1, '#451A03');
      ctx.fillStyle = maskGrad;
      ctx.beginPath();
      ctx.moveTo(hd.x - 1.0, hd.y + 0.1);
      ctx.lineTo(hd.x + (4.0 + 2.7 * frontFactor), hd.y + 0.1);
      ctx.quadraticCurveTo(hd.x + 6.3 * frontFactor, hd.y + 5.4, hd.x + (3.0 + 1.8 * frontFactor), hd.y + 5.6);
      ctx.lineTo(hd.x - 0.8, hd.y + 5.0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FEF9C3';
      ctx.beginPath();
      ctx.moveTo(hd.x + 1.5, hd.y + 1.7);
      ctx.lineTo(hd.x + 2.25, hd.y + 4.3);
      ctx.lineTo(hd.x + 2.95, hd.y + 1.7);
      ctx.moveTo(hd.x + 4.05, hd.y + 1.7);
      ctx.lineTo(hd.x + 4.75, hd.y + 4.3);
      ctx.lineTo(hd.x + 5.4, hd.y + 1.7);
      ctx.fill();
      ctx.restore();
    }
  } else if (f.id === 'meilin') {
    const hairGrad = ctx.createRadialGradient(hd.x - 0.8, hd.y - 5.2, 1, hd.x - 0.5, hd.y - 3, 7);
    hairGrad.addColorStop(0, '#475569');
    hairGrad.addColorStop(0.5, '#0F172A');
    hairGrad.addColorStop(1, '#020617');
    ctx.fillStyle = hairGrad;
    ctx.beginPath();
    ctx.arc(hd.x - 0.4, hd.y - 2.6, 6.3, Math.PI * 0.88, Math.PI * 2.12);
    ctx.fill();

    // Couronne de reflets soyeux bleutés dans la chevelure
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(hd.x - 0.2, hd.y - 3.2, 4.7, Math.PI * 1.15, Math.PI * 1.82);
    ctx.stroke();

    // Chignon impérial 3D + coiffe d'or, perle de jade et épingle Kanzashi (orbite autour de la tête)
    const chignonX = hd.x - 5.0 * faceFacing;
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(chignonX, hd.y - 7.0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(chignonX - 3.2, hd.y - 8.6);
    ctx.lineTo(chignonX + 2.8, hd.y - 5.4);
    ctx.stroke();

    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.roundRect(chignonX - 1.3, hd.y - 7.3, 2.8, 2.4, 0.8);
    ctx.fill();
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(chignonX + 0.1, hd.y - 6.1, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Longue natte de soie noire avec physique de saut / course
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(chignonX - 0.8, hd.y - 6.2);
    ctx.quadraticCurveTo(
      chignonX - 8.5 + dragX * 0.7,
      hd.y - 9.2 + liftY * 0.6 + ribbonWave1,
      chignonX - 11.5 + dragX,
      Math.min(floorRestY, hd.y + 2.2 + liftY + ribbonWave1)
    );
    ctx.quadraticCurveTo(
      chignonX - 5.8 + dragX * 0.4,
      hd.y - 1.0 + liftY * 0.3 + ribbonWave1 * 0.5,
      chignonX,
      hd.y - 4.6
    );
    ctx.closePath();
    ctx.fill();
  } else if (f.id === 'titan') {
    // Coupe brosse militaire sculptée avec dégradé sur les tempes
    const buzzGrad = ctx.createLinearGradient(hd.x, hd.y - 7.8, hd.x, hd.y - 4.0);
    buzzGrad.addColorStop(0, '#4E342E');
    buzzGrad.addColorStop(0.55, '#27170F');
    buzzGrad.addColorStop(1, '#140B07');
    ctx.fillStyle = buzzGrad;
    ctx.beginPath();
    ctx.roundRect(hd.x - 5.7, hd.y - 7.5, 11.4, 3.3, 1.0);
    ctx.fill();

    // Barbe et moustache de lutteur sculptées (fondu 3D progressif qui s'estompe quand la tête tourne)
    if (frontFactor > 0.05) {
      ctx.save();
      ctx.globalAlpha = frontFactor;
      const beardGrad = ctx.createLinearGradient(hd.x, hd.y + 0.6, hd.x, hd.y + 7.2);
      beardGrad.addColorStop(0, '#4E342E');
      beardGrad.addColorStop(0.6, '#27170F');
      beardGrad.addColorStop(1, '#120905');
      ctx.fillStyle = beardGrad;
      ctx.beginPath();
      ctx.moveTo(hd.x - 3.8 * faceFacing, hd.y + 0.4);
      ctx.lineTo(hd.x + 2.4 * frontFactor, hd.y + 1.8);
      ctx.lineTo(hd.x + (3.4 + 3.0 * frontFactor), hd.y + 1.6);
      ctx.lineTo(hd.x + (3.3 + 3.0 * frontFactor), hd.y + 2.3);
      ctx.lineTo(hd.x + 2.9 * frontFactor, hd.y + 2.3);
      ctx.lineTo(hd.x + 2.9 * frontFactor, hd.y + 3.7);
      ctx.lineTo(hd.x + (3.3 + 3.0 * frontFactor), hd.y + 3.6);
      ctx.quadraticCurveTo(hd.x + (3.0 + 3.0 * frontFactor), hd.y + 6.8, hd.x + (2.0 + 2.3 * frontFactor), hd.y + 7.1);
      ctx.lineTo(hd.x - 2.2 * faceFacing, hd.y + 6.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (f.id === 'nyxia') {
    const silRamp = buildSmoothRamp('#F8FAFC', 1.0);
    const hairGrad = ctx.createLinearGradient(hd.x - 6, hd.y - 9, hd.x + 5, hd.y + 2);
    hairGrad.addColorStop(0, '#FFFFFF');
    hairGrad.addColorStop(0.55, silRamp.mid);
    hairGrad.addColorStop(1, silRamp.deepShadow);

    ctx.fillStyle = hairGrad;
    ctx.beginPath();
    ctx.arc(hd.x - 0.5, hd.y - 3.0, 6.6, Math.PI * 0.80, Math.PI * 2.18);
    ctx.fill();

    // Double mèche argentée flottante avec physique réactive aux sauts et courses
    const lockY = Math.min(floorRestY, hd.y + 16.4 + liftY);
    ctx.fillStyle = silRamp.shadow;
    ctx.beginPath();
    ctx.moveTo(hd.x - 6.0, hd.y - 2.6);
    ctx.quadraticCurveTo(
      hd.x - 13.0 + dragX * 0.6,
      hd.y + 5.0 + liftY * 0.5 + ribbonWave1 * 0.6,
      hd.x - 11.2 + dragX,
      Math.min(floorRestY, hd.y + 13.8 + liftY)
    );
    ctx.lineTo(hd.x - 8.8 + dragX, Math.min(floorRestY, hd.y + 12.2 + liftY));
    ctx.quadraticCurveTo(
      hd.x - 9.8 + dragX * 0.4,
      hd.y + 5.0 + liftY * 0.4 + ribbonWave1 * 0.4,
      hd.x - 4.4,
      hd.y - 1.2
    );
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = silRamp.light;
    ctx.beginPath();
    ctx.moveTo(hd.x - 5.4, hd.y - 3.0);
    ctx.quadraticCurveTo(
      hd.x - 11.2 + dragX * 0.5,
      hd.y + 6.0 + liftY * 0.5 + ribbonWave2 * 0.5,
      hd.x - 8.6 + dragX * 0.8,
      lockY
    );
    ctx.lineTo(hd.x - 6.2 + dragX * 0.8, Math.min(floorRestY, lockY - 1.6));
    ctx.quadraticCurveTo(
      hd.x - 8.0 + dragX * 0.4,
      hd.y + 6.0 + liftY * 0.4 + ribbonWave2 * 0.4,
      hd.x - 3.2,
      hd.y - 1.0
    );
    ctx.closePath();
    ctx.fill();

    // Diadème solaire d'Atacama serti d'un cristal stellaire cyan
    const circletGrad = ctx.createLinearGradient(hd.x - 4, hd.y - 4.5, hd.x + 6, hd.y - 2.6);
    circletGrad.addColorStop(0, '#92400E');
    circletGrad.addColorStop(0.55, '#F59E0B');
    circletGrad.addColorStop(1, '#FEF08A');
    ctx.fillStyle = circletGrad;
    ctx.beginPath();
    ctx.roundRect(hd.x - 4.0, hd.y - 4.5, 10.3, 2.0, 0.7);
    ctx.fill();

    if (frontFactor > 0.05) {
      ctx.save();
      ctx.globalAlpha = frontFactor;
      ctx.fillStyle = '#06B6D4';
      ctx.beginPath();
      ctx.arc(hd.x + 1.2 + 3.4 * frontFactor, hd.y - 3.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ECFEFF';
      ctx.beginPath();
      ctx.arc(hd.x + 1.3 + 3.4 * frontFactor, hd.y - 3.6, 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (f.id === 'malakor') {
    // Visière abyssale ombrée + regard spectral incandescent (fondu 3D progressif)
    if (frontFactor > 0.05) {
      ctx.save();
      ctx.globalAlpha = frontFactor;
      ctx.fillStyle = '#0F0724';
      ctx.fillRect(hd.x - 4.4, hd.y - 3.2, 5.0 + 5.6 * frontFactor, 4.6);

      ctx.fillStyle = '#E879F9';
      ctx.beginPath();
      ctx.ellipse(hd.x + 1.2 + 2.4 * frontFactor, hd.y - 1.0, 1.85 * frontFactor, 0.9, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(hd.x + 1.4 + 2.6 * frontFactor, hd.y - 1.05, 0.55 * frontFactor, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Heaume impérial d'airain couronné avec nasal ciselé
    const helmGrad = ctx.createLinearGradient(hd.x - 6, hd.y - 8.0, hd.x + 6, hd.y + 1);
    helmGrad.addColorStop(0, '#FEF08A');
    helmGrad.addColorStop(0.35, '#F59E0B');
    helmGrad.addColorStop(0.75, '#B45309');
    helmGrad.addColorStop(1, '#451A03');
    ctx.fillStyle = helmGrad;
    ctx.beginPath();
    ctx.moveTo(hd.x - 6.5, hd.y - 2.2);
    ctx.lineTo(hd.x - 6.1, hd.y - 7.8);
    ctx.lineTo(hd.x + 0.5, hd.y - 8.6);
    ctx.lineTo(hd.x + 6.4, hd.y - 7.1);
    ctx.lineTo(hd.x + 6.7, hd.y - 1.6);
    ctx.lineTo(hd.x + 5.7, hd.y + 1.8);
    ctx.lineTo(hd.x + 4.7, hd.y - 1.4);
    ctx.lineTo(hd.x + 1.2, hd.y - 0.5);
    ctx.closePath();
    ctx.fill();

    // Grandes cornes souveraines annelées d'ivoire et d'or
    const hornGrad = ctx.createLinearGradient(hd.x, hd.y - 17, hd.x, hd.y - 6);
    hornGrad.addColorStop(0, '#FFFFFF');
    hornGrad.addColorStop(0.35, '#FEF9C3');
    hornGrad.addColorStop(0.7, '#FBBF24');
    hornGrad.addColorStop(1, '#92400E');
    ctx.fillStyle = hornGrad;

    ctx.beginPath();
    ctx.moveTo(hd.x - 5.0, hd.y - 6.2);
    ctx.quadraticCurveTo(hd.x - 11.0, hd.y - 12.0, hd.x - 7.0, hd.y - 17.2);
    ctx.quadraticCurveTo(hd.x - 8.0, hd.y - 11.2, hd.x - 2.4, hd.y - 6.6);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(hd.x + 3.4, hd.y - 6.4);
    ctx.quadraticCurveTo(hd.x + 10.0, hd.y - 12.0, hd.x + 7.0, hd.y - 17.2);
    ctx.quadraticCurveTo(hd.x + 7.2, hd.y - 11.2, hd.x + 5.6, hd.y - 5.8);
    ctx.closePath();
    ctx.fill();
  }

  if (f.action === 'DIZZY') {
    for (let s = 0; s < 3; s++) {
      const a = frame * 0.18 + s * 2.09;
      const sx = hd.x + Math.cos(a) * 10.5;
      const sy = hd.y - 11.5 + Math.sin(a) * 3.0;
      ctx.fillStyle = s % 2 === 0 ? '#FACC15' : '#FB7185';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Dessine la traînée cinétique progressive (du point d'origine de l'élan jusqu'à la position EXACTE
 * actuelle du poing, du pied ou de la lame). Ne dépasse JAMAIS en avant de l'extrémité frappante !
 */
function drawProgressiveTrailRibbon(
  ctx: CanvasRenderingContext2D,
  trail: ProgressiveTrailData
): void {
  const pts = trail.points.map(toS);
  if (pts.length < 2) return;

  const n = pts.length;
  const head = pts[n - 1];
  const tail = pts[0];

  const leftSide: Array<{ x: number; y: number }> = [];
  const rightSide: Array<{ x: number; y: number }> = [];
  const coreLeft: Array<{ x: number; y: number }> = [];
  const coreRight: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tlen = Math.hypot(tx, ty) || 1;
    tx /= tlen;
    ty /= tlen;

    const nx = -ty;
    const ny = tx;

    // Effilement à 0px à la queue [0] et raccord net à l'intérieur du poing/pied/lame [n-1] sans dépassement avant !
    const profile = t < 0.85 ? Math.pow(t / 0.85, 1.35) : 1.0 - (t - 0.85) * 2.2;
    const halfW = Math.max(0, trail.width * 0.5 * profile);

    leftSide.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
    rightSide.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });

    const coreHalfW = halfW * 0.38;
    coreLeft.push({ x: pts[i].x + nx * coreHalfW, y: pts[i].y + ny * coreHalfW });
    coreRight.push({ x: pts[i].x - nx * coreHalfW, y: pts[i].y - ny * coreHalfW });
  }

  const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  grad.addColorStop(0.0, tintHex(trail.color, 0.9, 0, 0.0));
  grad.addColorStop(0.35, tintHex(trail.color, 1.0, 0, 0.48 * trail.alpha));
  grad.addColorStop(0.85, tintHex(trail.color, 1.1, 16, 0.88 * trail.alpha));
  grad.addColorStop(1.0, tintHex(trail.color, 1.15, 24, 0.92 * trail.alpha));

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(leftSide[0].x, leftSide[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(leftSide[i].x, leftSide[i].y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(rightSide[i].x, rightSide[i].y);
  ctx.closePath();
  ctx.fill();

  const coreGrad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  coreGrad.addColorStop(0.0, 'rgba(255,255,255,0)');
  coreGrad.addColorStop(0.55, `rgba(255,255,255,${(0.35 * trail.alpha).toFixed(2)})`);
  coreGrad.addColorStop(1.0, `rgba(255,255,255,${(0.82 * trail.alpha).toFixed(2)})`);

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.moveTo(coreLeft[0].x, coreLeft[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(coreLeft[i].x, coreLeft[i].y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(coreRight[i].x, coreRight[i].y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Drapés et ceintures de premier plan (pan frontal brodé du Qipao de Mei-Lin, pagne runique turquoise de Nyxia,
 * nœud de ceinture Obi de Kenji, boucle lourde de Titan) :
 * Dessinés EN PREMIER PLAN après la cuisse antérieure, assurant que le bas-ventre et les cuisses
 * ne soient JAMAIS coupés en deux par l'articulation de la hanche !
 */
function drawFrontGarmentFlaps(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  globalFrame: number,
  rightLegInFront: boolean
): void {
  const pel = toS(pose.pelvis);
  const floorRestY = SPRITE_ORIGIN_Y + 1.2;

  if (f.id === 'meilin') {
    // Si coup de pied fendant très haut vers l'avant, la fente haute s'écarte
    const isKickingForward =
      f.action === 'LOW_KICK' ||
      f.action === 'SPECIAL_1' ||
      (f.action.includes('ATTACK') && (pose.ankleR.x > pose.pelvis.x + 18 || pose.ankleL.x > pose.pelvis.x + 18));

    const apronBottomY = Math.min(floorRestY, pel.y + 13.6);
    const skirtWave = Math.sin(globalFrame * 0.22 - f.vx * 0.4) * 2.2;
    const qipaoRamp = buildSmoothRamp(def.primaryColor, 1.0);
    const skGrad = ctx.createLinearGradient(pel.x - 5, pel.y, pel.x + 7, apronBottomY);
    skGrad.addColorStop(0, qipaoRamp.specular);
    skGrad.addColorStop(0.28, qipaoRamp.light);
    skGrad.addColorStop(0.68, qipaoRamp.mid);
    skGrad.addColorStop(1, qipaoRamp.deepShadow);

    const flapOffsetX = isKickingForward ? -4.2 : 0;
    const flapWidth = isKickingForward ? 8.2 : 10.4;

    // Pan frontal de soie impériale qui drape le bas-ventre et la cuisse en un bloc fluide
    ctx.fillStyle = skGrad;
    ctx.beginPath();
    ctx.moveTo(pel.x - 4.8 + flapOffsetX, pel.y - 1.2);
    ctx.lineTo(pel.x - 4.8 + flapOffsetX + flapWidth, pel.y - 1.2);
    ctx.quadraticCurveTo(
      pel.x + 6.2 + flapOffsetX + skirtWave * 0.4,
      (pel.y + apronBottomY) * 0.5,
      pel.x + 6.0 + flapOffsetX + skirtWave * 0.75,
      apronBottomY - 0.6
    );
    ctx.lineTo(pel.x + 0.8 + flapOffsetX + skirtWave * 0.4, apronBottomY);
    ctx.lineTo(pel.x - 4.4 + flapOffsetX + skirtWave * 0.25, Math.min(floorRestY, apronBottomY - 1.5));
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 1.05;
    ctx.stroke();

    // Ceinture de soie vermillon nouée en avant du bassin (ligne continue, jamais scindée !)
    const sashGrad = ctx.createLinearGradient(pel.x, pel.y - 2.6, pel.x, pel.y + 1.5);
    sashGrad.addColorStop(0, '#FCA5A5');
    sashGrad.addColorStop(0.4, '#EF4444');
    sashGrad.addColorStop(1, '#991B1B');
    ctx.fillStyle = sashGrad;
    ctx.beginPath();
    ctx.roundRect(pel.x - 5.8, pel.y - 2.4, 11.6, 3.6, 1.0);
    ctx.fill();

    // Nœud de soie impérial et perle d'or
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.arc(pel.x - 2.8, pel.y - 0.6, 1.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(pel.x - 2.8, pel.y - 0.6, 0.85, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.id === 'nyxia') {
    // Pagne runique stellaire d'Atacama drapé en avant des cuisses (zéro coupure du bas-ventre !)
    const loinY = Math.min(floorRestY, pel.y + 11.4);
    const nyxGrad = ctx.createLinearGradient(pel.x - 4, pel.y - 1, pel.x + 4, loinY);
    nyxGrad.addColorStop(0, '#22D3EE');
    nyxGrad.addColorStop(0.45, '#0891B2');
    nyxGrad.addColorStop(1, '#164E63');

    // Boucle de ceinturon de bronze
    ctx.fillStyle = '#92400E';
    ctx.beginPath();
    ctx.roundRect(pel.x - 6.6, pel.y - 2.2, 13.2, 3.6, 0.9);
    ctx.fill();

    if (loinY > pel.y + 2.0) {
      ctx.fillStyle = nyxGrad;
      ctx.beginPath();
      ctx.moveTo(pel.x - 3.2, pel.y - 0.8);
      ctx.lineTo(pel.x + 3.8, pel.y - 0.8);
      ctx.lineTo(pel.x + 2.4, loinY);
      ctx.lineTo(pel.x + 0.3, loinY + 0.6);
      ctx.lineTo(pel.x - 2.0, loinY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 0.95;
      ctx.stroke();

      // Gemme solaire centrale sur la boucle
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(pel.x + 0.3, pel.y - 0.4, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(pel.x + 0.4, pel.y - 0.5, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (f.id === 'kenji') {
    // Nœud du Obi (ceinture noire) et pans du Dogi en avant des hanches
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(pel.x - 2.2, pel.y - 1.5, 4.4, 3.2, 0.8);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(pel.x - 1.2, pel.y + 1.2);
    ctx.lineTo(pel.x - 3.4, pel.y + 6.2);
    ctx.lineTo(pel.x - 1.6, pel.y + 6.5);
    ctx.lineTo(pel.x + 0.2, pel.y + 1.4);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Dessine le combattant complet en haute précision dans le contexte courant (échelle 128x112).
 */
function paintFighterVectorArt(
  ctx: CanvasRenderingContext2D,
  f: FighterRuntime,
  def: FighterDefinition,
  pose: FighterPoseSkeleton,
  globalFrame: number
): void {
  // Cape royale drapée du Seigneur Malakor ou écharpe d'ombre de Krowen
  if (f.id === 'malakor' || f.id === 'krowen') {
    const chs = toS(pose.chest);
    const pel = toS(pose.pelvis);
    const floorRestY = SPRITE_ORIGIN_Y + 1.2;
    const isTorpille = f.id === 'malakor' && f.action === 'SPECIAL_1';
    const isJumping = f.vy < -0.3;
    const isFalling = f.vy > 0.3;
    const capeLift = -f.vy * 1.85; // Flotte haut lors des chutes, traîne vers le bas lors des sauts
    const capeLag = -f.vx * 2.4;
    const capeBase = f.id === 'malakor' ? '#7F1D1D' : '#1E293B';
    const capeRamp = buildSmoothRamp(capeBase, 1.0);

    if (isTorpille) {
      // Dans la Torpille Pourpre : la cape s'étire à l'horizontale derrière le corps en rotation supersonique !
      const flutter = Math.sin(globalFrame * 0.65) * 3.2;
      const ripple = Math.cos(globalFrame * 0.55) * 2.4;
      const capeTailX = pel.x - 26 + flutter * 0.5;
      const capeTailY1 = pel.y - 5.5 + flutter;
      const capeTailY2 = pel.y + 6.0 - flutter * 0.8;
      const capeTailYMid = pel.y + 0.5 + ripple;

      const cGrad = ctx.createLinearGradient(chs.x, chs.y, capeTailX, pel.y);
      cGrad.addColorStop(0, capeRamp.light);
      cGrad.addColorStop(0.45, capeRamp.mid);
      cGrad.addColorStop(1, capeRamp.deepShadow);

      ctx.fillStyle = capeRamp.contour;
      ctx.beginPath();
      ctx.moveTo(chs.x - 2, chs.y - 7.5);
      ctx.lineTo(chs.x - 2, chs.y + 7.5);
      ctx.quadraticCurveTo(pel.x - 8, pel.y + 6, capeTailX, capeTailY2);
      ctx.lineTo(capeTailX - 4, capeTailYMid);
      ctx.lineTo(capeTailX + 2, capeTailY1);
      ctx.quadraticCurveTo(pel.x - 8, pel.y - 6, chs.x - 2, chs.y - 7.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.moveTo(chs.x - 1.5, chs.y - 6.8);
      ctx.lineTo(chs.x - 1.5, chs.y + 6.8);
      ctx.quadraticCurveTo(pel.x - 8, pel.y + 5.2, capeTailX + 1, capeTailY2 - 0.8);
      ctx.lineTo(capeTailX - 3, capeTailYMid);
      ctx.lineTo(capeTailX + 2.5, capeTailY1 + 0.8);
      ctx.quadraticCurveTo(pel.x - 8, pel.y - 5.2, chs.x - 1.5, chs.y - 6.8);
      ctx.closePath();
      ctx.fill();

      // Liseré d'or royal vibrant dans le sillage supersonique horizontal
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(chs.x - 1.5, chs.y - 6.8);
      ctx.quadraticCurveTo(pel.x - 8, pel.y - 5.5, capeTailX + 2.5, capeTailY1 + 0.8);
      ctx.lineTo(capeTailX - 3, capeTailYMid);
      ctx.lineTo(capeTailX + 1, capeTailY2 - 0.8);
      ctx.quadraticCurveTo(pel.x - 8, pel.y + 5.5, chs.x - 1.5, chs.y + 6.8);
      ctx.stroke();
    } else {
      // Vol / Saut / Sol standard avec dynamique active de vent et d'inertie
      const wave = Math.sin(globalFrame * (isJumping || isFalling ? 0.38 : 0.20)) * 3.8;
      const tipY1 = Math.min(floorRestY, pel.y + 20.5 - capeLift);
      const tipY2 = Math.min(floorRestY, pel.y + 15.2 - capeLift * 0.85);
      const tipYMid = Math.min(floorRestY, pel.y + 17.6 - capeLift * 0.95);
      const tipX1 = pel.x - 13.8 + capeLag - wave;
      const tipX2 = pel.x - 21.2 + capeLag * 0.8 - wave * 0.6;
      const tipXMid = pel.x - 16.5 + capeLag * 0.9 - wave * 0.8;

      const cGrad = ctx.createLinearGradient(chs.x, chs.y - 3, pel.x - 20, tipY1);
      cGrad.addColorStop(0, capeRamp.light);
      cGrad.addColorStop(0.5, capeRamp.mid);
      cGrad.addColorStop(1, capeRamp.deepShadow);

      ctx.fillStyle = capeRamp.contour;
      ctx.beginPath();
      ctx.moveTo(chs.x - 5.0, chs.y - 3.4);
      ctx.lineTo(chs.x + 3.8, chs.y - 3.4);
      ctx.quadraticCurveTo(pel.x - 6.5, pel.y + 7.5, tipX1, tipY1 + 0.5);
      ctx.lineTo(tipXMid, tipYMid - 1.4);
      ctx.lineTo(tipX2, tipY2 + 0.4);
      ctx.quadraticCurveTo(chs.x - 11.4, pel.y, chs.x - 5.0, chs.y - 3.4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.moveTo(chs.x - 4.5, chs.y - 3.0);
      ctx.lineTo(chs.x + 3.5, chs.y - 3.0);
      ctx.quadraticCurveTo(pel.x - 7.0, pel.y + 8.0, tipX1 - 0.2, tipY1);
      ctx.lineTo(tipXMid + 0.1, tipYMid - 2.0);
      ctx.lineTo(tipX2 + 0.4, tipY2);
      ctx.quadraticCurveTo(chs.x - 11.0, pel.y, chs.x - 4.5, chs.y - 3.0);
      ctx.closePath();
      ctx.fill();

      // Plis drapés internes de la cape
      ctx.strokeStyle = capeRamp.deepShadow;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(chs.x - 2.0, chs.y - 1.5);
      ctx.quadraticCurveTo(pel.x - 9.0, pel.y + 6.5, tipXMid, tipYMid - 2.0);
      ctx.stroke();

      if (f.id === 'malakor') {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(tipX1 - 0.2, tipY1);
        ctx.lineTo(tipXMid + 0.1, tipYMid - 2.0);
        ctx.lineTo(tipX2 + 0.4, tipY2);
        ctx.stroke();
      }
    }
  }

  const legThick =
    f.id === 'titan' ? 6.2 :
    f.id === 'malakor' ? 5.2 :
    f.id === 'kenji' ? 4.4 :
    f.id === 'krowen' ? 4.0 :
    f.id === 'nyxia' ? 3.8 : 3.5;

  const shinThick =
    f.id === 'titan' ? 5.4 :
    f.id === 'malakor' ? 4.6 :
    f.id === 'kenji' ? 3.7 :
    f.id === 'krowen' ? 3.3 :
    f.id === 'nyxia' ? 3.2 : 2.9;

  const armThick =
    f.id === 'titan' ? 5.8 :
    f.id === 'malakor' ? 4.8 :
    f.id === 'kenji' ? 3.7 :
    f.id === 'krowen' ? 3.2 :
    f.id === 'nyxia' ? 3.0 : 2.8;

  const pantsColor =
    f.id === 'titan'
      ? '#334155'
      : f.id === 'meilin'
      ? '#065F46'
      : f.id === 'nyxia'
      ? '#78350F'
      : f.id === 'krowen'
      ? '#1E293B'
      : def.primaryColor;

  const bootColor =
    f.id === 'kenji'
      ? def.skinColor
      : f.id === 'meilin'
      ? '#F8FAFC'
      : f.id === 'malakor'
      ? '#B45309'
      : '#1E293B';

  const sleeveColor =
    f.id === 'kenji' || f.id === 'titan' || f.id === 'nyxia'
      ? def.skinColor
      : def.primaryColor;

  const rightLegInFront = pose.ankleR.z >= pose.ankleL.z;
  const rightArmInFront = pose.wristR.z >= pose.wristL.z;

  // 1) Membres d'arrière-plan
  if (rightLegInFront) {
    drawFighterLeg(ctx, f, def, pose, pose.hipL, pose.kneeL, pose.ankleL, pose.toeL, legThick, shinThick, pantsColor, bootColor, false);
  } else {
    drawFighterLeg(ctx, f, def, pose, pose.hipR, pose.kneeR, pose.ankleR, pose.toeR, legThick, shinThick, pantsColor, bootColor, false);
  }

  if (rightArmInFront) {
    drawFighterArm(ctx, f, def, pose, pose.shoulderL, pose.elbowL, pose.wristL, armThick, sleeveColor, false, globalFrame);
  } else {
    drawFighterArm(ctx, f, def, pose, pose.shoulderR, pose.elbowR, pose.wristR, armThick, sleeveColor, false, globalFrame);
  }

  // 2) Bassin, Torse soudé & Tête haute précision
  drawTorsoAndArmor(ctx, f, def, pose, globalFrame);
  drawDetailedHead(ctx, f, def, pose, globalFrame);

  // 3) Traînée cinétique progressive des coups à mains/pieds nus dessinée JUSTE DERRIÈRE le membre frappant :
  // garantit physiquement que le poing ou le pied mène toujours l'impact et tire sa traînée derrière lui !
  if (pose.progressiveTrail && !pose.progressiveTrail.isWeapon) {
    drawProgressiveTrailRibbon(ctx, pose.progressiveTrail);
  }

  // 4) Membres de premier plan
  if (rightLegInFront) {
    drawFighterLeg(ctx, f, def, pose, pose.hipR, pose.kneeR, pose.ankleR, pose.toeR, legThick, shinThick, pantsColor, bootColor, true);
  } else {
    drawFighterLeg(ctx, f, def, pose, pose.hipL, pose.kneeL, pose.ankleL, pose.toeL, legThick, shinThick, pantsColor, bootColor, true);
  }

  // Drapés de premier plan (pan de Qipao, pagne runique, obi) : dessinés EN PREMIER PLAN après les jambes pour éliminer toute coupure du bas-ventre !
  drawFrontGarmentFlaps(ctx, f, def, pose, globalFrame, rightLegInFront);

  // Pour les armes (Katana / Éventail), le sillage ardent précède le dessin de la lame d'acier brillante
  if (pose.progressiveTrail && pose.progressiveTrail.isWeapon) {
    drawProgressiveTrailRibbon(ctx, pose.progressiveTrail);
  }

  if (rightArmInFront) {
    drawFighterArm(ctx, f, def, pose, pose.shoulderR, pose.elbowR, pose.wristR, armThick, sleeveColor, true, globalFrame);
  } else {
    drawFighterArm(ctx, f, def, pose, pose.shoulderL, pose.elbowL, pose.wristL, armThick, sleeveColor, true, globalFrame);
  }

  // 5) Braises de brume ninja pendant la dissolution immobile du Pas de Brume (sans aucun trait de coupe !)
  if (pose.emberDissolve) {
    const pel = toS(pose.pelvis);
    for (let e = 0; e < 7; e++) {
      const ex = pel.x + Math.sin(e * 1.9 + globalFrame * 0.25) * 11;
      const ey = pel.y + 8 - ((globalFrame * 1.8 + e * 9) % 36);
      ctx.fillStyle = e % 2 === 0 ? '#F97316' : '#FDE047';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Matrice de tramage ordonné Bayer 4x4 centrée [-0.46875 .. +0.46875] pour dégradés 16-bit BGR565 soyeux
const BAYER_4X4 = [
  -7.5 / 16,  0.5 / 16, -5.5 / 16,  2.5 / 16,
   4.5 / 16, -3.5 / 16,  6.5 / 16, -1.5 / 16,
  -4.5 / 16,  3.5 / 16, -6.5 / 16,  1.5 / 16,
   7.5 / 16, -0.5 / 16,  5.5 / 16, -2.5 / 16,
];

function downsample4xToMid(
  hiEl: HTMLCanvasElement,
  midCtx: CanvasRenderingContext2D
): void {
  midCtx.clearRect(0, 0, MID_W, MID_H);
  midCtx.imageSmoothingEnabled = true;
  midCtx.imageSmoothingQuality = 'high';
  midCtx.drawImage(hiEl, 0, 0, MID_W, MID_H);
}

function downsampleMidToCell(
  midEl: HTMLCanvasElement,
  cellRawCtx: CanvasRenderingContext2D
): void {
  cellRawCtx.clearRect(0, 0, SPRITE_CELL_W, SPRITE_CELL_H);
  cellRawCtx.imageSmoothingEnabled = true;
  cellRawCtx.imageSmoothingQuality = 'high';
  cellRawCtx.drawImage(midEl, 0, 0, SPRITE_CELL_W, SPRITE_CELL_H);
}

/**
 * Pipeline Pixel-Art Arcade CPS-3 / Neo-Geo vers 16-bit BGR565 :
 * 1) Micro-contraste Unsharp 3x3 sur les détails internes (plis du kimono, phalanges, regard, armure).
 * 2) Contours Colorés Sélectifs Directionnels (Sel-Out) orientés vers la source lumineuse (0.42, -0.91).
 * 3) Rim-Light zénithal & lueur d'aura Ki sur les crêtes supérieures de la silhouette.
 * 4) Tramage ordonné Bayer 4x4 et quantification matérielle 5-6-5 exacte (avec garde anti-collision 0xF81F).
 */
function quantizeBufferBGR565(
  rawCtx: CanvasRenderingContext2D,
  outCtx: CanvasRenderingContext2D,
  w: number,
  h: number,
  xrayShock: boolean,
  magentaBg: boolean,
  teleportFade: number,
  accentRgb: [number, number, number],
  hasAura: boolean
): void {
  const srcImg = rawCtx.getImageData(0, 0, w, h);
  const src = srcImg.data;

  let outImg: ImageData;
  if (w === SPRITE_CELL_W && h === SPRITE_CELL_H) {
    if (!cachedCellImgData) {
      cachedCellImgData = outCtx.createImageData(SPRITE_CELL_W, SPRITE_CELL_H);
    }
    outImg = cachedCellImgData;
  } else if (w === MID_W && h === MID_H) {
    if (!cachedMidImgData) {
      cachedMidImgData = outCtx.createImageData(MID_W, MID_H);
    }
    outImg = cachedMidImgData;
  } else {
    outImg = outCtx.createImageData(w, h);
  }
  const dst = outImg.data;

  const fadeKeepMod = teleportFade > 0.65 ? 4 : teleportFade > 0.25 ? 2 : 1;
  const alphaFloor = magentaBg ? 120 : 28;
  const stride = w * 4;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * stride;
    const bayerRow = (y & 3) << 2;
    const hasUp = y > 0;
    const hasDown = y < h - 1;
    const hasUp2 = y > 1;

    for (let x = 0; x < w; x++) {
      const i = rowOffset + (x << 2);
      const a = src[i + 3];

      if (a < alphaFloor) {
        if (magentaBg) {
          dst[i] = 255;
          dst[i + 1] = 0;
          dst[i + 2] = 255;
          dst[i + 3] = 255;
        } else {
          dst[i] = 0;
          dst[i + 1] = 0;
          dst[i + 2] = 0;
          dst[i + 3] = 0;
        }
        continue;
      }

      if (magentaBg && fadeKeepMod > 1) {
        const keep =
          fadeKeepMod === 2 ? ((x + y) & 1) === 0 : (x & 1) === 0 && (y & 1) === 0;
        if (!keep) {
          dst[i] = 255;
          dst[i + 1] = 0;
          dst[i + 2] = 255;
          dst[i + 3] = 255;
          continue;
        }
      }

      if (xrayShock) {
        const bright = (x + y) % 3 !== 0;
        dst[i] = bright ? 255 : 24;
        dst[i + 1] = bright ? 255 : 180;
        dst[i + 2] = 255;
        dst[i + 3] = magentaBg ? 255 : a;
        continue;
      }

      let r = src[i];
      let g = src[i + 1];
      let b = src[i + 2];

      const idxL = x > 0 ? i - 4 : i;
      const idxR = x < w - 1 ? i + 4 : i;
      const idxU = hasUp ? i - stride : i;
      const idxD = hasDown ? i + stride : i;

      const aL = x > 0 ? src[idxL + 3] : 0;
      const aR = x < w - 1 ? src[idxR + 3] : 0;
      const aU = hasUp ? src[idxU + 3] : 0;
      const aD = hasDown ? src[idxD + 3] : 0;

      const minCardA = Math.min(aL, aR, aU, aD);
      const maxCardA = Math.max(aL, aR, aU, aD);

      let outAlpha = magentaBg ? 255 : Math.round(a * (1 - teleportFade));

      // 1) Contour Coloré Sélectif Directionnel (Sel-Out) sur le liseré externe des matériaux opaques
      if (minCardA < 105 && maxCardA >= 220 && a >= 108) {
        // Échantillonne la teinte du voisin intérieur le plus solide pour éviter toute pollution de bord
        let bestIdx = i;
        let bestA = a;
        if (aL > bestA) {
          bestA = aL;
          bestIdx = idxL;
        }
        if (aR > bestA) {
          bestA = aR;
          bestIdx = idxR;
        }
        if (aU > bestA) {
          bestA = aU;
          bestIdx = idxU;
        }
        if (aD > bestA) {
          bestIdx = idxD;
        }

        const baseR = (r + src[bestIdx]) * 0.5;
        const baseG = (g + src[bestIdx + 1]) * 0.5;
        const baseB = (b + src[bestIdx + 2]) * 0.5;

        const outX = aL - aR;
        const outY = aU - aD;
        const nLen = Math.hypot(outX, outY) || 1;
        const lightDot = (outX / nLen) * 0.42 + (outY / nLen) * -0.91;

        const shade = 0.34 + (lightDot + 1) * 0.16;
        r = baseR * shade + 4;
        g = baseG * shade + 6;
        b = baseB * shade + 14;

        if (hasAura && lightDot > 0.05) {
          r = r * 0.72 + accentRgb[0] * 0.36;
          g = g * 0.72 + accentRgb[1] * 0.36;
          b = b * 0.72 + accentRgb[2] * 0.36;
        }

        if (!magentaBg) {
          outAlpha = Math.round(Math.min(255, Math.max(a, 228)) * (1 - teleportFade));
        }
      } else if (a >= 218 && minCardA >= 145) {
        // 2) Micro-contraste 3x3 sur les volumes intérieurs (plis, muscles, yeux, ornements)
        const avgR = (src[idxL] + src[idxR] + src[idxU] + src[idxD]) * 0.25;
        const avgG = (src[idxL + 1] + src[idxR + 1] + src[idxU + 1] + src[idxD + 1]) * 0.25;
        const avgB = (src[idxL + 2] + src[idxR + 2] + src[idxU + 2] + src[idxD + 2]) * 0.25;

        r += (r - avgR) * 0.26;
        g += (g - avgG) * 0.26;
        b += (b - avgB) * 0.26;

        // 3) Rim-Light zénithal fin juste sous les crêtes supérieures éclairées
        if (hasUp2 && src[i - stride * 2 + 3] < 72) {
          if (hasAura) {
            r += 10 + accentRgb[0] * 0.20;
            g += 10 + accentRgb[1] * 0.20;
            b += 10 + accentRgb[2] * 0.20;
          } else {
            r += 11;
            g += 11;
            b += 9;
          }
        }
      }

      // 4) Tramage ordonné Bayer 4x4 + Quantification matérielle 16-bit BGR565 (5-6-5)
      const dither = BAYER_4X4[bayerRow | (x & 3)];
      const rClamped = r < 0 ? 0 : r > 255 ? 255 : r;
      const gClamped = g < 0 ? 0 : g > 255 ? 255 : g;
      const bClamped = b < 0 ? 0 : b > 255 ? 255 : b;

      const r5Idx = Math.min(31, Math.max(0, Math.round((rClamped * 31) / 255 + dither * 0.72)));
      let g6Idx = Math.min(63, Math.max(0, Math.round((gClamped * 63) / 255 + dither * 0.72)));
      const b5Idx = Math.min(31, Math.max(0, Math.round((bClamped * 31) / 255 + dither * 0.72)));

      // Garde matérielle anti-collision avec la clé chromatique Magenta BGR565 0xF81F (31, 0, 31)
      if (r5Idx === 31 && g6Idx === 0 && b5Idx === 31) {
        g6Idx = 1;
      }

      dst[i] = (r5Idx << 3) | (r5Idx >> 2);
      dst[i + 1] = (g6Idx << 2) | (g6Idx >> 4);
      dst[i + 2] = (b5Idx << 3) | (b5Idx >> 2);
      dst[i + 3] = outAlpha;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
}

/**
 * Génère une cellule de sprite FIXE 128x112 px sur fond Magenta #FF00FF (ou transparent)
 * prête pour les planches de sprites Gamebuino AKA (ESP32-S3) sans aucun pixel coupé.
 */
export function renderFixedSpriteCell(
  targetCtx: CanvasRenderingContext2D,
  destX: number,
  destY: number,
  f: FighterRuntime,
  globalFrame: number,
  magentaBg = true
): { clipped: boolean } {
  const bufs = ensureSpriteBuffers();
  if (!bufs) return { clipped: false };

  const { hiCtx, hiEl, midCtx, midEl, cellRawCtx, cellOutCtx, cellOutEl } = bufs;
  const def = FIGHTERS[f.id];
  const pose = computeFighterPose(f, globalFrame, def.accentColor);
  const accentRgb = parseHex(def.accentColor);

  hiCtx.clearRect(0, 0, HI_W, HI_H);
  hiCtx.save();
  hiCtx.scale(SS, SS);
  paintFighterVectorArt(hiCtx, f, def, pose, globalFrame);
  hiCtx.restore();

  // Intégration boîte 16 échantillons en deux passes (512x448 -> 256x224 -> 128x112)
  downsample4xToMid(hiEl, midCtx);
  downsampleMidToCell(midEl, cellRawCtx);

  // Vérification stricte de non-rognage sur les 4 bords de la cellule 128x112
  const check = cellRawCtx.getImageData(0, 0, SPRITE_CELL_W, SPRITE_CELL_H).data;
  let clipped = false;
  for (let x = 0; x < SPRITE_CELL_W; x++) {
    const topA = check[x * 4 + 3];
    const botA = check[((SPRITE_CELL_H - 1) * SPRITE_CELL_W + x) * 4 + 3];
    if (topA >= 120 || botA >= 120) clipped = true;
  }
  for (let y = 0; y < SPRITE_CELL_H; y++) {
    const leftA = check[(y * SPRITE_CELL_W) * 4 + 3];
    const rightA = check[(y * SPRITE_CELL_W + (SPRITE_CELL_W - 1)) * 4 + 3];
    if (leftA >= 120 || rightA >= 120) clipped = true;
  }

  quantizeBufferBGR565(
    cellRawCtx,
    cellOutCtx,
    SPRITE_CELL_W,
    SPRITE_CELL_H,
    pose.xrayShock,
    magentaBg,
    pose.teleportFade,
    accentRgb,
    pose.auraRadius > 0
  );
  targetCtx.drawImage(cellOutEl, destX, destY);

  return { clipped };
}

/**
 * Rend un combattant en jeu (128x112 BGR565 natif sur écran 320x240) ou sur vignette d'inspection HD
 * (256x224 BGR565 avec tramage Bayer, Sel-Out directionnel et micro-contraste).
 */
export function drawProPixelArtFighter(
  targetCtx: CanvasRenderingContext2D,
  f: FighterRuntime,
  groundScreenY: number,
  globalFrame: number,
  renderScale = 1.0
): void {
  const bufs = ensureSpriteBuffers();
  if (!bufs) return;

  const { hiCtx, hiEl, midCtx, midEl, midOutCtx, midOutEl, cellRawCtx, cellOutCtx, cellOutEl } = bufs;
  const def = FIGHTERS[f.id];
  const pose = computeFighterPose(f, globalFrame, def.accentColor);
  const accentRgb = parseHex(def.accentColor);

  const sx = Math.round(f.x);
  const sy = Math.round(groundScreenY + f.y);

  // 1. Ombre de contact au sol à double densité (noyau d'occlusion + pénombre douce)
  const shadowScale = Math.max(0.32, 1 + f.y / 115) * renderScale;
  const baseShadowRx = (f.id === 'titan' ? 21 : 16.5) * shadowScale;
  const baseShadowRy = 3.8 * shadowScale;
  targetCtx.save();
  targetCtx.fillStyle = 'rgba(4, 6, 14, 0.34)';
  targetCtx.beginPath();
  targetCtx.ellipse(sx, groundScreenY + 2 * renderScale, baseShadowRx * 1.12, baseShadowRy * 1.15, 0, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.fillStyle = 'rgba(2, 4, 10, 0.56)';
  targetCtx.beginPath();
  targetCtx.ellipse(sx, groundScreenY + 1.8 * renderScale, baseShadowRx * 0.74, baseShadowRy * 0.72, 0, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.restore();

  // 2. Dessin vectoriel haute-finesse dans le tampon 4x (512x448)
  hiCtx.clearRect(0, 0, HI_W, HI_H);
  hiCtx.save();
  hiCtx.scale(SS, SS);
  paintFighterVectorArt(hiCtx, f, def, pose, globalFrame);
  hiCtx.restore();

  targetCtx.save();
  targetCtx.translate(sx, sy);
  targetCtx.scale(f.facing * renderScale, renderScale);

  if (pose.auraRadius > 0) {
    targetCtx.strokeStyle = def.accentColor;
    targetCtx.lineWidth = 1.4;
    targetCtx.beginPath();
    targetCtx.ellipse(0, -1, 17 + Math.sin(globalFrame * 0.45) * 2.5, 4.2, 0, 0, Math.PI * 2);
    targetCtx.stroke();
  }

  downsample4xToMid(hiEl, midCtx);

  if (renderScale > 1.05) {
    // Sur les vignettes d'inspection de la Fiche Personnage : rendu BGR565 2x (256x224) ultra-net avec Sel-Out & Bayer
    quantizeBufferBGR565(
      midCtx,
      midOutCtx,
      MID_W,
      MID_H,
      pose.xrayShock,
      false,
      pose.teleportFade,
      accentRgb,
      pose.auraRadius > 0
    );
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = 'high';
    targetCtx.drawImage(
      midOutEl,
      -SPRITE_ORIGIN_X,
      -SPRITE_ORIGIN_Y,
      SPRITE_CELL_W,
      SPRITE_CELL_H
    );
  } else {
    // Sur l'écran natif 320x240 BGR565 de la Gamebuino AKA : cellule 128x112 1:1 au pixel près !
    downsampleMidToCell(midEl, cellRawCtx);
    quantizeBufferBGR565(
      cellRawCtx,
      cellOutCtx,
      SPRITE_CELL_W,
      SPRITE_CELL_H,
      pose.xrayShock,
      false,
      pose.teleportFade,
      accentRgb,
      pose.auraRadius > 0
    );
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(cellOutEl, -SPRITE_ORIGIN_X, -SPRITE_ORIGIN_Y);
  }

  if (f.action === 'BLOCK_HIGH' || f.action === 'BLOCK_LOW') {
    const shieldY = f.action === 'BLOCK_LOW' ? -26 : -44;
    targetCtx.strokeStyle = '#38BDF8';
    targetCtx.lineWidth = 1.8;
    targetCtx.beginPath();
    targetCtx.arc(11, shieldY, 13.5, -0.75, 0.75);
    targetCtx.stroke();
    targetCtx.strokeStyle = '#E0F2FE';
    targetCtx.lineWidth = 0.8;
    targetCtx.beginPath();
    targetCtx.arc(12.2, shieldY, 12.2, -0.58, 0.58);
    targetCtx.stroke();
  }

  if (f.action === 'FINISHER' && f.actionFrame > 16) {
    const beamH = 14 + Math.sin(globalFrame * 0.9) * 4;
    targetCtx.fillStyle = def.accentColor;
    targetCtx.fillRect(22, -46 - beamH * 0.5, 220, beamH);
    targetCtx.fillStyle = '#FFFFFF';
    targetCtx.fillRect(22, -46 - beamH * 0.22, 220, beamH * 0.44);
  }

  targetCtx.restore();
}
