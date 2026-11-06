// Synthétiseur audio chiptune 8-bit / 16-bit (SFX + Musiques BGM par scène)
// Inspiré du DAC audio et du processeur son de la Gamebuino AKA (ESP32-S3 I2S / PWM DAC)

export type MusicTheme =
  | 'SILENCE'
  | 'TITLE'
  | 'SELECT'
  | 'VERSUS'
  | 'STAGE_DOJO'
  | 'STAGE_PIT'
  | 'STAGE_HARBOR'
  | 'STAGE_FOUNDRY'
  | 'STAGE_SANCTUARY'
  | 'STAGE_CITADEL'
  | 'FINISH_HIM'
  | 'VICTORY'
  | 'GAME_OVER';

interface MusicTrackPattern {
  bpm: number;
  bassNotes: number[];      // Frequencies in Hz, 0 = pause (32 to 64 steps)
  melodyNotes: number[];    // Lead melody in Hz (32 to 64 steps)
  harmonyNotes?: number[];  // Arpeggios / chord harmonies (32 to 64 steps)
  drums?: number[];         // 0: none, 1: hi-hat, 2: snare, 3: kick, 4: kick+accent
  bassType: OscillatorType;
  melodyType: OscillatorType;
  harmonyType?: OscillatorType;
  decay: number;
}

// Compositions rétro-arcade complètes multi-phrases (32 ou 64 pas)
// Style Capcom CPS-2 / Neo-Geo (Street Fighter Alpha, King of Fighters, Guilty Gear)
const TRACKS: Record<MusicTheme, MusicTrackPattern | null> = {
  SILENCE: null,

  // Écran Titre : Hymne martial héroïque symphonique (64 pas, 132 BPM, La mineur -> Do majeur glorieux)
  TITLE: {
    bpm: 132,
    bassNotes: [
      // Phrase A (0..31) : Appel martial et groove montant
      110, 110, 110, 130.8, 110, 110, 146.8, 130.8,
      110, 110, 110, 164.8, 146.8, 130.8, 110, 98,
      87.3, 87.3, 87.3, 110, 98, 87.3, 110, 123.5,
      130.8, 130.8, 146.8, 164.8, 196, 174.6, 164.8, 146.8,
      // Phrase B (32..63) : Climax héroïque et triomphe majeur
      110, 146.8, 164.8, 220, 196, 164.8, 146.8, 130.8,
      87.3, 110, 130.8, 174.6, 164.8, 146.8, 130.8, 110,
      130.8, 164.8, 196, 261.6, 246.9, 196, 164.8, 130.8,
      146.8, 164.8, 196, 220, 261.6, 246.9, 220, 164.8,
    ],
    melodyNotes: [
      // Thème A : Noblesse du tournoi
      220, 0, 220, 261.6, 293.7, 0, 329.6, 293.7,
      261.6, 220, 261.6, 293.7, 349.2, 329.6, 293.7, 261.6,
      174.6, 0, 220, 261.6, 246.9, 0, 220, 246.9,
      261.6, 293.7, 329.6, 392, 523.3, 440, 392, 329.6,
      // Thème B : Envolée magistrale
      440, 0, 392, 329.6, 349.2, 440, 523.3, 440,
      349.2, 329.6, 293.7, 261.6, 293.7, 349.2, 440, 523.3,
      523.3, 587.3, 659.3, 523.3, 587.3, 659.3, 784, 659.3,
      587.3, 523.3, 440, 392, 440, 0, 440, 0,
    ],
    harmonyNotes: [
      329.6, 440, 329.6, 440, 349.2, 440, 349.2, 440,
      329.6, 440, 329.6, 440, 392, 523.3, 392, 523.3,
      261.6, 349.2, 261.6, 349.2, 293.7, 392, 293.7, 392,
      329.6, 392, 440, 523.3, 659.3, 523.3, 440, 392,
      659.3, 0, 523.3, 0, 587.3, 0, 659.3, 0,
      523.3, 0, 440, 0, 493.9, 0, 659.3, 0,
      784, 0, 659.3, 0, 784, 0, 987.8, 0,
      880, 784, 659.3, 523.3, 659.3, 0, 659.3, 0,
    ],
    drums: [
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 3, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 3, 4, 2, 2, 2,
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 2, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 2, 3, 2,
      4, 2, 4, 2, 4, 4, 2, 0,
    ],
    bassType: 'sawtooth',
    melodyType: 'square',
    harmonyType: 'triangle',
    decay: 0.16,
  },

  // Sélection des combattants : Groove tendu à suspense & anticipation (64 pas, 122 BPM)
  SELECT: {
    bpm: 122,
    bassNotes: [
      // Partie 1 : Tension et syncope
      98, 0, 98, 116.5, 98, 0, 130.8, 116.5,
      98, 0, 98, 146.8, 130.8, 116.5, 98, 87.3,
      77.8, 0, 77.8, 98, 87.3, 0, 110, 98,
      98, 116.5, 130.8, 146.8, 174.6, 164.8, 146.8, 116.5,
      // Partie 2 : Montée d'adrénaline
      116.5, 0, 116.5, 130.8, 146.8, 0, 164.8, 146.8,
      130.8, 0, 130.8, 164.8, 174.6, 0, 196, 174.6,
      146.8, 0, 174.6, 196, 220, 196, 174.6, 146.8,
      130.8, 146.8, 164.8, 174.6, 196, 164.8, 130.8, 98,
    ],
    melodyNotes: [
      196, 233.1, 293.7, 0, 349.2, 329.6, 293.7, 233.1,
      196, 0, 233.1, 293.7, 392, 0, 349.2, 293.7,
      155.6, 196, 233.1, 0, 220, 261.6, 293.7, 0,
      196, 233.1, 293.7, 349.2, 392, 466.2, 440, 392,
      233.1, 293.7, 349.2, 466.2, 440, 349.2, 293.7, 233.1,
      261.6, 329.6, 392, 523.3, 493.9, 392, 329.6, 261.6,
      293.7, 349.2, 440, 587.3, 523.3, 440, 349.2, 293.7,
      329.6, 392, 440, 523.3, 587.3, 523.3, 392, 293.7,
    ],
    harmonyNotes: [
      293.7, 0, 349.2, 0, 293.7, 0, 349.2, 0,
      293.7, 0, 392, 0, 349.2, 0, 293.7, 0,
      233.1, 0, 293.7, 0, 261.6, 0, 329.6, 0,
      293.7, 349.2, 392, 440, 466.2, 523.3, 440, 349.2,
      349.2, 0, 466.2, 0, 349.2, 0, 466.2, 0,
      392, 0, 523.3, 0, 392, 0, 523.3, 0,
      440, 0, 587.3, 0, 440, 0, 587.3, 0,
      493.9, 0, 587.3, 0, 659.3, 587.3, 493.9, 392,
    ],
    drums: [
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 3, 2, 1, 4, 1, 2, 2,
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      4, 2, 3, 2, 4, 2, 4, 2,
    ],
    bassType: 'triangle',
    melodyType: 'square',
    harmonyType: 'sawtooth',
    decay: 0.17,
  },

  // Face-à-face pré-combat : Pression guerrière et staccato agressif (64 pas, 140 BPM)
  VERSUS: {
    bpm: 140,
    bassNotes: [
      82.4, 82.4, 0, 82.4, 98, 82.4, 110, 103.8,
      82.4, 82.4, 0, 82.4, 123.5, 110, 98, 87.3,
      82.4, 82.4, 0, 82.4, 98, 82.4, 110, 103.8,
      123.5, 110, 98, 87.3, 82.4, 73.4, 82.4, 0,
      98, 98, 0, 98, 116.5, 98, 130.8, 116.5,
      110, 110, 0, 110, 130.8, 110, 146.8, 130.8,
      123.5, 123.5, 0, 123.5, 146.8, 123.5, 164.8, 146.8,
      146.8, 130.8, 123.5, 110, 98, 87.3, 82.4, 0,
    ],
    melodyNotes: [
      164.8, 0, 196, 0, 220, 207.7, 196, 164.8,
      246.9, 0, 220, 0, 196, 174.6, 164.8, 0,
      164.8, 0, 196, 0, 220, 246.9, 261.6, 246.9,
      329.6, 293.7, 261.6, 246.9, 220, 196, 164.8, 0,
      196, 0, 233.1, 0, 261.6, 0, 246.9, 196,
      220, 0, 261.6, 0, 293.7, 0, 261.6, 220,
      246.9, 0, 293.7, 0, 329.6, 0, 293.7, 246.9,
      329.6, 293.7, 261.6, 220, 196, 164.8, 146.8, 0,
    ],
    drums: [
      4, 1, 2, 1, 4, 1, 2, 1,
      3, 1, 2, 1, 4, 2, 3, 2,
      4, 1, 2, 1, 4, 1, 2, 1,
      3, 2, 3, 2, 4, 4, 2, 2,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 2, 3, 2,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 4, 3, 3, 4, 2, 4, 0,
    ],
    bassType: 'sawtooth',
    melodyType: 'sawtooth',
    decay: 0.13,
  },

  // Arène Kyoto Dojo (Kenji) : Épopée bushido en gamme Insen/Hirajōshi (128 pas, 138 BPM, 4 mouvements)
  STAGE_DOJO: {
    bpm: 138,
    bassNotes: [
      // Mouvement 1 : Thème du temple
      110, 110, 146.8, 110, 164.8, 146.8, 130.8, 110,
      110, 110, 146.8, 110, 196, 164.8, 146.8, 130.8,
      87.3, 87.3, 110, 87.3, 130.8, 110, 98, 87.3,
      110, 110, 146.8, 164.8, 220, 196, 164.8, 146.8,
      // Mouvement 2 : Contre-chant méditatif
      146.8, 146.8, 174.6, 146.8, 196, 174.6, 164.8, 146.8,
      164.8, 164.8, 196, 164.8, 220, 196, 174.6, 164.8,
      130.8, 130.8, 164.8, 130.8, 196, 164.8, 146.8, 130.8,
      110, 146.8, 164.8, 196, 220, 164.8, 146.8, 110,
      // Mouvement 3 : Pont martial aux sabres (Arpèges vifs)
      98, 130.8, 146.8, 164.8, 196, 164.8, 146.8, 130.8,
      87.3, 110, 130.8, 146.8, 164.8, 146.8, 130.8, 110,
      73.4, 98, 110, 130.8, 146.8, 130.8, 110, 98,
      87.3, 110, 146.8, 164.8, 196, 220, 196, 164.8,
      // Mouvement 4 : Climax héroïque et envolée du Dragon
      110, 146.8, 164.8, 220, 246.9, 220, 164.8, 146.8,
      130.8, 164.8, 196, 246.9, 261.6, 246.9, 196, 164.8,
      146.8, 174.6, 220, 261.6, 293.7, 261.6, 220, 174.6,
      164.8, 196, 220, 246.9, 220, 164.8, 146.8, 110,
    ],
    melodyNotes: [
      // Mouvement 1 : Thème noble du sabreur
      220, 261.6, 293.7, 349.2, 329.6, 293.7, 261.6, 220,
      293.7, 329.6, 349.2, 440, 392, 349.2, 329.6, 293.7,
      174.6, 220, 261.6, 293.7, 261.6, 220, 196, 174.6,
      220, 261.6, 293.7, 329.6, 440, 392, 349.2, 329.6,
      // Mouvement 2 : Envolée du dragon ascendant
      293.7, 349.2, 392, 440, 523.3, 440, 392, 349.2,
      329.6, 392, 440, 523.3, 587.3, 523.3, 440, 392,
      349.2, 440, 523.3, 440, 392, 349.2, 329.6, 293.7,
      261.6, 293.7, 329.6, 261.6, 220, 246.9, 220, 0,
      // Mouvement 3 : Pont mystique en cascade (Shakuhachi chiptune)
      392, 440, 523.3, 587.3, 659.3, 587.3, 523.3, 440,
      349.2, 392, 440, 523.3, 587.3, 523.3, 440, 349.2,
      293.7, 329.6, 349.2, 440, 523.3, 440, 349.2, 293.7,
      329.6, 349.2, 392, 440, 493.9, 440, 392, 329.6,
      // Mouvement 4 : Grand tutti héroïque flamboyant
      440, 523.3, 587.3, 659.3, 784, 659.3, 587.3, 523.3,
      523.3, 587.3, 659.3, 784, 880, 784, 659.3, 523.3,
      587.3, 659.3, 784, 880, 987.8, 880, 784, 659.3,
      659.3, 587.3, 523.3, 440, 392, 349.2, 329.6, 220,
    ],
    harmonyNotes: [
      // Mouvement 1
      329.6, 0, 349.2, 0, 440, 0, 349.2, 0,
      349.2, 0, 440, 0, 523.3, 0, 440, 0,
      261.6, 0, 293.7, 0, 329.6, 0, 261.6, 0,
      329.6, 0, 349.2, 0, 440, 0, 523.3, 0,
      // Mouvement 2
      440, 0, 523.3, 0, 587.3, 0, 523.3, 0,
      493.9, 0, 587.3, 0, 659.3, 0, 587.3, 0,
      523.3, 0, 440, 0, 392, 0, 349.2, 0,
      329.6, 0, 293.7, 0, 261.6, 0, 220, 0,
      // Mouvement 3
      587.3, 0, 523.3, 0, 440, 0, 392, 0,
      523.3, 0, 440, 0, 349.2, 0, 329.6, 0,
      440, 0, 349.2, 0, 293.7, 0, 261.6, 0,
      493.9, 0, 440, 0, 392, 0, 349.2, 0,
      // Mouvement 4
      659.3, 784, 880, 784, 659.3, 587.3, 523.3, 440,
      784, 880, 987.8, 880, 784, 659.3, 587.3, 523.3,
      880, 987.8, 1046.5, 987.8, 880, 784, 659.3, 587.3,
      784, 659.3, 587.3, 523.3, 440, 392, 329.6, 220,
    ],
    drums: [
      // Mouvement 1
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 3, 2, 1,
      // Mouvement 2
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 2, 3, 2, 4, 2, 2, 2,
      // Mouvement 3
      4, 2, 1, 2, 3, 2, 1, 2,
      4, 2, 1, 2, 3, 2, 1, 2,
      4, 2, 1, 2, 3, 2, 1, 2,
      3, 1, 3, 1, 4, 2, 3, 1,
      // Mouvement 4
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 3, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 2, 3, 2, 4, 4, 2, 2,
    ],
    bassType: 'triangle',
    melodyType: 'square',
    harmonyType: 'sawtooth',
    decay: 0.15,
  },

  // Arène Fosse d'Obsidienne (Krowen) : Chiptune thrash metal sombre et furieux (128 pas, 146 BPM, 4 mouvements)
  STAGE_PIT: {
    bpm: 146,
    bassNotes: [
      // Mouvement 1 : Riff lourd d'obsidienne
      73.4, 73.4, 87.3, 73.4, 98, 87.3, 110, 98,
      73.4, 73.4, 87.3, 73.4, 116.5, 110, 98, 87.3,
      65.4, 65.4, 77.8, 65.4, 87.3, 77.8, 98, 87.3,
      73.4, 73.4, 98, 110, 123.5, 110, 98, 87.3,
      // Mouvement 2 : Vélocité tranchante
      73.4, 73.4, 87.3, 73.4, 98, 87.3, 110, 98,
      73.4, 73.4, 116.5, 110, 98, 87.3, 77.8, 73.4,
      55, 55, 65.4, 55, 73.4, 65.4, 82.4, 73.4,
      73.4, 87.3, 98, 110, 123.5, 130.8, 123.5, 110,
      // Mouvement 3 : Descente abyssale et double pédale
      65.4, 65.4, 73.4, 65.4, 82.4, 73.4, 87.3, 82.4,
      55, 55, 65.4, 55, 73.4, 65.4, 77.8, 73.4,
      49, 49, 55, 49, 65.4, 55, 73.4, 65.4,
      55, 65.4, 73.4, 87.3, 98, 87.3, 73.4, 65.4,
      // Mouvement 4 : Éruption infernale
      73.4, 87.3, 110, 130.8, 146.8, 130.8, 110, 87.3,
      82.4, 98, 123.5, 146.8, 164.8, 146.8, 123.5, 98,
      87.3, 110, 130.8, 164.8, 174.6, 164.8, 130.8, 110,
      98, 116.5, 130.8, 146.8, 164.8, 146.8, 110, 73.4,
    ],
    melodyNotes: [
      // Mouvement 1 : Thème assassin du corbeau
      146.8, 174.6, 196, 220, 233.1, 220, 196, 174.6,
      146.8, 196, 220, 261.6, 246.9, 220, 196, 174.6,
      130.8, 155.6, 174.6, 196, 207.7, 196, 174.6, 155.6,
      146.8, 174.6, 196, 220, 246.9, 261.6, 293.7, 261.6,
      // Mouvement 2 : Attaque des ombres
      293.7, 329.6, 349.2, 392, 440, 392, 349.2, 329.6,
      293.7, 349.2, 392, 440, 466.2, 440, 392, 349.2,
      220, 261.6, 293.7, 329.6, 349.2, 329.6, 293.7, 261.6,
      293.7, 261.6, 246.9, 220, 196, 174.6, 164.8, 146.8,
      // Mouvement 3 : Lames spectrales en écho
      220, 233.1, 261.6, 293.7, 329.6, 293.7, 261.6, 233.1,
      196, 220, 233.1, 261.6, 293.7, 261.6, 233.1, 220,
      174.6, 196, 220, 233.1, 261.6, 233.1, 220, 196,
      220, 246.9, 261.6, 293.7, 329.6, 349.2, 392, 440,
      // Mouvement 4 : Furie frénétique finale
      440, 466.2, 523.3, 587.3, 659.3, 587.3, 523.3, 466.2,
      493.9, 523.3, 587.3, 659.3, 740, 659.3, 587.3, 523.3,
      523.3, 587.3, 659.3, 784, 880, 784, 659.3, 587.3,
      587.3, 523.3, 466.2, 440, 392, 349.2, 293.7, 146.8,
    ],
    harmonyNotes: [
      // Mouvement 1
      220, 0, 261.6, 0, 293.7, 0, 261.6, 0,
      220, 0, 293.7, 0, 329.6, 0, 293.7, 0,
      196, 0, 233.1, 0, 261.6, 0, 233.1, 0,
      220, 0, 261.6, 0, 293.7, 0, 329.6, 0,
      // Mouvement 2
      440, 0, 493.9, 0, 523.3, 0, 493.9, 0,
      440, 0, 523.3, 0, 587.3, 0, 523.3, 0,
      329.6, 0, 392, 0, 440, 0, 392, 0,
      440, 392, 349.2, 329.6, 293.7, 261.6, 246.9, 220,
      // Mouvement 3
      329.6, 0, 349.2, 0, 392, 0, 349.2, 0,
      293.7, 0, 329.6, 0, 349.2, 0, 329.6, 0,
      261.6, 0, 293.7, 0, 329.6, 0, 293.7, 0,
      329.6, 0, 392, 0, 440, 0, 523.3, 0,
      // Mouvement 4
      659.3, 0, 784, 0, 880, 0, 784, 0,
      740, 0, 880, 0, 987.8, 0, 880, 0,
      784, 0, 987.8, 0, 1046.5, 0, 987.8, 0,
      880, 784, 659.3, 587.3, 440, 392, 293.7, 220,
    ],
    drums: [
      // Mouvement 1
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 2, 3, 3, 2, 1,
      // Mouvement 2
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 2, 3, 2, 4, 2, 4, 2,
      // Mouvement 3
      4, 2, 4, 2, 4, 2, 4, 2,
      4, 1, 2, 1, 3, 2, 2, 1,
      4, 2, 4, 2, 4, 2, 4, 2,
      3, 2, 3, 2, 4, 4, 2, 1,
      // Mouvement 4
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 3, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 2, 4, 2, 4, 4, 4, 2,
    ],
    bassType: 'sawtooth',
    melodyType: 'sawtooth',
    harmonyType: 'square',
    decay: 0.13,
  },

  // Arène Port de Hong Kong (Mei-Lin) : Rushdown synthwave ultra-dynamique (128 pas, 154 BPM, 4 mouvements)
  STAGE_HARBOR: {
    bpm: 154,
    bassNotes: [
      // Mouvement 1 : Pulsation néon des quais
      130.8, 130.8, 164.8, 130.8, 196, 164.8, 174.6, 146.8,
      130.8, 130.8, 164.8, 130.8, 220, 196, 174.6, 164.8,
      110, 110, 130.8, 110, 164.8, 146.8, 130.8, 110,
      146.8, 146.8, 174.6, 146.8, 196, 174.6, 164.8, 146.8,
      // Mouvement 2 : Échappée nocturne
      130.8, 130.8, 164.8, 130.8, 196, 164.8, 174.6, 146.8,
      174.6, 174.6, 220, 174.6, 261.6, 220, 196, 174.6,
      164.8, 164.8, 196, 164.8, 246.9, 196, 174.6, 164.8,
      130.8, 164.8, 196, 246.9, 261.6, 196, 164.8, 130.8,
      // Mouvement 3 : Solo d'arpeggios à grande vitesse
      110, 130.8, 164.8, 196, 220, 196, 164.8, 130.8,
      98, 123.5, 146.8, 185, 196, 185, 146.8, 123.5,
      87.3, 110, 130.8, 164.8, 174.6, 164.8, 130.8, 110,
      130.8, 146.8, 164.8, 196, 220, 246.9, 261.6, 293.7,
      // Mouvement 4 : Danse des éventails d'acier (Climax)
      130.8, 164.8, 196, 261.6, 196, 164.8, 130.8, 98,
      146.8, 174.6, 220, 293.7, 220, 174.6, 146.8, 110,
      164.8, 196, 246.9, 329.6, 246.9, 196, 164.8, 123.5,
      174.6, 220, 261.6, 349.2, 329.6, 261.6, 196, 130.8,
    ],
    melodyNotes: [
      // Mouvement 1 : Thème virevoltant de Mei-Lin
      261.6, 329.6, 392, 440, 523.3, 440, 392, 329.6,
      392, 440, 523.3, 587.3, 659.3, 587.3, 523.3, 392,
      220, 261.6, 329.6, 392, 440, 392, 329.6, 261.6,
      293.7, 349.2, 440, 523.3, 493.9, 440, 392, 349.2,
      // Mouvement 2 : Voltige aérienne
      523.3, 659.3, 784, 659.3, 587.3, 523.3, 440, 392,
      698.5, 659.3, 587.3, 523.3, 440, 392, 349.2, 329.6,
      659.3, 587.3, 523.3, 440, 392, 349.2, 329.6, 293.7,
      261.6, 329.6, 392, 523.3, 659.3, 523.3, 392, 261.6,
      // Mouvement 3 : Éclair céleste (Cascade montante)
      440, 523.3, 659.3, 784, 880, 784, 659.3, 523.3,
      392, 493.9, 587.3, 740, 784, 740, 587.3, 493.9,
      349.2, 440, 523.3, 659.3, 698.5, 659.3, 523.3, 440,
      523.3, 587.3, 659.3, 784, 880, 987.8, 1046.5, 1174.7,
      // Mouvement 4 : Chœur triomphal
      1046.5, 880, 784, 659.3, 523.3, 659.3, 784, 880,
      1174.7, 987.8, 880, 784, 587.3, 784, 880, 987.8,
      1318.5, 1046.5, 987.8, 784, 659.3, 784, 987.8, 1046.5,
      1046.5, 880, 784, 659.3, 523.3, 392, 329.6, 261.6,
    ],
    harmonyNotes: [
      // Mouvement 1
      392, 523.3, 659.3, 523.3, 392, 523.3, 659.3, 523.3,
      523.3, 659.3, 784, 659.3, 523.3, 659.3, 784, 659.3,
      329.6, 440, 523.3, 440, 329.6, 440, 523.3, 440,
      440, 523.3, 659.3, 523.3, 440, 523.3, 659.3, 523.3,
      // Mouvement 2
      784, 0, 659.3, 0, 587.3, 0, 523.3, 0,
      698.5, 0, 587.3, 0, 523.3, 0, 440, 0,
      659.3, 0, 523.3, 0, 440, 0, 392, 0,
      523.3, 659.3, 784, 659.3, 523.3, 392, 329.6, 261.6,
      // Mouvement 3
      659.3, 0, 784, 0, 880, 0, 784, 0,
      587.3, 0, 740, 0, 784, 0, 740, 0,
      523.3, 0, 659.3, 0, 698.5, 0, 659.3, 0,
      784, 0, 880, 0, 987.8, 0, 1046.5, 0,
      // Mouvement 4
      784, 659.3, 523.3, 659.3, 784, 659.3, 523.3, 392,
      880, 698.5, 587.3, 698.5, 880, 698.5, 587.3, 440,
      987.8, 784, 659.3, 784, 987.8, 784, 659.3, 493.9,
      784, 659.3, 523.3, 392, 329.6, 261.6, 196, 130.8,
    ],
    drums: [
      // Mouvement 1
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 3, 2, 1,
      // Mouvement 2
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 2, 3, 2, 4, 2, 2, 2,
      // Mouvement 3
      4, 2, 1, 2, 4, 2, 1, 2,
      4, 2, 1, 2, 4, 2, 1, 2,
      4, 2, 1, 2, 4, 2, 1, 2,
      3, 1, 3, 2, 4, 2, 4, 2,
      // Mouvement 4
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 3, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 2, 3, 2, 4, 4, 4, 2,
    ],
    bassType: 'square',
    melodyType: 'square',
    harmonyType: 'triangle',
    decay: 0.11,
  },

  // Arène Fonderie de Sibérie (Titan) : Rythme lourd industriel & marteau cybernétique (128 pas, 124 BPM, 4 mouvements)
  STAGE_FOUNDRY: {
    bpm: 124,
    bassNotes: [
      // Mouvement 1 : Cadence du pilon hydraulique
      65.4, 65.4, 77.8, 65.4, 82.4, 77.8, 98, 82.4,
      65.4, 65.4, 77.8, 65.4, 98, 87.3, 82.4, 77.8,
      58.3, 58.3, 69.3, 58.3, 77.8, 69.3, 87.3, 77.8,
      65.4, 65.4, 77.8, 82.4, 98, 82.4, 77.8, 65.4,
      // Mouvement 2 : Métal chauffé à blanc
      82.4, 82.4, 98, 82.4, 110, 98, 123.5, 110,
      77.8, 77.8, 92.5, 77.8, 98, 92.5, 110, 98,
      65.4, 65.4, 77.8, 65.4, 82.4, 77.8, 98, 82.4,
      98, 82.4, 77.8, 65.4, 58.3, 65.4, 77.8, 82.4,
      // Mouvement 3 : Fourneau sous pression
      55, 55, 65.4, 55, 73.4, 65.4, 82.4, 73.4,
      49, 49, 58.3, 49, 65.4, 58.3, 73.4, 65.4,
      55, 55, 65.4, 73.4, 82.4, 73.4, 65.4, 55,
      65.4, 77.8, 82.4, 98, 110, 98, 82.4, 77.8,
      // Mouvement 4 : Impact titanesque
      82.4, 110, 123.5, 146.8, 130.8, 123.5, 110, 82.4,
      77.8, 98, 116.5, 138.6, 123.5, 116.5, 98, 77.8,
      65.4, 82.4, 98, 123.5, 110, 98, 82.4, 65.4,
      58.3, 65.4, 77.8, 82.4, 98, 82.4, 77.8, 65.4,
    ],
    melodyNotes: [
      // Mouvement 1 : Thème colossal du colosse de fer
      130.8, 155.6, 164.8, 196, 164.8, 155.6, 130.8, 116.5,
      130.8, 164.8, 196, 233.1, 220, 196, 164.8, 155.6,
      116.5, 138.6, 155.6, 174.6, 155.6, 138.6, 116.5, 103.8,
      130.8, 155.6, 164.8, 196, 220, 196, 164.8, 130.8,
      // Mouvement 2 : Charge mécanique
      164.8, 196, 220, 246.9, 261.6, 246.9, 220, 196,
      155.6, 185, 207.7, 233.1, 220, 207.7, 185, 155.6,
      130.8, 155.6, 164.8, 196, 220, 196, 164.8, 155.6,
      196, 164.8, 155.6, 130.8, 116.5, 130.8, 155.6, 164.8,
      // Mouvement 3 : Alarme de surcharge industrielle
      220, 233.1, 246.9, 261.6, 293.7, 261.6, 246.9, 233.1,
      196, 207.7, 220, 233.1, 261.6, 233.1, 220, 207.7,
      174.6, 196, 207.7, 220, 246.9, 220, 207.7, 196,
      220, 246.9, 261.6, 293.7, 329.6, 293.7, 261.6, 246.9,
      // Mouvement 4 : Écrasement total (Séisme d'Oural)
      329.6, 293.7, 261.6, 246.9, 220, 196, 164.8, 155.6,
      293.7, 261.6, 233.1, 220, 196, 174.6, 155.6, 138.6,
      261.6, 233.1, 207.7, 196, 174.6, 155.6, 138.6, 130.8,
      196, 164.8, 155.6, 130.8, 116.5, 103.8, 98, 65.4,
    ],
    harmonyNotes: [
      // Mouvement 1
      196, 0, 233.1, 0, 261.6, 0, 233.1, 0,
      196, 0, 261.6, 0, 293.7, 0, 261.6, 0,
      174.6, 0, 207.7, 0, 233.1, 0, 207.7, 0,
      196, 0, 233.1, 0, 261.6, 0, 293.7, 0,
      // Mouvement 2
      246.9, 0, 293.7, 0, 329.6, 0, 293.7, 0,
      233.1, 0, 277.2, 0, 311.1, 0, 277.2, 0,
      196, 0, 233.1, 0, 261.6, 0, 233.1, 0,
      261.6, 233.1, 196, 164.8, 155.6, 164.8, 196, 220,
      // Mouvement 3
      329.6, 0, 349.2, 0, 392, 0, 349.2, 0,
      293.7, 0, 329.6, 0, 349.2, 0, 329.6, 0,
      261.6, 0, 293.7, 0, 329.6, 0, 293.7, 0,
      329.6, 0, 370, 0, 392, 0, 440, 0,
      // Mouvement 4
      440, 0, 392, 0, 329.6, 0, 293.7, 0,
      392, 0, 349.2, 0, 293.7, 0, 261.6, 0,
      349.2, 0, 293.7, 0, 261.6, 0, 220, 0,
      293.7, 261.6, 220, 196, 164.8, 146.8, 130.8, 110,
    ],
    drums: [
      // Mouvement 1
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 2, 4, 3, 2, 1,
      // Mouvement 2
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 2, 4, 2, 4, 4, 2, 2,
      // Mouvement 3
      4, 4, 2, 1, 4, 4, 2, 1,
      4, 4, 2, 1, 4, 4, 2, 1,
      4, 4, 2, 1, 4, 4, 2, 1,
      4, 2, 4, 2, 4, 4, 3, 2,
      // Mouvement 4
      4, 1, 4, 1, 4, 1, 4, 1,
      4, 1, 4, 1, 4, 3, 4, 1,
      4, 1, 4, 1, 4, 1, 4, 1,
      4, 4, 4, 4, 4, 2, 4, 2,
    ],
    bassType: 'sawtooth',
    melodyType: 'triangle',
    harmonyType: 'square',
    decay: 0.19,
  },

  // Arène Sanctuaire d'Atacama (Nyxia) : Ambiance astrale & foudre céleste (128 pas, 136 BPM, 4 mouvements)
  STAGE_SANCTUARY: {
    bpm: 136,
    bassNotes: [
      // Mouvement 1 : Nuit étoilée d'Atacama
      123.5, 123.5, 146.8, 123.5, 164.8, 185, 164.8, 146.8,
      123.5, 123.5, 146.8, 123.5, 196, 185, 164.8, 146.8,
      98, 98, 123.5, 98, 146.8, 123.5, 110, 98,
      110, 110, 130.8, 146.8, 164.8, 146.8, 130.8, 110,
      // Mouvement 2 : Éveil de la lance foudroyante
      123.5, 123.5, 164.8, 123.5, 185, 164.8, 146.8, 123.5,
      146.8, 146.8, 185, 146.8, 220, 185, 164.8, 146.8,
      164.8, 164.8, 196, 164.8, 246.9, 196, 185, 164.8,
      185, 164.8, 146.8, 123.5, 110, 123.5, 146.8, 164.8,
      // Mouvement 3 : Faisceaux boréaux et réverbération cosmique
      146.8, 185, 220, 246.9, 293.7, 246.9, 220, 185,
      130.8, 164.8, 196, 220, 261.6, 220, 196, 164.8,
      123.5, 146.8, 185, 220, 246.9, 220, 185, 146.8,
      110, 130.8, 164.8, 196, 220, 196, 164.8, 130.8,
      // Mouvement 4 : Apothéose de la Reine des Étoiles
      123.5, 164.8, 185, 246.9, 293.7, 246.9, 185, 164.8,
      146.8, 185, 220, 293.7, 329.6, 293.7, 220, 185,
      164.8, 196, 246.9, 329.6, 370, 329.6, 246.9, 196,
      185, 220, 246.9, 293.7, 246.9, 185, 146.8, 123.5,
    ],
    melodyNotes: [
      // Mouvement 1 : Thème mystique de Nyxia
      246.9, 293.7, 329.6, 370, 440, 370, 329.6, 293.7,
      329.6, 370, 440, 493.9, 587.3, 493.9, 440, 370,
      196, 246.9, 293.7, 329.6, 370, 329.6, 293.7, 246.9,
      220, 261.6, 293.7, 329.6, 392, 329.6, 293.7, 261.6,
      // Mouvement 2 : Envolée céleste
      493.9, 587.3, 659.3, 740, 880, 740, 659.3, 587.3,
      587.3, 659.3, 740, 880, 987.8, 880, 740, 659.3,
      659.3, 740, 880, 987.8, 1174.7, 987.8, 880, 740,
      740, 659.3, 587.3, 493.9, 440, 370, 329.6, 293.7,
      // Mouvement 3 : Ondes spectrales du zénith
      587.3, 740, 880, 987.8, 1174.7, 987.8, 880, 740,
      523.3, 659.3, 784, 880, 1046.5, 880, 784, 659.3,
      493.9, 587.3, 740, 880, 987.8, 880, 740, 587.3,
      440, 523.3, 659.3, 784, 880, 784, 659.3, 523.3,
      // Mouvement 4 : Tempête foudroyante suprême
      987.8, 1174.7, 1318.5, 1479.9, 1318.5, 1174.7, 987.8, 740,
      1174.7, 1318.5, 1479.9, 1760, 1479.9, 1318.5, 1174.7, 880,
      1318.5, 1479.9, 1760, 1975.5, 1760, 1479.9, 1318.5, 987.8,
      1174.7, 987.8, 880, 740, 587.3, 493.9, 370, 246.9,
    ],
    harmonyNotes: [
      // Mouvement 1
      370, 440, 493.9, 440, 370, 440, 493.9, 440,
      440, 493.9, 587.3, 493.9, 440, 493.9, 587.3, 493.9,
      293.7, 329.6, 370, 329.6, 293.7, 329.6, 370, 329.6,
      329.6, 370, 440, 370, 329.6, 370, 440, 370,
      // Mouvement 2
      740, 880, 987.8, 880, 740, 880, 987.8, 880,
      880, 987.8, 1174.7, 987.8, 880, 987.8, 1174.7, 987.8,
      987.8, 1174.7, 1318.5, 1174.7, 987.8, 1174.7, 1318.5, 1174.7,
      1108.7, 987.8, 880, 740, 587.3, 493.9, 440, 370,
      // Mouvement 3
      880, 0, 987.8, 0, 1174.7, 0, 987.8, 0,
      784, 0, 880, 0, 1046.5, 0, 880, 0,
      740, 0, 880, 0, 987.8, 0, 880, 0,
      659.3, 0, 784, 0, 880, 0, 784, 0,
      // Mouvement 4
      1174.7, 987.8, 880, 740, 880, 987.8, 1174.7, 1318.5,
      1318.5, 1174.7, 987.8, 880, 987.8, 1174.7, 1318.5, 1479.9,
      1479.9, 1318.5, 1174.7, 987.8, 1174.7, 1318.5, 1479.9, 1760,
      1318.5, 1174.7, 987.8, 740, 587.3, 493.9, 370, 246.9,
    ],
    drums: [
      // Mouvement 1
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 3, 2, 1,
      // Mouvement 2
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      3, 2, 3, 2, 4, 1, 2, 2,
      // Mouvement 3
      3, 2, 1, 2, 3, 2, 1, 2,
      3, 2, 1, 2, 3, 2, 1, 2,
      3, 2, 1, 2, 3, 2, 1, 2,
      4, 1, 2, 1, 4, 2, 3, 1,
      // Mouvement 4
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 3, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 2, 4, 2, 4, 4, 3, 2,
    ],
    bassType: 'triangle',
    melodyType: 'sine',
    harmonyType: 'triangle',
    decay: 0.16,
  },

  // Citadelle d'Airain (Seigneur Malakor) : Marche impériale gothique grandiose (128 pas, 148 BPM, 4 mouvements)
  STAGE_CITADEL: {
    bpm: 148,
    bassNotes: [
      // Mouvement 1 : Marche de fer du despote
      55, 55, 65.4, 55, 73.4, 65.4, 82.4, 73.4,
      55, 55, 65.4, 55, 92.5, 82.4, 73.4, 65.4,
      49, 49, 58.3, 49, 65.4, 58.3, 73.4, 65.4,
      55, 55, 73.4, 82.4, 98, 87.3, 82.4, 73.4,
      // Mouvement 2 : Tourment pourpre
      110, 110, 130.8, 110, 146.8, 130.8, 164.8, 146.8,
      103.8, 103.8, 123.5, 103.8, 138.6, 123.5, 155.6, 138.6,
      98, 98, 116.5, 98, 130.8, 116.5, 146.8, 130.8,
      82.4, 98, 110, 123.5, 130.8, 110, 82.4, 55,
      // Mouvement 3 : Requiem d'ombre et d'acier
      73.4, 73.4, 87.3, 73.4, 98, 87.3, 110, 98,
      65.4, 65.4, 77.8, 65.4, 87.3, 77.8, 98, 87.3,
      58.3, 58.3, 69.3, 58.3, 77.8, 69.3, 87.3, 77.8,
      55, 65.4, 73.4, 82.4, 98, 87.3, 73.4, 55,
      // Mouvement 4 : Ordre suprême et domination
      110, 130.8, 164.8, 220, 196, 164.8, 130.8, 110,
      103.8, 123.5, 155.6, 207.7, 185, 155.6, 123.5, 103.8,
      98, 116.5, 146.8, 196, 174.6, 146.8, 116.5, 98,
      82.4, 110, 130.8, 164.8, 146.8, 110, 82.4, 55,
    ],
    melodyNotes: [
      // Mouvement 1 : Thème impérial de Malakor
      110, 130.8, 146.8, 164.8, 220, 196, 164.8, 146.8,
      130.8, 164.8, 196, 220, 261.6, 246.9, 220, 196,
      98, 123.5, 146.8, 164.8, 196, 164.8, 146.8, 123.5,
      110, 146.8, 164.8, 196, 220, 246.9, 261.6, 246.9,
      // Mouvement 2 : Déferlante de l'armure d'airain
      220, 261.6, 293.7, 329.6, 440, 392, 329.6, 293.7,
      207.7, 246.9, 277.2, 311.1, 415.3, 370, 311.1, 277.2,
      196, 233.1, 261.6, 293.7, 392, 349.2, 293.7, 261.6,
      164.8, 196, 220, 246.9, 261.6, 220, 164.8, 110,
      // Mouvement 3 : Murmures d'outre-tombe
      220, 246.9, 261.6, 293.7, 329.6, 293.7, 261.6, 246.9,
      196, 220, 233.1, 261.6, 293.7, 261.6, 233.1, 220,
      174.6, 196, 207.7, 233.1, 261.6, 233.1, 207.7, 196,
      164.8, 196, 220, 261.6, 311.1, 329.6, 370, 440,
      // Mouvement 4 : Châtiment du Tyran (Climax monumental)
      440, 523.3, 587.3, 659.3, 880, 784, 659.3, 587.3,
      415.3, 493.9, 554.4, 622.3, 830.6, 740, 622.3, 554.4,
      392, 466.2, 523.3, 587.3, 784, 698.5, 587.3, 523.3,
      329.6, 392, 440, 523.3, 440, 329.6, 220, 110,
    ],
    harmonyNotes: [
      // Mouvement 1
      220, 0, 261.6, 0, 329.6, 0, 261.6, 0,
      261.6, 0, 329.6, 0, 392, 0, 329.6, 0,
      196, 0, 246.9, 0, 293.7, 0, 246.9, 0,
      220, 0, 261.6, 0, 329.6, 0, 392, 0,
      // Mouvement 2
      440, 0, 523.3, 0, 659.3, 0, 523.3, 0,
      415.3, 0, 493.9, 0, 622.3, 0, 493.9, 0,
      392, 0, 466.2, 0, 587.3, 0, 466.2, 0,
      329.6, 392, 440, 493.9, 523.3, 440, 329.6, 220,
      // Mouvement 3
      329.6, 0, 370, 0, 392, 0, 370, 0,
      293.7, 0, 329.6, 0, 349.2, 0, 329.6, 0,
      261.6, 0, 293.7, 0, 311.1, 0, 293.7, 0,
      329.6, 0, 392, 0, 440, 0, 523.3, 0,
      // Mouvement 4
      659.3, 0, 784, 0, 880, 0, 784, 0,
      622.3, 0, 740, 0, 830.6, 0, 740, 0,
      587.3, 0, 698.5, 0, 784, 0, 698.5, 0,
      523.3, 440, 392, 329.6, 261.6, 220, 164.8, 110,
    ],
    drums: [
      // Mouvement 1
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 2, 4, 3, 2, 1,
      // Mouvement 2
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 1, 2, 1, 4, 1, 2, 1,
      4, 2, 4, 2, 4, 4, 2, 2,
      // Mouvement 3
      4, 2, 4, 2, 4, 2, 4, 2,
      4, 2, 4, 2, 4, 2, 4, 2,
      4, 2, 4, 2, 4, 2, 4, 2,
      4, 4, 2, 2, 4, 4, 3, 2,
      // Mouvement 4
      4, 1, 4, 1, 4, 1, 4, 1,
      4, 1, 4, 1, 4, 3, 4, 1,
      4, 1, 4, 1, 4, 1, 4, 1,
      4, 4, 4, 4, 4, 4, 4, 2,
    ],
    bassType: 'sawtooth',
    melodyType: 'sawtooth',
    harmonyType: 'sawtooth',
    decay: 0.15,
  },

  // "Achevez-le !" : Tension mortelle au ralenti (16 pas, 160 BPM)
  FINISH_HIM: {
    bpm: 160,
    bassNotes: [55, 0, 55, 0, 55, 0, 77.8, 65.4, 55, 0, 55, 0, 82.4, 77.8, 65.4, 55],
    melodyNotes: [110, 0, 110, 0, 155.6, 0, 130.8, 0, 110, 0, 110, 0, 164.8, 155.6, 130.8, 110],
    drums: [4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 2, 2, 2],
    bassType: 'sawtooth',
    melodyType: 'square',
    decay: 0.10,
  },

  // Victoire / Triomphe du champion (32 pas, 130 BPM)
  VICTORY: {
    bpm: 130,
    bassNotes: [
      130.8, 130.8, 164.8, 196, 130.8, 164.8, 196, 261.6,
      174.6, 174.6, 220, 261.6, 196, 196, 246.9, 293.7,
      130.8, 130.8, 164.8, 196, 146.8, 174.6, 220, 261.6,
      196, 220, 246.9, 293.7, 261.6, 329.6, 392, 523.3,
    ],
    melodyNotes: [
      261.6, 329.6, 392, 523.3, 392, 523.3, 659.3, 523.3,
      349.2, 440, 523.3, 698.5, 392, 493.9, 587.3, 784,
      523.3, 659.3, 784, 1046.5, 587.3, 698.5, 880, 1174.7,
      784, 880, 987.8, 1174.7, 1046.5, 0, 1046.5, 0,
    ],
    harmonyNotes: [
      392, 0, 523.3, 0, 392, 0, 659.3, 0,
      523.3, 0, 698.5, 0, 587.3, 0, 784, 0,
      784, 0, 1046.5, 0, 880, 0, 1174.7, 0,
      987.8, 0, 1174.7, 0, 1046.5, 0, 1046.5, 0,
    ],
    drums: [
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 1, 2, 1, 3, 1, 2, 1,
      4, 2, 3, 2, 4, 0, 4, 0,
    ],
    bassType: 'triangle',
    melodyType: 'square',
    harmonyType: 'triangle',
    decay: 0.20,
  },

  // Défaite / Game Over : Solennité nostalgique (32 pas, 90 BPM)
  GAME_OVER: {
    bpm: 90,
    bassNotes: [
      110, 110, 103.8, 103.8, 98, 98, 92.5, 92.5,
      87.3, 87.3, 82.4, 82.4, 73.4, 73.4, 55, 55,
      65.4, 65.4, 73.4, 73.4, 82.4, 82.4, 87.3, 87.3,
      73.4, 73.4, 65.4, 65.4, 55, 55, 55, 0,
    ],
    melodyNotes: [
      220, 207.7, 196, 185, 174.6, 164.8, 146.8, 130.8,
      130.8, 123.5, 110, 103.8, 98, 87.3, 55, 0,
      130.8, 146.8, 164.8, 174.6, 196, 174.6, 164.8, 146.8,
      146.8, 130.8, 123.5, 110, 55, 0, 55, 0,
    ],
    harmonyNotes: [
      164.8, 0, 155.6, 0, 146.8, 0, 138.6, 0,
      130.8, 0, 123.5, 0, 110, 0, 82.4, 0,
      98, 0, 110, 0, 130.8, 0, 123.5, 0,
      110, 0, 98, 0, 82.4, 0, 55, 0,
    ],
    drums: [
      3, 0, 1, 0, 2, 0, 1, 0,
      3, 0, 1, 0, 2, 0, 1, 0,
      3, 0, 1, 0, 2, 0, 1, 0,
      3, 0, 2, 0, 4, 0, 0, 0,
    ],
    bassType: 'sawtooth',
    melodyType: 'triangle',
    harmonyType: 'sine',
    decay: 0.32,
  },
};

export interface AudioStepEvent {
  theme: MusicTheme;
  step: number;
  totalSteps: number;
  bpm: number;
  bassFreq: number;
  melodyFreq: number;
  harmonyFreq: number;
  drumHit: number;
}

export interface SoundTrackInfo {
  id: MusicTheme;
  title: string;
  arenaOrContext: string;
  fighterName?: string;
  bpm: number;
  totalSteps: number;
  description: string;
}

export const SOUND_TRACKS: SoundTrackInfo[] = [
  {
    id: 'TITLE',
    title: 'Écran Titre AKA',
    arenaOrContext: 'Menu Principal',
    bpm: 132,
    totalSteps: 64,
    description: 'Hymne martial héroïque synthwave & bushido, fanfare de bravoure.',
  },
  {
    id: 'SELECT',
    title: 'Sélection des Guerriers',
    arenaOrContext: 'Choix du Combattant',
    bpm: 122,
    totalSteps: 64,
    description: 'Groove à suspense syncopé et montée de tension pré-combat.',
  },
  {
    id: 'VERSUS',
    title: 'Face-à-Face / Confrontation',
    arenaOrContext: 'Écran de Duel',
    bpm: 140,
    totalSteps: 64,
    description: 'Cadence martiale rapide et riffs percutants annonçant le combat.',
  },
  {
    id: 'STAGE_DOJO',
    title: 'Dojo de Kyoto',
    arenaOrContext: 'Arène de Kenji (Japon)',
    fighterName: 'Kenji',
    bpm: 138,
    totalSteps: 128,
    description: 'Gamme traditionnelle Hirajōshi & cascades de katana chiptune (4 mouvements).',
  },
  {
    id: 'STAGE_PIT',
    title: 'Fosse d’Obsidienne',
    arenaOrContext: 'Arène de Krowen (Royaume Sombre)',
    fighterName: 'Krowen',
    bpm: 146,
    totalSteps: 128,
    description: 'Thrash metal ténébreux, vélocité d’assassin et double pédale furieuse.',
  },
  {
    id: 'STAGE_HARBOR',
    title: 'Port de Hong Kong',
    arenaOrContext: 'Arène de Mei-Lin (Néons)',
    fighterName: 'Mei-Lin',
    bpm: 154,
    totalSteps: 128,
    description: 'Rushdown synthwave ultra-dynamique, envolées d’éventails en arpèges vifs.',
  },
  {
    id: 'STAGE_FOUNDRY',
    title: 'Fonderie de Sibérie',
    arenaOrContext: 'Arène de Titan (Usine Lourde)',
    fighterName: 'Titan',
    bpm: 124,
    totalSteps: 128,
    description: 'Pilon hydraulique colossal, percussions industrielles et marteau de fer.',
  },
  {
    id: 'STAGE_SANCTUARY',
    title: 'Sanctuaire d’Atacama',
    arenaOrContext: 'Arène de Nyxia (Cosmos & Ruines)',
    fighterName: 'Nyxia',
    bpm: 136,
    totalSteps: 128,
    description: 'Ambiance céleste astrale, faisceaux boréaux et foudre solaire.',
  },
  {
    id: 'STAGE_CITADEL',
    title: 'Citadelle d’Airain',
    arenaOrContext: 'Arène de Malakor (Forteresse du Boss)',
    fighterName: 'Seigneur Malakor',
    bpm: 148,
    totalSteps: 128,
    description: 'Marche impériale gothique grandiose, orgue chiptune et domination absolue.',
  },
  {
    id: 'FINISH_HIM',
    title: 'Achevez-le !',
    arenaOrContext: 'Ralenti Mortel',
    bpm: 160,
    totalSteps: 16,
    description: 'Battements cardiaques et staccato glacial avant le Coup Fatal.',
  },
  {
    id: 'VICTORY',
    title: 'Victoire & Gloire',
    arenaOrContext: 'Fin de Match',
    bpm: 130,
    totalSteps: 32,
    description: 'Fanfare triomphale ascendante saluant le champion.',
  },
  {
    id: 'GAME_OVER',
    title: 'Défaite / Requiem',
    arenaOrContext: 'Game Over',
    bpm: 90,
    totalSteps: 32,
    description: 'Mélodie mélancolique solennelle dans le silence de l’arène.',
  },
];

class GamebuinoSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private bgmVol = 0.7; // 0..1
  private sfxVol = 0.85; // 0..1

  // Moteur de BGM chiptune en arrière-plan
  private currentTheme: MusicTheme = 'SILENCE';
  private bgmIntervalId: number | null = null;
  private stepIndex = 0;
  private stepListeners: Set<(ev: AudioStepEvent) => void> = new Set();

  public onStep(listener: (ev: AudioStepEvent) => void): () => void {
    this.stepListeners.add(listener);
    return () => this.stepListeners.delete(listener);
  }

  public getTrackInfo(theme: MusicTheme): { bpm: number; totalSteps: number } | null {
    const t = TRACKS[theme];
    if (!t) return null;
    return { bpm: t.bpm, totalSteps: t.bassNotes.length };
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
    if (!val) {
      this.stopMusic();
    } else if (this.currentTheme !== 'SILENCE') {
      this.playMusic(this.currentTheme);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setBgmVolume(percent: number): void {
    this.bgmVol = Math.max(0, Math.min(100, percent)) / 100;
  }

  public getBgmVolume(): number {
    return Math.round(this.bgmVol * 100);
  }

  public setSfxVolume(percent: number): void {
    this.sfxVol = Math.max(0, Math.min(100, percent)) / 100;
  }

  public getSfxVolume(): number {
    return Math.round(this.sfxVol * 100);
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // --- MOTEUR DE MUSIQUE CHIPTUNE POLYPHONIQUE AVEC PERCUSSIONS ---

  public playMusic(theme: MusicTheme): void {
    if (this.currentTheme === theme && this.bgmIntervalId !== null) return;
    this.stopMusic();
    this.currentTheme = theme;

    if (!this.enabled || theme === 'SILENCE') return;
    const track = TRACKS[theme];
    if (!track) return;

    this.stepIndex = 0;
    const stepMs = Math.round((60000 / track.bpm) / 4); // Double-croches (16th notes fluides)

    this.bgmIntervalId = window.setInterval(() => {
      if (!this.enabled || this.bgmVol <= 0.01) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const idx = this.stepIndex;
      const bassNote = track.bassNotes[idx % track.bassNotes.length];
      const melodyNote = track.melodyNotes[idx % track.melodyNotes.length];
      const harmNote = track.harmonyNotes ? track.harmonyNotes[idx % track.harmonyNotes.length] : 0;
      const drumHit = track.drums ? track.drums[idx % track.drums.length] : 0;

      const now = ctx.currentTime;
      const dur = track.decay;

      // Voix 1 : Ligne de basse chiptune percutante
      if (bassNote > 0) {
        const oscB = ctx.createOscillator();
        const gainB = ctx.createGain();
        oscB.type = track.bassType;
        oscB.frequency.setValueAtTime(bassNote, now);
        gainB.gain.setValueAtTime(0.001, now);
        gainB.gain.linearRampToValueAtTime(0.11 * this.bgmVol, now + 0.004);
        gainB.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        oscB.connect(gainB);
        gainB.connect(ctx.destination);
        oscB.start(now);
        oscB.stop(now + dur + 0.02);
      }

      // Voix 2 : Mélodie principale lead éclatante
      if (melodyNote > 0) {
        const oscM = ctx.createOscillator();
        const gainM = ctx.createGain();
        oscM.type = track.melodyType;
        oscM.frequency.setValueAtTime(melodyNote, now);
        gainM.gain.setValueAtTime(0.001, now);
        gainM.gain.linearRampToValueAtTime(0.08 * this.bgmVol, now + 0.005);
        gainM.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        oscM.connect(gainM);
        gainM.connect(ctx.destination);
        oscM.start(now);
        oscM.stop(now + dur + 0.02);
      }

      // Voix 3 : Contre-chant / Accord d'harmonie chiptune
      if (harmNote && harmNote > 0) {
        const oscH = ctx.createOscillator();
        const gainH = ctx.createGain();
        oscH.type = track.harmonyType || 'triangle';
        oscH.frequency.setValueAtTime(harmNote, now);
        gainH.gain.setValueAtTime(0.001, now);
        gainH.gain.linearRampToValueAtTime(0.045 * this.bgmVol, now + 0.006);
        gainH.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.9);
        oscH.connect(gainH);
        gainH.connect(ctx.destination);
        oscH.start(now);
        oscH.stop(now + dur + 0.02);
      }

      // Voix 4 : Batterie chiptune rétro (Grosse caisse, Caisse claire, Charleston, Crash)
      if (this.bgmVol > 0.05 && drumHit > 0) {
        if (drumHit === 1) {
          // Charleston fermé (bruit blanc aigu rapide)
          this.playNoise(0.025, 0.028 * this.bgmVol, 3200);
        } else if (drumHit === 2) {
          // Caisse claire (bruit filtré médium + impact triangulaire)
          this.playNoise(0.07, 0.055 * this.bgmVol, 1100);
          this.playTone(180, 75, 0.04, 'triangle', 0.05 * this.bgmVol);
        } else if (drumHit === 3) {
          // Grosse caisse (tonalité basse descendante percutante)
          this.playTone(120, 38, 0.08, 'sine', 0.12 * this.bgmVol);
        } else if (drumHit === 4) {
          // Grosse caisse + Cymbale crash d'accentuation
          this.playTone(130, 36, 0.10, 'sine', 0.14 * this.bgmVol);
          this.playNoise(0.16, 0.065 * this.bgmVol, 2600);
        }
      }

      if (this.stepListeners.size > 0) {
        const totalSteps = track.bassNotes.length;
        const ev: AudioStepEvent = {
          theme,
          step: idx % totalSteps,
          totalSteps,
          bpm: track.bpm,
          bassFreq: bassNote,
          melodyFreq: melodyNote,
          harmonyFreq: harmNote || 0,
          drumHit,
        };
        for (const listener of this.stepListeners) {
          listener(ev);
        }
      }

      this.stepIndex++;
    }, stepMs);
  }

  public stopMusic(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.currentTheme = 'SILENCE';
  }

  public getCurrentTheme(): MusicTheme {
    return this.currentTheme;
  }

  // --- BRUITAGES DE COMBAT & INTERFACE (SFX) ---

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'square',
    gainPeak = 0.14,
    delaySec = 0
  ): void {
    if (this.sfxVol <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const actualPeak = gainPeak * this.sfxVol;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freqStart), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), now + durationSec);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(actualPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  }

  private playNoise(durationSec: number, gainPeak = 0.18, bandpassFreq = 900, delaySec = 0): void {
    if (this.sfxVol <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const actualPeak = gainPeak * this.sfxVol;
    const now = ctx.currentTime + delaySec;
    const sampleCount = Math.max(256, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(bandpassFreq, now);
    filter.Q.setValueAtTime(1.1, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(actualPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + durationSec + 0.01);
  }

  public menuMove(): void {
    this.playTone(520, 680, 0.045, 'square', 0.08);
  }

  public menuConfirm(): void {
    this.playTone(440, 660, 0.07, 'square', 0.11, 0);
    this.playTone(660, 880, 0.11, 'square', 0.12, 0.065);
  }

  public menuCancel(): void {
    this.playTone(620, 380, 0.08, 'square', 0.09, 0);
  }

  public jump(): void {
    this.playTone(170, 420, 0.11, 'triangle', 0.10);
  }

  public whiff(): void {
    this.playNoise(0.055, 0.07, 1600);
  }

  public lightHit(): void {
    this.playNoise(0.07, 0.18, 1200);
    this.playTone(260, 95, 0.08, 'square', 0.13);
  }

  public heavyHit(): void {
    this.playNoise(0.14, 0.25, 650);
    this.playTone(190, 52, 0.16, 'sawtooth', 0.18);
  }

  public blockHit(): void {
    this.playTone(880, 440, 0.07, 'triangle', 0.13);
    this.playNoise(0.05, 0.10, 2400);
  }

  public throwSlam(): void {
    this.playNoise(0.22, 0.28, 340);
    this.playTone(140, 36, 0.25, 'sawtooth', 0.22);
  }

  public specialMove(kind: 'KI' | 'TELEPORT' | 'HARPOON' | 'LIGHTNING' | 'HEAVY'): void {
    switch (kind) {
      case 'KI':
        this.playTone(320, 760, 0.16, 'sawtooth', 0.13);
        this.playNoise(0.12, 0.11, 1400, 0.02);
        break;
      case 'TELEPORT':
        this.playTone(920, 180, 0.14, 'sine', 0.15);
        this.playTone(220, 840, 0.12, 'triangle', 0.12, 0.09);
        break;
      case 'HARPOON':
        this.playNoise(0.09, 0.16, 2800);
        this.playTone(620, 290, 0.14, 'sawtooth', 0.14);
        break;
      case 'LIGHTNING':
        this.playNoise(0.18, 0.20, 3200);
        this.playTone(1100, 280, 0.16, 'square', 0.12);
        break;
      case 'HEAVY':
        this.playTone(150, 70, 0.20, 'sawtooth', 0.18);
        this.playNoise(0.16, 0.18, 500);
        break;
    }
  }

  public taunt(): void {
    this.playTone(240, 190, 0.09, 'sawtooth', 0.11, 0);
    this.playTone(220, 170, 0.09, 'sawtooth', 0.11, 0.11);
    this.playTone(200, 150, 0.13, 'sawtooth', 0.12, 0.22);
  }

  public roundBell(): void {
    this.playTone(587.33, 580, 0.35, 'triangle', 0.16, 0);
    this.playTone(880, 872, 0.35, 'square', 0.10, 0);
  }

  public finishHimSting(): void {
    this.playTone(110, 106, 0.55, 'sawtooth', 0.18, 0);
    this.playTone(130.81, 126, 0.55, 'sawtooth', 0.15, 0);
    this.playTone(164.81, 160, 0.55, 'square', 0.11, 0.05);
    this.playNoise(0.28, 0.14, 420, 0);
  }

  public finisherImpact(): void {
    this.playNoise(0.42, 0.30, 320, 0);
    this.playTone(220, 38, 0.45, 'sawtooth', 0.24, 0);
    this.playTone(440, 82, 0.40, 'square', 0.14, 0.08);
  }

  public koBlast(): void {
    this.playNoise(0.38, 0.28, 380, 0);
    this.playTone(240, 42, 0.42, 'sawtooth', 0.22, 0);
  }

  public victoryFanfare(): void {
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.01, 0.16, 'square', 0.11, idx * 0.11);
    });
  }
}

export const soundFX = new GamebuinoSoundEngine();
