# Safari app

The Mac App Store app that carries the Safari version of Logseq Copilot. The
app only shows whether the extension is on and opens Safari's settings; the
extension is the output of `pnpm build:safari`.

Signing happens only on the maintainer's Mac. The team ID, certificates,
provisioning profiles and App Store Connect keys are never committed and are
not stored in GitHub. CI (`.github/workflows/safari.yml`) builds without
signing.

## Layout

| Path | What it is |
| --- | --- |
| `LogseqCopilot.xcodeproj` | Targets "Logseq Copilot" (`me.eindex.logseq-copilot`) and "Logseq Copilot Extension" (`me.eindex.logseq-copilot.extension`), shared scheme "Logseq Copilot" |
| `App/` | The app: window, page shown in it (`Resources/`), icons |
| `Extension/` | The Safari web extension handler |
| `Config/Base.xcconfig` | Settings for all targets: automatic signing, placeholder version numbers |
| `Config/Signing.local.xcconfig` | Git-ignored. Sets `DEVELOPMENT_TEAM` on this Mac |
| `Scripts/copy-web-extension.sh` | Build phase: copies `../.output/safari-mv3` into the extension |
| `build/` | Git-ignored. Archives and packages from `pnpm release:safari` |

The source files come from `xcrun safari-web-extension-converter --macos-only`.
Xcode 27's converter writes the new `project.xcproj` format, which Xcode 26
cannot open, so the project was generated once with XcodeGen in the
`project.pbxproj` format instead; CI builds it on the standard macOS runner,
which has Xcode 26. Edit the project in Xcode from now on. If Xcode offers to
convert it to the new format, decline. The app runs on macOS 12 and later.

The extension files are not in the project. The "Copy web extension" build
phase copies `.output/safari-mv3` into the extension's `Resources` on every
build, so **run `pnpm build:safari` before building in Xcode**. The build stops
with an error if that folder is missing.

The app icons come from `public/brand/thread.svg`:
`node scripts/build-brand-icons.mjs` renders them again.

## Version and build numbers

- `MARKETING_VERSION` (the version shown in the App Store) is the `version`
  in `package.json`.
- `CURRENT_PROJECT_VERSION` (the build number) is the UTC time of the release
  as `YYYYMMDD.HHMM`, for example `20261126.0930`. App Store Connect needs a
  higher build number on every upload; the time always grows, also when the
  same commit is uploaded again. Set `SAFARI_BUILD_NUMBER` to use another
  number.

`pnpm release:safari` passes both to `xcodebuild`. Builds from Xcode itself
use the placeholders in `Config/Base.xcconfig` (`0.0.0`, build `1`), so do not
upload from Xcode's Organizer.

## One-time setup

1. Sign in to Xcode > Settings > Accounts with an Apple ID in the team.
   Xcode creates the certificates and provisioning profiles it needs
   (automatic signing).
2. Create the local signing file and set the team ID (Membership details at
   <https://developer.apple.com/account>):

   ```sh
   cp safari/Config/Signing.local.xcconfig.example safari/Config/Signing.local.xcconfig
   # edit: DEVELOPMENT_TEAM = <your team ID>
   ```

3. In App Store Connect, create the macOS app with the bundle ID
   `me.eindex.logseq-copilot` (register it and `me.eindex.logseq-copilot.extension`
   under Certificates, Identifiers & Profiles first if Xcode has not), set the
   price, category Productivity, and the listing.
4. Optional: an App Store Connect API key, so the script does not depend on
   the Xcode account. Create one in App Store Connect > Users and Access >
   Integrations (role Admin or App Manager), download the `.p8` once, keep it
   outside the repository, and export the three values in your shell profile:

   ```sh
   export ASC_KEY_ID=...        # Key ID
   export ASC_ISSUER_ID=...     # Issuer ID
   export ASC_KEY_PATH="$HOME/.appstoreconnect/AuthKey_<Key ID>.p8"
   ```

   Set all three or none. Without them the script uses the Xcode account.

## Releasing

```sh
pnpm release:safari           # build, archive, sign, export the .pkg
pnpm release:safari --upload  # the same, then upload to App Store Connect
```

The script runs `pnpm build:safari`, archives the app with the version and
build number above, exports a signed `.pkg` for the Mac App Store, and prints
the paths under `safari/build/<version>-<build>/`. With `--upload` it also
uploads that build to App Store Connect.

It never submits for review. After the upload has been processed (App Store
Connect sends an email), open the app in App Store Connect, add the build to a
new macOS version, and submit it for review by hand. The first submission also
needs the listing, screenshots, privacy answers and the export compliance
question (encryption).

The script stops with an explanation when `Signing.local.xcconfig` is missing,
when only some of the `ASC_*` variables are set, or when the `.p8` path is
inside the repository.
