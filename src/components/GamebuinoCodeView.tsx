import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { GAMEBUINO_SKETCH_INO } from '../data/gamebuinoCode';
import { RenderEngineMode } from '../types/game';

interface GamebuinoCodeViewProps {
  currentRenderMode: RenderEngineMode;
  onSwitchRenderModeAndPlay: (mode: RenderEngineMode) => void;
}

export const GamebuinoCodeView: React.FC<GamebuinoCodeViewProps> = ({
  currentRenderMode,
  onSwitchRenderModeAndPlay,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(GAMEBUINO_SKETCH_INO).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([GAMEBUINO_SKETCH_INO], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IronTournamentAKA_ESP32S3.ino';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-8 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs text-slate-400">
            Architecture Gamebuino AKA · ESP32-S3 Dual-Core 240 MHz · FPU Matériel · Dalle 320×240 BGR565
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Pipeline 320×240 BGR565 : Sprites 2D Pro, Hybride 2.5D & 3D Volumétrique
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Code copié' : 'Copier le code ESP32-S3'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Télécharger .ino
          </button>
        </div>
      </div>

      {/* Diagnostic matériel ESP32-S3 320x240 BGR565 */}
      <div className="bg-[#131822] border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="space-y-2 max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-slate-100">
            Bilan Technique ESP32-S3 : 320×240 en 16-bit BGR565 sans compromis
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Contrairement à l’ancienne génération Cortex-M0+, la <strong className="text-white">Gamebuino AKA</strong> embarque un <span className="font-mono text-slate-200">ESP32-S3 Dual-Core à 240 MHz</span> muni d’une unité flottante matérielle (FPU) et de mémoire PSRAM rapide. Un framebuffer complet <span className="font-mono text-amber-400">320×240 en BGR565</span> occupe exactement <span className="font-mono text-slate-200">153 600 octets</span> (<span className="font-mono text-slate-400">((B &amp; 0xF8) &lt;&lt; 8) | ((G &amp; 0xFC) &lt;&lt; 3) | (R &gt;&gt; 3)</span>) et s’expédie vers l’écran par DMA SPI à 80 MHz sur le Core 0 pendant que le Core 1 calcule les 24 animations de combat, l’éclairage et l’IA psychologique.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Moteur Graphique</th>
                <th className="py-2.5 px-3 font-semibold">Format Natif</th>
                <th className="py-2.5 px-3 font-semibold font-mono">Mémoire DMA</th>
                <th className="py-2.5 px-3 font-semibold font-mono">Cadence ESP32-S3</th>
                <th className="py-2.5 px-3 font-semibold">Rendu des 24 Postures & Décors</th>
                <th className="py-2.5 pl-3 font-semibold text-right">Activer en direct</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              <tr>
                <td className="py-3 pr-4 font-semibold text-amber-400">
                  Sprites 2D Pro — Clé Magenta 0xF81F (Recommandé)
                </td>
                <td className="py-3 px-3 font-mono">128×112 px · BGR565</td>
                <td className="py-3 px-3 font-mono text-emerald-400">307.2 Ko + Planches PSRAM</td>
                <td className="py-3 px-3 font-mono text-emerald-400">60 FPS verrouillés (&lt;1.2 ms)</td>
                <td className="py-3 px-3">
                  Le plus performant et le plus fin graphiquement : ombrage continu lissé 3×, articulations soudées, cellules fixes 128×112 sur fond #FF00FF sans aucun rognage.
                </td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSwitchRenderModeAndPlay('SPRITE_2D_PRO')}
                    className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                      currentRenderMode !== 'FULL_3D_PRO'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                    }`}
                  >
                    {currentRenderMode !== 'FULL_3D_PRO' ? 'Actif sur Console' : 'Activer Sprites 2D Pro'}
                  </button>
                </td>
              </tr>

              <tr>
                <td className="py-3 pr-4 font-semibold text-sky-400">
                  3D Volumétrique Pro (FPU Dual-Core)
                </td>
                <td className="py-3 px-3 font-mono">320×240 BGR565</td>
                <td className="py-3 px-3 font-mono text-amber-400">460.8 Ko (+ Z-Span)</td>
                <td className="py-3 px-3 font-mono text-emerald-400">48 – 60 FPS</td>
                <td className="py-3 px-3">
                  Combattants 3D articulés (~420 facettes octogonales/perso), éclairage adouci 3 points, reflets au sol et traînées progressives.
                </td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSwitchRenderModeAndPlay('FULL_3D_PRO')}
                    className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                      currentRenderMode === 'FULL_3D_PRO'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                    }`}
                  >
                    {currentRenderMode === 'FULL_3D_PRO' ? 'Actif sur Console' : 'Activer 3D Pro'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Code source Arduino / ESP32-S3 Gamebuino AKA */}
      <div className="bg-[#131822] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4">
          <span className="font-mono text-xs text-slate-300">
            IronTournamentAKA_ESP32S3.ino · C++20 ESP32-S3 (320×240 BGR565 DMA)
          </span>
          <span className="font-mono text-xs text-slate-400">
            FPU 32-bit · Double Framebuffer PSRAM · 24 États d’Animation
          </span>
        </div>
        <pre className="p-5 overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed max-h-[560px]">
          <code>{GAMEBUINO_SKETCH_INO}</code>
        </pre>
      </div>
    </div>
  );
};
