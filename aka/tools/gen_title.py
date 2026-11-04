#!/usr/bin/env python3
"""
 gen_title.py — Convertit l'ecran-titre PNG en binaire BGR565 brut.

 On produit un .bin embarque par CMake (EMBED_FILES) plutot qu'un tableau C :
 320x240 pixels feraient ~1,2 Mo de source texte, illisible et long a compiler.
 Le .bin fait exactement 153 600 octets et se mappe directement en flash.

 Format : BGR565 little-endian, ligne par ligne, de haut en bas.
 (L'ecran de la AKA est en BGR565 : rouge sur les bits BAS.)
"""
import sys
import numpy as np
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/AKACHESS.png'
dst = sys.argv[2] if len(sys.argv) > 2 else 'main/assets/title.bin'

im = Image.open(src).convert('RGB')
if im.size != (320, 240):
    print(f"  redimensionnement {im.size} -> (320,240)")
    im = im.resize((320, 240), Image.LANCZOS)

a = np.asarray(im, dtype=np.uint16)
r = (a[:, :, 0] >> 3) & 0x1F
g = (a[:, :, 1] >> 2) & 0x3F
b = (a[:, :, 2] >> 3) & 0x1F
bgr = ((b << 11) | (g << 5) | r).astype('<u2')

bgr.tofile(dst)
print(f"{dst} : {bgr.size * 2} octets ({bgr.shape[1]}x{bgr.shape[0]}, BGR565)")
