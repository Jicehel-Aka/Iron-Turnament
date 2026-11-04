import React, { useState } from 'react';
import { FIGHTERS } from '../data/fighters';
import { FighterId } from '../types/game';

interface FighterPortraitProps {
  fighterId: FighterId;
  className?: string;
  sizeClass?: string;
  showNameplate?: boolean;
  showSubtitle?: boolean;
  badgeTag?: 'J1' | 'J2' | 'IA' | 'J1·J2' | null;
  mirrored?: boolean;
}

/**
 * Cadre de portrait unifié « Iron Tournament AKA » :
 * Garantit une présentation identique (fond #0B101E, liseré supérieur aux couleurs du guerrier,
 * typographie Barlow Condensed homogène et contraste mesuré) sur tous les écrans du jeu.
 */
export const FighterPortrait: React.FC<FighterPortraitProps> = ({
  fighterId,
  className = '',
  sizeClass = 'w-full h-full',
  showNameplate = false,
  showSubtitle = false,
  badgeTag = null,
  mirrored = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fighter = FIGHTERS[fighterId];

  return (
    <div
      className={`relative overflow-hidden bg-[#0B101E] select-none ${sizeClass} ${className}`}
    >
      {/* Liseré d'identité chromatique uniforme en haut du cadre */}
      <div
        className="absolute inset-x-0 top-0 h-[3px] z-10"
        style={{ backgroundColor: fighter.accentColor }}
      />

      {!imgFailed ? (
        <img
          src={fighter.portraitUrl}
          alt={`Portrait officiel de ${fighter.name} — ${fighter.title}`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`w-full h-full pixel-canvas ${fighter.portraitCropClass} ${
            mirrored ? '-scale-x-100' : ''
          } transition-transform duration-150`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#0E1528] to-[#080B14] p-2 text-center">
          <span
            className="font-display text-2xl font-bold tracking-wider"
            style={{ color: fighter.accentColor }}
          >
            {fighter.shortName.slice(0, 3)}
          </span>
          <span className="text-[11px] text-slate-300 truncate max-w-full">
            {fighter.shortName}
          </span>
        </div>
      )}

      {/* Indicateur de curseur J1 / J2 homogène dans l'angle supérieur */}
      {badgeTag && (
        <div
          className={`absolute top-2 ${
            badgeTag === 'J2' || badgeTag === 'IA' ? 'right-2 bg-rose-600' : 'left-2 bg-sky-500'
          } z-10 px-1.5 py-0.5 rounded-xs font-mono text-[10px] font-bold text-slate-950 leading-none shadow-sm`}
        >
          {badgeTag}
        </div>
      )}

      {/* Cartouche de nom unifié avec scrim de contraste */}
      {showNameplate && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/92 via-black/70 to-transparent pt-5 pb-1.5 px-2.5">
          <div className="font-display text-sm sm:text-base font-bold tracking-wide text-white leading-tight truncate">
            {fighter.shortName}
          </div>
          {showSubtitle && (
            <div className="text-[10px] text-slate-300 truncate leading-tight">
              {fighter.origin}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
