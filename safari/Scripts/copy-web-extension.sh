#!/bin/sh
# Build phase of the "Logseq Copilot Extension" target: copies the output of
# `pnpm build:safari` into the extension's Resources, so the web extension
# files are never committed under safari/.
set -eu

src="${SRCROOT}/../.output/safari-mv3"
dest="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"

if [ ! -f "${src}/manifest.json" ]; then
  echo "error: ${src}/manifest.json not found. Run 'pnpm build:safari' in the repository root first."
  exit 1
fi

mkdir -p "${dest}"
# --delete drops chunks left over from an earlier build. This target has no
# other resources, so nothing else lives in this folder.
rsync -a --delete "${src}/" "${dest}/"
