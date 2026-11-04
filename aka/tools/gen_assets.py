#!/usr/bin/env python3
"""
 gen_assets.py — Assets d'Iron Tournament AKA (portraits, decors, ecran-titre)

 Source : assets_src/  (les JPG du prototype web, tels quels)
 Sortie : main/assets/portraits.bin   6 x 64x64        BGR565
          main/assets/stages.bin      6 x 360x176      BGR565  (360 px : 40 px de parallaxe)
          main/assets/title.bin       320x240          BGR565  (via gen_title.py)
          assets_src/title.png        ecran-titre (genere)
          sd/IRONTOURNAMENT/Picture.png, screen.bmp   (160x120, 24 bits, comme Galaxy Fighter)

 Format BGR565 little-endian, ligne par ligne : l'ecran de la AKA est en BGR565,
 le ROUGE est sur les bits BAS (cf. gen_title.py).
 L'ORDRE des fichiers est celui de l'enum FighterId du jeu :
 kenji, krowen, meilin, titan, nyxia, malakor.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC    = os.path.join(ROOT, 'assets_src')
OUT    = os.path.join(ROOT, 'main', 'assets')
SD     = os.path.join(ROOT, 'sd', 'IRONTOURNAMENT')

ORDER  = ['kenji', 'krowen', 'meilin', 'titan', 'nyxia', 'malakor']
STAGES = ['kyoto_dojo', 'obsidian_pit', 'hk_harbor', 'siberia_foundry',
          'atacama_sanctuary', 'brass_citadel']      # un decor par combattant, meme ordre

PORTRAIT = 64
STAGE_W, STAGE_H = 360, 176


def to_bgr565(im):
    a = np.asarray(im.convert('RGB'), dtype=np.uint16)
    r = (a[:, :, 0] >> 3) & 0x1F
    g = (a[:, :, 1] >> 2) & 0x3F
    b = (a[:, :, 2] >> 3) & 0x1F
    return ((b << 11) | (g << 5) | r).astype('<u2')


def cover(im, w, h):
    """Redimensionne en remplissant (w,h), recadre au centre."""
    sx, sy = w / im.width, h / im.height
    s = max(sx, sy)
    nw, nh = max(w, round(im.width * s)), max(h, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    l, t = (nw - w) // 2, (nh - h) // 2
    return im.crop((l, t, l + w, t + h))


def make_portraits():
    blob = bytearray()
    for n in ORDER:
        im = cover(Image.open(f'{SRC}/portraits/{n}.jpg'), PORTRAIT, PORTRAIT)
        blob += to_bgr565(im).tobytes()
    open(f'{OUT}/portraits.bin', 'wb').write(blob)
    print(f'portraits.bin : {len(blob)} octets ({len(ORDER)} x {PORTRAIT}x{PORTRAIT})')


def make_stages():
    blob = bytearray()
    for n in STAGES:
        im = cover(Image.open(f'{SRC}/stages/{n}.jpg'), STAGE_W, STAGE_H)
        blob += to_bgr565(im).tobytes()
    open(f'{OUT}/stages.bin', 'wb').write(blob)
    print(f'stages.bin    : {len(blob)} octets ({len(STAGES)} x {STAGE_W}x{STAGE_H})')


def make_title():
    bg = cover(Image.open(f'{SRC}/stages/brass_citadel.jpg'), 320, 240)
    bg = ImageEnhance.Brightness(bg).enhance(0.55)
    d = ImageDraw.Draw(bg, 'RGBA')

    # bandeau sombre derriere le titre, lisible quelle que soit l'image
    d.rectangle((0, 22, 320, 96), fill=(8, 6, 16, 170))
    d.rectangle((0, 22, 320, 23), fill=(240, 176, 64, 255))
    d.rectangle((0, 95, 320, 96), fill=(240, 176, 64, 255))

    fpath = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
    if not os.path.exists(fpath):
        fpath = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    big, mid = ImageFont.truetype(fpath, 34), ImageFont.truetype(fpath, 15)

    def centered(y, text, font, fill, shadow=(0, 0, 0, 255)):
        w = d.textlength(text, font=font)
        x = (320 - w) / 2
        d.text((x + 2, y + 2), text, font=font, fill=shadow)
        d.text((x, y), text, font=font, fill=fill)

    centered(26, 'IRON', big, (240, 176, 64, 255))
    centered(56, 'TOURNAMENT', mid, (238, 238, 232, 255))
    centered(75, 'GAMEBUINO AKA', ImageFont.truetype(fpath, 10), (146, 150, 166, 255))

    # les six maitres en bas
    accents = [(56, 189, 248), (249, 115, 22), (52, 211, 153),
               (239, 68, 68), (34, 211, 238), (192, 132, 252)]
    sz, gap = 44, 8
    x0 = (320 - (6 * sz + 5 * gap)) // 2
    for i, n in enumerate(ORDER):
        p = cover(Image.open(f'{SRC}/portraits/{n}.jpg'), sz, sz)
        x, y = x0 + i * (sz + gap), 170
        d.rectangle((x - 2, y - 2, x + sz + 1, y + sz + 1), fill=accents[i] + (255,))
        bg.paste(p, (x, y))

    bg.save(f'{SRC}/title.png')
    os.system(f'python3 "{ROOT}/tools/gen_title.py" "{SRC}/title.png" "{OUT}/title.bin"')

    # catalogue web + ecran du loader (160x120, 24 bits : meme format que Galaxy Fighter)
    os.makedirs(SD, exist_ok=True)
    bg.save(f'{SD}/Picture.png')
    bg.resize((160, 120), Image.LANCZOS).convert('RGB').save(f'{SD}/screen.bmp')
    print('Picture.png + screen.bmp ->', SD)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make_portraits()
    make_stages()
    make_title()
