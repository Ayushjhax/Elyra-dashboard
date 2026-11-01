#!/usr/bin/env bash
# Pulls representative stills for all seven scenes, plus both sides of the
# three signature cuts, from the FINAL encode (not from a separate still
# render), and builds the labelled contact sheet.
# Usage: scripts/deliver-stills.sh [film.mp4] [outdir]
set -euo pipefail
FILM="${1:-../../output/teaser-20s/elyra-teaser-20s-16x9.mp4}"
OUT="${2:-../../output/teaser-20s/stills}"
mkdir -p "$OUT"
rm -f "$OUT"/*.jpg
declare -A NAME=(
  [30]="s1-markets-move" [160]="s2-move-with-clarity" [330]="s3-ask-elyra" [450]="s4-all-your-capital"
  [520]="s4-liquidation-headroom" [625]="s5-signals" [675]="s5-smart-money" [725]="s5-research"
  [775]="s5-alerts" [840]="s6-swap-review" [876]="s6-wallet-approval" [965]="s6-product-vision"
  [1100]="s7-hero"
  [99]="cut-099-candle-to-rail-before" [100]="cut-100-candle-to-rail-after"
  [399]="cut-399-rail-to-cap-before" [412]="cut-412-rail-to-cap-after"
  [999]="cut-999-lockup-before" [1000]="cut-1000-lockup-landed"
)
for f in $(printf '%s\n' "${!NAME[@]}" | sort -n); do
  ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "select=eq(n\,$f)" -vframes 1 -q:v 2 \
    "$OUT/$(printf %04d "$f")-${NAME[$f]}.jpg"
done
python3 -I scripts/contact.py "$OUT/../contact-sheet.jpg" 4 $(ls "$OUT"/*.jpg | grep -v cut-)
ls -la "$OUT"
