"""Builds a labelled contact sheet from rendered stills. Usage: python3 -I scripts/contact.py OUT.png COLS STILL...  """
import sys, os
from PIL import Image, ImageDraw, ImageFont
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
w, h = 640, 360
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w + (cols + 1) * 12, rows * (h + 34) + 12), (16, 23, 16))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype(os.path.join(os.path.dirname(__file__), "..", "public", "fonts", "GeneralSans-Medium.otf"), 20)
except Exception:
    font = ImageFont.load_default()
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h), Image.LANCZOS)
    x = 12 + (i % cols) * (w + 12)
    y = 12 + (i // cols) * (h + 34)
    sheet.paste(im, (x, y))
    d.text((x, y + h + 6), os.path.basename(f).replace(".png", ""), fill=(184, 186, 168), font=font)
sheet.save(out, quality=90)
print(out, sheet.size)
