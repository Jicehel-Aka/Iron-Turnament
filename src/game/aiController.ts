import { FIGHTERS } from '../data/fighters';
import {
  Difficulty,
  FighterRuntime,
  InputSnapshot,
  MatchEngineState,
} from '../types/game';

const EMPTY_INPUT: InputSnapshot = {
  left: false,
  right: false,
  up: false,
  down: false,
  btnA: false,
  btnB: false,
  btnSpecial: false,
  justPressedA: false,
  justPressedB: false,
  justPressedSpecial: false,
};

/**
 * Moteur d'Intelligence Artificielle piloté par la PERSONNALITÉ du personnage
 * et l'adaptation temps-réel aux habitudes du joueur adverse.
 */
export function computePersonalityAI(
  state: MatchEngineState,
  ai: FighterRuntime,
  opp: FighterRuntime,
  difficulty: Difficulty
): InputSnapshot {
  const input: InputSnapshot = { ...EMPTY_INPUT };

  // L'IA n'agit que pendant le combat ou la fenêtre "ACHEVEZ-LE !"
  if (state.roundSubPhase !== 'FIGHT' && state.roundSubPhase !== 'FINISH_HIM') {
    return input;
  }

  const def = FIGHTERS[ai.id];
  const profile = def.aiProfile;

  const diffScale =
    difficulty === 'NOVICE' ? 0.52 : difficulty === 'ARCADE' ? 0.80 : 1.0;

  const dx = opp.x - ai.x;
  const absDist = Math.abs(dx);
  const towardLeft = dx < 0;
  const awayLeft = !towardLeft;

  const setToward = () => {
    if (towardLeft) input.left = true;
    else input.right = true;
  };

  const setAway = () => {
    if (awayLeft) input.left = true;
    else input.right = true;
  };

  // --- 1. FENÊTRE "ACHEVEZ-LE !" (Mortal Kombat Finisher / Honneur) ---
  if (state.roundSubPhase === 'FINISH_HIM' && opp.action === 'DIZZY') {
    const wantsFinisher =
      def.finisher.isHonorable || Math.random() < profile.finisherRuthlessness * diffScale + 0.15;

    if (wantsFinisher) {
      // Se placer à bonne distance si nécessaire
      if (def.finisher.rangeHint === 'Corps-à-corps' && absDist > 46) {
        setToward();
        ai.aiThought = 'Approche Fatale';
        return input;
      }
      if (state.frame % 18 === 0) {
        input.down = true;
        input.btnSpecial = true;
        input.justPressedSpecial = true;
        ai.aiThought = def.finisher.isHonorable ? 'Sceau Honorable' : 'Coup Fatal !';
        return input;
      }
    } else if (absDist > 42) {
      setToward();
      ai.aiThought = 'Coup de grâce';
      return input;
    } else if (state.frame % 20 === 0) {
      input.btnB = true;
      input.justPressedB = true;
      return input;
    }
  }

  // Temps de réaction modulé par la difficulté
  const reactionInterval =
    difficulty === 'NOVICE' ? 18 : difficulty === 'ARCADE' ? 10 : 5;

  // Menace de projectile adverse en approche
  const incomingProj = state.projectiles.find(
    (p) =>
      p.ownerSlot !== ai.slot &&
      Math.abs(p.x - ai.x) < 95 &&
      Math.sign(p.vx) === Math.sign(ai.x - p.x)
  );

  // --- 2. RÉACTIONS DÉFENSIVES & PERSONNALITÉ FACE AUX PROJECTILES ---
  if (incomingProj) {
    // Krowen : Contre-téléportation dans le dos !
    if (
      profile.teleportCounter > 0.5 &&
      Math.random() < profile.teleportCounter * diffScale
    ) {
      setAway();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiThought = 'Contre Téléport !';
      return input;
    }

    // Titan : Pulvérise le projectile avec son Lariat Blindé !
    if (ai.id === 'titan' && Math.abs(incomingProj.x - ai.x) < 56 && Math.random() < 0.72 * diffScale) {
      input.up = true;
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiThought = 'Lariat anti-tir !';
      return input;
    }

    // Mei-Lin : Saute par-dessus avec agilité
    if (ai.id === 'meilin' && Math.abs(incomingProj.x - ai.x) < 72 && ai.y >= 0 && Math.random() < 0.78 * diffScale) {
      input.up = true;
      setToward();
      ai.aiThought = 'Esquive aérienne';
      return input;
    }

    // Garde prudente par défaut
    if (Math.random() < (0.45 + profile.patience * 0.45) * diffScale) {
      setAway();
      ai.aiThought = 'Garde projectile';
      return input;
    }
  }

  // --- 3. RÉFLEXE ANTI-AÉRIEN (Spécialité de Kenji & Nyxia) ---
  if (opp.y < -22 && absDist < 68 && state.frame % reactionInterval === 0) {
    if (Math.random() < profile.antiAirReflex * diffScale) {
      if (ai.id === 'kenji' || ai.id === 'titan') {
        // Dragon Ascendant ou Lariat Blindé (↑ + A+B)
        input.up = true;
        input.btnSpecial = true;
        input.justPressedSpecial = true;
        ai.aiThought = ai.id === 'kenji' ? 'Dragon Anti-Air !' : 'Lariat Anti-Air !';
        return input;
      }
      // Uppercut normal (Bas + A ou Haut + B)
      input.down = true;
      input.btnA = true;
      input.justPressedA = true;
      ai.aiThought = 'Punition saut';
      return input;
    }
  }

  // --- 4. DÉFENSE CONTRE ATTAQUE AU CORPS-À-CORPS ---
  const oppIsAttacking =
    opp.action === 'LIGHT_ATTACK' ||
    opp.action === 'HEAVY_ATTACK' ||
    opp.action === 'LOW_KICK' ||
    opp.action === 'SPECIAL_1' ||
    opp.action === 'SPECIAL_2' ||
    opp.action === 'SPECIAL_3';

  if (oppIsAttacking && absDist < 66) {
    const blockChance = (0.32 + profile.patience * 0.5) * diffScale;
    if (Math.random() < blockChance) {
      setAway();
      if (opp.action === 'LOW_KICK') {
        input.down = true;
        ai.aiThought = 'Garde basse';
      } else {
        ai.aiThought = 'Garde haute';
      }
      return input;
    }
  }

  // --- 5. TRAIT D'ORGUEIL (Seigneur Malakor / Provocation en avance) ---
  const hpLeadRatio = ai.hp / ai.maxHp - opp.hp / opp.maxHp;
  if (
    profile.arroganceTaunt > 0.3 &&
    hpLeadRatio > 0.26 &&
    absDist > 85 &&
    ai.aiCooldown <= 0 &&
    state.frame % 45 === 0 &&
    Math.random() < profile.arroganceTaunt * 0.45
  ) {
    // Déclenche une provocation (Haut + Bas simultanés géré ou action spéciale d'orgueil)
    ai.action = 'TAUNT';
    ai.actionFrame = 0;
    ai.actionTotalFrames = 42;
    ai.vx = 0;
    ai.aiCooldown = 90;
    ai.aiThought = 'Orgueil : Rire !';
    return input;
  }

  // Cooldown de décision d'attaque pour un rythme naturel et lisible
  if (ai.aiCooldown > 0) {
    // Déplacement de positionnement pendant le cooldown selon la personnalité
    if (absDist > profile.preferredRangePx + 18) {
      setToward();
      ai.aiThought = profile.aggression > 0.7 ? 'Pression avant' : 'Approche mesurée';
    } else if (absDist < profile.preferredRangePx - 20 && profile.patience > 0.65) {
      setAway();
      ai.aiThought = 'Repli tactique';
    }
    return input;
  }

  if (state.frame % reactionInterval !== 0) {
    if (absDist > profile.preferredRangePx + 14) setToward();
    else if (absDist < profile.preferredRangePx - 22 && profile.aggression < 0.45) setAway();
    return input;
  }

  // Adaptation aux habitudes du joueur (ex. joueur très défensif -> plus de prises !)
  const playerTurtling = state.p1Habits.blockingFrames > 90;
  const playerSpammingProj = state.p1Habits.projectilesThrown >= 3;

  // --- 6. CHOIX OFFENSIFS SELON LA DISTANCE ET LE CARACTÈRE ---

  // A. Corps-à-corps (< 46px)
  if (absDist <= 46) {
    const grabBoost = playerTurtling ? 0.28 : 0;
    // Titan adore son Brise-Vertèbres imblocable !
    if (
      ai.id === 'titan' &&
      Math.random() < (profile.grappleTendency + grabBoost) * diffScale
    ) {
      setToward();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiCooldown = 22;
      ai.aiThought = 'Brise-Vertèbres !';
      return input;
    }

    // Projection classique si le joueur bloque beaucoup
    if (
      (opp.action === 'BLOCK_HIGH' || opp.action === 'BLOCK_LOW' || playerTurtling) &&
      Math.random() < (profile.grappleTendency + 0.3) * diffScale
    ) {
      setToward();
      input.btnA = true;
      input.btnB = true;
      input.justPressedA = true;
      input.justPressedB = true;
      ai.aiCooldown = 20;
      ai.aiThought = 'Projection !';
      return input;
    }

    // Nyxia déteste le corps-à-corps : elle repousse avec Torpille d'Orage ou recule
    if (ai.id === 'nyxia' && Math.random() < 0.72 * diffScale) {
      input.up = true;
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiCooldown = 24;
      ai.aiThought = 'Dégagement éclair';
      return input;
    }

    // Mix-up attaque basse / overhead / combo rapide
    const roll = Math.random();
    if (roll < 0.34) {
      input.down = true;
      input.btnB = true;
      input.justPressedB = true;
      ai.aiCooldown = 16;
      ai.aiThought = 'Balayette basse';
    } else if (roll < 0.66) {
      input.btnA = true;
      input.justPressedA = true;
      ai.aiCooldown = 11;
      ai.aiThought = 'Enchaînement vif';
    } else if ((ai.id === 'krowen' || ai.id === 'malakor') && roll < 0.88) {
      // Brise-garde (Souffle Calciné / Marteau de l'Empereur)
      input.up = true;
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiCooldown = 24;
      ai.aiThought = 'Brise-garde !';
    } else {
      input.btnB = true;
      input.justPressedB = true;
      ai.aiCooldown = 18;
      ai.aiThought = 'Frappe lourde';
    }
    return input;
  }

  // B. Mi-distance (47px - 105px)
  if (absDist <= 105) {
    const roll = Math.random();

    if (ai.id === 'meilin' && roll < 0.45 * diffScale) {
      // Cent Éclairs ou Flèche du Phénix
      if (Math.random() < 0.55) {
        setAway();
        input.btnSpecial = true;
        input.justPressedSpecial = true;
        ai.aiThought = 'Cent Éclairs !';
      } else {
        input.up = true;
        input.btnSpecial = true;
        input.justPressedSpecial = true;
        ai.aiThought = 'Flèche du Phénix';
      }
      ai.aiCooldown = 20;
      return input;
    }

    if (ai.id === 'malakor' && roll < 0.48 * diffScale) {
      setToward();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiCooldown = 24;
      ai.aiThought = 'Torpille Pourpre !';
      return input;
    }

    if (ai.id === 'kenji' && roll < 0.36 * diffScale) {
      if (Math.random() < 0.55) {
        setToward();
        input.btnSpecial = true;
        input.justPressedSpecial = true;
        ai.aiThought = 'Onde Céleste';
      } else {
        setAway();
        input.btnSpecial = true;
        input.justPressedSpecial = true;
        ai.aiThought = 'Ouragan Écarlate';
      }
      ai.aiCooldown = 22;
      return input;
    }

    if (ai.id === 'titan' && roll < 0.34 * diffScale && opp.y >= 0) {
      setAway();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiCooldown = 26;
      ai.aiThought = 'Séisme d’Oural !';
      return input;
    }

    if (roll < 0.35 * profile.aggression) {
      // Saut offensif
      input.up = true;
      setToward();
      ai.aiCooldown = 18;
      ai.aiThought = 'Assaut aérien';
      return input;
    }

    if (absDist < 72 && roll < 0.65) {
      input.btnB = true;
      input.justPressedB = true;
      ai.aiCooldown = 16;
      ai.aiThought = 'Allonge neutre';
      return input;
    }

    setToward();
    ai.aiThought = 'Gain de terrain';
    return input;
  }

  // C. Longue distance (> 105px)
  const existingOwnProj = state.projectiles.some((p) => p.ownerSlot === ai.slot);

  if (ai.id === 'krowen') {
    // Krowen harponne les fuyards ou se téléporte si le joueur campe !
    if ((playerSpammingProj || Math.random() < 0.42) && Math.random() < diffScale) {
      setAway();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiCooldown = 26;
      ai.aiThought = 'Embuscade Ombre !';
      return input;
    }
    if (!existingOwnProj && Math.random() < 0.58 * diffScale) {
      setToward();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiCooldown = 26;
      ai.aiThought = 'Harpon : Viens ici !';
      return input;
    }
  }

  if (ai.id === 'nyxia' && !existingOwnProj && Math.random() < profile.projectileTendency * diffScale) {
    if (Math.random() < 0.62) {
      setToward();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiThought = 'Lance Foudroyante';
    } else {
      setAway();
      input.btnSpecial = true;
      input.justPressedSpecial = true;
      ai.aiThought = 'Sphère de Stase';
    }
    ai.aiCooldown = 22;
    return input;
  }

  if (
    !existingOwnProj &&
    profile.projectileTendency > 0.4 &&
    Math.random() < profile.projectileTendency * 0.65 * diffScale
  ) {
    if (ai.id === 'malakor') {
      setAway();
    } else {
      setToward();
    }
    input.btnSpecial = true;
    input.justPressedSpecial = true;
    ai.aiCooldown = 24;
    ai.aiThought = 'Tir de pression';
    return input;
  }

  setToward();
  ai.aiThought = ai.id === 'titan' ? 'Marche inexorable' : 'Approche';
  return input;
}
