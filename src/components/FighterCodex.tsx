import React, { useState } from 'react';
import { FIGHTERS, FIGHTER_ORDER } from '../data/fighters';
import { FighterAction, FighterId, RenderEngineMode } from '../types/game';
import { FighterAnimationBoard } from './FighterAnimationBoard';
import { FighterLivePreview } from './FighterLivePreview';
import { FighterPortrait } from './FighterPortrait';
import { SpriteSheetStudio } from './SpriteSheetStudio';

interface FighterCodexProps {
  selectedId: FighterId;
  renderMode: RenderEngineMode;
  onChangeRenderMode: (mode: RenderEngineMode) => void;
  onSelectFighterForStory: (id: FighterId) => void;
  onSelectFighterForVersus: (id: FighterId) => void;
}

export const FighterCodex: React.FC<FighterCodexProps> = ({
  selectedId,
  renderMode,
  onChangeRenderMode,
  onSelectFighterForStory,
  onSelectFighterForVersus,
}) => {
  const [activeId, setActiveId] = useState<FighterId>(selectedId);
  const [activePreviewAction, setActivePreviewAction] = useState<FighterAction>('IDLE');
  const [triggerRequest, setTriggerRequest] = useState<{
    action: FighterAction;
    nonce: number;
  } | null>(null);

  const f = FIGHTERS[activeId];
  const rival = FIGHTERS[f.rivalId];
  const statSum =
    f.stats.vitality +
    f.stats.speed +
    f.stats.power +
    f.stats.defense +
    f.stats.reach +
    f.stats.recovery;

  const statRows: Array<{ label: string; value: number; detail: string }> = [
    { label: 'Vitalité', value: f.stats.vitality, detail: `${f.maxHp} PV max` },
    { label: 'Vitesse', value: f.stats.speed, detail: `${f.walkSpeedFwd.toFixed(2)} px/f` },
    { label: 'Puissance', value: f.stats.power, detail: 'Multiplicateur dégâts' },
    { label: 'Défense', value: f.stats.defense, detail: 'Réduction d’impact' },
    { label: 'Portée', value: f.stats.reach, detail: 'Allonge coups normaux' },
    { label: 'Récupération', value: f.stats.recovery, detail: 'Agilité post-attaque' },
  ];

  const triggerAnimationInStage = (action: FighterAction) => {
    setActivePreviewAction(action);
    setTriggerRequest((prev) => ({
      action,
      nonce: (prev?.nonce || 0) + 1,
    }));
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-8 space-y-10">
      <div className="space-y-5 border-b border-slate-800 pb-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs text-slate-400">
              Fiches Combattants · Portraits Unifiés · Animations Lissées · Planches Magenta 128×112 px
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
              Les Six Maîtres du Tournoi de Fer
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#sprite-sheet-studio"
              className="py-2 px-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Voir Planches Sprites (#FF00FF)
            </a>
            <p className="text-xs text-slate-400 font-mono">
              320×240 BGR565 (ESP32-S3)
            </p>
          </div>
        </div>

        {/* Galerie unifiée des 6 portraits officiels (présentation homogène, cadre et typographie identiques) */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {FIGHTER_ORDER.map((id) => {
            const isActive = id === activeId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveId(id)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer text-left ${
                  isActive
                    ? 'border-amber-400 ring-2 ring-amber-400/30'
                    : 'border-slate-800 hover:border-slate-600 opacity-85 hover:opacity-100'
                }`}
              >
                <FighterPortrait fighterId={id} showNameplate showSubtitle />
              </button>
            );
          })}
        </div>
      </div>

      {/* Fiche principale : Portrait Unifié + Démonstrateur d'Arène 320x240 + Lore & Coups */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Colonne Portrait & Identité */}
        <div className="lg:col-span-4 bg-[#131822] border border-slate-800 rounded-xl p-6 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            <div className="aspect-square w-full rounded-lg overflow-hidden border border-slate-700/80">
              <FighterPortrait fighterId={f.id} showNameplate showSubtitle />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-slate-400">
                {f.origin} · {f.archetype}
              </p>
              <h2 className="font-display text-3xl font-bold text-slate-100">
                {f.name}
              </h2>
              <p className="text-sm text-amber-400 font-medium">{f.title}</p>
            </div>

            <p className="text-sm text-slate-300 italic leading-relaxed">
              {f.introQuote}
            </p>

            <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-400 space-y-1.5">
              <div>
                Style martial : <span className="text-slate-200">{f.fightingStyle}</span>
              </div>
              <div>
                Arène attitrée : <span className="text-slate-200">{f.stage.name}</span>
              </div>
              <div>
                Rival désigné : <span className="text-slate-200">{rival.name}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => onSelectFighterForStory(f.id)}
              className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Jouer son Histoire
            </button>
            <button
              type="button"
              onClick={() => onSelectFighterForVersus(f.id)}
              className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Choisir en Versus
            </button>
          </div>
        </div>

        {/* Colonne Studio Temps-Réel + Lore + Caractère IA + Coups */}
        <div className="lg:col-span-8 space-y-6">
          <FighterLivePreview
            fighterId={f.id}
            renderMode={renderMode}
            onChangeRenderMode={onChangeRenderMode}
            externalTriggerAction={triggerRequest}
            onActiveActionChange={setActivePreviewAction}
          />

          <div className="bg-[#131822] border border-slate-800 rounded-xl p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2.5">
                <h3 className="font-display text-xl font-bold text-slate-100">
                  01. Histoire & Origines
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {f.loreBackground}
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-xl font-bold text-slate-100">
                  02. Psychologie & Caractère IA
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {f.personalityDescription}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  <strong className="text-slate-200 font-semibold">
                    Moteur IA ({f.aiProfile.archetypeLabel}) :
                  </strong>{' '}
                  {f.aiProfile.behaviorSummary}
                </p>
              </div>
            </div>

            {/* Jauges d'équilibrage compétitif */}
            <div className="space-y-4 pt-6 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="font-display text-xl font-bold text-slate-100">
                  03. Équilibrage Compétitif
                </h3>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  Budget total : {statSum} / 360 pts · Distance IA préférée : {f.aiProfile.preferredRangePx} px
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                {statRows.map((row) => (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-200 font-medium">
                        {row.label} <span className="text-slate-500">· {row.detail}</span>
                      </span>
                      <span className="font-mono text-slate-300 tabular-nums">
                        {row.value}/100
                      </span>
                    </div>
                    <div className="h-2 bg-slate-900 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${row.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Liste interactive des Coups Spéciaux, Esquives & Coup Fatal */}
            <div className="space-y-4 pt-6 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xl font-bold text-slate-100">
                  04. Coups Spéciaux, Esquives & Coup Fatal (cliquer pour animer)
                </h3>
                <span className="text-xs text-slate-400">
                  Esquives : ↓+A+B (Haute) · ←← (Moyenne) · ↙+A+B (Basse)
                </span>
              </div>

              <div className="divide-y divide-slate-800/80 border-t border-b border-slate-800/80">
                {f.specials.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => triggerAnimationInStage(sp.id)}
                    className="w-full py-3 px-2 hover:bg-slate-800/40 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors cursor-pointer"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-slate-100">
                        {sp.name}
                      </div>
                      <p className="text-xs text-slate-400">{sp.description}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 font-mono text-xs tabular-nums">
                      <span className="text-amber-400">{sp.gbShortcut}</span>
                      <span className="text-slate-500">ou</span>
                      <span className="text-slate-300">{sp.classicInput}</span>
                      <span className="text-slate-400">· {sp.damage} dég.</span>
                    </div>
                  </button>
                ))}

                {/* Coup Fatal */}
                <button
                  type="button"
                  onClick={() => triggerAnimationInStage('FINISHER')}
                  className="w-full py-3 px-2 hover:bg-slate-800/40 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-rose-400">
                      {f.finisher.isHonorable ? 'Sceau Honorable : ' : 'Fatalité : '}
                      {f.finisher.name}
                    </div>
                    <p className="text-xs text-slate-400">
                      {f.finisher.description} ({f.finisher.rangeHint})
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 font-mono text-xs tabular-nums">
                    <span className="text-rose-400">{f.finisher.gbShortcut}</span>
                    <span className="text-slate-500">ou</span>
                    <span className="text-slate-300">{f.finisher.classicInput}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Planche complète des 16 animations simultanées lissées */}
      <FighterAnimationBoard
        fighterId={f.id}
        renderMode={renderMode}
        activeAction={activePreviewAction}
        onSelectAnimation={triggerAnimationInStage}
      />

      {/* Planches de Sprites Fixes 128x112 sur fond Magenta #FF00FF (0xF81F BGR565) sans aucun pixel coupé */}
      <SpriteSheetStudio fighterId={f.id} />

      {/* Tableau récapitulatif d'équilibrage des 6 personnages */}
      <div className="bg-[#131822] border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="font-display text-2xl font-bold text-slate-100">
            Matrice d’Équilibrage Complet de la Sélection
          </h3>
          <span className="text-xs text-slate-400">
            Somme constante de 360 points d’attributs par combattant en mode Versus
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Combattant</th>
                <th className="py-2.5 px-3 font-semibold">Archétype</th>
                <th className="py-2.5 px-3 font-semibold font-mono">PV Max</th>
                <th className="py-2.5 px-3 font-semibold font-mono">Vit.</th>
                <th className="py-2.5 px-3 font-semibold font-mono">Puis.</th>
                <th className="py-2.5 px-3 font-semibold font-mono">Déf.</th>
                <th className="py-2.5 px-3 font-semibold font-mono">Portée</th>
                <th className="py-2.5 px-3 font-semibold font-mono">Récup.</th>
                <th className="py-2.5 pl-3 font-semibold font-mono">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 tabular-nums">
              {FIGHTER_ORDER.map((id) => {
                const char = FIGHTERS[id];
                const sum =
                  char.stats.vitality +
                  char.stats.speed +
                  char.stats.power +
                  char.stats.defense +
                  char.stats.reach +
                  char.stats.recovery;
                return (
                  <tr
                    key={id}
                    onClick={() => setActiveId(id)}
                    className={`cursor-pointer transition-colors ${
                      id === activeId ? 'bg-slate-800/60 text-white' : 'text-slate-300 hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="py-2.5 pr-4 font-semibold">{char.name}</td>
                    <td className="py-2.5 px-3 text-slate-400">{char.archetype}</td>
                    <td className="py-2.5 px-3 font-mono">{char.maxHp}</td>
                    <td className="py-2.5 px-3 font-mono">{char.stats.speed}</td>
                    <td className="py-2.5 px-3 font-mono">{char.stats.power}</td>
                    <td className="py-2.5 px-3 font-mono">{char.stats.defense}</td>
                    <td className="py-2.5 px-3 font-mono">{char.stats.reach}</td>
                    <td className="py-2.5 px-3 font-mono">{char.stats.recovery}</td>
                    <td className="py-2.5 pl-3 font-mono text-amber-400 font-semibold">{sum}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
