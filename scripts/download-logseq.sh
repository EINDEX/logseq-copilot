#!/usr/bin/env bash
# Download and extract a Logseq desktop release for integration / E2E tests.
#
# Usage: scripts/download-logseq.sh <file|db> [version] [dest-dir]
#   file -> Logseq file-graph release (0.10.x)
#   db   -> Logseq DB-graph release (2.x)
#
# Linux: the AppImage, extracted (no FUSE needed).
# macOS: the .zip build, extracted to <dest-dir>/<variant>-<version>/Logseq.app.
#        Kept apart from /Applications so it never touches an installed Logseq.
#
# Prints the path to the extracted executable on the last line of stdout.
set -euo pipefail

VARIANT="${1:?variant (file|db) is required}"
case "$VARIANT" in
  file) VERSION="${2:-0.10.15}" ;;
  db) VERSION="${2:-2.0.2}" ;;
  *)
    echo "unknown variant: $VARIANT" >&2
    exit 1
    ;;
esac

DEST="${3:-.logseq-bin}/${VARIANT}-${VERSION}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
BASE_URL="https://github.com/logseq/logseq/releases/download/${VERSION}"

if [ "$(uname -s)" = "Darwin" ]; then
  case "$(uname -m)" in
    arm64) ARCH=arm64 ;;
    *) ARCH=x64 ;;
  esac
  if [ ! -d "$DEST/Logseq.app" ]; then
    URL="${BASE_URL}/Logseq-darwin-${ARCH}-${VERSION}.zip"
    echo "Downloading $URL" >&2
    curl -fsSL --retry 3 -o "$DEST/logseq.zip" "$URL"
    # ditto keeps the framework symlinks that a plain unzip may break.
    ditto -x -k "$DEST/logseq.zip" "$DEST"
    rm "$DEST/logseq.zip"
  fi
  echo "$DEST/Logseq.app/Contents/MacOS/Logseq"
  exit 0
fi

case "$VARIANT" in
  file) ASSET="Logseq-linux-x64-${VERSION}.AppImage" ;;
  db) ASSET="Logseq-linux-x86_64-${VERSION}.AppImage" ;;
esac

if [ ! -d "$DEST/squashfs-root" ]; then
  URL="${BASE_URL}/${ASSET}"
  echo "Downloading $URL" >&2
  curl -fsSL --retry 3 -o "$DEST/logseq.AppImage" "$URL"
  chmod +x "$DEST/logseq.AppImage"
  # Extract instead of mounting so FUSE is not needed on CI runners.
  (cd "$DEST" && ./logseq.AppImage --appimage-extract >/dev/null)
  rm "$DEST/logseq.AppImage"
fi

# The executable is `Logseq` in 0.10.x and `logseq` in 2.x.
find "$DEST/squashfs-root" -maxdepth 1 -type f -iname logseq | head -n 1
