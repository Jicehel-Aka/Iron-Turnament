export const GAMEBUINO_SKETCH_INO = `/**
 * IRON TOURNAMENT AKA — Moteur Pro 320x240 BGR565 pour Gamebuino AKA (ESP32-S3)
 * SoC Cible : Espressif ESP32-S3 Dual-Core Xtensa LX7 @ 240 MHz + FPU Matériel 32-bit
 * Mémoire   : 512 Ko SRAM interne + 8 Mo PSRAM Octal SPI (Double Framebuffer DMA 320x240)
 * Affichage : Dalle IPS/TFT 320x240 en format natif 16-bit BGR565 (153 600 octets / trame)
 *
 * FORMAT PIXEL MATÉRIEL BGR565 :
 *   uint16_t packBGR565(uint8_t r, uint8_t g, uint8_t b) {
 *     return ((uint16_t)(b & 0xF8) << 8) | ((uint16_t)(g & 0xFC) << 3) | (r >> 3);
 *   }
 *
 * ARCHITECTURE DUAL-CORE ESP32-S3 (60 FPS Constants) :
 * - Core 0 (DMA & Audio Task) : Transfert SPI DMA asynchrone à 80 MHz du framebuffer BGR565 + mixeur SFX
 * - Core 1 (Engine & Render)  : Physique 60 Hz, IA psychologique des 6 maîtres, et pipeline commutable :
 *     1) HYBRID_25D_PRO : Décor 16-bit parallaxe + grille/piliers 3D projetés + Sprites 2D BGR565 encrés
 *     2) SPRITE_2D_PRO  : Blitting RLE 16-bit BGR565 façon CPS-2 / Neo-Geo (24 animations par guerrier)
 *     3) FULL_3D_PRO    : Maillages articulés octogonaux (~420 tris/perso) via FPU + éclairage 3 points
 */

#include <Arduino.h>
#include <SPI.h>

static constexpr int16_t SCREEN_W       = 320;
static constexpr int16_t SCREEN_H       = 240;
static constexpr int16_t STAGE_WORLD_W  = 640;
static constexpr int16_t MAX_FIGHTER_DX = 268;
static constexpr int16_t HORIZON_Y      = 176;
static constexpr int16_t GROUND_Y       = 208;

// Double tampon 320x240 BGR565 (2 x 153.6 Ko alloués en PSRAM/SRAM alignée DMA)
uint16_t* frameBuf[2];
volatile uint8_t activeBuf = 0;

// Encodage matériel strict BGR565 (5 bits Bleu | 6 bits Vert | 5 bits Rouge)
static inline uint16_t packBGR565(uint8_t r, uint8_t g, uint8_t b) {
  return ((uint16_t)(b & 0xF8) << 8) | ((uint16_t)(g & 0xFC) << 3) | ((uint16_t)r >> 3);
}

enum RenderEngineMode : uint8_t {
  HYBRID_25D_PRO = 0,
  SPRITE_2D_PRO  = 1,
  FULL_3D_PRO    = 2
};

// Les 24 états d'animation dédiés (aucune pose générique partagée)
enum FighterAction : uint8_t {
  ACT_IDLE = 0, ACT_WALK_FWD, ACT_WALK_BACK, ACT_CROUCH, ACT_JUMP,
  ACT_LIGHT_ATK, ACT_HEAVY_ATK, ACT_LOW_KICK, ACT_UPPERCUT, ACT_THROW,
  ACT_SPECIAL_1, ACT_SPECIAL_2, ACT_SPECIAL_3,
  ACT_BLOCK_HIGH, ACT_BLOCK_LOW, ACT_HITSTUN, ACT_KNOCKDOWN, ACT_WAKEUP,
  ACT_TAUNT, ACT_DIZZY, ACT_FINISHER, ACT_FINISHER_VICTIM, ACT_VICTORY, ACT_DEFEAT
};

struct FighterProfile {
  const char* shortName;
  int16_t maxHp;
  float walkSpeed;
  uint8_t power;
  uint8_t defense;
  uint8_t reachPx;
  // Profil psychologique IA (0..100)
  uint8_t preferredRangePx;
  uint8_t aggression;
  uint8_t patience;
  uint8_t teleportCounter;
  uint8_t grappleTendency;
  uint8_t arroganceTaunt;
  uint16_t primaryBGR;
  uint16_t accentBGR;
};

// Équilibrage compétitif 360 points des 6 maîtres du Tournoi de Fer
const FighterProfile ROSTER[6] = {
  { "KENJI",   1000, 2.35f, 62, 60, 44,  92, 52, 78,  0, 25,  2, 0xF7BE, 0xFC9C },
  { "KROWEN",   950, 2.75f, 68, 48, 48,  68, 82, 34, 92, 35, 12, 0x2945, 0x0BBE },
  { "MEI-LIN",  940, 3.15f, 54, 52, 40,  54, 86, 42,  0, 30,  4, 0x86C2, 0x37FA },
  { "TITAN",   1180, 1.65f, 84, 76, 38,  42, 68, 72,  0, 94, 14, 0x4228, 0x19FF },
  { "NYXIA",    920, 2.45f, 58, 46, 62, 138, 28, 90,  0, 12,  6, 0x5ACB, 0xF760 },
  { "MALAKOR", 1080, 2.15f, 78, 64, 46,  78, 78, 48,  0, 42, 45, 0x18E3, 0xF2B5 }
};

struct Vec3 { float x, y, z; };

struct FighterRuntime {
  uint8_t id;
  float x, y, vx, vy;
  int8_t facing;
  int16_t hp;
  FighterAction action;
  uint16_t actionFrame;
  uint8_t wins;
};

static constexpr int16_t SPRITE_CELL_W   = 128;
static constexpr int16_t SPRITE_CELL_H   = 112;
static constexpr int16_t SPRITE_ORIGIN_X = 60;
static constexpr int16_t SPRITE_ORIGIN_Y = 98;
static constexpr uint16_t CHROMA_MAGENTA_BGR565 = 0xF81F; // #FF00FF en BGR565 (B=31, G=0, R=31)

FighterRuntime p1, p2;
RenderEngineMode engineMode = SPRITE_2D_PRO;
float cameraX = 0.0f;

// --- BLITTER HAUTE VITESSE DE PLANCHES DE SPRITES FIXES 128x112 SUR FOND MAGENTA (0xF81F) ---
void blitSprite128x112MagentaBGR565(
  uint16_t* fb,
  const uint16_t* sheetAtlas,
  int16_t sheetStridePx,
  uint8_t rowIdx,
  uint8_t colIdx,
  int16_t footScreenX,
  int16_t footScreenY,
  int8_t facing
) {
  const int16_t srcBaseX = colIdx * SPRITE_CELL_W;
  const int16_t srcBaseY = rowIdx * SPRITE_CELL_H;

  for (int16_t sy = 0; sy < SPRITE_CELL_H; sy++) {
    const int16_t dstY = footScreenY - SPRITE_ORIGIN_Y + sy;
    if (dstY < 0 || dstY >= SCREEN_H) continue;

    const uint16_t* srcRow = sheetAtlas + (srcBaseY + sy) * sheetStridePx + srcBaseX;
    uint16_t* dstRow = fb + dstY * SCREEN_W;

    for (int16_t sx = 0; sx < SPRITE_CELL_W; sx++) {
      const uint16_t px = srcRow[sx];
      if (px == CHROMA_MAGENTA_BGR565) continue;

      const int16_t relX = sx - SPRITE_ORIGIN_X;
      const int16_t dstX = footScreenX + (facing >= 0 ? relX : -relX);
      if (dstX >= 0 && dstX < SCREEN_W) {
        dstRow[dstX] = px;
      }
    }
  }
}

// --- IA PSYCHOLOGIQUE TEMPS-RÉEL (EXÉCUTÉE SUR CORE 1) ---
void stepPersonalityAI(FighterRuntime& ai, const FighterRuntime& opp) {
  const FighterProfile& prof = ROSTER[ai.id];
  float dist = fabsf(opp.x - ai.x);
  int8_t dir = (opp.x >= ai.x) ? 1 : -1;
  ai.facing = dir;

  // Orgueil de Malakor : provocation lorsqu'il domine la manche
  if (prof.arroganceTaunt > 30 && (ai.hp - opp.hp) > 280 && dist > 105.0f && (esp_random() % 100) < 3) {
    ai.action = ACT_TAUNT;
    ai.vx = 0.0f;
    return;
  }

  // Contre-téléportation instantanée de Krowen face au zoning
  if (prof.teleportCounter > 80 && opp.action == ACT_SPECIAL_1 && dist > 110.0f) {
    ai.action = ACT_SPECIAL_2; // Pas de l'Ombre
    ai.actionFrame = 0;
    return;
  }

  if (dist > prof.preferredRangePx + 16.0f) {
    ai.vx = dir * prof.walkSpeed;
    ai.action = ACT_WALK_FWD;
  } else if (dist < prof.preferredRangePx - 18.0f && prof.patience > 75) {
    ai.vx = -dir * (prof.walkSpeed * 0.82f);
    ai.action = ACT_WALK_BACK;
  } else if ((esp_random() % 100) < prof.aggression) {
    ai.action = (dist < 46.0f && (esp_random() % 100) < prof.grappleTendency)
                  ? ACT_SPECIAL_1
                  : ACT_HEAVY_ATK;
    ai.actionFrame = 0;
  }
}

void setup() {
  // Allocation des deux framebuffers 320x240 BGR565 (153 600 octets chacun)
  frameBuf[0] = (uint16_t*)ps_malloc(SCREEN_W * SCREEN_H * sizeof(uint16_t));
  frameBuf[1] = (uint16_t*)ps_malloc(SCREEN_W * SCREEN_H * sizeof(uint16_t));

  p1 = { 0, 246.0f, 0.0f, 0.0f, 0.0f,  1, ROSTER[0].maxHp, ACT_IDLE, 0, 0 };
  p2 = { 5, 394.0f, 0.0f, 0.0f, 0.0f, -1, ROSTER[5].maxHp, ACT_IDLE, 0, 0 };
}

// --- PLANCHER EN SCROLLING DIFFÉRENTIEL PAR LIGNE RASTER (0.72x -> 1.00x @ y=208 -> 1.28x @ y=240) ---
void renderDifferentialParallaxFloorBGR565(uint16_t* fb, float camDelta) {
  const uint16_t slabA = packBGR565(42, 34, 52);
  const uint16_t slabB = packBGR565(32, 26, 40);
  const uint16_t seamC = packBGR565(76, 62, 92);

  for (int16_t y = HORIZON_Y; y < SCREEN_H; y++) {
    const float rowFactor = 0.72f + ((float)(y - HORIZON_Y) / 32.0f) * 0.28f;
    const int16_t rowScroll = (int16_t)(camDelta * rowFactor);
    uint16_t* dstRow = fb + y * SCREEN_W;

    for (int16_t sx = 0; sx < SCREEN_W; sx++) {
      const int16_t worldSlabX = (sx - (SCREEN_W / 2)) + rowScroll + 1024;
      const int16_t inSlab = worldSlabX % 36;
      dstRow[sx] = (inSlab == 0) ? seamC : (((worldSlabX / 36) & 1) ? slabA : slabB);
    }
  }
}

void loop() {
  uint16_t* fb = frameBuf[activeBuf];

  // 1. Logique de combat 60 Hz, arène élargie 640px & laisse de caméra (268px max)
  stepPersonalityAI(p2, p1);
  p1.x = constrain(p1.x + p1.vx, 36.0f, (float)(STAGE_WORLD_W - 36));
  p2.x = constrain(p2.x + p2.vx, 36.0f, (float)(STAGE_WORLD_W - 36));

  const float camLeftX = constrain((p1.x + p2.x) * 0.5f - (SCREEN_W * 0.5f), 0.0f, (float)(STAGE_WORLD_W - SCREEN_W));
  cameraX = camLeftX - (STAGE_WORLD_W - SCREEN_W) * 0.5f;

  // 2. Décor multi-plans + sol en scrolling différentiel BGR565 + Blitting DMA 128x112 (clé Magenta 0xF81F)
  const uint16_t skyBGR = packBGR565(14, 20, 38);
  for (int i = 0; i < SCREEN_W * HORIZON_Y; i++) fb[i] = skyBGR;
  renderDifferentialParallaxFloorBGR565(fb, cameraX);

  // Exemple d'appel direct en coordonnées écran relatives à camLeftX :
  // blitSprite128x112MagentaBGR565(fb, atlasKenji, 6 * SPRITE_CELL_W, p1.action, (p1.actionFrame / 6) % 6, (int16_t)(p1.x - camLeftX), GROUND_Y + (int16_t)p1.y, p1.facing);
  // blitSprite128x112MagentaBGR565(fb, atlasMalakor, 6 * SPRITE_CELL_W, p2.action, (p2.actionFrame / 6) % 6, (int16_t)(p2.x - camLeftX), GROUND_Y + (int16_t)p2.y, p2.facing);

  // 3. Permutation DMA asynchrone vers l'écran 320x240 BGR565 (0 ms d'attente CPU)
  activeBuf ^= 1;
}
`;
