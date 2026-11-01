#!/usr/bin/env bash
# Quality-controls the rendered film: container/stream specs, exact frame
# count, audio loudness and true peak, and frames pulled from the encode
# itself (full size and a 640×360 social-feed size).
# Usage: scripts/qc.sh path/to/film.mp4 out/qc
set -euo pipefail
FILM="$1"
OUT="${2:-out/qc}"
mkdir -p "$OUT/full" "$OUT/small"

echo "== streams"
ffprobe -v error -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels,duration,color_space,color_primaries,color_transfer \
  -of default=noprint_wrappers=1 "$FILM"
echo "== decoded video frames"
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$FILM"
echo "== format duration"
ffprobe -v error -show_entries format=duration,size,bit_rate -of default=noprint_wrappers=1 "$FILM"
echo "== loudness (EBU R128) and true peak of the encoded audio"
ffmpeg -hide_banner -nostats -i "$FILM" -map 0:a -filter_complex "ebur128=peak=true" -f null - 2>&1 | grep -A 12 "Summary:"

# Frames from the encode: each scene, and both sides of each major cut.
for f in 0 50 99 100 113 160 199 200 220 300 330 399 400 412 450 520 575 600 625 650 700 725 750 775 799 800 850 876 899 900 930 965 999 1000 1100 1199; do
  ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "select=eq(n\,$f)" -vframes 1 "$OUT/full/f$(printf %04d "$f").png"
done
ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "scale=640:360:flags=lanczos,fps=4" "$OUT/small/s%03d.png"
echo "frames written to $OUT"
