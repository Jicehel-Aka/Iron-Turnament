#!/usr/bin/env python3
"""
 recolor_portrait_kenji.py — Aligne le portrait de Kenji sur la planche : kimono gris clair,
 bandeau et gants bleu moyen. Usage : python3 tools/recolor_portrait_kenji.py [entree.jpg] [sortie.jpg]
 Masques doux (pas de halo sur les contours) ; peau, cheveux, ceinture et fond inchanges.
"""
import sys
import numpy as np
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else 'assets_src/portraits/kenji.jpg'
dst = sys.argv[2] if len(sys.argv) > 2 else src
im = np.array(Image.open(src).convert('RGB')).astype(np.float64) / 255.0
r, g, b = im[..., 0], im[..., 1], im[..., 2]
mx, mn = im.max(2), im.min(2)
d = mx - mn
s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0.0)
h = np.zeros_like(mx)
m = d > 1e-6
rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
h[rm] = ((g - b)[rm] / d[rm]) % 6; h[gm] = (b - r)[gm] / d[gm] + 2; h[bm] = (r - g)[bm] / d[bm] + 4
h = (h * 60.0) % 360.0

def ramp(x, a, b_):            # 0 sous a, 1 au-dessus de b_ (lisse)
    t = np.clip((x - a) / (b_ - a), 0, 1)
    return t * t * (3 - 2 * t)

# Kimono : peu sature et clair (le fond bleu nuit est sombre -> exclu par la luminosite)
w_white = (1 - ramp(s, 0.10, 0.26)) * ramp(mx, 0.45, 0.60)
# Bleu sature du bandeau/gants (teinte 200-260) -> bleu moyen, un peu moins sature
w_blue = ramp(s, 0.45, 0.60) * ramp(mx, 0.30, 0.42) * (1 - ramp(abs(h - 228), 32, 48))

def hsv2rgb(hh, ss, vv):
    i = np.floor(hh * 6.0).astype(int) % 6
    f = hh * 6.0 - np.floor(hh * 6.0)
    p = vv * (1 - ss); q = vv * (1 - f * ss); t = vv * (1 - (1 - f) * ss)
    out = np.zeros(hh.shape + (3,))
    for k, (rr, gg, bb) in enumerate(((vv, t, p), (q, vv, p), (p, vv, t), (p, q, vv), (t, p, vv), (vv, p, q))):
        sel = i == k
        out[sel, 0] = rr[sel]; out[sel, 1] = gg[sel]; out[sel, 2] = bb[sel]
    return out

# gris clair legerement froid : valeur [0.45..1] -> [0.50..0.86]
vg = 0.50 + (np.clip(mx, 0.45, 1.0) - 0.45) * (0.86 - 0.50) / 0.55
grey = hsv2rgb(np.full(mx.shape, 215 / 360), np.full(mx.shape, 0.07), vg)
# bleu moyen (#3B82CE ~ teinte 213) : saturation reduite, luminosite relevee
mb = hsv2rgb(np.full(mx.shape, 213 / 360), np.clip(s * 0.72, 0, 1), np.clip(mx * 0.95 + 0.08, 0, 1))

res = im * (1 - w_white[..., None]) + grey * w_white[..., None]
res = res * (1 - w_blue[..., None]) + mb * w_blue[..., None]
Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst, quality=95)
print('ok ->', dst)
