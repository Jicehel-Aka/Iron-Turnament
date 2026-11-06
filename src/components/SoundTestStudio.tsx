import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Disc3,
  Radio,
  Sparkles,
  Zap,
  ArrowLeft,
  Flame,
  Shield,
  Activity,
  Music,
} from 'lucide-react';
import {
  soundFX,
  MusicTheme,
  SOUND_TRACKS,
  SoundTrackInfo,
  AudioStepEvent,
} from '../audio/soundEngine';

interface SoundTestStudioProps {
  onBack: () => void;
  bgmVolume: number;
  sfxVolume: number;
  onUpdateBgmVolume: (val: number) => void;
  onUpdateSfxVolume: (val: number) => void;
  soundEnabled: boolean;
  onToggleSoundEnabled: () => void;
}

export function SoundTestStudio({
  onBack,
  bgmVolume,
  sfxVolume,
  onUpdateBgmVolume,
  onUpdateSfxVolume,
  soundEnabled,
  onToggleSoundEnabled,
}: SoundTestStudioProps) {
  const [activeTrackIndex, setActiveTrackIndex] = useState(3); // Start with STAGE_DOJO (idx 3)
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentStepEvent, setCurrentStepEvent] = useState<AudioStepEvent | null>(null);
  const [activeTab, setActiveTab] = useState<'MUSIC' | 'SFX'>('MUSIC');
  const [lastSfxName, setLastSfxName] = useState<string>('Prêt');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const activeTrack: SoundTrackInfo = SOUND_TRACKS[activeTrackIndex] || SOUND_TRACKS[0];

  // Joue la piste active
  const playTrackByIndex = (idx: number) => {
    const nextIdx = (idx + SOUND_TRACKS.length) % SOUND_TRACKS.length;
    setActiveTrackIndex(nextIdx);
    const target = SOUND_TRACKS[nextIdx];
    soundFX.playMusic(target.id);
    setIsPlaying(true);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      soundFX.stopMusic();
      setIsPlaying(false);
    } else {
      soundFX.playMusic(activeTrack.id);
      setIsPlaying(true);
    }
  };

  const stopPlayback = () => {
    soundFX.stopMusic();
    setIsPlaying(false);
    setCurrentStepEvent(null);
  };

  // Écouteur des pas musicaux de soundFX
  useEffect(() => {
    // Si la musique n'est pas déjà lancée sur cette piste, on la lance
    soundFX.playMusic(activeTrack.id);
    setIsPlaying(true);

    const unsubscribe = soundFX.onStep((ev) => {
      setCurrentStepEvent(ev);
    });

    return () => {
      unsubscribe();
    };
  }, [activeTrack.id]);

  // Rendu de l'oscilloscope chiptune rétro sur Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const renderOscilloscope = () => {
      phase += 0.08;
      const w = canvas.width;
      const h = canvas.height;

      // Fond LCD rétro vert sombre / ambre
      ctx.fillStyle = '#060A0D';
      ctx.fillRect(0, 0, w, h);

      // Grille matricielle
      ctx.strokeStyle = '#0E1E1E';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Ligne centrale zéro
      ctx.strokeStyle = '#163836';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (!isPlaying || !currentStepEvent) {
        // Ligne de veille
        ctx.strokeStyle = '#1FD6A3';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = h / 2 + Math.sin(x * 0.05 + phase * 0.4) * 1.5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        animFrameRef.current = requestAnimationFrame(renderOscilloscope);
        return;
      }

      // Onde composée des 4 canaux
      const bassAmp = currentStepEvent.bassFreq > 0 ? 0.35 : 0.05;
      const melAmp = currentStepEvent.melodyFreq > 0 ? 0.45 : 0.08;
      const harmAmp = currentStepEvent.harmonyFreq > 0 ? 0.25 : 0.04;
      const drumAmp = currentStepEvent.drumHit > 0 ? (currentStepEvent.drumHit === 4 ? 0.7 : 0.4) : 0.02;

      const f1 = (currentStepEvent.bassFreq || 110) * 0.003;
      const f2 = (currentStepEvent.melodyFreq || 220) * 0.004;
      const f3 = (currentStepEvent.harmonyFreq || 330) * 0.005;

      // Glow de l'onde
      ctx.shadowColor = '#10B981';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 2.0;

      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const wave =
          Math.sin(x * f1 + phase * 2.0) * bassAmp +
          Math.cos(x * f2 + phase * 3.5) * melAmp +
          Math.sin(x * f3 + phase * 1.8) * harmAmp +
          (Math.random() - 0.5) * drumAmp;

        const y = h / 2 + wave * (h * 0.38);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      animFrameRef.current = requestAnimationFrame(renderOscilloscope);
    };

    animFrameRef.current = requestAnimationFrame(renderOscilloscope);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, currentStepEvent]);

  // Test SFX
  const triggerSfx = (name: string, fn: () => void) => {
    setLastSfxName(name);
    fn();
  };

  const currentStep = currentStepEvent?.step ?? 0;
  const totalSteps = currentStepEvent?.totalSteps ?? activeTrack.totalSteps;
  const progressPercent = Math.min(100, Math.round(((currentStep + 1) / totalSteps) * 100));

  return (
    <div className="w-full h-full flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-[#080B11] via-[#0E1420] to-[#06080D] text-slate-200 select-none overflow-y-auto">
      {/* Barre supérieure : Titre et retour */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white">
                Juke-box & Studio Son AKA
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                DSP 4 CANAUX
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Synthétiseur chiptune 16-bit · Gamebuino AKA ESP32-S3
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Onglets Musique vs SFX */}
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('MUSIC')}
              className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                activeTab === 'MUSIC'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Musiques (12)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SFX')}
              className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                activeTab === 'SFX'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bruitages SFX
            </button>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour</span>
          </button>
        </div>
      </div>

      {activeTab === 'MUSIC' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 my-3 items-start">
          {/* Colonne gauche : Lecteur actif & Oscilloscope (7 colonnes) */}
          <div className="lg:col-span-7 space-y-3.5">
            {/* Boîtier principal du lecteur */}
            <div className="bg-[#0B101A] border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
              {/* Informations du morceau */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      PISTE {String(activeTrackIndex + 1).padStart(2, '0')} / {SOUND_TRACKS.length}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {activeTrack.bpm} BPM · {activeTrack.totalSteps} PAS
                    </span>
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white truncate">
                    {activeTrack.title}
                  </h3>
                  <p className="text-xs text-rose-400 font-medium">
                    {activeTrack.arenaOrContext}
                    {activeTrack.fighterName ? ` · ${activeTrack.fighterName}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1 text-slate-400 shrink-0">
                  <Disc3 className={`w-8 h-8 text-amber-400 ${isPlaying ? 'animate-spin' : ''}`} />
                </div>
              </div>

              {/* Description artistique du thème */}
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                {activeTrack.description}
              </p>

              {/* Oscilloscope Canvas Chiptune en temps réel */}
              <div className="relative rounded-lg overflow-hidden border border-emerald-950/80 bg-black">
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={90}
                  className="w-full h-24 block"
                />
                <div className="absolute top-1.5 left-2 flex items-center gap-2 text-[10px] font-mono text-emerald-400 bg-black/60 px-2 py-0.5 rounded border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>OSCILLOSCOPE TEMPS RÉEL</span>
                </div>
                <div className="absolute bottom-1.5 right-2 text-[10px] font-mono text-emerald-400/80 bg-black/60 px-2 py-0.5 rounded">
                  PAS : {String(currentStep + 1).padStart(3, '0')} / {totalSteps}
                </div>
              </div>

              {/* Barre de progression du pas (Step Progression) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Progression de la boucle</span>
                  <span className="text-amber-400 font-semibold">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-75"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* 4 Canaux Audio Séparés avec VU-Mètres interactifs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {/* Canal 1 : Basse */}
                <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg text-center space-y-1">
                  <span className="text-[10px] font-mono text-amber-400 font-bold block">1. BASSE</span>
                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-75"
                      style={{
                        width: `${currentStepEvent?.bassFreq ? Math.min(100, Math.round((currentStepEvent.bassFreq / 250) * 100)) : 10}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 block truncate">
                    {currentStepEvent?.bassFreq ? `${Math.round(currentStepEvent.bassFreq)} Hz` : 'Repos'}
                  </span>
                </div>

                {/* Canal 2 : Mélodie */}
                <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg text-center space-y-1">
                  <span className="text-[10px] font-mono text-rose-400 font-bold block">2. LEAD</span>
                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all duration-75"
                      style={{
                        width: `${currentStepEvent?.melodyFreq ? Math.min(100, Math.round((currentStepEvent.melodyFreq / 1000) * 100)) : 10}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 block truncate">
                    {currentStepEvent?.melodyFreq ? `${Math.round(currentStepEvent.melodyFreq)} Hz` : 'Repos'}
                  </span>
                </div>

                {/* Canal 3 : Harmonie */}
                <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg text-center space-y-1">
                  <span className="text-[10px] font-mono text-sky-400 font-bold block">3. HARMONIE</span>
                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all duration-75"
                      style={{
                        width: `${currentStepEvent?.harmonyFreq ? Math.min(100, Math.round((currentStepEvent.harmonyFreq / 1200) * 100)) : 10}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 block truncate">
                    {currentStepEvent?.harmonyFreq ? `${Math.round(currentStepEvent.harmonyFreq)} Hz` : 'Repos'}
                  </span>
                </div>

                {/* Canal 4 : Percussion */}
                <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg text-center space-y-1">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold block">4. RYTHME</span>
                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-75"
                      style={{
                        width: `${currentStepEvent?.drumHit ? currentStepEvent.drumHit * 25 : 8}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 block truncate">
                    {currentStepEvent?.drumHit === 1
                      ? 'Charleston'
                      : currentStepEvent?.drumHit === 2
                      ? 'Caisse claire'
                      : currentStepEvent?.drumHit === 3
                      ? 'Kick basse'
                      : currentStepEvent?.drumHit === 4
                      ? 'Crash accent'
                      : 'Silence'}
                  </span>
                </div>
              </div>

              {/* Boutons de contrôle de lecture */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => playTrackByIndex(activeTrackIndex - 1)}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Morceau précédent"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={togglePlayPause}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    title={isPlaying ? 'Mettre en pause' : 'Lancer la lecture'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>{isPlaying ? 'Pause' : 'Lecture'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={stopPlayback}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Arrêter"
                  >
                    <Square className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => playTrackByIndex(activeTrackIndex + 1)}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Morceau suivant"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Volume de musique BGM */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onToggleSoundEnabled}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-rose-500" />
                    )}
                  </button>
                  <div className="w-24 sm:w-32 flex items-center gap-1.5">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={bgmVolume}
                      onChange={(e) => onUpdateBgmVolume(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                    />
                    <span className="text-[11px] font-mono text-slate-400 w-8 text-right">
                      {bgmVolume}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite : Liste complète des 12 pistes (5 colonnes) */}
          <div className="lg:col-span-5 bg-[#0B101A] border border-slate-800 rounded-xl p-3 space-y-2 max-h-[460px] overflow-y-auto">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-800 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-amber-400" />
                <span>Pistes disponibles (12)</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">16-BIT CHIPTUNE</span>
            </div>

            <div className="space-y-1.5">
              {SOUND_TRACKS.map((t, idx) => {
                const isCurrent = activeTrackIndex === idx;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => playTrackByIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                      isCurrent
                        ? 'bg-rose-950/40 border-rose-500/80 text-white shadow-sm'
                        : 'bg-slate-900/50 hover:bg-slate-800/80 border-slate-800/70 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                          isCurrent
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate leading-tight">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {t.arenaOrContext}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-slate-400">
                        {t.bpm} BPM
                      </span>
                      {isCurrent && isPlaying ? (
                        <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                      ) : (
                        <Play className="w-3 h-3 text-slate-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Onglet Bruitages SFX de combat */
        <div className="bg-[#0B101A] border border-slate-800 rounded-xl p-4 my-3 space-y-4 max-h-[460px] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Banc d’Essai des Bruitages & Coups Spéciaux</span>
              </h3>
              <p className="text-xs text-slate-400">
                Testez les impacts martiaux, coups spéciaux et gongs du moteur audio AKA.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Dernier son joué :</span>
              <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {lastSfxName}
              </span>
            </div>
          </div>

          {/* Grille des SFX */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* 1. Coups de base */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Impacts Standard</span>
              </span>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => triggerSfx('Coup Léger (Jab)', () => soundFX.lightHit())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Coup Léger (Poing)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Coup Lourd (Impact)', () => soundFX.heavyHit())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Coup Lourd (Choc)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Balayette Basse (Sweep)', () => soundFX.lightHit())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Balayette Basse
                </button>
              </div>
            </div>

            {/* 2. Défense & Parades */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span>Défense & Garde</span>
              </span>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => triggerSfx('Garde Absorbée', () => soundFX.blockHit())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Garde Standard (Block)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Fendage de l’Air (Whiff)', () => soundFX.whiff())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Fendage de l’Air (Esquive)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Projection au Sol (Throw)', () => soundFX.throwSlam())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Projection au Sol (Throw)
                </button>
              </div>
            </div>

            {/* 3. Coups Spéciaux Kenji & Krowen */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>Kenji & Krowen</span>
              </span>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => triggerSfx('Onde Céleste (Hadoken)', () => soundFX.specialMove('KI'))}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Onde Céleste (Hadoken)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Souffle Calciné (Flammes)', () => soundFX.specialMove('HEAVY'))}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Souffle Calciné (Feu)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Pas de Brume (Téléportation)', () => soundFX.specialMove('TELEPORT'))}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Pas de Brume (Ombres)
                </button>
              </div>
            </div>

            {/* 4. Coups Spéciaux Mei-Lin & Titan */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Mei-Lin & Titan</span>
              </span>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => triggerSfx('Éventail d’Acier (Mei-Lin)', () => soundFX.specialMove('HARPOON'))}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Éventail d’Acier (Tranchant)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Séisme d’Oural (Titan)', () => soundFX.specialMove('HEAVY'))}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Séisme d’Oural (Impact Sol)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Lariat Blindé (Titan)', () => soundFX.heavyHit())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Lariat Blindé (Rotation)
                </button>
              </div>
            </div>

            {/* 5. Coups Spéciaux Nyxia & Malakor */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Nyxia & Malakor</span>
              </span>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => triggerSfx('Lance Foudroyante (Nyxia)', () => soundFX.specialMove('LIGHTNING'))}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Lance Foudroyante (Éclair)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Torpille Pourpre (Malakor)', () => soundFX.specialMove('HEAVY'))}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Torpille Pourpre (Foreuse)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Provocation Martiale (Taunt)', () => soundFX.taunt())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Provocation Martiale (Taunt)
                </button>
              </div>
            </div>

            {/* 6. Fin de Combat & Annonces */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-rose-500 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>Verdict & Coup Fatal</span>
              </span>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => triggerSfx('Gong K.O. Final (Round Bell)', () => soundFX.roundBell())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Gong K.O. Final
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Achevez-le ! (Finish Him Sting)', () => soundFX.finishHimSting())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Signal « Achevez-le ! »
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Impact Coup Fatal (Finisher)', () => soundFX.finisherImpact())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Impact Coup Fatal (Finisher)
                </button>
                <button
                  type="button"
                  onClick={() => triggerSfx('Déflagration K.O. (Ko Blast)', () => soundFX.koBlast())}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-left rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Déflagration K.O. Blast
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pied de page informatif */}
      <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <span>Gamebuino AKA · Audio I2S Synthwave Chiptune 16-bit</span>
        <span>Commandes console : [A] Lecture · [B] Arrêt · [←/→] Piste</span>
      </div>
    </div>
  );
}
