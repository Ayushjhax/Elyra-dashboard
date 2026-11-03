#!/usr/bin/env bash
# Prepare the stills the film uses from the Seeker captures.
#
# Every still is cropped to the conformed footage geometry (1200 x 2520: the
# raw 1200 x 2670 capture minus the 96 px status bar and 54 px gesture strip),
# so a still and its matching footage share one coordinate system.
#
# Personal details are blurred here, once, at the source:
#   receive.png    the wallet address, and the bottom half of the QR (the
#                  film frames only the top half; without its bottom-left
#                  finder pattern and half its modules the code cannot be
#                  decoded)
#   account.png    the truncated wallet address
#   referrals.png  the invite link and referral code
# Nothing else is altered. No figures, states or labels are repainted.
set -euo pipefail
cd "$(dirname "$0")/.."
KIT=../../output/launch-video-45s
OUT=public/stills
mkdir -p "$OUT"

crop() { # crop <src.png> <out-name>
  ffmpeg -y -loglevel error -i "$1" -vf "crop=1200:2520:0:96" "$OUT/$2.png"
}

# blur <name> <x:y:w:h> [<x:y:w:h> ...]  (coordinates in the cropped still)
blur() {
  local name=$1; shift
  local f="$OUT/$name.png" graph="[0:v]split=$(( $# + 1 ))[base]" i=0 chain=""
  for r in "$@"; do graph+="[s$i]"; i=$((i+1)); done
  graph+=";"
  i=0; local last="base"
  for r in "$@"; do
    IFS=: read -r x y w h <<<"$r"
    graph+="[s$i]crop=$w:$h:$x:$y,boxblur=22:3[b$i];[$last][b$i]overlay=$x:$y[o$i];"
    last="o$i"; i=$((i+1))
  done
  graph="${graph%;}"
  ffmpeg -y -loglevel error -i "$f" -filter_complex "$graph" -map "[$last]" "$f.tmp.png"
  mv "$f.tmp.png" "$f"
}

X=$KIT/captures-extra
O=$KIT/captures

crop $X/pulse-funding.png   pulse-funding
crop $X/pulse-oi.png        pulse-oi
crop $X/report-card.png     report-card
crop $X/report-top.png      report-top
crop $X/bt-curve1.png       bt-curve
crop $X/bt4.png             bt-compare
crop $X/rtab-Signals.png    research-signals
crop $X/rtab-SEC.png        research-sec
crop $X/sec-nvda1.png       sec-company
crop $X/sec-nvda3.png       sec-filings
crop $X/actions1.png        actions
crop $X/actions2.png        actions-steps
crop $X/receive1.png        receive
crop $X/inbox1.png          inbox
crop $X/notif-settings.png  notification-settings
crop $X/account1.png        account
crop $X/referrals1.png      referrals
crop $X/connections1.png    connections
crop $X/connections2.png    connections-exchanges
crop $X/cap-memory.png      capital-memory
crop $X/cap-history.png     capital-history
crop $X/yield-pools.png     yield-pools
crop $X/attach1.png         composer-attach
crop $X/slash1.png          composer-shortcuts
crop $O/04-portfolio.png          portfolio
crop $O/04-portfolio-details.png  portfolio-explore
crop $O/05-research-predictions.png research-predictions
crop $O/00-opened.png             research-recap
crop $O/01-sol-decision-brief.png decision-brief
crop $O/02-ask-answer.png         ask-answer
crop $O/07-smart-money-expanded.png smart-money

# Privacy.
blur receive "40:1250:1120:130" "280:870:640:330"
blur account "140:876:800:96"
blur referrals "150:1730:910:90" "500:2148:420:92"

# The research PDF, opened from the report, framed without the viewer app's
# toolbar, page indicator or edit button (third-party chrome).
ffmpeg -y -loglevel error -i $X/pdf3.png -vf "crop=1200:2040:0:260" "$OUT/pdf-cover.png"
ffmpeg -y -loglevel error -i $X/pdf4.png -vf "crop=1200:1600:0:960" "$OUT/pdf-page2.png"

ls "$OUT" | wc -l | xargs echo "stills prepared:"
