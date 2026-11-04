import React, { useEffect, useRef } from 'react';
import { FIGHTERS } from '../data/fighters';
import { drawStandalone3DFighter } from '../game/pro3DRenderer';
import { drawProPixelArtFighter } from '../game/proSpriteRenderer';
import {
  FighterAction,
  FighterId,
  FighterRuntime,
  RenderEngineMode,
} from '../types/game';

interface FighterAnimationBoardProps {
  fighterId: FighterId;
  renderMode: RenderEngineMode;
  activeAction: FighterAction;
  onSelectAnimation: (action: FighterAction) => void;
}

interface AnimationTileSpec {
  id: string;
  category: 'Déplacements & Sauts' | 'Esquives (Haute · Moyenne · Basse)' | 'Coups Normaux' | 'Coups Spéciaux' | 'Impacts & K.O.';
  title: string;
  inputHint: string;
  primaryAction: FighterAction;
  cycleFrames: number;
  alternateAction?: FighterAction;
}

const TILE_W = 224;
const TILE_H = 180;
const GROUND_Y = 154;
const TILE_RENDER_SCALE = 1.48;

function createDummyFighter(id: FighterId, action: FighterAction): FighterRuntime {
  const def = FIGHTERS[id];
  return {
    id,
    slot: 1,
    x: Math.round(TILE_W * 0.45),
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    hp: def.maxHp,
    maxHp: def.maxHp,
    displayHp: def.maxHp,
    ki: 100,
    action,
    actionFrame: 0,
    actionTotalFrames: 40,
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
 * Planche complète de 16 vignettes animées haute finesse sur la Fiche Personnage :
 * Marche, Saut, Coup sauté, Esquives Haute / Moyenne / Basse, Coups normaux,
 * Coups spéciaux signature, Encaissement de coup (haut & corps) et K.O.
 */
export const FighterAnimationBoard: React.FC<FighterAnimationBoardProps> = ({
  fighterId,
  renderMode,
  activeAction,
  onSelectAnimation,
}) => {
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const fighter = FIGHTERS[fighterId];

  const tiles: AnimationTileSpec[] = [
    // 1. Déplacements & Sauts
    {
      id: 'walk',
      category: 'Déplacements & Sauts',
      title: 'Marche Avant & Recul',
      inputHint: '→ / ←',
      primaryAction: 'WALK_FWD',
      alternateAction: 'WALK_BACK',
      cycleFrames: 56,
    },
    {
      id: 'jump',
      category: 'Déplacements & Sauts',
      title: 'Saut Martial / Salto',
      inputHint: '↑ ou ↗',
      primaryAction: 'JUMP',
      cycleFrames: 46,
    },
    {
      id: 'jump_atk',
      category: 'Déplacements & Sauts',
      title: 'Coup Sauté Aérien',
      inputHint: 'Saut + B',
      primaryAction: 'JUMP_ATTACK',
      cycleFrames: 44,
    },
    {
      id: 'crouch_guard',
      category: 'Déplacements & Sauts',
      title: 'Accroupi & Garde',
      inputHint: '↓ / Arrière',
      primaryAction: 'CROUCH',
      alternateAction: 'BLOCK_HIGH',
      cycleFrames: 52,
    },

    // 2. Esquives (Haute, Moyenne, Basse)
    {
      id: 'evade_high',
      category: 'Esquives (Haute · Moyenne · Basse)',
      title: 'Esquive Haute (Retrait)',
      inputHint: '↓ + A+B',
      primaryAction: 'EVADE_HIGH',
      cycleFrames: 38,
    },
    {
      id: 'evade_mid',
      category: 'Esquives (Haute · Moyenne · Basse)',
      title: 'Esquive Moyenne (Pivot 3D)',
      inputHint: '← ← rapide',
      primaryAction: 'EVADE_MID',
      cycleFrames: 38,
    },
    {
      id: 'evade_low',
      category: 'Esquives (Haute · Moyenne · Basse)',
      title: 'Esquive Basse (Impulsion)',
      inputHint: '↙ + A+B',
      primaryAction: 'EVADE_LOW',
      cycleFrames: 38,
    },

    // 3. Coups Normaux
    {
      id: 'light_atk',
      category: 'Coups Normaux',
      title: 'Direct Rapide',
      inputHint: 'Bouton A',
      primaryAction: 'LIGHT_ATTACK',
      cycleFrames: 28,
    },
    {
      id: 'heavy_atk',
      category: 'Coups Normaux',
      title: 'Coup Lourd',
      inputHint: 'Bouton B',
      primaryAction: 'HEAVY_ATTACK',
      cycleFrames: 36,
    },
    {
      id: 'low_kick',
      category: 'Coups Normaux',
      title: 'Balayette Basse',
      inputHint: '↓ + B',
      primaryAction: 'LOW_KICK',
      cycleFrames: 34,
    },
    {
      id: 'uppercut',
      category: 'Coups Normaux',
      title: 'Uppercut Anti-Air',
      inputHint: '↓ + A',
      primaryAction: 'UPPERCUT_NORMAL',
      cycleFrames: 34,
    },

    // 4. Coups Spéciaux Signature
    {
      id: 'spec_1',
      category: 'Coups Spéciaux',
      title: fighter.specials[0].name,
      inputHint: fighter.specials[0].gbShortcut,
      primaryAction: 'SPECIAL_1',
      cycleFrames: 48,
    },
    {
      id: 'spec_2',
      category: 'Coups Spéciaux',
      title: fighter.specials[1].name,
      inputHint: fighter.specials[1].gbShortcut,
      primaryAction: 'SPECIAL_2',
      cycleFrames: 48,
    },
    {
      id: 'spec_3',
      category: 'Coups Spéciaux',
      title: fighter.specials[2].name,
      inputHint: fighter.specials[2].gbShortcut,
      primaryAction: 'SPECIAL_3',
      cycleFrames: 50,
    },

    // 5. Impacts Subis & K.O.
    {
      id: 'hitstun',
      category: 'Impacts & K.O.',
      title: 'Encaissement (Haut & Corps)',
      inputHint: 'Impact subi',
      primaryAction: 'HITSTUN',
      alternateAction: 'HITSTUN_GUT',
      cycleFrames: 32,
    },
    {
      id: 'ko_fall',
      category: 'Impacts & K.O.',
      title: 'Chute & K.O. au Sol',
      inputHint: '0 PV / Balayette',
      primaryAction: 'KNOCKDOWN',
      alternateAction: 'DEFEAT',
      cycleFrames: 46,
    },
  ];

  useEffect(() => {
    let rafId = 0;
    let lastRender = 0;
    let tickFrame = 0;

    const renderTiles = (now: number) => {
      if (now - lastRender >= 32) {
        lastRender = now;
        tickFrame += 2;

        for (let idx = 0; idx < tiles.length; idx++) {
          const tile = tiles[idx];
          const canvas = canvasRefs.current[tile.id];
          if (!canvas) continue;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Fond studio arcade uniforme #0B101E + tatami de perspective propre
          const bgGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
          bgGrad.addColorStop(0, '#090D18');
          bgGrad.addColorStop(1, '#111829');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, TILE_W, GROUND_Y);

          ctx.fillStyle = fighter.stage.floorMain;
          ctx.fillRect(0, GROUND_Y, TILE_W, TILE_H - GROUND_Y);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          for (let g = -2; g <= 2; g++) {
            ctx.beginPath();
            ctx.moveTo(TILE_W * 0.5 + g * 28, GROUND_Y);
            ctx.lineTo(TILE_W * 0.5 + g * 52, TILE_H);
            ctx.stroke();
          }
          ctx.fillStyle = fighter.stage.floorTrim;
          ctx.fillRect(0, GROUND_Y, TILE_W, 2);

          const fullPeriod = tile.alternateAction ? tile.cycleFrames * 2 : tile.cycleFrames;
          const localTick = (tickFrame + idx * 5) % fullPeriod;
          const inSecondHalf = Boolean(tile.alternateAction && localTick >= tile.cycleFrames);
          const curAction = inSecondHalf && tile.alternateAction ? tile.alternateAction : tile.primaryAction;
          const actionFrame = inSecondHalf ? localTick - tile.cycleFrames : localTick;
          const progress = actionFrame / tile.cycleFrames;

          if (
            curAction === 'EVADE_HIGH' ||
            curAction === 'EVADE_MID' ||
            curAction === 'EVADE_LOW'
          ) {
            const lineY =
              curAction === 'EVADE_HIGH'
                ? GROUND_Y - 82
                : curAction === 'EVADE_MID'
                ? GROUND_Y - 58
                : GROUND_Y - 11;
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.26)';
            ctx.beginPath();
            ctx.moveTo(12, lineY);
            ctx.lineTo(TILE_W - 12, lineY);
            ctx.stroke();
            ctx.restore();
          }

          const dummy = createDummyFighter(fighterId, curAction);
          dummy.actionFrame = actionFrame;
          dummy.actionTotalFrames = tile.cycleFrames;

          // Mouvement spatial réaliste sur la vignette haute résolution
          if (curAction === 'WALK_FWD') {
            dummy.x = Math.round(TILE_W * 0.35 + progress * 36);
          } else if (curAction === 'WALK_BACK') {
            dummy.x = Math.round(TILE_W * 0.55 - progress * 36);
          } else if (curAction === 'JUMP') {
            dummy.vx = 1.6;
            dummy.y = -Math.sin(progress * Math.PI) * 46;
          } else if (curAction === 'JUMP_ATTACK') {
            dummy.y = -Math.sin(progress * Math.PI) * 40;
            dummy.x = Math.round(TILE_W * 0.36 + progress * 34);
          } else if (curAction === 'KNOCKDOWN') {
            dummy.x = Math.round(TILE_W * 0.56 - Math.min(1, progress * 1.4) * 22);
            dummy.y = progress < 0.45 ? -Math.sin((progress / 0.45) * Math.PI) * 26 : 0;
          } else if (curAction === 'DEFEAT') {
            dummy.x = Math.round(TILE_W * 0.56);
            dummy.y = 0;
          } else if (fighterId === 'krowen' && curAction === 'SPECIAL_2') {
            // Pas de Brume : immobile pendant la disparition (0..0.36), puis réapparition avancée pour la coupe !
            dummy.x = progress < 0.36 ? Math.round(TILE_W * 0.33) : Math.round(TILE_W * 0.56);
            dummy.y = 0;
          } else if (fighterId === 'kenji' && curAction === 'SPECIAL_3') {
            // Ouragan Écarlate : lévitation rotative horizontale propre
            dummy.x = Math.round(TILE_W * 0.34 + progress * 44);
            dummy.y = -Math.sin(progress * Math.PI) * 22;
          } else if (
            (fighterId === 'nyxia' && curAction === 'SPECIAL_3') ||
            (fighterId === 'malakor' && curAction === 'SPECIAL_1')
          ) {
            dummy.x = Math.round(TILE_W * 0.32 + progress * 48);
            dummy.y = -Math.sin(progress * Math.PI) * 18;
          } else if (
            (fighterId === 'kenji' && curAction === 'SPECIAL_2') ||
            (fighterId === 'meilin' && curAction === 'SPECIAL_3') ||
            (fighterId === 'krowen' && curAction === 'SPECIAL_3')
          ) {
            dummy.y = -Math.sin(progress * Math.PI) * 38;
            dummy.x = Math.round(TILE_W * 0.40 + progress * 22);
          }

          if (renderMode === 'FULL_3D_PRO') {
            drawStandalone3DFighter(ctx, dummy, dummy.x, GROUND_Y, tickFrame);
          } else {
            drawProPixelArtFighter(ctx, dummy, GROUND_Y, tickFrame, TILE_RENDER_SCALE);
          }

          if ((curAction === 'HITSTUN' || curAction === 'HITSTUN_GUT') && progress < 0.45) {
            const sy = curAction === 'HITSTUN' ? GROUND_Y - 76 : GROUND_Y - 52;
            ctx.fillStyle = '#FACC15';
            for (let s = 0; s < 5; s++) {
              const ang = s * 1.25 + progress * 5;
              ctx.beginPath();
              ctx.arc(
                dummy.x + 12 + Math.cos(ang) * (7 + progress * 20),
                sy + Math.sin(ang) * (7 + progress * 20),
                2.2,
                0,
                Math.PI * 2
              );
              ctx.fill();
            }
          }

          if (
            curAction === 'SPECIAL_1' &&
            progress > 0.34 &&
            fighterId !== 'titan' &&
            fighterId !== 'malakor'
          ) {
            const px = Math.round(dummy.x + 34 + (progress - 0.34) * 105);
            const py = GROUND_Y - 58;
            ctx.fillStyle = fighter.accentColor;
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(px + 1.5, py, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      rafId = requestAnimationFrame(renderTiles);
    };

    rafId = requestAnimationFrame(renderTiles);
    return () => cancelAnimationFrame(rafId);
  }, [fighterId, renderMode]);

  const categories: AnimationTileSpec['category'][] = [
    'Déplacements & Sauts',
    'Esquives (Haute · Moyenne · Basse)',
    'Coups Normaux',
    'Coups Spéciaux',
    'Impacts & K.O.',
  ];

  return (
    <div className="bg-[#131822] border border-slate-800 rounded-xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <p className="text-xs text-slate-400">
            Catalogue d’Animations Lissé · Cliquez sur une posture pour l’examiner dans l’arène 320×240
          </p>
          <h3 className="font-display text-2xl font-bold text-slate-100">
            Postures & Traînées Progressives de {fighter.name} ({renderMode === 'FULL_3D_PRO' ? 'Maillage 3D Pro' : 'Sprites 2D Pro BGR565'})
          </h3>
        </div>
        <span className="font-mono text-xs text-amber-400 shrink-0">
          16 séquences clés animées en direct
        </span>
      </div>

      <div className="space-y-6">
        {categories.map((cat) => {
          const groupTiles = tiles.filter((t) => t.category === cat);
          return (
            <div key={cat} className="space-y-2.5">
              <h4 className="font-display text-base font-bold tracking-wide text-slate-200">
                {cat}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {groupTiles.map((tile) => {
                  const isSelected =
                    activeAction === tile.primaryAction ||
                    (tile.alternateAction !== undefined && activeAction === tile.alternateAction);
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => onSelectAnimation(tile.primaryAction)}
                      className={`group text-left rounded-lg overflow-hidden border transition-colors cursor-pointer bg-[#0B101E] ${
                        isSelected
                          ? 'border-amber-400 ring-1 ring-amber-400/50'
                          : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="relative aspect-[224/180] w-full bg-[#0B101E]">
                        <canvas
                          ref={(el) => {
                            canvasRefs.current[tile.id] = el;
                          }}
                          width={TILE_W}
                          height={TILE_H}
                          className="w-full h-full block"
                        />
                        <span className="absolute top-1.5 right-1.5 font-mono text-[10px] text-slate-300 bg-slate-950/85 px-1.5 py-0.5 rounded-xs">
                          {tile.inputHint}
                        </span>
                      </div>
                      <div className="px-2.5 py-2 bg-[#101521] border-t border-slate-800/90 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          {tile.title}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
