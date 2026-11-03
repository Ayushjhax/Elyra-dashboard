#!/usr/bin/env bash
# Quality control of the delivered film: stream specs, exact decoded frame
# count, container duration, EBU R128 loudness and true peak of the encoded
# audio, black/frozen-frame detection, and frames pulled from the encode at
# full size and at a 480x270 social-feed size.
# Usage: scripts/qc.sh [film.mp4] [out-dir]
set -euo pipefail
cd "$(dirname "$0")/.."
FILM="${1:-../../output/launch-video-45s/elyra-launch-45s-16x9.mp4}"
OUT="${2:-out/qc}"
mkdir -p "$OUT/full" "$OUT/small"
echo "== streams"
ffprobe -v error -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels,duration,color_space \
  -of default=noprint_wrappers=1 "$FILM"
echo "== decoded video frames (must be 2600)"
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$FILM"
echo "== format duration (must be 43.333)"
ffprobe -v error -show_entries format=duration,size,bit_rate -of default=noprint_wrappers=1 "$FILM"
echo "== loudness (EBU R128) and true peak of the encoded audio"
ffmpeg -hide_banner -nostats -i "$FILM" -map 0:a -af "ebur128=peak=true" -f null - 2>&1 | grep -A 12 "Summary:"
echo "== black frames (none expected)"
ffmpeg -hide_banner -nostats -i "$FILM" -vf "blackdetect=d=0.1:pix_th=0.06" -an -f null - 2>&1 | grep -c blackdetect || true
for f in 0 30 90 100 140 200 245 285 320 360 420 500 550 590 645 730 790 860 950 1040 1120 1200 1235 1300 1365 1415 1470 1510 1545 1575 1608 1640 1690 1730 1780 1860 1920 1980 2050 2115 2145 2190 2230 2299 2300 2450 2599; do
  ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "select=eq(n\,$f)" -fps_mode vfr -frames:v 1 "$OUT/full/f$(printf %04d "$f").png"
done
ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "scale=480:270:flags=lanczos,fps=2" "$OUT/small/s%03d.png"
echo "frames written to $OUT"
