#!/usr/bin/env bash
# Muxes the 24-bit WAV master as AAC onto the silent H.264 render, trimmed to
# exactly 2,000 frames (33.333 s), with the moov atom first for streaming.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="../../output/paper-trading/elyra-paper-trading-1080p.mp4"
mkdir -p "$(dirname "$OUT")"
ffmpeg -loglevel error -y -i out/video-only.mp4 -i public/audio/paper-trading-mix.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -ar 48000 -ac 2 \
  -t 33.333333 -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels -show_entries format=duration,size,bit_rate -of compact "$OUT"
echo "wrote $OUT"
