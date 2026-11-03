#!/usr/bin/env bash
# Representative stills and a contact sheet, pulled from the delivered encode.
set -euo pipefail
cd "$(dirname "$0")/.."
FILM="${1:-../../output/launch-video-45s/elyra-launch-45s-16x9.mp4}"
DIR=../../output/launch-video-45s/stills
mkdir -p "$DIR"
rm -f "$DIR"/*.jpg
NAMES=(
  "0030:hook-look-past-the-price" "0140:reveal-a-terminal-in-your-hand" "0245:ask-attach"
  "0285:ask-shortcuts-dictation" "0340:ask-question" "0410:ask-working" "0475:intelligence-with-evidence"
  "0570:answer" "0635:answer-sources" "0730:capital-in-context" "0880:read-only-by-design"
  "1010:a-quiet-market" "1110:smart-money-consensus" "1220:smart-money-detail" "1340:reports-pdf"
  "1440:backtest-trace" "1492:compare" "1540:prediction-markets" "1576:market-recap"
  "1612:signals" "1648:yield" "1686:unlocks" "1726:sec-insiders"
  "1790:eight-research-tools" "1870:prepare-your-move" "2020:you-stay-in-control" "2130:set-the-condition"
  "2210:tells-you-never-trades" "2270:handset-returns" "2350:live-on-solana-dapp-store" "2590:end-frame"
)
LIST=()
for e in "${NAMES[@]}"; do
  f=${e%%:*}; n=${e##*:}
  out="$DIR/${f}-${n}.jpg"
  ffmpeg -hide_banner -loglevel error -y -i "$FILM" -vf "select=eq(n\,$((10#$f)))" -fps_mode vfr -frames:v 1 -q:v 2 "$out"
  LIST+=("$out")
done
ARGS=(); FILT=""; i=0
for p in "${LIST[@]}"; do ARGS+=(-i "$p"); FILT+="[$i:v]scale=480:270[v$i];"; i=$((i+1)); done
LAYOUT=""; for ((j=0;j<i;j++)); do LAYOUT+="$(( (j%4)*480 ))_$(( (j/4)*270 ))|"; done
ffmpeg -hide_banner -loglevel error -y "${ARGS[@]}" -filter_complex "${FILT}$(for ((j=0;j<i;j++)); do printf "[v$j]"; done)xstack=inputs=$i:layout=${LAYOUT%|}:fill=black" -q:v 3 ../../output/launch-video-45s/contact-sheet.jpg
echo "stills: $DIR ($i) · contact sheet: output/launch-video-45s/contact-sheet.jpg"
