#!/bin/zsh
set -euo pipefail
poster_dir="${0:A:h}"
chromium_bin="/Users/ayush/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
if [[ ! -f "$poster_dir/elyra-solana-metallic-art.png" ]]; then
  print -u2 -- "Missing background: $poster_dir/elyra-solana-metallic-art.png"
  exit 1
fi
"$chromium_bin" --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=3840,2160 --virtual-time-budget=8000 --screenshot="$poster_dir/elyra-solana-metallic.png" "file://$poster_dir/elyra-solana-metallic.html"
