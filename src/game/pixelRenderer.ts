import { FIGHTERS, FIGHTER_ORDER } from '../data/fighters';
import {
  MatchEngineState,
  ProjectileEntity,
  RenderEngineMode,
  StageDefinition,
} from '../types/game';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  STAGE_MIN_X,
  STAGE_WORLD_WIDTH,
  computeCameraLeftX,
} from './engine';
import { renderFull3DProScene } from './pro3DRenderer';
import { drawProPixelArtFighter } from './proSpriteRenderer';

const GROUND_SCREEN_Y = 208;
const FLOOR_HORIZON_Y = 176;

let sceneCanvas320: HTMLCanvasElement | null = null;
const stageImageCache = new Map<string, HTMLImageElement>();
const portraitImageCache = new Map<string, HTMLImageElement>();
let cacheInitialized = false;

function ensureStageImagesPreloaded(): void {
  if (cacheInitialized || typeof window === 'undefined') return;
  cacheInitialized = true;

  for (const id of FIGHTER_ORDER) {
    const f = FIGHTERS[id];
    const st = f.stage;
    if (!stageImageCache.has(st.id)) {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = st.bgImageUrl;
      stageImageCache.set(st.id, img);
    }
    if (!portraitImageCache.has(id)) {
      const pImg = new Image();
      pImg.referrerPolicy = 'no-referrer';
      pImg.src = f.portraitUrl;
      portraitImageCache.set(id, pImg);
    }
  }
}

/**
 * Plan 1 (0.16x) : Crête lointaine d'horizon atmosphérique pour accentuer la profondeur du monde 640px.
 */
function drawDistantHorizonSilhouette(
  ctx: CanvasRenderingContext2D,
  stage: StageDefinition,
  camDelta: number,
  panY: number
): void {
  const shift = -camDelta * 0.16;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 24, 0.46)';
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_HORIZON_Y);
  for (let sx = -16; sx <= ARENA_WIDTH + 16; sx += 16) {
    const wx = sx - shift;
    const ridge =
      stage.id === 'hk_harbor' || stage.id === 'siberia_foundry'
        ? Math.floor(Math.abs(Math.sin(wx * 0.032)) * 4) * 6 + ((Math.floor(wx / 28) % 3) * 5)
        : Math.sin(wx * 0.018) * 14 + Math.cos(wx * 0.043) * 7;
    ctx.lineTo(sx, Math.round(138 - ridge - panY * 0.4));
  }
  ctx.lineTo(ARENA_WIDTH, FLOOR_HORIZON_Y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Plan 3 (0.72x) : Piliers architecturaux 3D de plan médian répartis sur les 640px de l'arène.
 * Leur face latérale s'extrude dynamiquement selon l'angle de vue (sx - 160), créant un vrai relief 3D.
 */
function drawMidground3DArchitecture(
  ctx: CanvasRenderingContext2D,
  stage: StageDefinition,
  camDelta: number,
  panY: number,
  frame: number
): void {
  const worldOffsets = [-236, -118, 0, 118, 236];
  const horizonY = Math.round(FLOOR_HORIZON_Y + panY * 0.5);
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.18);

  const frontColor =
    stage.id === 'kyoto_dojo'
      ? '#991B1B'
      : stage.id === 'obsidian_pit'
      ? '#1E293B'
      : stage.id === 'hk_harbor'
      ? '#1E3A5F'
      : stage.id === 'siberia_foundry'
      ? '#334155'
      : stage.id === 'atacama_sanctuary'
      ? '#78350F'
      : '#44403C';

  const sideDarkColor =
    stage.id === 'kyoto_dojo'
      ? '#450A0A'
      : stage.id === 'obsidian_pit'
      ? '#090D16'
      : stage.id === 'hk_harbor'
      ? '#0F172A'
      : stage.id === 'siberia_foundry'
      ? '#1E293B'
      : stage.id === 'atacama_sanctuary'
      ? '#451A03'
      : '#1C1917';

  for (let idx = 0; idx < worldOffsets.length; idx++) {
    const wOff = worldOffsets[idx];
    // À l'ouverture du round (camDelta=0), le pilier central (wOff=0) s'efface dans les décors à point focal central
    if (wOff === 0 && (stage.id === 'brass_citadel' || stage.id === 'siberia_foundry')) {
      continue;
    }

    const sx = Math.round(ARENA_WIDTH * 0.5 + wOff - camDelta * 0.72);
    if (sx < -28 || sx > ARENA_WIDTH + 28) continue;

    // Épaisseur 3D de la tranche latérale visible en fonction du décalage par rapport à l'axe optique (160)
    const sideW = Math.round(Math.max(-6, Math.min(6, (ARENA_WIDTH * 0.5 - sx) * 0.055)));
    const colHalfW = wOff === 0 ? 6 : 8;
    const topY = Math.round((Math.abs(wOff) > 180 ? 28 : 38) + panY * 0.5);
    const colH = horizonY - topY;

    // Ombre portée du pilier sur le mur du fond
    ctx.fillStyle = 'rgba(4, 6, 14, 0.35)';
    ctx.fillRect(sx - colHalfW - 3, topY + 4, colHalfW * 2 + 6, colH);

    // Tranche 3D extrudée (gauche ou droite selon la parallaxe !)
    if (sideW !== 0) {
      ctx.fillStyle = sideDarkColor;
      if (sideW > 0) {
        ctx.fillRect(sx + colHalfW, topY + 2, sideW, colH - 2);
      } else {
        ctx.fillRect(sx - colHalfW + sideW, topY + 2, -sideW, colH - 2);
      }
    }

    // Fût principal du pilier
    ctx.fillStyle = frontColor;
    ctx.fillRect(sx - colHalfW, topY, colHalfW * 2, colH);

    // Filet spéculaire vertical sur l'arête éclairée
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(sx - colHalfW + 1, topY, 2, colH);

    // Socle mouluré 3D et chapiteau supérieur
    ctx.fillStyle = stage.floorTrim;
    ctx.fillRect(sx - colHalfW - 3, horizonY - 7, colHalfW * 2 + 6 + Math.abs(sideW) * 0.5, 7);
    ctx.fillRect(sx - colHalfW - 3, topY, colHalfW * 2 + 6, 5);

    // Détail lumineux signature par arène
    if (stage.id === 'kyoto_dojo') {
      // Lanterne Chochin suspendue avec halo chaud
      const lanternX = sx + (wOff <= 0 ? colHalfW + 6 : -colHalfW - 6);
      const lanternY = topY + 34;
      ctx.strokeStyle = '#1E293B';
      ctx.beginPath();
      ctx.moveTo(sx, topY + 24);
      ctx.lineTo(lanternX, lanternY - 5);
      ctx.stroke();
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(lanternX - 4, lanternY - 4, 8, 10);
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(lanternX - 4, lanternY - 5, 8, 2);
      ctx.fillRect(lanternX - 4, lanternY + 5, 8, 2);
    } else if (stage.id === 'hk_harbor') {
      // Balise néon portuaire + reflet vertical
      ctx.fillStyle = idx % 2 === 0 ? '#10B981' : '#38BDF8';
      ctx.fillRect(sx - 2, topY + 18, 4, 18);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(sx - 1, topY + 20, 2, 14);
    } else if (stage.id === 'atacama_sanctuary') {
      // Glyphes runiques turquoise gravés dans le monolithe
      ctx.fillStyle = `rgba(34, 211, 238, ${(0.55 + pulse * 0.4).toFixed(2)})`;
      ctx.fillRect(sx - 2, topY + 22, 4, 8);
      ctx.fillRect(sx - 3, topY + 36, 6, 3);
      ctx.fillRect(sx - 2, topY + 44, 4, 10);
    } else {
      // Vasque de feu / gyrophare de fonderie
      const flk = Math.round(Math.sin(frame * 0.34 + idx) * 2);
      ctx.fillStyle = stage.accentHex;
      ctx.fillRect(sx - 3, topY + 26 + flk, 6, 6);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx - 1, topY + 28 + flk, 2, 3);
    }
  }
}

/**
 * Plan 4 (0.72x à y=176 -> 1.00x exact à y=208 -> 1.28x à y=240) :
 * Plancher en scrolling différentiel façon Street Fighter II CPS-2 !
 * Au niveau des pieds (y=208), la vitesse du sol correspond à 100% au déplacement des combattants (zéro patinage).
 */
function drawDifferentialPerspectiveFloor(
  ctx: CanvasRenderingContext2D,
  stage: StageDefinition,
  camDelta: number,
  renderMode: RenderEngineMode
): void {
  const topY = FLOOR_HORIZON_Y;
  const botY = ARENA_HEIGHT;

  // Base dégradée en profondeur du sol de combat
  const floorGrad = ctx.createLinearGradient(0, topY, 0, botY);
  floorGrad.addColorStop(0, '#090D18');
  floorGrad.addColorStop(0.16, stage.floorMain);
  floorGrad.addColorStop(0.75, stage.floorMain);
  floorGrad.addColorStop(1, '#080B14');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, topY, ARENA_WIDTH, botY - topY);

  // Dalles trapézoïdales en vraie perspective différentielle (0.72x au fond -> 1.00x à y=208 -> 1.28x devant)
  const slabWorldW = 36;
  ctx.save();
  for (let i = -11; i <= 10; i++) {
    const w0 = i * slabWorldW;
    const w1 = (i + 1) * slabWorldW;

    const farX0 = ARENA_WIDTH * 0.5 + w0 - camDelta * 0.72;
    const farX1 = ARENA_WIDTH * 0.5 + w1 - camDelta * 0.72;
    const nearX0 = ARENA_WIDTH * 0.5 + w0 - camDelta * 1.28;
    const nearX1 = ARENA_WIDTH * 0.5 + w1 - camDelta * 1.28;

    if (Math.max(farX1, nearX1) < -8 || Math.min(farX0, nearX0) > ARENA_WIDTH + 8) {
      continue;
    }

    // Alternance subtile de tonalité d'une travée de dalles à l'autre pour percevoir immédiatement le défilement différentiel
    ctx.fillStyle =
      Math.abs(i) % 2 === 0
        ? 'rgba(255, 255, 255, 0.045)'
        : 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    ctx.moveTo(farX0, topY);
    ctx.lineTo(farX1, topY);
    ctx.lineTo(nearX1, botY);
    ctx.lineTo(nearX0, botY);
    ctx.closePath();
    ctx.fill();

    // Joint de perspective entre les travées
    ctx.strokeStyle =
      renderMode === 'HYBRID_25D_PRO'
        ? stage.floorTrim
        : 'rgba(255, 255, 255, 0.12)';
    ctx.globalAlpha = renderMode === 'HYBRID_25D_PRO' ? 0.38 : 0.65;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(farX0) + 0.5, topY);
    ctx.lineTo(Math.round(nearX0) + 0.5, botY);
    ctx.stroke();
  }
  ctx.restore();

  // Traverses horizontales à espacement progressif 1/Z (effet de bandes raster CPS-2)
  const zRows = [180, 185, 191, 199, 208, 219, 232];
  ctx.save();
  for (let r = 0; r < zRows.length; r++) {
    const ry = zRows[r];
    const isFootLine = ry === GROUND_SCREEN_Y;
    ctx.strokeStyle = isFootLine ? stage.floorTrim : 'rgba(15, 23, 42, 0.55)';
    ctx.globalAlpha = isFootLine ? 0.42 : 0.72;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ry + 0.5);
    ctx.lineTo(ARENA_WIDTH, ry + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  // Marqueurs tactiques au sol : médaillon central (x=320) & lignes de coin d'arène (x=36 / x=604)
  const centerFarX = ARENA_WIDTH * 0.5 - camDelta * 0.72;
  const centerMidX = ARENA_WIDTH * 0.5 - camDelta * 1.0;
  const centerNearX = ARENA_WIDTH * 0.5 - camDelta * 1.28;
  if (centerMidX > -32 && centerMidX < ARENA_WIDTH + 32) {
    ctx.save();
    ctx.strokeStyle = stage.accentHex;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(centerMidX, GROUND_SCREEN_Y, 22, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerFarX, topY + 2);
    ctx.lineTo(centerNearX, botY);
    ctx.stroke();
    ctx.restore();
  }

  const maxCornerOffset = STAGE_WORLD_WIDTH * 0.5 - STAGE_MIN_X;
  for (const side of [-1, 1]) {
    const wCorner = side * maxCornerOffset;
    const cFarX = ARENA_WIDTH * 0.5 + wCorner - camDelta * 0.72;
    const cNearX = ARENA_WIDTH * 0.5 + wCorner - camDelta * 1.28;
    if (Math.max(cFarX, cNearX) < -8 || Math.min(cFarX, cNearX) > ARENA_WIDTH + 8) continue;
    ctx.save();
    ctx.strokeStyle = stage.accentHex;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cFarX, topY + 2);
    ctx.lineTo(cNearX, botY);
    ctx.stroke();
    ctx.restore();
  }

  // Bordure moulurée du fond du ring (transition nette mur / tatami à y=176)
  ctx.fillStyle = stage.floorTrim;
  ctx.fillRect(0, topY - 1, ARENA_WIDTH, 3);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.fillRect(0, topY + 2, ARENA_WIDTH, 2);
}

/**
 * Plan 5B (1.34x) : Bornes / Braseros de premier plan défilant plus vite que les combattants
 * lorsqu'on approche des ailes gauche et droite de l'arène 640px !
 */
function drawForegroundParallaxProps(
  ctx: CanvasRenderingContext2D,
  stage: StageDefinition,
  camDelta: number,
  frame: number
): void {
  const propWorldOffsets = [-248, -152, 152, 248];
  for (let i = 0; i < propWorldOffsets.length; i++) {
    const wOff = propWorldOffsets[i];
    const sx = Math.round(ARENA_WIDTH * 0.5 + wOff - camDelta * 1.34);
    if (sx < -26 || sx > ARENA_WIDTH + 26) continue;

    const isOuterCorner = Math.abs(wOff) > 200;
    const baseTopY = isOuterCorner ? 194 : 212;
    const halfW = isOuterCorner ? 9 : 7;

    // Socle sombre de premier plan (créant une vraie parallaxe devant le plan des pieds !)
    ctx.fillStyle = '#070A12';
    ctx.fillRect(sx - halfW - 1, baseTopY, halfW * 2 + 2, ARENA_HEIGHT - baseTopY);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(sx - halfW, baseTopY + 2, halfW * 2, ARENA_HEIGHT - baseTopY - 2);
    ctx.fillStyle = stage.floorTrim;
    ctx.fillRect(sx - halfW - 2, baseTopY - 1, halfW * 2 + 4, 3);

    if (isOuterCorner) {
      const flicker = Math.round(Math.sin(frame * 0.36 + i) * 2);
      ctx.fillStyle = stage.accentHex;
      ctx.beginPath();
      ctx.moveTo(sx - 5, baseTopY - 1);
      ctx.lineTo(sx, baseTopY - 13 + flicker);
      ctx.lineTo(sx + 5, baseTopY - 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx - 1.5, baseTopY - 7 + flicker, 3, 4);
    }
  }
}

/**
 * Anime les détails vivants du décor Pixel-Art 320x240 sur toute la largeur panoramique :
 * lanternes vacillantes, pluie et flaques, étincelles de fonderie, éclairs d'orage, yeux du trône de crâne !
 */
function drawStageLiveAnimations(
  ctx: CanvasRenderingContext2D,
  stage: StageDefinition,
  panX: number,
  panY: number,
  frame: number
): void {
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.16);

  if (stage.id === 'kyoto_dojo') {
    ctx.save();
    ctx.globalAlpha = 0.14 + pulse * 0.1;
    ctx.fillStyle = '#FDBA74';
    ctx.beginPath();
    ctx.arc(62 - panX, 98 - panY, 22, 0, Math.PI * 2);
    ctx.arc(282 - panX, 108 - panY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < 18; i++) {
      const px = (((i * 29 + frame * 0.7 - panX * 1.1) % (ARENA_WIDTH + 20)) + (ARENA_WIDTH + 20)) % (ARENA_WIDTH + 20) - 10;
      const py = ((i * 19 + frame * (i % 2 === 0 ? 0.6 : -0.8)) % 198 + 198) % 198;
      ctx.fillStyle = i % 2 === 0 ? '#FDA4AF' : '#FB923C';
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
  } else if (stage.id === 'obsidian_pit') {
    ctx.save();
    ctx.globalAlpha = 0.12 + pulse * 0.12;
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(90 - panX, 128, 140, 48);
    ctx.restore();

    for (let i = 0; i < 18; i++) {
      const px = (((i * 23 + Math.sin(frame * 0.05 + i) * 8 - panX * 1.2) % ARENA_WIDTH) + ARENA_WIDTH) % ARENA_WIDTH;
      const py = ((230 - ((frame * 1.3 + i * 17) % 210)) + 230) % 230;
      ctx.fillStyle = i % 3 === 0 ? '#FEF08A' : '#F97316';
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
  } else if (stage.id === 'hk_harbor') {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const rx = (((i * 37 - frame * 2.4 - panX * 1.3) % ARENA_WIDTH) + ARENA_WIDTH) % ARENA_WIDTH;
      const ry = (i * 29 + frame * 5.2) % 212;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 3, ry + 8);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    for (let i = 0; i < 6; i++) {
      const splashAge = (frame + i * 11) % 24;
      const sx = (((i * 59 + 24 - panX * 2.0) % 280) + 280) % 280 + 20;
      const sy = 192 + (i % 3) * 12;
      ctx.beginPath();
      ctx.ellipse(sx, sy, splashAge * 0.4, splashAge * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (stage.id === 'siberia_foundry') {
    for (let i = 0; i < 20; i++) {
      if (i < 7) {
        const nx = (((i * 11 + frame * 0.5) % 58) + 58) % 58 + 8 - panX * 0.5;
        const ny = (i * 27 + frame * 1.1) % 165;
        ctx.fillStyle = '#E0F2FE';
        ctx.fillRect(Math.round(nx), Math.round(ny), 2, 2);
      } else {
        const sx = 152 - panX + Math.sin(i * 2.1 + frame * 0.12) * 28;
        const sy = 115 + ((frame * 1.8 + i * 13) % 60);
        ctx.fillStyle = i % 2 === 0 ? '#FEF08A' : '#FB923C';
        ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
      }
    }
  } else if (stage.id === 'atacama_sanctuary') {
    if (frame % 78 < 4) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#67E8F9';
      ctx.fillRect(0, 0, ARENA_WIDTH, FLOOR_HORIZON_Y);
      ctx.restore();
    }
    for (let i = 0; i < 12; i++) {
      const px = (((i * 31 + frame * 0.8 - panX) % ARENA_WIDTH) + ARENA_WIDTH) % ARENA_WIDTH;
      const py = 148 + Math.sin(frame * 0.1 + i) * 28;
      ctx.fillStyle = '#22D3EE';
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
  } else if (stage.id === 'brass_citadel') {
    ctx.save();
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    ctx.fillStyle = '#E879F9';
    ctx.fillRect(Math.round(151 - panX), Math.round(86 - panY), 4, 3);
    ctx.fillRect(Math.round(165 - panX), Math.round(86 - panY), 4, 3);
    ctx.restore();

    for (let i = 0; i < 14; i++) {
      const px = (i % 2 === 0 ? 104 : 216) - panX + Math.sin(frame * 0.2 + i) * 5;
      const py = 148 - ((frame * 1.2 + i * 9) % 34);
      ctx.fillStyle = i % 2 === 0 ? '#C084FC' : '#F0ABFC';
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
  }
}

function drawStage2D(
  ctx: CanvasRenderingContext2D,
  stage: StageDefinition,
  state: MatchEngineState,
  camDelta: number,
  camY: number,
  renderMode: RenderEngineMode
): void {
  if (state.darkSkyFlash > 0) {
    ctx.fillStyle = state.frame % 12 === 0 ? '#3B0764' : '#05060C';
    ctx.fillRect(0, 0, ARENA_WIDTH, FLOOR_HORIZON_Y);
    drawDifferentialPerspectiveFloor(ctx, stage, camDelta, renderMode);
    return;
  }

  const bgImg = stageImageCache.get(stage.id);
  const panX = camDelta * 0.42;
  const panY = camY * 0.24;

  // Plan 0 & 1 : Ciel profond + horizon lointain (0.16x)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, FLOOR_HORIZON_Y);
  skyGrad.addColorStop(0, stage.skyTop);
  skyGrad.addColorStop(1, stage.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, ARENA_WIDTH, FLOOR_HORIZON_Y);

  // Plan 2 (0.42x) : Fresque panoramique élargie couvrant tout le débattement [-160..+160] sans bord coupé
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    const panoW = 472;
    const panoH = ARENA_HEIGHT + 18;
    const drawX = Math.round((ARENA_WIDTH - panoW) * 0.5 - panX);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, ARENA_WIDTH, FLOOR_HORIZON_Y);
    ctx.clip();
    ctx.drawImage(bgImg, drawX, Math.round(-12 + panY), panoW, panoH);
    ctx.restore();
  } else {
    drawDistantHorizonSilhouette(ctx, stage, camDelta, panY);
  }

  // Plan 3 (0.72x) : Piliers et structures 3D à extrusion latérale dynamique
  drawMidground3DArchitecture(ctx, stage, camDelta, panY, state.frame);

  // Plan 4 (0.72x -> 1.00x -> 1.28x) : Plancher en perspective à scrolling différentiel CPS-2
  drawDifferentialPerspectiveFloor(ctx, stage, camDelta, renderMode);

  // Effets atmosphériques animés en parallaxe
  drawStageLiveAnimations(ctx, stage, panX, panY, state.frame);
}

function drawProProjectiles(
  ctx: CanvasRenderingContext2D,
  state: MatchEngineState,
  projectiles: ProjectileEntity[],
  frame: number
): void {
  for (const p of projectiles) {
    const px = Math.round(p.x);
    const py = Math.round(GROUND_SCREEN_Y + p.y);
    const dir = Math.sign(p.vx) || 1;

    if (p.kind === 'HARPOON') {
      // Chaîne articulée maillon par maillon depuis le poing de Krowen jusqu'au fer de lance !
      const owner = p.ownerSlot === 1 ? state.p1 : state.p2;
      const startX = Math.round(owner.x + owner.facing * 24);
      const startY = Math.round(GROUND_SCREEN_Y + owner.y - 42);

      const links = Math.max(4, Math.floor(Math.abs(px - startX) / 6));
      for (let i = 0; i <= links; i++) {
        const t = i / links;
        const lx = Math.round(startX + (px - startX) * t);
        const ly = Math.round(startY + (py - startY) * t + Math.sin(t * Math.PI * 3 + frame * 0.6) * 1.4);
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(lx - 2, ly - 2, 5, 4);
        ctx.fillStyle = i % 2 === 0 ? '#F59E0B' : '#94A3B8';
        ctx.fillRect(lx - 1, ly - 1, 3, 2);
      }

      // Pointe Kunai-Harpon barbelée incandescente
      ctx.fillStyle = '#1E1B4B';
      ctx.beginPath();
      ctx.moveTo(px + dir * 11, py);
      ctx.lineTo(px - dir * 6, py - 6.5);
      ctx.lineTo(px - dir * 3, py);
      ctx.lineTo(px - dir * 6, py + 6.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.moveTo(px + dir * 9, py);
      ctx.lineTo(px - dir * 5, py - 4.6);
      ctx.lineTo(px - dir * 2, py);
      ctx.lineTo(px - dir * 5, py + 4.6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.moveTo(px + dir * 6.5, py);
      ctx.lineTo(px - dir * 2, py - 2);
      ctx.lineTo(px - dir * 2, py + 2);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === 'STEEL_FAN') {
      // Éventail impérial d'acier et de jade à nervures d'or tournoyant !
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(frame * 0.65 * dir);

      // Sillage circulaire d'émeraude
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#065F46';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 10.5, -1.25, 1.25);
      ctx.closePath();
      ctx.fill();

      // Bordure de lames d'acier blanc
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 9.8, -1.22, 1.22);
      ctx.stroke();

      // Nervures impériales dorées
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 1;
      for (let r = -2; r <= 2; r++) {
        const a = r * 0.52;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5);
        ctx.stroke();
      }
      ctx.restore();
    } else if (p.kind === 'LIGHTNING_SPEAR') {
      // Javelot d'éclair astral multi-arcs
      ctx.strokeStyle = '#0891B2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px - dir * 18, py);
      ctx.lineTo(px + dir * 16, py);
      ctx.stroke();

      const flick = (frame & 2) === 0 ? 1 : -1;
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(px - dir * 18, py - 2 * flick);
      ctx.lineTo(px - dir * 7, py + 4 * flick);
      ctx.lineTo(px + dir * 4, py - 3.5 * flick);
      ctx.lineTo(px + dir * 16, py);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(px - dir * 14, py);
      ctx.lineTo(px - dir * 4, py - 2 * flick);
      ctx.lineTo(px + dir * 6, py + 1.5 * flick);
      ctx.lineTo(px + dir * 17, py);
      ctx.stroke();
    } else if (p.kind === 'STASIS_ORB') {
      // Orbe runique d'Atacama à anneaux croisés et cœur cristallin
      const r = 8 + Math.sin(frame * 0.4) * 1.8;
      ctx.strokeStyle = '#0891B2';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(px, py, r + 2.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#164E63';
      ctx.beginPath();
      ctx.arc(px, py, r * 0.85, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#67E8F9';
      ctx.lineWidth = 1.2;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(frame * 0.14);
      ctx.strokeRect(-r * 0.5, -r * 0.5, r, r);
      ctx.restore();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Onde Céleste (Hadouken) / Égide Noire sculptée façon CPS-3 (collerette d'onde + comète plasma + noyau ardent)
      const pulse = Math.sin(frame * 0.7) * 1.2;

      // Sillage de flammes Ki arrière
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(px + dir * 4, py - 7.5 - pulse * 0.4);
      ctx.quadraticCurveTo(px - dir * 10, py - 9, px - dir * 24, py - 3.5);
      ctx.lineTo(px - dir * 15, py);
      ctx.lineTo(px - dir * 26, py + 3.5);
      ctx.quadraticCurveTo(px - dir * 10, py + 9, px + dir * 4, py + 7.5 + pulse * 0.4);
      ctx.quadraticCurveTo(px + dir * 13, py, px + dir * 4, py - 7.5 - pulse * 0.4);
      ctx.closePath();
      ctx.fill();

      // Collerette d'onde de choc avant
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px + dir * 1, py, 9 + pulse * 0.5, dir > 0 ? -1.05 : Math.PI - 1.05, dir > 0 ? 1.05 : Math.PI + 1.05);
      ctx.stroke();

      // Noyau blanc incandescent profilé
      ctx.fillStyle = p.coreColor || '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(px + dir * 2.5, py, 6.5, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawArcadeHUD320(ctx: CanvasRenderingContext2D, state: MatchEngineState): void {
  const p1Def = FIGHTERS[state.p1.id];
  const p2Def = FIGHTERS[state.p2.id];
  const p1Mug = portraitImageCache.get(state.p1.id);
  const p2Mug = portraitImageCache.get(state.p2.id);

  // Bandeau supérieur arcade biseauté façon Capcom CPS-2 / SNK MVS
  ctx.fillStyle = 'rgba(7, 10, 18, 0.84)';
  ctx.fillRect(4, 4, 312, 31);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(4, 4, 312, 1);

  // --- MINI-PORTRAIT J1 (22x22) ---
  ctx.fillStyle = '#0B101E';
  ctx.fillRect(7, 7, 22, 22);
  if (p1Mug && p1Mug.complete && p1Mug.naturalWidth > 0) {
    ctx.drawImage(p1Mug, 7, 7, 22, 22);
  }
  ctx.strokeStyle = p1Def.accentColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(7.5, 7.5, 21, 21);

  // --- MINI-PORTRAIT J2 (22x22, symétrique) ---
  ctx.fillStyle = '#0B101E';
  ctx.fillRect(291, 7, 22, 22);
  if (p2Mug && p2Mug.complete && p2Mug.naturalWidth > 0) {
    ctx.save();
    ctx.translate(313, 7);
    ctx.scale(-1, 1);
    ctx.drawImage(p2Mug, 0, 0, 22, 22);
    ctx.restore();
  }
  ctx.strokeStyle = p2Def.accentColor;
  ctx.strokeRect(291.5, 7.5, 21, 21);

  const barW = 107;
  const barH = 9;

  // --- BARRE DE VIE J1 ---
  const p1Left = 32;
  ctx.fillStyle = '#090D16';
  ctx.fillRect(p1Left, 8, barW, barH);

  const p1RedW = Math.round((state.p1.displayHp / state.p1.maxHp) * barW);
  ctx.fillStyle = '#B91C1C';
  ctx.fillRect(p1Left + (barW - p1RedW), 8, p1RedW, barH);

  const p1Ratio = state.p1.hp / state.p1.maxHp;
  const p1HpW = Math.round(p1Ratio * barW);
  ctx.fillStyle = p1Ratio < 0.25 ? '#F97316' : '#FACC15';
  ctx.fillRect(p1Left + (barW - p1HpW), 8, p1HpW, barH);
  ctx.fillStyle = p1Ratio < 0.25 ? '#FDBA74' : '#FEF08A';
  ctx.fillRect(p1Left + (barW - p1HpW), 8, p1HpW, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(p1Left + (barW - p1HpW), 15, p1HpW, 2);

  // Cadre métallique double filet
  ctx.strokeStyle = '#E2E8F0';
  ctx.strokeRect(p1Left + 0.5, 8.5, barW - 1, barH - 1);

  // --- BARRE DE VIE J2 ---
  const p2Left = 181;
  ctx.fillStyle = '#090D16';
  ctx.fillRect(p2Left, 8, barW, barH);

  const p2RedW = Math.round((state.p2.displayHp / state.p2.maxHp) * barW);
  ctx.fillStyle = '#B91C1C';
  ctx.fillRect(p2Left, 8, p2RedW, barH);

  const p2Ratio = state.p2.hp / state.p2.maxHp;
  const p2HpW = Math.round(p2Ratio * barW);
  ctx.fillStyle = p2Ratio < 0.25 ? '#F97316' : '#FACC15';
  ctx.fillRect(p2Left, 8, p2HpW, barH);
  ctx.fillStyle = p2Ratio < 0.25 ? '#FDBA74' : '#FEF08A';
  ctx.fillRect(p2Left, 8, p2HpW, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(p2Left, 15, p2HpW, 2);

  ctx.strokeStyle = '#E2E8F0';
  ctx.strokeRect(p2Left + 0.5, 8.5, barW - 1, barH - 1);

  // --- CHRONOMÈTRE CENTRAL BISEAUTÉ ---
  const seconds = Math.max(0, Math.ceil(state.timerFrames / 60));
  ctx.fillStyle = '#080B14';
  ctx.fillRect(142, 6, 36, 24);
  ctx.strokeStyle = '#F59E0B';
  ctx.strokeRect(142.5, 6.5, 35, 23);

  ctx.fillStyle = seconds <= 15 ? '#EF4444' : '#F8FAFC';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(seconds).padStart(2, '0'), 160, 23);

  // --- NOMS & GEMMES DE VICTOIRE ---
  ctx.font = 'bold 9px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(p1Def.shortName, p1Left, 29);

  for (let w = 0; w < 2; w++) {
    const gx = p1Left + barW - 15 + w * 8;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(gx, 21, 6, 6);
    ctx.fillStyle = w < state.p1Wins ? '#FACC15' : '#334155';
    ctx.fillRect(gx + 1, 22, 4, 4);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(p2Def.shortName, p2Left + barW, 29);

  for (let w = 0; w < 2; w++) {
    const gx = p2Left + w * 8;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(gx, 21, 6, 6);
    ctx.fillStyle = w < state.p2Wins ? '#FACC15' : '#334155';
    ctx.fillRect(gx + 1, 22, 4, 4);
  }

  // --- JAUGES SUPER / KI SEGMENTÉES EN BAS D'ÉCRAN ---
  const kiW = 88;
  ctx.fillStyle = 'rgba(7, 10, 18, 0.86)';
  ctx.fillRect(8, 226, kiW + 4, 9);
  ctx.fillRect(ARENA_WIDTH - 12 - kiW, 226, kiW + 4, 9);
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(8.5, 226.5, kiW + 3, 8);
  ctx.strokeRect(ARENA_WIDTH - 11.5 - kiW, 226.5, kiW + 3, 8);

  const p1KiPx = Math.round((state.p1.ki / 100) * kiW);
  ctx.fillStyle = p1Def.accentColor;
  ctx.fillRect(10, 228, p1KiPx, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(10, 228, p1KiPx, 1.5);

  const p2KiPx = Math.round((state.p2.ki / 100) * kiW);
  ctx.fillStyle = p2Def.accentColor;
  ctx.fillRect(ARENA_WIDTH - 10 - p2KiPx, 228, p2KiPx, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(ARENA_WIDTH - 10 - p2KiPx, 228, p2KiPx, 1.5);

  // Graduations de segments Super (4 blocs)
  ctx.fillStyle = '#070A12';
  for (let seg = 1; seg <= 3; seg++) {
    ctx.fillRect(10 + seg * 22, 228, 1, 5);
    ctx.fillRect(ARENA_WIDTH - 10 - seg * 22, 228, 1, 5);
  }

  // --- COMPTEUR DE COMBOS ---
  if (state.p2.comboCount >= 2) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`${state.p2.comboCount} COUPS !`, 10, 49);
  }
  if (state.p1.comboCount >= 2) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#F97316';
    ctx.fillText(`${state.p1.comboCount} COUPS !`, 310, 49);
  }

  // --- BANNIÈRE D'ANNONCE ARCADE ---
  if (state.bannerTimer > 0 && state.bannerText) {
    ctx.fillStyle = 'rgba(8, 11, 20, 0.88)';
    ctx.fillRect(34, 74, 252, state.bannerSubtext ? 42 : 30);
    ctx.strokeStyle = state.bannerColor;
    ctx.strokeRect(34.5, 74.5, 251, state.bannerSubtext ? 41 : 29);

    ctx.textAlign = 'center';
    ctx.fillStyle = state.bannerColor;
    ctx.font = 'bold 18px "Barlow Condensed", sans-serif';
    ctx.fillText(state.bannerText, 160, 95);

    if (state.bannerSubtext) {
      ctx.fillStyle = '#F1F5F9';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText(state.bannerSubtext, 160, 109);
    }
  }
}

export function renderMatchToCanvas(
  targetCanvas: HTMLCanvasElement,
  state: MatchEngineState,
  stage: StageDefinition,
  renderMode: RenderEngineMode
): void {
  ensureStageImagesPreloaded();

  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) return;

  if (!sceneCanvas320) {
    sceneCanvas320 = document.createElement('canvas');
    sceneCanvas320.width = ARENA_WIDTH;
    sceneCanvas320.height = ARENA_HEIGHT;
  }
  const ctx = sceneCanvas320.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  const camLeftX = computeCameraLeftX(state.p1.x, state.p2.x);
  const camDelta = camLeftX - (STAGE_WORLD_WIDTH - ARENA_WIDTH) * 0.5;
  const minFighterY = Math.min(state.p1.y, state.p2.y);
  const camY = minFighterY * 0.25;

  const shakeX = state.screenShake > 0 ? Math.round((Math.random() - 0.5) * state.screenShake) : 0;
  const shakeY = state.screenShake > 0 ? Math.round((Math.random() - 0.5) * state.screenShake) : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  if (renderMode === 'FULL_3D_PRO') {
    const bgImg = stageImageCache.get(stage.id) || null;
    renderFull3DProScene(ctx, state, stage, bgImg);

    ctx.save();
    ctx.translate(-Math.round(camLeftX), 0);
    drawProProjectiles(ctx, state, state.projectiles, state.frame);
    for (const pt of state.particles) {
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y + 6), pt.size, pt.size);
    }
    ctx.restore();
  } else {
    drawStage2D(ctx, stage, state, camDelta, camY, renderMode);

    // Plan 5A (1.00x) : Caméra monde pour les combattants, projectiles et étincelles d'impact
    ctx.save();
    ctx.translate(-Math.round(camLeftX), 0);

    const p1Attacking = state.p1.action.includes('ATTACK') || state.p1.action.startsWith('SPECIAL');
    if (p1Attacking) {
      drawProPixelArtFighter(ctx, state.p2, GROUND_SCREEN_Y, state.frame);
      drawProPixelArtFighter(ctx, state.p1, GROUND_SCREEN_Y, state.frame);
    } else {
      drawProPixelArtFighter(ctx, state.p1, GROUND_SCREEN_Y, state.frame);
      drawProPixelArtFighter(ctx, state.p2, GROUND_SCREEN_Y, state.frame);
    }

    drawProProjectiles(ctx, state, state.projectiles, state.frame);

    for (const pt of state.particles) {
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y + 6), pt.size, pt.size);
    }

    ctx.restore();

    // Plan 5B (1.34x) : Bornes & braseros de premier plan défilant devant le ring
    drawForegroundParallaxProps(ctx, stage, camDelta, state.frame);
  }

  ctx.restore();

  drawArcadeHUD320(ctx, state);

  targetCtx.imageSmoothingEnabled = false;
  targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetCtx.drawImage(sceneCanvas320, 0, 0, targetCanvas.width, targetCanvas.height);
}
