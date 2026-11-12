# Store listing copy

Text for the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO). English only, in `en/`.

| File | Where it goes | Limit |
| --- | --- | --- |
| `en/summary.txt` | The manifest `description` in `wxt.config.ts`. Chrome shows it as the summary. Edge shows it as the short description. | 132 characters (Chrome). Plain text. |
| `en/description.md` | The detailed description in all three stores. | Edge: 250 to 10,000 characters. Chrome: limit not verified. AMO: no fixed limit. |
| `en/firefox-summary.txt` | AMO, Summary field. | 250 characters. |
| `en/whats-new-2.0.txt` | AMO release notes of the 2.0 version, or wherever a store takes notes for an update. | None set here. |
| `en/video-script.md` | The intro video, recorded from the real UI. | 45 to 60 seconds. Captions of at most 8 words. |
| `en/tagline.txt` | Promo tiles and the end card of the video. Three candidates, one per line. Pick one. | About 8 words. |

## Formatting

- `summary.txt` and `wxt.config.ts` must hold the same sentence. Change both together, then check the built `manifest.json`.
- `description.md` is plain text with `- ` lists and bare URLs, so it reads the same where it is not rendered. Chrome and Edge show plain text: do not add Markdown links or headings.
- AMO: its docs say the description "can contain some Markdown" (addons-server API docs) and that "some fields support a limited set of Markdown" (Extension Workshop, "Create an appealing listing"). Neither page says whether HTML is accepted. HTML: not verified.
- Edge: Partner Center has no "What's new" field in its publishing docs. "Notes for certification" goes to the testers, not to users.
