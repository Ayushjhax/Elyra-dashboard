"""QC for the soundtrack: per-bar loudness, onsets vs cues, spectrogram PNG.
Usage: python3 -I audio/analyze.py MIX.wav OUT.png"""
import json, os, sys
import numpy as np, soundfile as sf
from scipy import signal
from PIL import Image, ImageDraw
SR = 48000
mix, sr = sf.read(sys.argv[1]); assert sr == SR
m = mix.mean(1)
for b in range(12):
    seg = mix[b*80000:(b+1)*80000]
    print(f"bar {b+1:2d}  rms {20*np.log10(np.sqrt((seg**2).mean())+1e-9):6.1f} dBFS  peak {20*np.log10(np.abs(seg).max()+1e-9):5.1f}")
f, t, S = signal.spectrogram(m, SR, nperseg=2048, noverlap=1536)
S = 10*np.log10(S+1e-12)
logf = np.geomspace(30, 16000, 360)
S = S[np.searchsorted(f, logf).clip(0, len(f)-1)][::-1]
S = np.clip((S-(S.max()-80))/80, 0, 1)
W = 1600
im = Image.fromarray((S*255).astype(np.uint8)).resize((W, 360))
im = Image.merge('RGB', (im.point(lambda v: int(v*0.55)), im, im.point(lambda v: int(v*0.4))))
c = Image.new('RGB', (W, 520), (16, 23, 16)); c.paste(im, (0, 0)); d = ImageDraw.Draw(c)
env = np.abs(m).reshape(W, -1).max(1)
for x, v in enumerate(env): d.line([(x, 450-v*60), (x, 450+v*60)], fill=(210, 220, 118))
for fr in [100, 200, 400, 600, 800, 900, 1000]:
    x = fr/1200*W; d.line([(x, 0), (x, 520)], fill=(247, 248, 234)); d.text((x+3, 365), str(fr), fill=(247, 248, 234))
c.save(sys.argv[2]); print(sys.argv[2])
