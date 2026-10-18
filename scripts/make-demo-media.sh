#!/usr/bin/env bash
# Converts the newest .screenshots/demo/*.webm into docs/media/demo.mp4 (LinkedIn) and demo.gif (README, <= ~5 MB).
set -euo pipefail
cd "$(dirname "$0")/.."
src=$(ls -t .screenshots/demo/*.webm | head -1)
mkdir -p docs/media
ffmpeg -y -loglevel error -ss "${TRIM_START:-0}" -i "$src" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart -an docs/media/demo.mp4
ffmpeg -y -loglevel error -ss "${TRIM_START:-0}" -i "$src" -vf "fps=${GIF_FPS:-12},scale=${GIF_WIDTH:-800}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" docs/media/demo.gif
ls -l docs/media
