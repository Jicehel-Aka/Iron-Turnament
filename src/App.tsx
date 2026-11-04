import { useState } from 'react';
import { FighterCodex } from './components/FighterCodex';
import { GamebuinoCodeView } from './components/GamebuinoCodeView';
import { GamebuinoConsoleWorkspace } from './components/GamebuinoShell';
import {
  Difficulty,
  FighterId,
  GameMode,
  RenderEngineMode,
  ScreenPhase,
} from './types/game';

type ActiveSection = 'CONSOLE' | 'CODEX' | 'ARCH_3D';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('CONSOLE');
  const [gameMode, setGameMode] = useState<GameMode>('STORY');
  const [phase, setPhase] = useState<ScreenPhase>('TITLE_MENU');
  const [p1Id, setP1Id] = useState<FighterId>('kenji');
  const [p2Id, setP2Id] = useState<FighterId>('krowen');
  const [renderMode, setRenderMode] = useState<RenderEngineMode>('SPRITE_2D_PRO');
  const [difficulty, setDifficulty] = useState<Difficulty>('ARCADE');

  const openStoryMode = (fighterId?: FighterId) => {
    if (fighterId) setP1Id(fighterId);
    setGameMode('STORY');
    setPhase('CHARACTER_SELECT');
    setActiveSection('CONSOLE');
  };

  const openVersusMode = (fighterId?: FighterId) => {
    if (fighterId) setP1Id(fighterId);
    setGameMode('VERSUS_CPU');
    setPhase('CHARACTER_SELECT');
    setActiveSection('CONSOLE');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] text-slate-100">
      {/* Top Bar Contract : 3 zones strictes séparées par gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/90 bg-[#0B0E14]">
        {/* Zone 1 : Marque sur une seule ligne */}
        <button
          type="button"
          onClick={() => {
            setActiveSection('CONSOLE');
            setPhase('TITLE_MENU');
          }}
          className="font-display text-2xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          Iron Tournament AKA
        </button>

        {/* Zone 2 : 5 liens de navigation concis sur une seule ligne */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveSection('CONSOLE')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'CONSOLE' ? 'text-white underline underline-offset-8 decoration-rose-500' : ''
            }`}
          >
            Console
          </button>
          <button
            type="button"
            onClick={() => openStoryMode()}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Histoire
          </button>
          <button
            type="button"
            onClick={() => openVersusMode()}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Versus
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('CODEX')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'CODEX' ? 'text-white underline underline-offset-8 decoration-rose-500' : ''
            }`}
          >
            Combattants
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('ARCH_3D')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'ARCH_3D' ? 'text-white underline underline-offset-8 decoration-rose-500' : ''
            }`}
          >
            Architecture 3D
          </button>
        </nav>

        {/* Zone 3 : 1 action principale */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => openStoryMode()}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Nouveau duel
          </button>
        </div>
      </header>

      {/* Navigation mobile compacte */}
      <div className="flex md:hidden items-center justify-around gap-2 px-4 py-2 border-b border-slate-800 bg-[#10151F] text-xs font-medium text-slate-300 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSection('CONSOLE')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeSection === 'CONSOLE' ? 'text-rose-400 font-semibold' : ''}`}
        >
          Console
        </button>
        <button
          type="button"
          onClick={() => openStoryMode()}
          className="px-2 py-1 whitespace-nowrap shrink-0"
        >
          Histoire
        </button>
        <button
          type="button"
          onClick={() => openVersusMode()}
          className="px-2 py-1 whitespace-nowrap shrink-0"
        >
          Versus
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('CODEX')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeSection === 'CODEX' ? 'text-rose-400 font-semibold' : ''}`}
        >
          Combattants
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('ARCH_3D')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeSection === 'ARCH_3D' ? 'text-rose-400 font-semibold' : ''}`}
        >
          3D & .ino
        </button>
      </div>

      <main className="flex-1">
        {activeSection === 'CONSOLE' && (
          <GamebuinoConsoleWorkspace
            gameMode={gameMode}
            setGameMode={setGameMode}
            phase={phase}
            setPhase={setPhase}
            p1Id={p1Id}
            setP1Id={setP1Id}
            p2Id={p2Id}
            setP2Id={setP2Id}
            renderMode={renderMode}
            setRenderMode={setRenderMode}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onOpen3DAnalysis={() => setActiveSection('ARCH_3D')}
            onOpenSpriteSheets={() => setActiveSection('CODEX')}
          />
        )}

        {activeSection === 'CODEX' && (
          <FighterCodex
            selectedId={p1Id}
            renderMode={renderMode}
            onChangeRenderMode={setRenderMode}
            onSelectFighterForStory={(id) => openStoryMode(id)}
            onSelectFighterForVersus={(id) => openVersusMode(id)}
          />
        )}

        {activeSection === 'ARCH_3D' && (
          <GamebuinoCodeView
            currentRenderMode={renderMode}
            onSwitchRenderModeAndPlay={(mode) => {
              setRenderMode(mode);
              setActiveSection('CONSOLE');
            }}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Iron Tournament AKA · Gamebuino AKA (ESP32-S3 · 320×240 BGR565)</span>
        <span>6 Combattants équilibrés (360 pts) · Sprites 2D Pro (128×112 Magenta 0xF81F) & 3D Volumétrique</span>
      </footer>
    </div>
  );
}
