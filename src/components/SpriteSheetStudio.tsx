import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Grid } from 'lucide-react';
import { FIGHTERS } from '../data/fighters';
import {
  MAGENTA_KEY_HEX,
  SPRITE_CELL_H,
  SPRITE_CELL_W,
  SPRITE_ORIGIN_X,
  SPRITE_ORIGIN_Y,
  renderFixedSpriteCell,
} from '../game/proSpriteRenderer';
import { FighterAction, FighterId, FighterRuntime } from '../types/game';

interface SpriteSheetStudioProps {
  fighterId: FighterId;
}

interface SpriteRowSpec {
  id: string;
  action: FighterAction;
  label: string;
  totalFrames: number;
  sampleProgress: number[];
  airborneJump?: boolean;
}

const COLS_PER_ROW = 6;

function makeSheetFighter(
  id: FighterId,
  action: FighterAction,
  actionFrame: number,
  totalFrames: number,
  airborneJump = false
): FighterRuntime {
  const def = FIGHTERS[id];
  return {
    id,
    slot: 1,
    x: 0,
    y: airborneJump ? -24 : 0,
    vx: airborneJump ? 1.6 : 0,
    vy: 0,
    facing: 1,
    hp: def.maxHp,
    maxHp: def.maxHp,
    displayHp: def.maxHp,
    ki: 100,
    action,
    actionFrame,
    actionTotalFrames: totalFrames,
    hitConfirmedThisMove: false,
    comboCount: 0,
    comboTimer: 0,
    stunGauge: 0,
    invulnFrames: 0,
    isBossBoosted: false,
    inputHistory: [],
    aiThought: '',
    aiCooldown: 0,
  };
}

/**
 * Générateur & Inspecteur de Planches de Sprites sur fond Magenta (#FF00FF / 0xF81F BGR565)
 * à cellules strictement fixes (128 × 112 px, pivot pied à X=60, Y=98) sans aucun pixel coupé.
 */
export const SpriteSheetStudio: React.FC<SpriteSheetStudioProps> = ({ fighterId }) => {
  const fighter = FIGHTERS[fighterId];
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pureExportCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [viewScope, setViewScope] = useState<'FULL_ATLAS' | 'SINGLE_ROW'>('FULL_ATLAS');
  const [selectedRowId, setSelectedRowId] = useState<string>('spec_3');
  const [zoomScale, setZoomScale] = useState<1 | 2>(1);
  const [showOverlayGuides, setShowOverlayGuides] = useState<boolean>(true);
  const [auditStats, setAuditStats] = useState<{ totalCells: number; clippedCells: number }>({
    totalCells: 0,
    clippedCells: 0,
  });

  const rows: SpriteRowSpec[] = useMemo(
    () => [
      {
        id: 'idle',
        action: 'IDLE',
        label: '01. Garde Martiale (Cycle)',
        totalFrames: 60,
        sampleProgress: [0.0, 0.17, 0.34, 0.5, 0.67, 0.84],
      },
      {
        id: 'walk_fwd',
        action: 'WALK_FWD',
        label: '02. Marche Avant',
        totalFrames: 48,
        sampleProgress: [0.0, 0.17, 0.34, 0.5, 0.67, 0.84],
      },
      {
        id: 'walk_back',
        action: 'WALK_BACK',
        label: '03. Marche Arrière',
        totalFrames: 48,
        sampleProgress: [0.0, 0.17, 0.34, 0.5, 0.67, 0.84],
      },
      {
        id: 'jump',
        action: 'JUMP',
        label: '04. Saut Martial / Salto',
        totalFrames: 48,
        sampleProgress: [0.06, 0.22, 0.38, 0.54, 0.72, 0.88],
        airborneJump: true,
      },
      {
        id: 'jump_attack',
        action: 'JUMP_ATTACK',
        label: '05. Coup Sauté Aérien',
        totalFrames: 44,
        sampleProgress: [0.08, 0.2, 0.36, 0.52, 0.66, 0.86],
        airborneJump: true,
      },
      {
        id: 'crouch',
        action: 'CROUCH',
        label: '06. Posture Accroupie',
        totalFrames: 36,
        sampleProgress: [0.05, 0.2, 0.38, 0.56, 0.74, 0.9],
      },
      {
        id: 'block_high',
        action: 'BLOCK_HIGH',
        label: '07. Garde Haute',
        totalFrames: 36,
        sampleProgress: [0.08, 0.24, 0.4, 0.58, 0.76, 0.92],
      },
      {
        id: 'block_low',
        action: 'BLOCK_LOW',
        label: '08. Garde Basse',
        totalFrames: 36,
        sampleProgress: [0.08, 0.24, 0.4, 0.58, 0.76, 0.92],
      },
      {
        id: 'evade_high',
        action: 'EVADE_HIGH',
        label: '09. Esquive Haute (Retrait)',
        totalFrames: 38,
        sampleProgress: [0.08, 0.24, 0.42, 0.58, 0.74, 0.9],
      },
      {
        id: 'evade_mid',
        action: 'EVADE_MID',
        label: '10. Esquive Moyenne (Pivot)',
        totalFrames: 38,
        sampleProgress: [0.08, 0.24, 0.42, 0.58, 0.74, 0.9],
      },
      {
        id: 'evade_low',
        action: 'EVADE_LOW',
        label: '11. Esquive Basse (Impulsion)',
        totalFrames: 38,
        sampleProgress: [0.08, 0.24, 0.42, 0.58, 0.74, 0.9],
      },
      {
        id: 'light_atk',
        action: 'LIGHT_ATTACK',
        label: '12. Direct Rapide (A)',
        totalFrames: 28,
        sampleProgress: [0.08, 0.2, 0.36, 0.48, 0.64, 0.86],
      },
      {
        id: 'heavy_atk',
        action: 'HEAVY_ATTACK',
        label: '13. Coup Lourd (B)',
        totalFrames: 36,
        sampleProgress: [0.08, 0.22, 0.38, 0.52, 0.66, 0.86],
      },
      {
        id: 'low_kick',
        action: 'LOW_KICK',
        label: '14. Balayette Basse (↓+B)',
        totalFrames: 34,
        sampleProgress: [0.08, 0.22, 0.38, 0.52, 0.66, 0.86],
      },
      {
        id: 'uppercut',
        action: 'UPPERCUT_NORMAL',
        label: '15. Uppercut Anti-Air (↓+A)',
        totalFrames: 34,
        sampleProgress: [0.08, 0.2, 0.36, 0.52, 0.68, 0.86],
      },
      {
        id: 'spec_1',
        action: 'SPECIAL_1',
        label: `16. ${fighter.specials[0].name}`,
        totalFrames: 48,
        sampleProgress: [0.08, 0.24, 0.38, 0.52, 0.68, 0.86],
      },
      {
        id: 'spec_2',
        action: 'SPECIAL_2',
        label: `17. ${fighter.specials[1].name}`,
        totalFrames: 48,
        sampleProgress: [0.08, 0.22, 0.4, 0.56, 0.72, 0.88],
      },
      {
        id: 'spec_3',
        action: 'SPECIAL_3',
        label: `18. ${fighter.specials[2].name}`,
        totalFrames: 50,
        sampleProgress: [0.08, 0.24, 0.4, 0.56, 0.72, 0.88],
      },
      {
        id: 'hitstun',
        action: 'HITSTUN',
        label: '19. Encaissement Haut',
        totalFrames: 32,
        sampleProgress: [0.06, 0.22, 0.38, 0.54, 0.72, 0.9],
      },
      {
        id: 'hitstun_gut',
        action: 'HITSTUN_GUT',
        label: '20. Encaissement Corps',
        totalFrames: 32,
        sampleProgress: [0.06, 0.22, 0.38, 0.54, 0.72, 0.9],
      },
      {
        id: 'knockdown',
        action: 'KNOCKDOWN',
        label: '21. Chute & Rebond K.O.',
        totalFrames: 46,
        sampleProgress: [0.08, 0.22, 0.36, 0.55, 0.74, 0.92],
      },
      {
        id: 'defeat',
        action: 'DEFEAT',
        label: '22. K.O. au Sol',
        totalFrames: 48,
        sampleProgress: [0.0, 0.2, 0.4, 0.6, 0.8, 0.95],
      },
      {
        id: 'victory',
        action: 'VICTORY',
        label: '23. Pose de Victoire',
        totalFrames: 60,
        sampleProgress: [0.08, 0.24, 0.42, 0.6, 0.78, 0.94],
      },
    ],
    [fighter]
  );

  const visibleRows = useMemo(() => {
    if (viewScope === 'SINGLE_ROW') {
      const found = rows.find((r) => r.id === selectedRowId);
      return found ? [found] : [rows[0]];
    }
    return rows;
  }, [rows, viewScope, selectedRowId]);

  const sheetWidth = COLS_PER_ROW * SPRITE_CELL_W;
  const sheetHeight = visibleRows.length * SPRITE_CELL_H;

  useEffect(() => {
    const displayCanvas = displayCanvasRef.current;
    if (!displayCanvas) return;

    if (!pureExportCanvasRef.current) {
      pureExportCanvasRef.current = document.createElement('canvas');
    }
    const pureCanvas = pureExportCanvasRef.current;
    pureCanvas.width = sheetWidth;
    pureCanvas.height = sheetHeight;

    displayCanvas.width = sheetWidth;
    displayCanvas.height = sheetHeight;

    const pureCtx = pureCanvas.getContext('2d');
    const dispCtx = displayCanvas.getContext('2d');
    if (!pureCtx || !dispCtx) return;

    pureCtx.imageSmoothingEnabled = false;
    pureCtx.fillStyle = MAGENTA_KEY_HEX;
    pureCtx.fillRect(0, 0, sheetWidth, sheetHeight);

    let totalCells = 0;
    let clippedCells = 0;

    visibleRows.forEach((rowSpec, rIdx) => {
      for (let cIdx = 0; cIdx < COLS_PER_ROW; cIdx++) {
        const p = rowSpec.sampleProgress[cIdx] ?? cIdx / COLS_PER_ROW;
        const actionFrame = Math.min(
          rowSpec.totalFrames - 1,
          Math.max(0, Math.round(p * rowSpec.totalFrames))
        );
        const globalFrame = Math.round(p * 30);

        const isAirborneKnockdown = rowSpec.action === 'KNOCKDOWN' && cIdx < 3;
        const dummy = makeSheetFighter(
          fighterId,
          rowSpec.action,
          actionFrame,
          rowSpec.totalFrames,
          Boolean(rowSpec.airborneJump || isAirborneKnockdown)
        );

        const destX = cIdx * SPRITE_CELL_W;
        const destY = rIdx * SPRITE_CELL_H;
        const { clipped } = renderFixedSpriteCell(pureCtx, destX, destY, dummy, globalFrame, true);

        totalCells += 1;
        if (clipped) clippedCells += 1;
      }
    });

    setAuditStats({ totalCells, clippedCells });

    // Copie 1:1 sur le canvas d'affichage + guides visuels optionnels (absents de l'export PNG !)
    dispCtx.imageSmoothingEnabled = false;
    dispCtx.drawImage(pureCanvas, 0, 0);

    if (showOverlayGuides) {
      dispCtx.save();
      dispCtx.strokeStyle = 'rgba(15, 23, 42, 0.38)';
      dispCtx.lineWidth = 1;

      for (let c = 1; c < COLS_PER_ROW; c++) {
        const gx = c * SPRITE_CELL_W + 0.5;
        dispCtx.beginPath();
        dispCtx.moveTo(gx, 0);
        dispCtx.lineTo(gx, sheetHeight);
        dispCtx.stroke();
      }
      for (let r = 1; r < visibleRows.length; r++) {
        const gy = r * SPRITE_CELL_H + 0.5;
        dispCtx.beginPath();
        dispCtx.moveTo(0, gy);
        dispCtx.lineTo(sheetWidth, gy);
        dispCtx.stroke();
      }

      // Repère discret du point pivot sol (60, 98) dans chaque cellule fixe 128×112
      dispCtx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      for (let r = 0; r < visibleRows.length; r++) {
        for (let c = 0; c < COLS_PER_ROW; c++) {
          const px = c * SPRITE_CELL_W + SPRITE_ORIGIN_X;
          const py = r * SPRITE_CELL_H + SPRITE_ORIGIN_Y;
          dispCtx.fillRect(px - 3, py, 7, 1);
          dispCtx.fillRect(px, py - 3, 1, 7);
        }
      }
      dispCtx.restore();
    }
  }, [fighterId, visibleRows, sheetWidth, sheetHeight, showOverlayGuides]);

  const handleDownloadPng = () => {
    const pureCanvas = pureExportCanvasRef.current;
    if (!pureCanvas) return;
    const dataUrl = pureCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    const suffix = viewScope === 'FULL_ATLAS' ? 'atlas_complet' : selectedRowId;
    a.href = dataUrl;
    a.download = `sprites_${fighterId}_${suffix}_${SPRITE_CELL_W}x${SPRITE_CELL_H}_magenta_bgr565.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div id="sprite-sheet-studio" className="bg-[#131822] border border-slate-800 rounded-xl p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <p className="text-xs text-slate-400">
            Export Matériel Gamebuino AKA · Clé Chromatique Magenta #FF00FF (0xF81F BGR565) · Cellules Fixes {SPRITE_CELL_W}×{SPRITE_CELL_H} px
          </p>
          <h3 className="font-display text-2xl font-bold text-slate-100">
            Planches de Sprites Fixes sur Fond Magenta — {fighter.name}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewScope('FULL_ATLAS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewScope === 'FULL_ATLAS'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Planche complète (23 anims)
            </button>
            <button
              type="button"
              onClick={() => setViewScope('SINGLE_ROW')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewScope === 'SINGLE_ROW'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Bande unique (6 frames)
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setZoomScale(1)}
              className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                zoomScale === 1
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1:1
            </button>
            <button
              type="button"
              onClick={() => setZoomScale(2)}
              className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                zoomScale === 2
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2×
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowOverlayGuides((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              showOverlayGuides
                ? 'bg-slate-800 border-slate-600 text-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Grille {SPRITE_CELL_W}×{SPRITE_CELL_H}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Télécharger PNG (#FF00FF)</span>
          </button>
        </div>
      </div>

      {/* Sélecteur rapide de séquence en mode Bande unique + Métadonnées techniques sans boîte */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
          <span>Dimensions planche : {sheetWidth}×{sheetHeight} px</span>
          <span aria-hidden="true">·</span>
          <span>Cellule fixe : {SPRITE_CELL_W}×{SPRITE_CELL_H} px</span>
          <span aria-hidden="true">·</span>
          <span>Pivot sol : ({SPRITE_ORIGIN_X}, {SPRITE_ORIGIN_Y})</span>
          <span aria-hidden="true">·</span>
          <span className={auditStats.clippedCells === 0 ? 'text-emerald-400' : 'text-amber-400'}>
            {auditStats.totalCells} sprites vérifiés ({auditStats.clippedCells} coupé)
          </span>
        </div>

        {viewScope === 'SINGLE_ROW' && (
          <div className="flex items-center gap-2">
            <label htmlFor="sprite-row-select" className="text-slate-300 font-medium shrink-0">
              Animation :
            </label>
            <select
              id="sprite-row-select"
              value={selectedRowId}
              onChange={(e) => setSelectedRowId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 cursor-pointer"
            >
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Visionneuse de la planche Magenta avec légende latérale alignée au pixel */}
      <div className="border border-slate-800 rounded-lg bg-[#090D16] overflow-auto max-h-[680px]">
        <div className="inline-flex min-w-full">
          {/* Colonne d'index des séquences (hors du PNG exporté) */}
          <div className="sticky left-0 z-10 bg-[#0D121F]/95 border-r border-slate-800 shrink-0 select-none">
            {visibleRows.map((rowSpec) => (
              <button
                key={rowSpec.id}
                type="button"
                onClick={() => {
                  setSelectedRowId(rowSpec.id);
                  setViewScope(viewScope === 'SINGLE_ROW' ? 'FULL_ATLAS' : 'SINGLE_ROW');
                }}
                style={{ height: `${SPRITE_CELL_H * zoomScale}px` }}
                className="w-48 px-3 border-b border-slate-800/70 flex flex-col justify-center text-left hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <span className="text-xs font-semibold text-slate-100 truncate">
                  {rowSpec.label}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  6 × {SPRITE_CELL_W}×{SPRITE_CELL_H} px
                </span>
              </button>
            ))}
          </div>

          {/* Planche de sprites sur fond Magenta #FF00FF pur */}
          <div className="p-0 shrink-0">
            <canvas
              ref={displayCanvasRef}
              width={sheetWidth}
              height={sheetHeight}
              style={{
                width: `${sheetWidth * zoomScale}px`,
                height: `${sheetHeight * zoomScale}px`,
              }}
              className="block pixel-canvas"
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Le fichier PNG téléchargé contient exclusivement les cellules fixes <span className="font-mono text-slate-200">{SPRITE_CELL_W}×{SPRITE_CELL_H}</span> sur fond <span className="font-mono text-fuchsia-400">#FF00FF</span> pur (sans la grille ni la colonne de titres), directement exploitable par le blitter DMA <span className="font-mono text-slate-200">0xF81F</span> en BGR565 sur l’ESP32-S3.
      </p>
    </div>
  );
};
