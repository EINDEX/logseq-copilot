#!/usr/bin/env bash
# Builds, signs and exports the Mac App Store package of the Safari app
# (safari/). With --upload it also uploads the build to App Store Connect.
# It never submits a build for review.
#
# Runs on the maintainer's Mac only. Signing details come from files and
# environment variables on that Mac, never from the repository. See
# safari/README.md.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: pnpm release:safari [--upload]

  (no option)  Build the extension, archive and sign the app, export the .pkg.
  --upload     Also upload the build to App Store Connect. It is not
               submitted for review.

Environment (optional):
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
      App Store Connect API key. Set all three or none. Without them, the
      Apple account signed in to Xcode is used.
  SAFARI_BUILD_NUMBER
      Build number to use instead of the UTC time (YYYYMMDD.HHMM).
EOF
}

upload=false
for arg in "$@"; do
  case "$arg" in
    --upload) upload=true ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

fail() {
  printf 'error: %s\n' "$1" >&2
  shift
  for line in "$@"; do printf '       %s\n' "$line" >&2; done
  exit 1
}

root=$(cd "$(dirname "$0")/.." && pwd)
safari="$root/safari"
project="$safari/LogseqCopilot.xcodeproj"
signing="$safari/Config/Signing.local.xcconfig"

# --- Signing team ----------------------------------------------------------
if [[ ! -f "$signing" ]]; then
  fail "safari/Config/Signing.local.xcconfig is missing." \
    "Create it from the example and set your Apple team ID:" \
    "  cp safari/Config/Signing.local.xcconfig.example safari/Config/Signing.local.xcconfig" \
    "The file is git-ignored. See safari/README.md."
fi
if ! grep -Eq '^[[:space:]]*DEVELOPMENT_TEAM[[:space:]]*=[[:space:]]*[A-Z0-9]{10}[[:space:]]*$' "$signing"; then
  fail "safari/Config/Signing.local.xcconfig has no DEVELOPMENT_TEAM." \
    "Add a line like: DEVELOPMENT_TEAM = <your 10-character team ID>" \
    "The team ID is under Membership details at https://developer.apple.com/account."
fi

# --- App Store Connect authentication --------------------------------------
auth=(-allowProvisioningUpdates)
set_count=0
for name in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do
  [[ -n "${!name:-}" ]] && set_count=$((set_count + 1))
done
if [[ $set_count -eq 3 ]]; then
  key_path="${ASC_KEY_PATH/#\~/$HOME}"
  [[ -f "$key_path" ]] || fail "ASC_KEY_PATH does not point to a file." \
    "Download the .p8 key from App Store Connect > Users and Access > Integrations" \
    "and keep it outside the repository, for example in ~/.appstoreconnect/."
  key_dir=$(cd "$(dirname "$key_path")" && pwd)
  case "$key_dir/" in
    "$root"/*) fail "ASC_KEY_PATH is inside the repository. Move the .p8 key out of it." ;;
  esac
  auth+=(-authenticationKeyPath "$key_dir/$(basename "$key_path")"
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID")
  echo "Authenticating with the App Store Connect API key in ASC_KEY_PATH."
elif [[ $set_count -eq 0 ]]; then
  echo "ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH are not set."
  echo "Using the Apple account signed in to Xcode (Xcode > Settings > Accounts)."
else
  fail "Set all three of ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH, or none of them."
fi

# --- Versions ----------------------------------------------------------------
version=$(node -p "require(process.argv[1]).version" "$root/package.json")
# App Store Connect needs a higher build number on every upload. The UTC time
# as YYYYMMDD.HHMM always grows and does not depend on the git history.
build="${SAFARI_BUILD_NUMBER:-$(date -u +%Y%m%d.%H%M)}"
[[ "$build" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]] ||
  fail "SAFARI_BUILD_NUMBER must be one to three dot-separated integers, got '$build'."

out="$safari/build/$version-$build"
archive="$out/LogseqCopilot.xcarchive"
mkdir -p "$out"

xcodebuild_or_explain() {
  if ! xcodebuild "$@"; then
    fail "xcodebuild failed. If the error is about signing or provisioning:" \
      "- Sign in to Xcode > Settings > Accounts with an account in the team" \
      "  named in safari/Config/Signing.local.xcconfig, or set ASC_KEY_ID," \
      "  ASC_ISSUER_ID and ASC_KEY_PATH (an Admin or App Manager key)." \
      "- Register the bundle IDs me.eindex.logseq-copilot and" \
      "  me.eindex.logseq-copilot.extension, and create the app in App Store" \
      "  Connect, if this is the first release."
  fi
}

export_options() {
  cat >"$2" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>$1</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF
}

echo "==> Building the Safari extension"
(cd "$root" && pnpm build:safari)

echo "==> Archiving Logseq Copilot $version ($build)"
xcodebuild_or_explain archive \
  -project "$project" \
  -scheme "Logseq Copilot" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -archivePath "$archive" \
  -derivedDataPath "$safari/build/DerivedData" \
  -quiet \
  "${auth[@]}" \
  MARKETING_VERSION="$version" \
  CURRENT_PROJECT_VERSION="$build"

echo "==> Exporting the App Store package"
export_options export "$out/ExportOptions.plist"
xcodebuild_or_explain -exportArchive \
  -archivePath "$archive" \
  -exportPath "$out/export" \
  -exportOptionsPlist "$out/ExportOptions.plist" \
  -quiet \
  "${auth[@]}"

pkg=$(find "$out/export" -maxdepth 1 -name '*.pkg' -print -quit)
[[ -n "$pkg" ]] || fail "The export finished but no .pkg is in $out/export."
echo "Archive: $archive"
echo "Package: $pkg"

if $upload; then
  echo "==> Uploading to App Store Connect"
  export_options upload "$out/ExportOptions-upload.plist"
  xcodebuild_or_explain -exportArchive \
    -archivePath "$archive" \
    -exportPath "$out/upload" \
    -exportOptionsPlist "$out/ExportOptions-upload.plist" \
    -quiet \
    "${auth[@]}"
  echo "Uploaded Logseq Copilot $version ($build). It is not submitted for review:"
  echo "submit it in App Store Connect when it has finished processing."
else
  echo "Not uploaded. Run 'pnpm release:safari --upload' to upload this kind of build."
fi
