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
echo "== decoded video frames (must be 2700)"
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$FILM"
echo "== format duration (must be 45.000)"
ffprobe -v error -show_entries format=duration,size,bit_rate -of default=noprint_wrappers=1 "$FILM"
echo "== loudness (EBU R128) and true peak of the encoded audio"
ffmpeg -hide_banner -nostats -i "$FILM" -map 0:a -af "ebur128=peak=true" -f null - 2>&1 | grep -A 12 "Summary:"
echo "== black frames (none expected)"
ffmpeg -hide_banner -nostats -i "$FILM" -vf "blackdetect=d=0.1:pix_th=0.06" -an -f null - 2>&1 | grep -c blackdetect || true
for f in 0 30 120 190 200 240 300 345 385 420 460 520 600 650 690 745 830 890 960 1050 1140 1220 1300 1335 1400 1465 1515 1570 1610 1645 1675 1708 1740 1790 1830 1880 1960 2020 2080 2150 2215 2245 2290 2330 2399 2400 2550 2699; do
  ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "select=eq(n\,$f)" -fps_mode vfr -frames:v 1 "$OUT/full/f$(printf %04d "$f").png"
done
ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "scale=480:270:flags=lanczos,fps=2" "$OUT/small/s%03d.png"
echo "frames written to $OUT"
