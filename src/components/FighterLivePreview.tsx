import React, { useEffect, useRef, useState } from 'react';
import { FIGHTERS } from '../data/fighters';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  STAGE_WORLD_WIDTH,
  createInitialMatchState,
} from '../game/engine';
import { renderMatchToCanvas } from '../game/pixelRenderer';
import {
  FighterAction,
  FighterId,
  MatchEngineState,
  ProjectileEntity,
  RenderEngineMode,
} from '../types/game';

interface FighterLivePreviewProps {
  fighterId: FighterId;
  renderMode: RenderEngineMode;
  onChangeRenderMode: (mode: RenderEngineMode) => void;
  externalTriggerAction?: { action: FighterAction; nonce: number } | null;
  onActiveActionChange?: (action: FighterAction) => void;
}

interface ActionPreset {
  action: FighterAction;
  label: string;
  duration: number;
}

const POSE_PRESETS: ActionPreset[] = [
  { action: 'IDLE', label: 'Garde', duration: 60 },
  { action: 'WALK_FWD', label: 'Marche Av.', duration: 76 },
  { action: 'WALK_BACK', label: 'Marche Ar.', duration: 76 },
  { action: 'JUMP', label: 'Saut', duration: 48 },
  { action: 'JUMP_ATTACK', label: 'Coup Sauté', duration: 46 },
  { action: 'EVADE_HIGH', label: 'Esquive Haute', duration: 42 },
  { action: 'EVADE_MID', label: 'Esquive Moyenne', duration: 42 },
  { action: 'EVADE_LOW', label: 'Esquive Basse', duration: 42 },
  { action: 'LIGHT_ATTACK', label: 'Direct (A)', duration: 26 },
  { action: 'HEAVY_ATTACK', label: 'Lourd (B)', duration: 34 },
  { action: 'LOW_KICK', label: 'Balayette', duration: 32 },
  { action: 'UPPERCUT_NORMAL', label: 'Uppercut', duration: 34 },
  { action: 'THROW', label: 'Projection', duration: 40 },
  { action: 'SPECIAL_1', label: 'Spécial 1', duration: 48 },
  { action: 'SPECIAL_2', label: 'Spécial 2', duration: 48 },
  { action: 'SPECIAL_3', label: 'Spécial 3', duration: 50 },
  { action: 'BLOCK_HIGH', label: 'Garde Haute', duration: 40 },
  { action: 'BLOCK_LOW', label: 'Garde Basse', duration: 40 },
  { action: 'HITSTUN', label: 'Encaisse Haut', duration: 32 },
  { action: 'HITSTUN_GUT', label: 'Encaisse Corps', duration: 32 },
  { action: 'KNOCKDOWN', label: 'Chute K.O.', duration: 48 },
  { action: 'DEFEAT', label: 'K.O. au Sol', duration: 64 },
  { action: 'DIZZY', label: 'Étourdi', duration: 68 },
  { action: 'FINISHER', label: 'Coup Fatal', duration: 76 },
  { action: 'VICTORY', label: 'Victoire', duration: 68 },
];

function createPreviewProjectile(
  ownerSlot: 1 | 2,
  fighterId: FighterId,
  action: FighterAction,
  startX: number,
  dir: 1 | -1
): ProjectileEntity | null {
  if (ownerSlot === 2) {
    // Projectile haut envoyé par le partenaire pour démontrer l'Esquive Haute !
    return {
      id: 99,
      ownerSlot: 2,
      fighterId,
      kind: 'KI_WAVE',
      x: startX + dir * 22,
      y: -52,
      vx: dir * 4.4,
      vy: 0,
      width: 22,
      height: 14,
      damage: 0,
      chipDamage: 0,
      color: '#F97316',
      coreColor: '#FFFFFF',
      lifeFrames: 60,
      maxLifeFrames: 60,
    };
  }

  if (fighterId === 'kenji' && action === 'SPECIAL_1') {
    return {
      id: 1,
      ownerSlot: 1,
      fighterId,
      kind: 'KI_WAVE',
      x: startX + 28,
      y: -40,
      vx: 3.8,
      vy: 0,
      width: 22,
      height: 16,
      damage: 85,
      chipDamage: 16,
      color: '#38BDF8',
      coreColor: '#FFFFFF',
      lifeFrames: 60,
      maxLifeFrames: 60,
    };
  }
  if (fighterId === 'krowen' && action === 'SPECIAL_1') {
    return {
      id: 2,
      ownerSlot: 1,
      fighterId,
      kind: 'HARPOON',
      x: startX + 26,
      y: -42,
      vx: 5.2,
      vy: 0,
      width: 24,
      height: 10,
      damage: 75,
      chipDamage: 14,
      color: '#F97316',
      coreColor: '#FEF08A',
      lifeFrames: 42,
      maxLifeFrames: 42,
      pullsOnHit: true,
    };
  }
  if (fighterId === 'meilin' && action === 'SPECIAL_1') {
    return {
      id: 3,
      ownerSlot: 1,
      fighterId,
      kind: 'STEEL_FAN',
      x: startX + 26,
      y: -42,
      vx: 4.3,
      vy: 0,
      width: 20,
      height: 20,
      damage: 72,
      chipDamage: 14,
      color: '#10B981',
      coreColor: '#F8FAFC',
      lifeFrames: 55,
      maxLifeFrames: 55,
    };
  }
  if (fighterId === 'nyxia' && action === 'SPECIAL_1') {
    return {
      id: 4,
      ownerSlot: 1,
      fighterId,
      kind: 'LIGHTNING_SPEAR',
      x: startX + 30,
      y: -42,
      vx: 5.5,
      vy: 0,
      width: 30,
      height: 12,
      damage: 84,
      chipDamage: 18,
      color: '#06B6D4',
      coreColor: '#FFFFFF',
      lifeFrames: 45,
      maxLifeFrames: 45,
    };
  }
  if (fighterId === 'nyxia' && action === 'SPECIAL_2') {
    return {
      id: 5,
      ownerSlot: 1,
      fighterId,
      kind: 'STASIS_ORB',
      x: startX + 32,
      y: -44,
      vx: 1.9,
      vy: 0,
      width: 20,
      height: 20,
      damage: 78,
      chipDamage: 16,
      color: '#22D3EE',
      coreColor: '#FFFFFF',
      lifeFrames: 75,
      maxLifeFrames: 75,
    };
  }
  if (fighterId === 'malakor' && action === 'SPECIAL_1') {
    return {
      id: 6,
      ownerSlot: 1,
      fighterId,
      kind: 'DARK_WAVE',
      x: startX + 28,
      y: -42,
      vx: 4.1,
      vy: 0,
      width: 24,
      height: 18,
      damage: 94,
      chipDamage: 20,
      color: '#A855F7',
      coreColor: '#FFFFFF',
      lifeFrames: 58,
      maxLifeFrames: 58,
    };
  }
  return null;
}

/**
 * Studio de démonstration en arène 320×240 BGR565 avec partenaire d'entraînement réactif :
 * illustre chaque attaque, saut, coup sauté, esquive (haute, moyenne, basse), encaissement et K.O. en situation réelle.
 */
export const FighterLivePreview: React.FC<FighterLivePreviewProps> = ({
  fighterId,
  renderMode,
  onChangeRenderMode,
  externalTriggerAction,
  onActiveActionChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<MatchEngineState | null>(null);
  const [selectedAction, setSelectedAction] = useState<FighterAction>('IDLE');
  const [autoCycle, setAutoCycle] = useState<boolean>(false);

  const fighter = FIGHTERS[fighterId];

  const applyActionToPreview = (st: MatchEngineState, action: FighterAction) => {
    const preset = POSE_PRESETS.find((p) => p.action === action) || POSE_PRESETS[0];
    const rivalId = FIGHTERS[fighterId].rivalId;

    st.p1.id = fighterId;
    st.p2.id = rivalId;
    st.p1.facing = 1;
    st.p2.facing = -1;
    st.p1.hp = action === 'DEFEAT' || action === 'KNOCKDOWN' ? Math.round(st.p1.maxHp * 0.12) : st.p1.maxHp;
    st.p1.displayHp = st.p1.hp;
    st.p2.hp = st.p2.maxHp;
    st.p2.displayHp = st.p2.maxHp;

    const closeInteraction =
      action === 'THROW' ||
      action === 'FINISHER' ||
      action === 'EVADE_MID' ||
      action === 'EVADE_LOW' ||
      action === 'HITSTUN' ||
      action === 'HITSTUN_GUT' ||
      action === 'KNOCKDOWN' ||
      action === 'LIGHT_ATTACK' ||
      action === 'HEAVY_ATTACK' ||
      action === 'LOW_KICK' ||
      action === 'UPPERCUT_NORMAL';

    const centerX = STAGE_WORLD_WIDTH * 0.5;
    st.p1.x = closeInteraction ? centerX - 22 : centerX - 58;
    st.p2.x = closeInteraction ? centerX + 22 : centerX + 62;
    st.p1.y = 0;
    st.p2.y = 0;
    st.p1.vx = 0;
    st.p1.vy = 0;
    st.p1.ki = 100;
    st.p1.action = action;
    st.p1.actionFrame = 0;
    st.p1.actionTotalFrames = preset.duration;

    st.projectiles = [];
    st.particles = [];
    st.darkSkyFlash = action === 'FINISHER' ? 42 : 0;

    // Mise en scène du partenaire d'entraînement selon l'animation observée !
    if (action === 'FINISHER') {
      st.p2.action = 'FINISHER_VICTIM';
      st.p2.actionFrame = 0;
      st.p2.actionTotalFrames = preset.duration;
    } else if (action === 'THROW') {
      st.p2.action = 'KNOCKDOWN';
      st.p2.actionFrame = 4;
      st.p2.actionTotalFrames = 38;
    } else if (action === 'EVADE_MID') {
      // Le partenaire porte un coup direct au corps qui passe dans le vide grâce au pivot 3D !
      st.p2.action = 'HEAVY_ATTACK';
      st.p2.actionFrame = 0;
      st.p2.actionTotalFrames = 34;
    } else if (action === 'EVADE_LOW') {
      // Le partenaire tente une balayette basse esquivée par l'impulsion !
      st.p2.action = 'LOW_KICK';
      st.p2.actionFrame = 0;
      st.p2.actionTotalFrames = 34;
    } else if (action === 'EVADE_HIGH') {
      // Le partenaire tire un projectile haut qui passe au-dessus du retrait !
      st.p2.action = 'SPECIAL_1';
      st.p2.actionFrame = 0;
      st.p2.actionTotalFrames = 40;
      const incoming = createPreviewProjectile(2, rivalId, 'SPECIAL_1', st.p2.x, -1);
      if (incoming) st.projectiles.push(incoming);
    } else if (action === 'HITSTUN' || action === 'HITSTUN_GUT' || action === 'KNOCKDOWN') {
      st.p2.action = action === 'HITSTUN_GUT' ? 'LIGHT_ATTACK' : 'HEAVY_ATTACK';
      st.p2.actionFrame = 6;
      st.p2.actionTotalFrames = 28;
      for (let k = 0; k < 10; k++) {
        st.particles.push({
          x: st.p1.x + 8,
          y: action === 'HITSTUN_GUT' ? 172 : 158,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          size: 3,
          color: '#FACC15',
          life: 16,
          maxLife: 16,
        });
      }
    } else {
      st.p2.action = 'IDLE';
      st.p2.actionFrame = 0;
      st.p2.actionTotalFrames = 60;
    }
  };

  useEffect(() => {
    const rivalId = FIGHTERS[fighterId].rivalId;
    const st = createInitialMatchState(fighterId, rivalId, false);
    st.roundSubPhase = 'FIGHT';
    st.bannerTimer = 0;
    st.bannerText = '';
    applyActionToPreview(st, selectedAction);
    stateRef.current = st;
  }, [fighterId]);

  useEffect(() => {
    if (externalTriggerAction && stateRef.current) {
      setSelectedAction(externalTriggerAction.action);
      setAutoCycle(false);
      applyActionToPreview(stateRef.current, externalTriggerAction.action);
    }
  }, [externalTriggerAction]);

  const handleSelectAction = (action: FighterAction) => {
    setSelectedAction(action);
    onActiveActionChange?.(action);
    if (stateRef.current) {
      applyActionToPreview(stateRef.current, action);
    }
  };

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let acc = 0;
    const STEP = 1000 / 60;

    const loop = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;
      acc += dt;

      const st = stateRef.current;
      if (st) {
        while (acc >= STEP) {
          acc -= STEP;
          st.frame += 1;
          st.p1.actionFrame += 1;
          st.p2.actionFrame += 1;
          if (st.darkSkyFlash > 0) st.darkSkyFlash -= 1;

          const act = st.p1.action;
          const total = Math.max(1, st.p1.actionTotalFrames);
          const t = st.p1.actionFrame / total;

          // Déplacements physiques dans l'arène élargie 640px (mettant en évidence le scrolling différentiel 3D)
          const centerX = STAGE_WORLD_WIDTH * 0.5;
          if (act === 'WALK_FWD') {
            st.p1.x = centerX - 132 + t * 156;
            st.p2.x = centerX + 74;
          } else if (act === 'WALK_BACK') {
            st.p1.x = centerX + 24 - t * 156;
            st.p2.x = centerX + 74;
          } else if (act === 'JUMP') {
            st.p1.vx = 1.6;
            st.p1.y = -Math.sin(Math.min(1, t) * Math.PI) * 58;
            st.p1.x = centerX - 78 + t * 88;
          } else if (act === 'JUMP_ATTACK') {
            st.p1.y = -Math.sin(Math.min(1, t) * Math.PI) * 52;
            st.p1.x = centerX - 60 + t * 84;
            if (st.p1.actionFrame === 22) {
              st.p2.action = 'HITSTUN';
              st.p2.actionFrame = 0;
              st.p2.actionTotalFrames = 18;
            }
          } else if (act === 'KNOCKDOWN') {
            st.p1.x = centerX - 22 - Math.min(1, t * 1.3) * 48;
            st.p1.y = t < 0.48 ? -Math.sin((t / 0.48) * Math.PI) * 28 : 0;
          } else if (fighterId === 'krowen' && act === 'SPECIAL_2') {
            // Pas de Brume : disparition immobile [0..0.36], puis téléportation dans le dos de l'adversaire !
            if (t < 0.36) {
              st.p1.x = centerX - 58;
              st.p1.facing = 1;
            } else {
              st.p1.x = st.p2.x + 28;
              st.p1.facing = -1;
              if (st.p1.actionFrame === 29) {
                st.p2.action = 'HITSTUN';
                st.p2.actionFrame = 0;
                st.p2.actionTotalFrames = 20;
              }
            }
            st.p1.y = 0;
          } else if (
            (fighterId === 'kenji' && act === 'SPECIAL_2') ||
            (fighterId === 'meilin' && act === 'SPECIAL_3') ||
            (fighterId === 'krowen' && act === 'SPECIAL_3')
          ) {
            st.p1.y = -Math.sin(Math.min(1, t) * Math.PI) * 48;
            st.p1.x = centerX - 56 + Math.sin(Math.min(1, t) * Math.PI * 0.5) * 66;
            if (st.p1.actionFrame === 24) {
              st.p2.action = 'HITSTUN';
              st.p2.actionFrame = 0;
              st.p2.actionTotalFrames = 18;
            }
          } else if (
            (fighterId === 'kenji' && act === 'SPECIAL_3') ||
            (fighterId === 'meilin' && act === 'SPECIAL_2') ||
            (fighterId === 'titan' && act === 'SPECIAL_3') ||
            (fighterId === 'malakor' && act === 'SPECIAL_2') ||
            (fighterId === 'malakor' && act === 'SPECIAL_1') ||
            (fighterId === 'nyxia' && act === 'SPECIAL_3')
          ) {
            st.p1.x = centerX - 66 + Math.min(1, t * 1.25) * 92;
            if (fighterId === 'kenji' || fighterId === 'malakor' || fighterId === 'nyxia') {
              st.p1.y = -18 * Math.sin(Math.min(1, t) * Math.PI);
            }
          } else {
            st.p1.y = 0;
          }

          // Réaction du partenaire sur les coups normaux au contact (synchronisée avec le pic d'impact)
          if (
            (act === 'LIGHT_ATTACK' ||
              act === 'HEAVY_ATTACK' ||
              act === 'LOW_KICK' ||
              act === 'UPPERCUT_NORMAL') &&
            st.p1.actionFrame === Math.round(st.p1.actionTotalFrames * 0.44)
          ) {
            st.p2.action = act === 'LOW_KICK' ? 'KNOCKDOWN' : act === 'LIGHT_ATTACK' ? 'HITSTUN_GUT' : 'HITSTUN';
            st.p2.actionFrame = 0;
            st.p2.actionTotalFrames = 20;
            for (let k = 0; k < 8; k++) {
              st.particles.push({
                x: st.p2.x - 10,
                y: act === 'LOW_KICK' ? 198 : 164,
                vx: (Math.random() - 0.5) * 3.8,
                vy: (Math.random() - 0.5) * 3.8,
                size: 3,
                color: fighter.accentColor,
                life: 14,
                maxLife: 14,
              });
            }
          }

          // Émission du vrai projectile à la frame d'extension complète (sauf Torpille Pourpre de Malakor)
          if (
            st.p1.actionFrame === Math.round(st.p1.actionTotalFrames * 0.46) &&
            (act === 'SPECIAL_1' || act === 'SPECIAL_2') &&
            !(fighterId === 'malakor' && act === 'SPECIAL_1')
          ) {
            const proj = createPreviewProjectile(1, fighterId, act, st.p1.x, 1);
            if (proj) st.projectiles.push(proj);
          }

          // Avancement des projectiles
          for (let i = st.projectiles.length - 1; i >= 0; i--) {
            const pr = st.projectiles[i];
            pr.x += pr.vx;
            pr.lifeFrames -= 1;

            if (pr.ownerSlot === 1 && Math.abs(pr.x - st.p2.x) < 18) {
              st.p2.action = 'HITSTUN';
              st.p2.actionFrame = 0;
              st.p2.actionTotalFrames = 18;
              for (let k = 0; k < 10; k++) {
                st.particles.push({
                  x: st.p2.x - 8,
                  y: 208 + pr.y,
                  vx: (Math.random() - 0.5) * 4,
                  vy: (Math.random() - 0.5) * 4,
                  size: 3,
                  color: pr.color,
                  life: 14,
                  maxLife: 14,
                });
              }
              st.projectiles.splice(i, 1);
              continue;
            }
            if (pr.lifeFrames <= 0 || pr.x < -20 || pr.x > STAGE_WORLD_WIDTH + 20) {
              st.projectiles.splice(i, 1);
            }
          }

          for (let i = st.particles.length - 1; i >= 0; i--) {
            const pt = st.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.life -= 1;
            if (pt.life <= 0) st.particles.splice(i, 1);
          }

          if (
            (st.p2.action === 'HITSTUN' ||
              st.p2.action === 'HITSTUN_GUT' ||
              st.p2.action === 'HEAVY_ATTACK' ||
              st.p2.action === 'LOW_KICK' ||
              st.p2.action === 'LIGHT_ATTACK' ||
              st.p2.action === 'SPECIAL_1') &&
            st.p2.actionFrame >= st.p2.actionTotalFrames
          ) {
            st.p2.action = 'IDLE';
            st.p2.actionFrame = 0;
          }

          if (st.p1.actionFrame >= st.p1.actionTotalFrames) {
            if (autoCycle) {
              const curIdx = POSE_PRESETS.findIndex((p) => p.action === st.p1.action);
              const nextPreset = POSE_PRESETS[(curIdx + 1) % POSE_PRESETS.length];
              setSelectedAction(nextPreset.action);
              onActiveActionChange?.(nextPreset.action);
              applyActionToPreview(st, nextPreset.action);
            } else {
              applyActionToPreview(st, st.p1.action);
            }
          }
        }

        if (canvasRef.current) {
          renderMatchToCanvas(canvasRef.current, st, FIGHTERS[fighterId].stage, renderMode);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [fighterId, renderMode, autoCycle]);

  const getDynamicMoveLabel = (preset: ActionPreset): string => {
    if (preset.action === 'SPECIAL_1') return fighter.specials[0].name;
    if (preset.action === 'SPECIAL_2') return fighter.specials[1].name;
    if (preset.action === 'SPECIAL_3') return fighter.specials[2].name;
    if (preset.action === 'FINISHER') return fighter.finisher.name;
    return preset.label;
  };

  return (
    <div className="bg-[#0E131F] border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            Arène d’Inspection Interactive · 320×240 BGR565 · Partenaire Réactif
          </p>
          <h3 className="font-display text-xl font-bold text-slate-100">
            Démonstration en Situation : Portrait, Guerrier & Mouvements
          </h3>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg self-start sm:self-auto">
          {(
            [
              { id: 'SPRITE_2D_PRO', label: 'Sprites 2D Pro (60 FPS)' },
              { id: 'FULL_3D_PRO', label: '3D Pro' },
            ] as Array<{ id: RenderEngineMode; label: string }>
          ).map((m) => {
            const isActive =
              m.id === 'SPRITE_2D_PRO'
                ? renderMode !== 'FULL_3D_PRO'
                : renderMode === 'FULL_3D_PRO';
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeRenderMode(m.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <div className="md:col-span-7 space-y-2">
          <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border-2 border-slate-900 bg-[#070A12]">
            <canvas
              ref={canvasRef}
              width={ARENA_WIDTH}
              height={ARENA_HEIGHT}
              className="w-full h-full block pixel-canvas"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Arène : {fighter.stage.name}</span>
            <button
              type="button"
              onClick={() => setAutoCycle((v) => !v)}
              className={`hover:text-white cursor-pointer ${
                autoCycle ? 'text-amber-400 font-semibold' : 'text-slate-400'
              }`}
            >
              {autoCycle ? 'Défilement auto : Actif' : 'Défiler toutes les poses'}
            </button>
          </div>
        </div>

        <div className="md:col-span-5 space-y-2">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Tester une animation précise :</span>
            <span className="font-mono text-amber-400">{selectedAction}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto pr-1">
            {POSE_PRESETS.map((preset) => {
              const isSelected = selectedAction === preset.action;
              const isSpecial = preset.action.startsWith('SPECIAL_');
              const isEvade = preset.action.startsWith('EVADE_');
              const isFinisher = preset.action === 'FINISHER';
              return (
                <button
                  key={preset.action}
                  type="button"
                  onClick={() => {
                    setAutoCycle(false);
                    handleSelectAction(preset.action);
                  }}
                  className={`px-2.5 py-1.5 rounded-md text-left text-[11px] font-medium truncate transition-colors cursor-pointer border ${
                    isSelected
                      ? 'bg-rose-600 border-rose-500 text-white font-semibold'
                      : isFinisher
                      ? 'bg-slate-900/90 border-rose-900/60 text-rose-300 hover:bg-slate-800'
                      : isSpecial
                      ? 'bg-slate-900/90 border-amber-900/50 text-amber-300 hover:bg-slate-800'
                      : isEvade
                      ? 'bg-slate-900/90 border-sky-900/60 text-sky-300 hover:bg-slate-800'
                      : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {getDynamicMoveLabel(preset)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
