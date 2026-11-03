#!/usr/bin/env bash
# Representative stills and a contact sheet, pulled from the delivered encode.
set -euo pipefail
cd "$(dirname "$0")/.."
FILM="${1:-../../output/launch-video-45s/elyra-launch-45s-16x9.mp4}"
DIR=../../output/launch-video-45s/stills
mkdir -p "$DIR"
rm -f "$DIR"/*.jpg
NAMES=(
  "0030:hook-look-past-the-price" "0130:funding-oi-accent" "0240:reveal-a-terminal-in-your-hand" "0345:ask-attach"
  "0385:ask-shortcuts-dictation" "0440:ask-question" "0510:ask-working" "0575:intelligence-with-evidence"
  "0670:answer" "0735:answer-sources" "0830:capital-in-context" "0980:read-only-by-design"
  "1110:a-quiet-market" "1210:smart-money-consensus" "1320:smart-money-detail" "1440:reports-pdf"
  "1540:backtest-trace" "1592:compare" "1640:prediction-markets" "1676:market-recap"
  "1712:signals" "1748:yield" "1786:unlocks" "1826:sec-insiders"
  "1890:eight-research-tools" "1970:prepare-your-move" "2120:you-stay-in-control" "2230:set-the-condition"
  "2310:tells-you-never-trades" "2370:handset-returns" "2450:live-on-solana-dapp-store" "2690:end-frame"
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
