#!/usr/bin/env python3
"""Generate the Open Pedigree desktop icon.

Draws the two canonical pedigree symbols — a square (male) linked to a circle
(female) by a marriage line, with a descent line to a child square — on a
rounded teal tile. Emits a 1024px master PNG plus a multi-size .ico that
electron-builder embeds into the Windows exe/installer.
"""
import os
from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded background tile (PhenoTips-ish teal gradient, faked with two rounded rects).
bg_radius = int(S * 0.18)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=bg_radius, fill=(19, 78, 94, 255))
d.rounded_rectangle([0, 0, S - 1, int(S * 0.62)], radius=bg_radius, fill=(24, 103, 122, 255))

# Geometry for the little three-node pedigree.
stroke = (255, 255, 255, 255)
lw = int(S * 0.028)
sym = int(S * 0.20)            # symbol size (square side / circle diameter)
cy = int(S * 0.36)            # parents' row centre-y
male_cx = int(S * 0.31)
female_cx = int(S * 0.69)
child_cx = int(S * 0.50)
child_cy = int(S * 0.70)

def square(cx, cy, size, fill=None):
    half = size // 2
    d.rectangle([cx - half, cy - half, cx + half, cy + half],
                outline=stroke, width=lw, fill=fill)

def circle(cx, cy, size, fill=None):
    half = size // 2
    d.ellipse([cx - half, cy - half, cx + half, cy + half],
              outline=stroke, width=lw, fill=fill)

# Marriage line (parents) + descent line (drawn under the symbols).
d.line([male_cx + sym // 2, cy, female_cx - sym // 2, cy], fill=stroke, width=lw)
mid_x = (male_cx + female_cx) // 2
d.line([mid_x, cy, mid_x, child_cy - sym // 2], fill=stroke, width=lw)

# Symbols: father (filled), mother (open), child (accent-filled).
square(male_cx, cy, sym, fill=(255, 255, 255, 255))   # filled male
circle(female_cx, cy, sym, fill=None)                 # open female
square(child_cx, child_cy, sym, fill=(120, 214, 198, 255))  # accent child

# Recolour father's outline vs fill contrast: redraw its border so it reads on white fill.
square(male_cx, cy, sym, fill=None)

out_dir = os.path.dirname(os.path.abspath(__file__))
png_path = os.path.join(out_dir, "icon.png")
ico_path = os.path.join(out_dir, "icon.ico")
img.save(png_path)

# Multi-resolution .ico for crisp taskbar/installer rendering.
sizes = [16, 24, 32, 48, 64, 128, 256]
img.save(ico_path, sizes=[(s, s) for s in sizes])
print("wrote", png_path, "and", ico_path, "sizes", sizes)
