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
  "0385:ask-shortcuts-dictation" "0430:ask-question" "0520:evidence-headline" "0650:answer-with-sources"
  "0690:answer-sources-macro" "0765:capital-context" "0835:capital-memory" "0890:portfolio-surfaces"
  "0960:connections-read-only" "1040:signals" "1150:smart-money-consensus" "1225:report-query"
  "1300:nvidia-report" "1340:report-pdf" "1400:backtest" "1465:backtest-compare" "1570:prediction-markets"
  "1645:research-tabs-signals" "1708:research-tabs-unlocks" "1790:sec-insider-activity" "1830:prepare-your-move"
  "1960:you-stay-in-control" "2020:receive" "2080:decision-brief-watch-next" "2150:set-the-condition"
  "2245:notification-preferences" "2290:account" "2450:live-on-solana-dapp-store"
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
