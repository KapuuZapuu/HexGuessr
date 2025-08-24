# png2svg.py
from PIL import Image
import sys

inp, outp = sys.argv[1], sys.argv[2]
img = Image.open(inp).convert("RGBA")
w, h = img.size
px = img.load()

# Map color -> list of rects (x, y, width, height)
layers = {}

for y in range(h):
    x = 0
    while x < w:
        r, g, b, a = px[x, y]
        if a == 0:
            x += 1
            continue
        color = f"#{r:02x}{g:02x}{b:02x}"
        # start run
        x0 = x
        while x < w:
            r2, g2, b2, a2 = px[x, y]
            if a2 == 0 or (r2, g2, b2) != (r, g, b):
                break
            x += 1
        run_w = x - x0
        layers.setdefault(color, []).append((x0, y, run_w, 1))

# write svg
with open(outp, "w") as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">\n')
    for color, rects in layers.items():
        f.write(f'  <g fill="{color}">\n')
        for x0, y0, rw, rh in rects:
            f.write(f'    <rect x="{x0}" y="{y0}" width="{rw}" height="{rh}"/>\n')
        f.write('  </g>\n')
    f.write('</svg>\n')