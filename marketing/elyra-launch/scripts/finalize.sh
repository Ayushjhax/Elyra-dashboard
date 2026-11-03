#!/usr/bin/env bash
# Final mux. Keeps Remotion's H.264 stream untouched and encodes stereo AAC
# (48 kHz, 320 kb/s) straight from the 24-bit master WAV, trimmed to exactly
# 43.333 s (2,600 frames) — AAC frame padding would otherwise push the
# container past the picture.
# Usage: scripts/finalize.sh [video-only.mp4] [film.mp4]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:-out/video-only.mp4}"
FILM="${2:-../../output/launch-video-45s/elyra-launch-45s-16x9.mp4}"
WAV=public/audio/elyra-launch-mix.wav
ffmpeg -hide_banner -loglevel error -y -i "$SRC" -i "$WAV" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 -ac 2 -t 43.333333 \
  -movflags +faststart "$FILM"
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels,duration,nb_frames:format=duration -of compact "$FILM"
