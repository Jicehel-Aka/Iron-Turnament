import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Pause, Play, RotateCcw, Home } from 'lucide-react';
import { soundFX } from '../audio/soundEngine';
import { FIGHTERS, FIGHTER_ORDER, buildStoryLadder } from '../data/fighters';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  createInitialMatchState,
  startNextRound,
  stepMatchEngine,
} from '../game/engine';
import { renderMatchToCanvas } from '../game/pixelRenderer';
import {
  Difficulty,
  FighterId,
  GameMode,
  InputSnapshot,
  MatchEngineState,
  RenderEngineMode,
  ScreenPhase,
} from '../types/game';
import { FighterPortrait } from './FighterPortrait';

interface GamebuinoConsoleWorkspaceProps {
  gameMode: GameMode;
  setGameMode: (m: GameMode) => void;
  phase: ScreenPhase;
  setPhase: (p: ScreenPhase) => void;
  p1Id: FighterId;
  setP1Id: (id: FighterId) => void;
  p2Id: FighterId;
  setP2Id: (id: FighterId) => void;
  renderMode: RenderEngineMode;
  setRenderMode: (m: RenderEngineMode) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onOpen3DAnalysis: () => void;
  onOpenSpriteSheets: () => void;
}

interface PressedKeysState {
  p1Left: boolean;
  p1Right: boolean;
  p1Up: boolean;
  p1Down: boolean;
  p1A: boolean;
  p1B: boolean;
  p1Spec: boolean;
  p2Left: boolean;
  p2Right: boolean;
  p2Up: boolean;
  p2Down: boolean;
  p2A: boolean;
  p2B: boolean;
  p2Spec: boolean;
}

const INITIAL_KEYS: PressedKeysState = {
  p1Left: false,
  p1Right: false,
  p1Up: false,
  p1Down: false,
  p1A: false,
  p1B: false,
  p1Spec: false,
  p2Left: false,
  p2Right: false,
  p2Up: false,
  p2Down: false,
  p2A: false,
  p2B: false,
  p2Spec: false,
};

export const GamebuinoConsoleWorkspace: React.FC<GamebuinoConsoleWorkspaceProps> = ({
  gameMode,
  setGameMode,
  phase,
  setPhase,
  p1Id,
  setP1Id,
  p2Id,
  setP2Id,
  renderMode,
  setRenderMode,
  difficulty,
  setDifficulty,
  onOpen3DAnalysis,
  onOpenSpriteSheets,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MatchEngineState | null>(null);
  const keysRef = useRef<PressedKeysState>({ ...INITIAL_KEYS });
  const prevButtonsRef = useRef({
    p1A: false,
    p1B: false,
    p1Spec: false,
    p2A: false,
    p2B: false,
    p2Spec: false,
  });

  const [storyLadder, setStoryLadder] = useState<FighterId[]>(() => buildStoryLadder(p1Id));
  const [storyStageIndex, setStoryStageIndex] = useState<number>(0);
  const [selectedStageId, setSelectedStageId] = useState<FighterId>('kenji');
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const [ledColors, setLedColors] = useState<string[]>(Array(8).fill('#1E293B'));
  const [aiLiveThought, setAiLiveThought] = useState<string>('En attente du gong');
  const [matchResult, setMatchResult] = useState<{
    winnerSlot: 1 | 2;
    finisher: 'NONE' | 'FATALITY' | 'HONOR_FINISH';
    quote: string;
  } | null>(null);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundFX.setEnabled(next);
  };

  // Démarre un combat (Histoire ou Versus)
  const launchMatch = useCallback(
    (fighter1: FighterId, fighter2: FighterId, isBoss = false, stageOwnerId?: FighterId) => {
      setSelectedStageId(stageOwnerId || fighter2);
      engineRef.current = createInitialMatchState(fighter1, fighter2, isBoss);
      setMatchResult(null);
      setAiLiveThought('Observation initiale');
      setPhase('PLAYING');
      soundFX.menuConfirm();
    },
    [setPhase]
  );

  const beginStoryCampaign = (chosenId: FighterId) => {
    const ladder = buildStoryLadder(chosenId);
    setStoryLadder(ladder);
    setStoryStageIndex(0);
    setP1Id(chosenId);
    setP2Id(ladder[0]);
    soundFX.menuConfirm();
    setPhase('PRE_MATCH_DIALOGUE');
  };

  const beginVersusMatch = () => {
    soundFX.menuConfirm();
    setPhase('PRE_MATCH_DIALOGUE');
  };

  // Gestion clavier complète (AZERTY + QWERTY + 2 Joueurs local)
  useEffect(() => {
    const mapKey = (e: KeyboardEvent, isDown: boolean) => {
      const code = e.code;
      const is2P = gameMode === 'VERSUS_2P';

      // Empêcher le défilement de page avec les flèches ou espace pendant le jeu
      if (
        phase === 'PLAYING' &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)
      ) {
        e.preventDefault();
      }

      if (isDown && code === 'Escape' && (phase === 'PLAYING' || phase === 'PAUSED')) {
        setPhase(phase === 'PLAYING' ? 'PAUSED' : 'PLAYING');
        return;
      }

      const k = keysRef.current;

      // Joueur 1 : ZQSD / WASD (et Flèches si 1 seul joueur humain !)
      if (code === 'KeyA' || code === 'KeyQ' || (!is2P && code === 'ArrowLeft')) k.p1Left = isDown;
      if (code === 'KeyD' || (!is2P && code === 'ArrowRight')) k.p1Right = isDown;
      if (code === 'KeyW' || code === 'KeyZ' || (!is2P && code === 'ArrowUp')) k.p1Up = isDown;
      if (code === 'KeyS' || (!is2P && code === 'ArrowDown')) k.p1Down = isDown;

      if (code === 'KeyJ' || code === 'KeyF') k.p1A = isDown;
      if (code === 'KeyK' || code === 'KeyG') k.p1B = isDown;
      if (code === 'KeyL' || code === 'KeyH' || code === 'Space') k.p1Spec = isDown;

      // Joueur 2 (Mode Versus 2 Joueurs local)
      if (is2P) {
        if (code === 'ArrowLeft') k.p2Left = isDown;
        if (code === 'ArrowRight') k.p2Right = isDown;
        if (code === 'ArrowUp') k.p2Up = isDown;
        if (code === 'ArrowDown') k.p2Down = isDown;
        if (code === 'Numpad1' || code === 'KeyN' || code === 'Comma') k.p2A = isDown;
        if (code === 'Numpad2' || code === 'KeyM' || code === 'Period') k.p2B = isDown;
        if (code === 'Numpad3' || code === 'Slash' || code === 'Enter') k.p2Spec = isDown;
      }
    };

    const onDown = (e: KeyboardEvent) => mapKey(e, true);
    const onUp = (e: KeyboardEvent) => mapKey(e, false);
    const onBlur = () => {
      keysRef.current = { ...INITIAL_KEYS };
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gameMode, phase, setPhase]);

  // Boucle de jeu 60 FPS à pas de temps fixe (Fixed Timestep)
  useEffect(() => {
    if (phase !== 'PLAYING') return;

    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const STEP_MS = 1000 / 60;

    const tick = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;
      accumulator += dt;

      const state = engineRef.current;
      if (state) {
        while (accumulator >= STEP_MS) {
          accumulator -= STEP_MS;

          const k = keysRef.current;
          const prev = prevButtonsRef.current;

          const p1Input: InputSnapshot = {
            left: k.p1Left,
            right: k.p1Right,
            up: k.p1Up,
            down: k.p1Down,
            btnA: k.p1A,
            btnB: k.p1B,
            btnSpecial: k.p1Spec,
            justPressedA: k.p1A && !prev.p1A,
            justPressedB: k.p1B && !prev.p1B,
            justPressedSpecial: k.p1Spec && !prev.p1Spec,
          };

          const p2Input: InputSnapshot | null =
            gameMode === 'VERSUS_2P'
              ? {
                  left: k.p2Left,
                  right: k.p2Right,
                  up: k.p2Up,
                  down: k.p2Down,
                  btnA: k.p2A,
                  btnB: k.p2B,
                  btnSpecial: k.p2Spec,
                  justPressedA: k.p2A && !prev.p2A,
                  justPressedB: k.p2B && !prev.p2B,
                  justPressedSpecial: k.p2Spec && !prev.p2Spec,
                }
              : null;

          prev.p1A = k.p1A;
          prev.p1B = k.p1B;
          prev.p1Spec = k.p1Spec;
          prev.p2A = k.p2A;
          prev.p2B = k.p2B;
          prev.p2Spec = k.p2Spec;

          stepMatchEngine(state, p1Input, p2Input, difficulty);

          // Transition automatique fin de manche / fin de match
          if (state.roundSubPhase === 'ROUND_END' && state.p1.actionFrame > 72) {
            if (state.p1Wins >= 2 || state.p2Wins >= 2) {
              const winSlot: 1 | 2 = state.p1Wins >= 2 ? 1 : 2;
              const winFighter = FIGHTERS[winSlot === 1 ? state.p1.id : state.p2.id];
              const quote =
                winFighter.winQuotes[
                  (state.roundNumber + state.frame) % winFighter.winQuotes.length
                ];
              setMatchResult({
                winnerSlot: winSlot,
                finisher: state.finisherExecuted,
                quote,
              });
              setPhase('ROUND_SUMMARY');
              return;
            } else {
              startNextRound(state);
            }
          }
        }

        if (canvasRef.current) {
          const stage = FIGHTERS[selectedStageId].stage;
          renderMatchToCanvas(canvasRef.current, state, stage, renderMode);
        }

        if (state.frame % 6 === 0) {
          setLedColors([...state.ledColors]);
          if (gameMode !== 'VERSUS_2P') {
            setAiLiveThought(state.p2.aiThought);
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, gameMode, difficulty, renderMode, selectedStageId, setPhase]);

  const setVirtualKey = (field: keyof PressedKeysState, pressed: boolean) => {
    keysRef.current[field] = pressed;
  };

  // Gestion de la suite après un match gagné / perdu
  const handlePostMatchContinue = () => {
    if (!matchResult) return;

    if (gameMode === 'STORY') {
      if (matchResult.winnerSlot === 1) {
        const nextIdx = storyStageIndex + 1;
        if (nextIdx >= storyLadder.length) {
          setPhase('STORY_ENDING');
          soundFX.victoryFanfare();
        } else {
          setStoryStageIndex(nextIdx);
          setP2Id(storyLadder[nextIdx]);
          setPhase('PRE_MATCH_DIALOGUE');
          soundFX.menuConfirm();
        }
      } else {
        // Continuer (Revanche sur le même palier d'histoire)
        const isFinalBoss = storyStageIndex === storyLadder.length - 1;
        launchMatch(p1Id, p2Id, isFinalBoss, p2Id);
      }
    } else {
      // Revanche immédiate en Versus
      launchMatch(p1Id, p2Id, false, selectedStageId);
    }
  };

  const p1Def = FIGHTERS[p1Id];
  const p2Def = FIGHTERS[p2Id];

  // Dialogue contextuel pré-combat
  const getPreMatchExchange = (): { line1: string; line2: string; contextLabel: string } => {
    if (gameMode === 'STORY') {
      const isFinal = storyStageIndex === storyLadder.length - 1;
      const isRival = p2Id === p1Def.rivalId && !isFinal;
      if (isFinal) {
        return {
          contextLabel: `Finale du Tournoi de Fer · Combat ${storyStageIndex + 1}/${storyLadder.length}`,
          line1: p1Def.bossChallengeLine,
          line2: p1Id === 'malakor' ? p2Def.introQuote : p1Def.bossReplyLine,
        };
      }
      if (isRival) {
        return {
          contextLabel: `Duel de Rivalité · Combat ${storyStageIndex + 1}/${storyLadder.length}`,
          line1: p1Def.rivalDialogue.playerLine,
          line2: p1Def.rivalDialogue.rivalReply,
        };
      }
      return {
        contextLabel: `Mode Histoire · Combat ${storyStageIndex + 1}/${storyLadder.length}`,
        line1: p1Def.introQuote,
        line2: p2Def.introQuote,
      };
    }

    return {
      contextLabel:
        gameMode === 'VERSUS_2P'
          ? 'Duel Local 2 Joueurs · Meilleur des 3 manches'
          : `Duel Versus contre IA (${difficulty})`,
      line1: p1Def.introQuote,
      line2: p2Def.introQuote,
    };
  };

  return (
    <div className="max-w-[1340px] mx-auto px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* COLONNE PRINCIPALE (8 col) : CONSOLE PORTABLE GAMEBUINO AKA */}
        <div className="lg:col-span-8 flex flex-col items-center space-y-5">
          {/* Boîtier matériel Gamebuino AKA */}
          <div className="w-full max-w-[760px] bg-[#181E2B] border border-slate-700/80 rounded-[28px] p-4 sm:p-6 shadow-2xl">
            {/* Barre supérieure du châssis Gamebuino */}
            <div className="flex items-center justify-between gap-4 mb-3 px-2">
              <div className="flex items-center gap-3">
                <span className="font-display text-lg font-bold tracking-wider text-slate-200">
                  GAMEBUINO AKA
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  · ESP32-S3 · 320×240 BGR565 ·{' '}
                  {renderMode === 'FULL_3D_PRO'
                    ? '3D Volumétrique Pro'
                    : 'Sprites 2D Pro (DMA 60 FPS)'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSound}
                  title={soundOn ? 'Couper le son' : 'Activer le son'}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                >
                  {soundOn ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{soundOn ? 'Audio' : 'Muet'}</span>
                </button>

                {(phase === 'PLAYING' || phase === 'PAUSED') && (
                  <button
                    type="button"
                    onClick={() => setPhase(phase === 'PLAYING' ? 'PAUSED' : 'PLAYING')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                  >
                    {phase === 'PLAYING' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{phase === 'PLAYING' ? 'Menu' : 'Reprendre'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setPhase('TITLE_MENU')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
              </div>
            </div>

            {/* Zone centrale : 4 LEDs RGB Gauche + Écran TFT 4:3 + 4 LEDs RGB Droite */}
            <div className="flex items-stretch gap-2.5 sm:gap-4">
              {/* Rampe LEDs RGB Gauche (Joueur 1) */}
              <div className="hidden sm:flex flex-col justify-around py-6 px-1.5 bg-slate-950/80 rounded-xl border border-slate-800">
                {ledColors.slice(0, 4).map((col, idx) => (
                  <div
                    key={`led-l-${idx}`}
                    className="w-2.5 h-6 rounded-xs transition-colors duration-100"
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>

              {/* Lunette d'écran TFT */}
              <div className="relative flex-1 aspect-[4/3] bg-[#07090E] rounded-xl border-4 border-slate-950 overflow-hidden">
                {/* 1. ÉCRAN TITRE */}
                {phase === 'TITLE_MENU' && (
                  <div className="w-full h-full flex flex-col justify-between p-5 sm:p-8 bg-gradient-to-b from-[#0E131F] via-[#131826] to-[#090C12]">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                      <span>ÉDITION TOURNOI DE FER</span>
                      <span>ESP32-S3 · 320×240 BGR565</span>
                    </div>

                    <div className="space-y-3 my-auto">
                      <p className="text-xs font-semibold tracking-wider text-amber-400">
                        STREET MARTIAL ARTS & DARK KOMBAT
                      </p>
                      <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-white leading-none">
                        IRON TOURNAMENT <span className="text-rose-500">AKA</span>
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
                        Affrontez des maîtres dotés d’une IA fidèle à leur psychologie, enchaînez les coups spéciaux et déclenchez votre Coup Fatal lors du signal « Achevez-le ! ».
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGameMode('STORY');
                          soundFX.menuConfirm();
                          setPhase('CHARACTER_SELECT');
                        }}
                        className="py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Mode Histoire
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setGameMode('VERSUS_CPU');
                          soundFX.menuConfirm();
                          setPhase('CHARACTER_SELECT');
                        }}
                        className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs sm:text-sm font-semibold rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Versus vs IA
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setGameMode('VERSUS_2P');
                          soundFX.menuConfirm();
                          setPhase('CHARACTER_SELECT');
                        }}
                        className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs sm:text-sm font-semibold rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Versus 2 Joueurs
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. SÉLECTION DES COMBATTANTS */}
                {phase === 'CHARACTER_SELECT' && (
                  <div className="w-full h-full flex flex-col justify-between p-4 sm:p-5 bg-[#0B0F19] overflow-y-auto">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] text-slate-400">
                          {gameMode === 'STORY'
                            ? 'Campagne 5 Combats · Choisissez votre Champion'
                            : gameMode === 'VERSUS_2P'
                            ? 'Duel Local · Sélectionnez J1 et J2'
                            : 'Mode Versus · Sélectionnez votre Champion et votre Adversaire'}
                        </p>
                        <h2 className="font-display text-2xl font-bold text-white">
                          Sélection des Combattants
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          gameMode === 'STORY'
                            ? beginStoryCampaign(p1Id)
                            : beginVersusMatch()
                        }
                        className="py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Lancer le Combat
                      </button>
                    </div>

                    {/* Grille unifiée des 6 portraits officiels (cadre, fond #0B101E, liseré et cartouche homogènes) */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 my-2">
                      {FIGHTER_ORDER.map((id) => {
                        const isP1 = p1Id === id;
                        const isP2 = gameMode !== 'STORY' && p2Id === id;
                        const badgeTag =
                          isP1 && isP2
                            ? 'J1·J2'
                            : isP1
                            ? 'J1'
                            : isP2
                            ? gameMode === 'VERSUS_2P'
                              ? 'J2'
                              : 'IA'
                            : null;
                        return (
                          <div
                            key={id}
                            className={`group relative rounded-lg overflow-hidden border-2 transition-colors bg-[#0B101E] ${
                              isP1 && isP2
                                ? 'border-amber-400'
                                : isP1
                                ? 'border-sky-400'
                                : isP2
                                ? 'border-rose-500'
                                : 'border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setP1Id(id);
                                soundFX.menuMove();
                              }}
                              className="w-full aspect-square block cursor-pointer text-left"
                            >
                              <FighterPortrait
                                fighterId={id}
                                showNameplate
                                badgeTag={badgeTag}
                              />
                            </button>
                            {gameMode !== 'STORY' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setP2Id(id);
                                  soundFX.menuMove();
                                }}
                                title="Choisir comme Adversaire J2 / IA"
                                className={`w-full py-1 text-[10px] font-mono font-semibold border-t border-slate-800/90 transition-colors cursor-pointer ${
                                  isP2
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-slate-950 text-slate-400 hover:text-white'
                                }`}
                              >
                                {isP2 ? 'Adversaire actif' : 'Cibler J2 / IA'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Résumé face-à-face J1 vs J2 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-sky-400 font-semibold">
                          J1 · {p1Def.name} ({p1Def.archetype})
                        </div>
                        <p className="text-slate-400 line-clamp-2">
                          {p1Def.personalityDescription}
                        </p>
                      </div>

                      {gameMode === 'STORY' ? (
                        <div className="space-y-1">
                          <div className="text-amber-400 font-semibold">
                            Parcours Histoire · 5 Adversaires
                          </div>
                          <p className="text-slate-400">
                            Rival désigné : <span className="text-slate-200">{FIGHTERS[p1Def.rivalId].name}</span> · Boss final : <span className="text-slate-200">Seigneur Malakor</span>
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-rose-400 font-semibold">
                            {gameMode === 'VERSUS_2P' ? 'J2' : 'IA'} · {p2Def.name} ({p2Def.aiProfile.archetypeLabel})
                          </div>
                          <p className="text-slate-400 line-clamp-2">
                            {p2Def.aiProfile.signatureHabit}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. ÉCRAN DE DIALOGUE & FACE-À-FACE PRÉ-MATCH */}
                {phase === 'PRE_MATCH_DIALOGUE' && (() => {
                  const exch = getPreMatchExchange();
                  const isFinalBoss =
                    gameMode === 'STORY' && storyStageIndex === storyLadder.length - 1;
                  return (
                    <div className="w-full h-full flex flex-col justify-between p-5 bg-[#0A0E17]">
                      <div className="text-center space-y-1">
                        <p className="text-xs text-amber-400 font-medium">
                          {exch.contextLabel}
                        </p>
                        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                          {p1Def.shortName} <span className="text-rose-500 px-2">CONTRE</span> {p2Def.shortName}
                        </h2>
                        <p className="text-xs text-slate-400">
                          Arène : {p2Def.stage.name} ({p2Def.stage.location})
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 my-auto items-center">
                        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 flex items-center gap-3">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden shrink-0 border border-sky-500/60">
                            <FighterPortrait fighterId={p1Id} badgeTag="J1" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="font-display text-base font-bold text-sky-400 truncate">
                              {p1Def.name}
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-200 italic leading-snug">
                              {exch.line1}
                            </p>
                          </div>
                        </div>

                        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 flex items-center gap-3">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden shrink-0 border border-rose-500/60">
                            <FighterPortrait
                              fighterId={p2Id}
                              badgeTag={gameMode === 'VERSUS_2P' ? 'J2' : 'IA'}
                              mirrored
                            />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="font-display text-base font-bold text-rose-400 truncate">
                              {p2Def.name}
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-200 italic leading-snug">
                              {exch.line2}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Échelle de progression en mode Histoire */}
                      {gameMode === 'STORY' && (
                        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
                          {storyLadder.map((oppId, idx) => (
                            <span
                              key={oppId}
                              className={
                                idx === storyStageIndex
                                  ? 'text-amber-400 font-semibold'
                                  : idx < storyStageIndex
                                  ? 'text-emerald-400 line-through'
                                  : 'text-slate-500'
                              }
                            >
                              {idx + 1}. {FIGHTERS[oppId].shortName}
                              {idx < storyLadder.length - 1 ? ' ·' : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          onClick={() => launchMatch(p1Id, p2Id, isFinalBoss, p2Id)}
                          className="py-2.5 px-6 bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Entrer dans l’Arène
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* 4. CANVAS DE COMBAT ACTIF (60 FPS) */}
                {(phase === 'PLAYING' || phase === 'PAUSED') && (
                  <>
                    <canvas
                      ref={canvasRef}
                      width={ARENA_WIDTH}
                      height={ARENA_HEIGHT}
                      className="w-full h-full block pixel-canvas"
                    />

                    {phase === 'PAUSED' && (
                      <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center p-6 text-center space-y-4">
                        <h3 className="font-display text-3xl font-bold text-white">
                          Combat en Pause
                        </h3>
                        <p className="text-xs text-slate-300 max-w-sm">
                          Raccourcis Spéciaux de {p1Def.shortName} :{' '}
                          {p1Def.specials.map((s) => `${s.name} (${s.gbShortcut})`).join(' · ')}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => setPhase('PLAYING')}
                            className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            Reprendre
                          </button>
                          <button
                            type="button"
                            onClick={() => launchMatch(p1Id, p2Id, false, selectedStageId)}
                            className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            Recommencer le Match
                          </button>
                          <button
                            type="button"
                            onClick={() => setPhase('CHARACTER_SELECT')}
                            className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            Changer de Combattant
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 5. RÉSUMÉ DE FIN DE MATCH */}
                {phase === 'ROUND_SUMMARY' && matchResult && (() => {
                  const winId = matchResult.winnerSlot === 1 ? p1Id : p2Id;
                  const winDef = FIGHTERS[winId];
                  const playerWon = matchResult.winnerSlot === 1;
                  return (
                    <div className="w-full h-full flex flex-col justify-between p-6 bg-[#0B0F19]">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {gameMode === 'STORY'
                            ? `Mode Histoire · Palier ${storyStageIndex + 1}/${storyLadder.length}`
                            : 'Résultat du Duel Versus'}
                        </span>
                        <span className="font-mono text-amber-400">
                          {matchResult.finisher === 'FATALITY'
                            ? 'VICTOIRE PAR FATALITÉ'
                            : matchResult.finisher === 'HONOR_FINISH'
                            ? 'SCEAU HONORABLE ACCOMPLI'
                            : 'VICTOIRE PAR K.O.'}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-5 my-auto">
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border-2 border-amber-400 shrink-0">
                          <FighterPortrait fighterId={winId} showNameplate />
                        </div>
                        <div className="space-y-2 text-center sm:text-left">
                          <h2 className="font-display text-3xl font-bold text-white">
                            {winDef.name} triomphe !
                          </h2>
                          <p className="text-sm text-slate-200 italic leading-relaxed">
                            {matchResult.quote}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setPhase('CHARACTER_SELECT')}
                          className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          Sélection des personnages
                        </button>
                        <button
                          type="button"
                          onClick={handlePostMatchContinue}
                          className="py-2.5 px-5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          {gameMode === 'STORY'
                            ? playerWon
                              ? storyStageIndex + 1 >= storyLadder.length
                                ? 'Découvrir l’Épilogue'
                                : 'Adversaire Suivant'
                              : 'Relever le Défi (Continuer)'
                            : 'Revanche Immédiate'}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* 6. ÉPILOGUE DU MODE HISTOIRE */}
                {phase === 'STORY_ENDING' && (
                  <div className="w-full h-full flex flex-col justify-between p-6 bg-gradient-to-b from-[#131826] to-[#080B11] overflow-y-auto">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-amber-400 shrink-0">
                        <FighterPortrait fighterId={p1Id} />
                      </div>
                      <div>
                        <p className="text-xs text-amber-400 font-semibold">
                          Champion du Tournoi de Fer · Épilogue de {p1Def.name}
                        </p>
                        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                          {p1Def.storyEndingTitle}
                        </h2>
                      </div>
                    </div>

                    <div className="space-y-2.5 my-3 text-xs sm:text-sm text-slate-200 leading-relaxed">
                      {p1Def.storyEndingParagraphs.map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <span className="text-xs text-slate-400">
                        Campagne terminée sur Gamebuino AKA
                      </span>
                      <button
                        type="button"
                        onClick={() => setPhase('CHARACTER_SELECT')}
                        className="py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Rejouer avec un autre Maître
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Rampe LEDs RGB Droite (Joueur 2 / IA) */}
              <div className="hidden sm:flex flex-col justify-around py-6 px-1.5 bg-slate-950/80 rounded-xl border border-slate-800">
                {ledColors.slice(4, 8).map((col, idx) => (
                  <div
                    key={`led-r-${idx}`}
                    className="w-2.5 h-6 rounded-xs transition-colors duration-100"
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

            {/* Contrôles tactiles physiques de la Gamebuino AKA (D-Pad + Boutons A, B et A+B Spécial) */}
            <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-6 px-2">
              {/* Croix Directionnelle (D-Pad) */}
              <div className="grid grid-cols-3 gap-1 w-[132px] h-[132px] select-none touch-none">
                <div />
                <button
                  type="button"
                  aria-label="Sauter (Haut)"
                  onPointerDown={() => setVirtualKey('p1Up', true)}
                  onPointerUp={() => setVirtualKey('p1Up', false)}
                  onPointerLeave={() => setVirtualKey('p1Up', false)}
                  className="bg-slate-900 active:bg-slate-700 border border-slate-700 rounded-t-md text-xs font-mono text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  ↑
                </button>
                <div />

                <button
                  type="button"
                  aria-label="Gauche"
                  onPointerDown={() => setVirtualKey('p1Left', true)}
                  onPointerUp={() => setVirtualKey('p1Left', false)}
                  onPointerLeave={() => setVirtualKey('p1Left', false)}
                  className="bg-slate-900 active:bg-slate-700 border border-slate-700 rounded-l-md text-xs font-mono text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  ←
                </button>
                <div className="bg-slate-950 border border-slate-800 rounded-xs" />
                <button
                  type="button"
                  aria-label="Droite"
                  onPointerDown={() => setVirtualKey('p1Right', true)}
                  onPointerUp={() => setVirtualKey('p1Right', false)}
                  onPointerLeave={() => setVirtualKey('p1Right', false)}
                  className="bg-slate-900 active:bg-slate-700 border border-slate-700 rounded-r-md text-xs font-mono text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  →
                </button>

                <div />
                <button
                  type="button"
                  aria-label="Accroupir (Bas)"
                  onPointerDown={() => setVirtualKey('p1Down', true)}
                  onPointerUp={() => setVirtualKey('p1Down', false)}
                  onPointerLeave={() => setVirtualKey('p1Down', false)}
                  className="bg-slate-900 active:bg-slate-700 border border-slate-700 rounded-b-md text-xs font-mono text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  ↓
                </button>
                <div />
              </div>

              {/* Rappel clavier ultra-lisible au centre */}
              <div className="flex-1 min-w-[200px] text-center space-y-1 text-xs text-slate-400">
                <div className="text-slate-200 font-medium">
                  Clavier J1 : <span className="font-mono text-amber-400">ZQSD</span> / Flèches · <span className="font-mono text-amber-400">J</span> (A) · <span className="font-mono text-amber-400">K</span> (B) · <span className="font-mono text-rose-400">L / Espace</span> (Spécial A+B)
                </div>
                {gameMode === 'VERSUS_2P' ? (
                  <div>
                    Clavier J2 : <span className="font-mono text-slate-200">Flèches</span> · <span className="font-mono text-slate-200">N / 1</span> (A) · <span className="font-mono text-slate-200">M / 2</span> (B) · <span className="font-mono text-slate-200">/ / 3</span> (Spécial)
                  </div>
                ) : (
                  <div>
                    Garde : <span className="font-mono text-slate-300">Arrière</span> · Esquives : <span className="font-mono text-sky-400">↓+Spéc</span> (H) · <span className="font-mono text-sky-400">←←</span> (M) · <span className="font-mono text-sky-400">↙+Spéc</span> (B)
                  </div>
                )}
              </div>

              {/* Boutons d'action A, B et Raccourci A+B Gamebuino */}
              <div className="flex items-center gap-3 select-none touch-none">
                <button
                  type="button"
                  onPointerDown={() => setVirtualKey('p1B', true)}
                  onPointerUp={() => setVirtualKey('p1B', false)}
                  onPointerLeave={() => setVirtualKey('p1B', false)}
                  className="w-12 h-12 rounded-full bg-amber-600 active:bg-amber-500 text-white font-display text-lg font-bold shadow-md flex flex-col items-center justify-center cursor-pointer"
                >
                  <span>B</span>
                  <span className="text-[9px] font-sans font-normal leading-none">Lourd</span>
                </button>

                <button
                  type="button"
                  onPointerDown={() => setVirtualKey('p1A', true)}
                  onPointerUp={() => setVirtualKey('p1A', false)}
                  onPointerLeave={() => setVirtualKey('p1A', false)}
                  className="w-12 h-12 -mt-5 rounded-full bg-rose-600 active:bg-rose-500 text-white font-display text-lg font-bold shadow-md flex flex-col items-center justify-center cursor-pointer"
                >
                  <span>A</span>
                  <span className="text-[9px] font-sans font-normal leading-none">Rapide</span>
                </button>

                <button
                  type="button"
                  onPointerDown={() => setVirtualKey('p1Spec', true)}
                  onPointerUp={() => setVirtualKey('p1Spec', false)}
                  onPointerLeave={() => setVirtualKey('p1Spec', false)}
                  className="h-12 px-3 rounded-xl bg-slate-800 active:bg-slate-700 border border-rose-500/60 text-rose-300 font-mono text-xs font-semibold flex flex-col items-center justify-center cursor-pointer"
                >
                  <span>A+B</span>
                  <span className="text-[9px] font-sans font-normal text-slate-300">Spécial</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLONNE DROITE (4 col) : MOTEUR 2D/2.5D/3D, CARACTÈRE IA & MÉMENTO DES COUPS */}
        <aside className="lg:col-span-4 space-y-5">
          {/* 1. Sélecteur du Moteur de Rendu Gamebuino AKA (Sprites 2D Pro DMA vs 3D Pro FPU) */}
          <div className="bg-[#131822] border border-slate-800 rounded-xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-slate-100">
                Moteur Graphique Gamebuino
              </h2>
              <button
                type="button"
                onClick={onOpen3DAnalysis}
                className="text-xs text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Code ESP32-S3
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setRenderMode('SPRITE_2D_PRO')}
                className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  renderMode !== 'FULL_3D_PRO'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Sprites 2D Pro (60 FPS)
              </button>
              <button
                type="button"
                onClick={() => setRenderMode('FULL_3D_PRO')}
                className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  renderMode === 'FULL_3D_PRO'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                3D Volumétrique
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {renderMode !== 'FULL_3D_PRO' &&
                '320×240 BGR565 (Recommandé) : Le plus rapide sur ESP32-S3 (< 1.2 ms/trame via DMA) avec ombrage lissé 3×, articulations fondues et cellules fixes 128×112 clé Magenta 0xF81F.'}
              {renderMode === 'FULL_3D_PRO' &&
                '320×240 BGR565 (FPU ESP32-S3) : Combattants 3D articulés (~420 facettes octogonales), éclairage spéculaire adouci et traînées progressives.'}
            </p>

            <button
              type="button"
              onClick={onOpenSpriteSheets}
              className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Inspecter & Télécharger les Planches Magenta (128×112)
            </button>
          </div>

          {/* 2. Niveau d'IA & Lecture du Caractère Adverse en Direct */}
          <div className="bg-[#131822] border border-slate-800 rounded-xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-slate-100">
                Caractère & Niveau de l’IA
              </h2>
              <span className="text-xs text-slate-400">{p2Def.shortName}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
              {(['NOVICE', 'ARCADE', 'MAITRE'] as Difficulty[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDifficulty(lvl)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    difficulty === lvl
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {lvl === 'NOVICE' ? 'Novice' : lvl === 'ARCADE' ? 'Arcade' : 'Maître'}
                </button>
              ))}
            </div>

            {gameMode !== 'VERSUS_2P' ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Profil psychologique :</span>
                  <span className="font-semibold text-amber-400">
                    {p2Def.aiProfile.archetypeLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Décision IA active :</span>
                  <span className="font-mono text-sky-400">{aiLiveThought}</span>
                </div>
                <p className="text-slate-400 pt-1 leading-relaxed">
                  {p2Def.aiProfile.signatureHabit}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Mode 2 Joueurs Humains actif : l’IA est désactivée au profit des commandes J2.
              </p>
            )}
          </div>

          {/* 3. Mémento des Coups Spéciaux de votre Combattant (J1) */}
          <div className="bg-[#131822] border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-slate-100">
                Coups de {p1Def.name}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (phase === 'PLAYING') {
                    launchMatch(p1Id, p2Id, false, selectedStageId);
                  }
                }}
                title="Réinitialiser la manche"
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            <div className="divide-y divide-slate-800/80 text-xs">
              {p1Def.specials.map((sp) => (
                <div key={sp.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-100">{sp.name}</div>
                    <div className="text-[11px] text-slate-400">{sp.classicInput}</div>
                  </div>
                  <span className="font-mono text-amber-400 whitespace-nowrap shrink-0">
                    {sp.gbShortcut}
                  </span>
                </div>
              ))}

              <div className="pt-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-rose-400">
                    {p1Def.finisher.isHonorable ? 'Sceau : ' : 'Fatalité : '}
                    {p1Def.finisher.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Lors de « ACHEVEZ-LE ! » · {p1Def.finisher.rangeHint}
                  </div>
                </div>
                <span className="font-mono text-rose-400 whitespace-nowrap shrink-0">
                  {p1Def.finisher.gbShortcut}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
