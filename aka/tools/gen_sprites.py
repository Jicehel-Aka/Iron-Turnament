#!/usr/bin/env python3
"""
 gen_sprites.py — Planches de sprites -> sd/IRONTOURNAMENT/sprites/<NOM>.spr

 Entree : assets_src/sheets/<nom>.png, 768 x 2576, fond magenta #FF00FF (cle de
 transparence 0xF81F), 23 lignes x 6 colonnes, cellules de 128 x 112, pied du
 combattant au pivot (60, 98) — format du Sprite Sheet Studio du prototype web.

 Lignes (meme ordre que le prototype) :
   0 IDLE  1 WALK_FWD  2 WALK_BACK  3 JUMP  4 JUMP_ATTACK  5 CROUCH
   6 BLOCK_HIGH  7 BLOCK_LOW  8 EVADE_HIGH  9 EVADE_MID  10 EVADE_LOW
   11 LIGHT  12 HEAVY  13 LOW_KICK  14 UPPERCUT  15-17 SPECIAL_1..3
   18 HITSTUN  19 HITSTUN_GUT  20 KNOCKDOWN  21 DEFEAT  22 VICTORY

 Sortie : fichier .spr, little-endian.
   en-tete  : "ISPR", u16 version=1, u16 nb_images (=138), u16 colonnes (=6), u16 0
   table    : pour chaque image (ligne*6+colonne), 12 octets :
              u16 w, u16 h, i16 ox, i16 oy, u32 offset
              (ox, oy = coin haut-gauche du cadre RECADRE, relatif au pivot ;
               offset = position des pixels depuis le debut du fichier ; w=h=0 : image vide)
   pixels   : BGR565 (rouge sur les bits bas, comme l'ecran de la AKA), w*h par image,
              cle de transparence 0xF81F.

 Chaque image est recadree au plus juste : ~0,7 a 0,85 Mo par combattant (au lieu de
 3,9 Mo pour les cellules entieres). Le jeu ne charge en PSRAM que les DEUX combattants
 du combat en cours.
"""
import os, struct, sys
import numpy as np
from PIL import Image

NAMES = ['kenji', 'krowen', 'meilin', 'titan', 'nyxia', 'malakor']   # ordre de FighterId
CELL_W, CELL_H, COLS, ROWS = 128, 112, 6, 23
PIVOT_X, PIVOT_Y = 60, 98
KEY = 0xF81F

def to_bgr565(rgb):
    r = (rgb[..., 0] >> 3).astype(np.uint16)
    g = (rgb[..., 1] >> 2).astype(np.uint16)
    b = (rgb[..., 2] >> 3).astype(np.uint16)
    return ((b << 11) | (g << 5) | r).astype('<u2')

def convert(png, out):
    im = Image.open(png).convert('RGB')
    if im.size != (CELL_W * COLS, CELL_H * ROWS):
        sys.exit(f"{png}: taille {im.size}, attendu {(CELL_W * COLS, CELL_H * ROWS)}")
    rgb = np.array(im)
    is_key = (rgb[..., 0] > 240) & (rgb[..., 1] < 16) & (rgb[..., 2] > 240)
    px = to_bgr565(rgb)
    # Un pixel qui n'est pas du fond ne doit JAMAIS valoir la cle : on l'ecarte d'un cran de vert.
    clash = (~is_key) & (px == KEY)
    px[clash] = KEY + 0x20
    px[is_key] = KEY

    table, blob = [], bytearray()
    n = ROWS * COLS
    base = 12 + 12 * n
    for r in range(ROWS):
        for c in range(COLS):
            y0, x0 = r * CELL_H, c * CELL_W
            cell_fg = ~is_key[y0:y0 + CELL_H, x0:x0 + CELL_W]
            ys, xs = np.where(cell_fg)
            if len(ys) == 0:
                table.append((0, 0, 0, 0, 0)); continue
            ya, yb, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            data = px[y0 + ya:y0 + yb, x0 + xa:x0 + xb]
            table.append((xb - xa, yb - ya, int(xa) - PIVOT_X, int(ya) - PIVOT_Y, base + len(blob)))
            blob += data.tobytes()
    head = b'ISPR' + struct.pack('<HHHH', 1, n, COLS, 0)
    tab = b''.join(struct.pack('<HHhhI', *t) for t in table)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f:
        f.write(head + tab + bytes(blob))
    return base + len(blob)

def main():
    src = 'assets_src/sheets'
    dst = 'sd/IRONTOURNAMENT/sprites'
    total = 0
    for n in NAMES:
        size = convert(f'{src}/{n}.png', f'{dst}/{n.upper()}.spr')
        total += size
        print(f'{n:8s} -> {dst}/{n.upper()}.spr  {size/1024:7.0f} Ko')
    print(f'total {total/1024/1024:.2f} Mo (2 combattants en PSRAM : ~{total/3/1024/1024:.1f} Mo)')

if __name__ == '__main__':
    main()
