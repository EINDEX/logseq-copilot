#!/usr/bin/env bash
# Download and extract a Logseq desktop AppImage for integration tests.
#
# Usage: scripts/download-logseq.sh <file|db> [version] [dest-dir]
#   file -> Logseq file-graph release (0.10.x)
#   db   -> Logseq DB-graph release (2.x)
#
# Prints the path to the extracted executable on the last line of stdout.
set -euo pipefail

VARIANT="${1:?variant (file|db) is required}"
case "$VARIANT" in
  file)
    VERSION="${2:-0.10.15}"
    ASSET="Logseq-linux-x64-${VERSION}.AppImage"
    ;;
  db)
    VERSION="${2:-2.0.2}"
    ASSET="Logseq-linux-x86_64-${VERSION}.AppImage"
    ;;
  *)
    echo "unknown variant: $VARIANT" >&2
    exit 1
    ;;
esac

DEST="${3:-.logseq-bin}/${VARIANT}-${VERSION}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

if [ ! -d "$DEST/squashfs-root" ]; then
  URL="https://github.com/logseq/logseq/releases/download/${VERSION}/${ASSET}"
  echo "Downloading $URL" >&2
  curl -fsSL --retry 3 -o "$DEST/logseq.AppImage" "$URL"
  chmod +x "$DEST/logseq.AppImage"
  # Extract instead of mounting so FUSE is not needed on CI runners.
  (cd "$DEST" && ./logseq.AppImage --appimage-extract >/dev/null)
  rm "$DEST/logseq.AppImage"
fi

# The executable is `Logseq` in 0.10.x and `logseq` in 2.x.
find "$DEST/squashfs-root" -maxdepth 1 -type f -iname logseq | head -n 1
