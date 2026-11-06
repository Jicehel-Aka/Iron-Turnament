#!/usr/bin/env python3
"""
 recolor_kenji.py — Palette de Kenji : kimono gris clair, bandeau et gants bleu moyen.
 Usage : python3 tools/recolor_kenji.py [entree.png] [sortie.png]
 (par defaut assets_src/sheets/kenji.png, sur place). La planche d'origine (kimono blanc, rouge)
 reste dans l'historique git. Ne touche ni aux formes ni aux positions : seulement les teintes.
 Rouge sature -> bleu moyen ; blanc/gris neutre -> gris clair legerement froid ; peau, cheveux, ceinture
 sombre et effets (boule d'energie bleue) inchanges.
"""
import sys, colorsys
import numpy as np
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else 'assets_src/sheets/kenji.png'
dst = sys.argv[2] if len(sys.argv) > 2 else src
BLUE_H = 214 / 360.0                 # bleu moyen
GREY_TINT_H = 215 / 360.0            # gris legerement froid

im = np.array(Image.open(src).convert('RGB')).astype(np.float64) / 255.0
key = (im[..., 0] > .94) & (im[..., 1] < .07) & (im[..., 2] > .94)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
mx, mn = im.max(2), im.min(2)
d = mx - mn
s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0.0)
h = np.zeros_like(mx)
m = d > 1e-6
rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
h[rm] = ((g - b)[rm] / d[rm]) % 6; h[gm] = (b - r)[gm] / d[gm] + 2; h[bm] = (r - g)[bm] / d[bm] + 4
h = (h * 60.0) % 360.0

fg = ~key
red = fg & (((s > 0.5) & (mx > 0.2)) | ((s > 0.18) & (mx > 0.6))) & ((h < 12) | (h > 335))   # inclut les traînees rosees
white = fg & (s < 0.2) & (mx > 0.5)

def hsv2rgb(hh, ss, vv):
    i = np.floor(hh * 6.0).astype(int) % 6
    f = hh * 6.0 - np.floor(hh * 6.0)
    p = vv * (1 - ss); q = vv * (1 - f * ss); t = vv * (1 - (1 - f) * ss)
    out = np.zeros(hh.shape + (3,))
    for k, (rr, gg, bb) in enumerate(((vv, t, p), (q, vv, p), (p, vv, t), (p, q, vv), (t, p, vv), (vv, p, q))):
        sel = i == k
        out[sel, 0] = rr[sel]; out[sel, 1] = gg[sel]; out[sel, 2] = bb[sel]
    return out

res = im.copy()
# rouge -> bleu moyen (saturation un peu reduite, luminosite conservee : les ombres restent des ombres)
v = mx[red]
hb = np.full(v.shape, BLUE_H)
res[red] = hsv2rgb(hb, np.clip(s[red] * 0.78, 0, 1), np.clip(v * 0.92 + 0.06, 0, 1))
# blanc -> gris clair : valeur ramenee de [0.5..1] vers [0.54..0.87], teinte froide tres legere
v = mx[white]
vn = 0.54 + (np.clip(v, 0.5, 1.0) - 0.5) * (0.87 - 0.54) / 0.5
res[white] = hsv2rgb(np.full(v.shape, GREY_TINT_H), np.full(v.shape, 0.07), vn)
res[key] = im[key]
Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst)
print('rouge', int(red.sum()), 'px ; blanc', int(white.sum()), 'px ->', dst)
