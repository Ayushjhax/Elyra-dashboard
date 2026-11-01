#!/usr/bin/env bash
# Final mux: keeps Remotion's H.264 video stream untouched and encodes the AAC
# straight from the 24-bit master WAV, trimmed to exactly 20.000 s (AAC frame
# padding otherwise leaves the container at ~20.011 s).
# Usage: scripts/finalize.sh [film.mp4]
set -euo pipefail
FILM="${1:-../../output/teaser-20s/elyra-teaser-20s-16x9.mp4}"
TMP="$(mktemp -d)/final.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$FILM" -i public/audio/elyra-teaser-mix.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 -t 20 -movflags +faststart "$TMP"
mv "$TMP" "$FILM"
ffprobe -v error -show_entries stream=codec_type,duration,nb_frames:format=duration -of compact "$FILM"
