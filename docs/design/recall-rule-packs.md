# Recall rule packs: design

Status: proposal, nothing implemented. Written 2026-11-24.

## Summary

A recall rule pack is a JSON file of purely declarative rules (hosts, path globs, query params to keep, equivalent URL forms). The extension fetches an index and packs from one public GitHub repo, validates them against a JSON Schema and a hand-written validator, and merges them into the rule set at read time. No pack contains code, regex, or anything the extension interprets as a program.

Decisions:

- Path patterns are a restricted glob. Packs never carry regex. The user-written `urlPattern` regex stays for the user's own rules only.
- `schemaVersion` is an integer for the file format. Pack `version` is an integer that only goes up. An extension that does not know a `schemaVersion` skips that pack and keeps the last good copy.
- Precedence: user override > subscribed pack > built-in.
- Subscription is opt-in and off by default. The request carries no URL, history or graph content.

Store review conclusion per store (policy text quoted in section 3):

| Store | Conclusion |
| --- | --- |
| Chrome Web Store | Allowed. The MV3 policy lists "Fetching a remote configuration file ... where all logic for the functionality is contained within the extension package" as permitted. The risk is the interpreter clause, so the schema must stay non-programmable. |
| Firefox AMO | Allowed in principle: the ban is on "remote code for execution". Needs the data-collection disclosure to be right and an opt-in. The `data_collection_permissions` value needs a decision (open question 2). |
| Microsoft Edge Add-ons | Allowed in principle: the policy has no remote-data ban, but bans downloaded scripts and obfuscated external resources. Section 1.2.4 on updates only through Partner Center is ambiguous for data and is an open question. |
| Safari / App Store | Highest uncertainty. Guideline 2.5.2 bans downloading code "which introduces or changes features or functionality" and does not mention data. The project does not ship on Safari today. Do not plan on it until Apple's review is tested. |

## 0. Current state (what packs map onto)

Read from the repo:

- `RecallRuleConfig` in `src/utils/storage.ts:103`: `id`, `name`, `enabled`, `description?`, `urlPattern` (regex string), `queryProcessing` (`ignoreHashFragments`, `ignoreQueryParams`, `excludeKeywords`, `includeKeywords`, `ignorePathSegments`, `scopeDepth?`), `searchScope` (`restrictToPages?`, `excludePages?`, `journalDateRange?`), `resultFiltering` (`minRelevanceScore?`, `maxResults?`, `prioritizeRecent`).
- Matching, from `docs/src/content/docs/features/recall-rules.mdx`: "Every rule has a **URL pattern**, a regular expression tested, case-insensitively, against the full address of the page, hash and query included." "A rule with a pattern that is not a valid regular expression is skipped." All matching enabled rules combine: URL transforms "Applied one after the other", scope "The deepest scope", keywords "Collected from all rules", pages-to-exclude from any rule, max results "The smallest number".
- The current PR (not in this branch's HEAD) adds `queryProcessing.keepQueryParams?: string[]`, `queryProcessing.urlForms?: string[]` (`{id}` placeholder, first form is canonical) and built-in rules `builtin:youtube-video`, `builtin:bilibili-video`, `builtin:hn-item`, `builtin:wechat-article`, merged at read time with stored rules. A stored rule with the same id is the user's override: disable is a stored copy with `enabled: false`, reset deletes the copy.

## 1. Pack schema and versioning

### 1.1 Glob, not regex

Recommendation: restricted glob, no regex in packs.

Why not regex, even with limits:

- A backtracking engine (the JS `RegExp` the processor uses) can be driven into catastrophic backtracking by a pattern like `(a+)+$`. Length limits do not help, because short patterns can be exponential. Complexity checks in CI are heuristics and a third-party pack skips CI.
- A linear engine (RE2 compiled to WASM) fixes ReDoS but adds a bundled binary. That is more review surface: AMO requires reviewable source ("Code must be provided in a way that is reviewable", section 3.1) and a regex library is a large generic interpreter for pack-supplied strings, which is what the Chrome interpreter clause worries about (section 3). Recall needs "this host, this path shape", not general regex.
- Glob answers everything the four built-ins need.

Glob grammar (the whole language):

- `hosts`: lowercase hostnames, punycode for IDN. `example.com` matches that host exactly. `*.example.com` matches any subdomain but not the apex. No ports, no bare `*`, no wildcard over a public suffix (`*.com`). CI rejects these.
- `paths` (optional, default any path): each starts with `/`, split on `/` into segments. A segment is a literal, `*` (exactly one segment) or `{name}` (one segment from the safe class `[A-Za-z0-9._~-]`). `**` is allowed only as the last segment and matches zero or more segments. Case-sensitive.
- The query string and hash are never matched by `paths`. Which query params matter is declared by `keepQueryParams`.

Matching is one left-to-right pass over the path segments. With `**` only at the end there is no backtracking, so cost is linear in the URL length times the pattern count. Nothing in the format can loop, branch on a condition, or reference another rule.

### 1.2 Fields a pack rule may set

A pack may only describe how a URL identifies content. Everything that touches the user's graph stays user-only.

| Field | Pack | Reason |
| --- | --- | --- |
| `match.hosts`, `match.paths` | yes | the glob above |
| `queryProcessing.ignoreHashFragments`, `ignoreQueryParams`, `ignorePathSegments`, `scopeDepth` | yes | URL identity |
| `queryProcessing.keepQueryParams`, `urlForms` | yes | URL identity (this PR) |
| `excludeKeywords`, `includeKeywords` | no | could hide notes from the user |
| `searchScope.*` | no | names pages of the user's graph; a pack must not know or steer them |
| `resultFiltering.*` | no | user preference |
| `urlPattern` (regex) | no | see 1.4 |

`urlForms` constraint: every host used in a form must appear in the same rule's `match.hosts` (CI and runtime both check). A pack cannot declare that one site's URL is equivalent to an unrelated site's.

### 1.3 Concrete JSON

Pack file, `packs/video-sites.json` (all values are illustrative):

```json
{
  "schemaVersion": 1,
  "id": "video-sites",
  "version": 3,
  "name": "Video and news sites",
  "description": "Keeps only the query params that identify the page.",
  "homepage": "https://github.com/OWNER/recall-packs/tree/main/packs/video-sites",
  "license": "CC0-1.0",
  "rules": [
    {
      "id": "youtube-video",
      "name": "YouTube video",
      "match": {
        "hosts": ["youtube.com", "*.youtube.com", "youtu.be"],
        "paths": ["/watch", "/shorts/{id}", "/{id}"]
      },
      "queryProcessing": {
        "ignoreHashFragments": true,
        "keepQueryParams": ["v"],
        "urlForms": [
          "youtube.com/watch?v={id}",
          "youtu.be/{id}",
          "youtube.com/shorts/{id}"
        ]
      },
      "tests": [
        { "url": "https://www.youtube.com/watch?v=abc123&t=42s", "recall": "youtube.com/watch?v=abc123" },
        { "url": "https://youtu.be/abc123", "recall": "youtube.com/watch?v=abc123" }
      ]
    },
    {
      "id": "hn-item",
      "name": "Hacker News item",
      "match": { "hosts": ["news.ycombinator.com"], "paths": ["/item"] },
      "queryProcessing": { "ignoreHashFragments": true, "keepQueryParams": ["id"] }
    }
  ],
  "renamedFrom": { "yt-video": "youtube-video" }
}
```

Index file, `index.json`:

```json
{
  "schemaVersion": 1,
  "generated": "2026-11-24T00:00:00Z",
  "packs": [
    {
      "id": "video-sites",
      "name": "Video and news sites",
      "description": "Keeps only the query params that identify the page.",
      "version": 3,
      "minSchemaVersion": 1,
      "path": "packs/video-sites.json",
      "sha256": "<64 hex characters of the pack file>",
      "bytes": 1843,
      "ruleCount": 2
    }
  ]
}
```

`tests` are data for CI only: CI runs the real matcher on each `url` and compares the address the rule recalls up to. The extension ignores `tests` at runtime.

### 1.4 Mapping onto `RecallRuleConfig`

A pack rule becomes a `RecallRuleConfig` in memory at read time and is never written into the stored rule list:

- `id` = `pack:<packId>/<ruleId>`, `name`, `description` copied.
- `enabled` = true if the pack is subscribed, unless the user has a stored override with `enabled: false`.
- `queryProcessing` copied field by field. Fields packs cannot set get the neutral defaults (`excludeKeywords: []`, `includeKeywords: []`, `searchScope: {}`, `resultFiltering: { prioritizeRecent: false }`).
- Matching. Recommended: add `match?: { hosts: string[]; paths?: string[] }` to `RecallRuleConfig` and a small matcher that the processor calls when `match` is present, otherwise the existing `urlPattern` regex. Pack rules have `match` and an empty `urlPattern`. Alternative, no processor change: compile the glob to an anchored regex string from escaped literals, `[^/]+` and a trailing `.*`; that grammar has no nested quantifiers and no alternation so it cannot backtrack badly. Native matching is preferred: it removes the regex path for pack data entirely.
- `urlPattern` stays user-only. It is unanchored, case-insensitive and tested against the full URL; pack globs are anchored on host and path, so the two do not mean the same thing. If a user edits a pack rule's matching, they are editing a copy (section 4.4) and it keeps working as a regex rule, user-risk only, as it does today.

### 1.5 Versioning and unknown schemas

- `schemaVersion` (integer, in index and pack): the file format. Bumped only when a field changes meaning or a new field changes how matching must behave.
- `version` (integer, per pack, only increases): content revision. The extension updates only when the index `version` is higher than the cached one.
- Extension rules for unknown input:
  - Index `schemaVersion` above what the extension supports: ignore the index, keep the cached packs, show "Update the extension to refresh packs".
  - Pack `schemaVersion` above supported, or `minSchemaVersion` above supported: skip that pack, keep its last good cached copy if it has one.
  - Unknown fields inside a supported `schemaVersion`: ignored (the extension is lenient, CI is strict, so contributors get errors but old extensions survive additive changes).
  - A rule that needs behaviour an old extension lacks lists it in `requires` (for example `["urlForms"]`). An old extension skips that one rule, not the whole pack.
  - Any validation failure rejects the whole pack and keeps the last good copy. Partial application of a pack is never done.
- Proposed starting limits, to be tuned on real packs (these are design parameters, not measured values): pack file 64 KiB, 200 rules per pack, 10 hosts and 10 paths per rule, 8 `urlForms` per rule, 200 characters per pattern string, 20 subscribed packs, index 256 KiB. The fetch reads at most the limit and aborts beyond it.

## 2. Distribution

### 2.1 Recommended

One public GitHub repo (`recall-packs`):

- `packs/*.json`, one file per pack, plus `schema/pack.schema.json` and `schema/index.schema.json`.
- CI on every PR: JSON Schema validation, the extra checks the schema cannot express (host/`urlForms` consistency, no wildcard over a public suffix, glob grammar, the size limits, `tests` run through the real matcher imported from the extension source), and generation of `index.json` with `sha256` and `bytes`.
- Community contributes by PR. The owner merges.
- The extension subscribes to the index and fetches packs. No backend.

### 2.2 Alternatives

| Option | Integrity | Update cadence | Offline | Review / trust | Verdict |
| --- | --- | --- | --- | --- | --- |
| Bundled only (packs ship inside the extension; updates through store releases) | Store signs the package | Days (store review) per update | Always works | Easiest for all stores: no remote fetch at all | Phase 1. No third party, no subscribe. |
| `raw.githubusercontent.com` | HTTPS; `sha256` in index is only as trusted as the index | Immediate on merge, though GitHub may cache briefly | Cached copy | Same repo owner trust | Works, but it is a file host not meant as an API; serves with a generic content type |
| GitHub Pages (custom or `github.io` domain) | HTTPS; one domain to name in the privacy policy | Minutes after the Pages build | Cached copy | Domain can be owned by the project and kept stable if the repo moves | Recommended host for the index and packs |
| jsDelivr over the GitHub repo | HTTPS; version pinning by tag | Cache TTL on its side | Cached copy | Adds a third-party operator that sees requests; one more domain in the policy | Optional mirror, not needed to start |
| Arbitrary third-party URL | HTTPS only; no repo review | Whatever the author does | Cached copy | The extension cannot vouch for it. See 2.4 | Phase 3, explicit user action only |
| Hosted backend (API, accounts, ratings) | Server-side, signed responses possible | Instant | Cached copy | A new server holding data about users who subscribe; privacy and operations cost; store reviewers see a service | Not recommended |

Rate limits: I did not fetch GitHub, Pages or jsDelivr documentation, so no figures are given here. The client design keeps load low regardless: conditional requests (`If-None-Match` / `ETag`), one index fetch per check, and packs fetched only when their `version` changed. Verify the current limits before phase 2 (open question 5).

### 2.3 Integrity

- Every pack is addressed by `sha256` in the index. This detects a truncated or swapped pack file and CDN corruption. It does not protect against a compromised index.
- Phase 2.5: sign `index.json` with an Ed25519 key. The public key is bundled in the extension. The private key lives in CI secrets or offline with the owner. Whether WebCrypto Ed25519 is available in all three target browsers needs checking, otherwise bundle a small signature library; it is data-handling code in the package, not remote code.
- Third-party packs are unsigned by definition. They are shown as such.

### 2.4 Cadence, cache and offline

- Check at most once per 24 hours, when the background starts or the options page opens, gated by a timestamp in `storage.local`. This needs no `alarms` permission. A manual "Check now" button exists.
- Store per pack: parsed rules, `version`, `ETag`, `fetchedAt`. Keep the last good copy. A failed fetch, bad hash, bad schema or oversize body changes nothing.
- Offline or fetch failure: cached packs keep working; built-ins always work because they are in the package.
- Uninstalling the subscription deletes the cached pack.

### 2.5 What a third-party pack URL means

- It is a URL the user typed or pasted. The confirm dialog shows the hostname, the pack name, the number of rules and the hosts the rules touch, and says it is not reviewed by this project.
- It is still data, validated by the same schema and limits, so a bad pack can at worst mis-normalise a URL (recall the wrong notes or none). It cannot run code or read the graph.
- Trust risk that remains: an author can make recall hide or mis-show notes for chosen sites, and the author's server sees the user's IP when the user fetches. Hence off by default, a visible "third-party" label in the UI, and no auto-discovery of third-party packs.
- Store review impact: the extension has the capability to fetch a URL chosen by the user; the content is data. State that in the review notes. See section 3.

## 3. Store review impact

All pages below were fetched on 2026-11-24. Quotes are copied from the raw policy text of that fetch. Chrome pages were read from the site's `.md.txt` rendering of the same page; the links go to the normal page.

### 3.1 Chrome Web Store (and `developer.chrome.com` extension docs)

Link: [Additional Requirements for Manifest V3](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)

- "Extensions using Manifest V3 must meet additional requirements related to the extension's code. Specifically, the full functionality of an extension must be easily discernible from its submitted code, unless otherwise exempt as noted in Section 2. This means that the logic of how each extension operates should be self contained. The extension may reference and load data and other information sources that are external to the extension, but these external resources must not contain any logic."
- Common violation 1.3: "Building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data"
- Section 3.2 (allowed): "Fetching a remote configuration file for A/B testing or determining enabled features, where all logic for the functionality is contained within the extension package"
- Section 4: "If we are unable to determine the full functionality of your extension during the review process, we may reject your submission or remove it from the store."

Link: [Remotely hosted code (migration guide)](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

- "Remotely hosted code, or RHC, is what the Chrome Web Store calls anything that is executed by the browser that is loaded from someplace other than the extension's own files. Things like JavaScript and WASM. It *does not* include data or things like JSON or CSS."

Link: [Improve extension security](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security) (section "Configuration-driven features and logic")

- "Your extension loads and caches a remote configuration (for example a JSON file) at runtime. The cached configuration determines which features are enabled."

Conclusion: allowed. Fetching JSON rule data matches the listed examples. The only real risk is the "interpreter" clause. Keep the pack format non-programmable: no expressions, no conditions, no references, no user-supplied regex. A glob matcher over URL strings is matching data, not running commands; the schema stays flat so a reviewer can see that. Ship the schema and matcher in the open-source repo and cite section 3.2 in the review notes.

Link: [Use of Permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions)

- "Request access to the narrowest permissions necessary to implement your Product's features or services."

Link: [Privacy Policy](https://developer.chrome.com/docs/webstore/program-policies/privacy)

- "If your Product handles any user data, then you must post an accurate and up to date privacy policy."
- "The privacy policy must, together with any in-Product disclosures, comprehensively disclose: How your Product collects, uses and shares user data; All parties the user data will be shared with." (the page lists these as items 2.1 and 2.2)

Link: [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)

- "Collection and use of web browsing activity is prohibited, except to the extent required for a user-facing feature described prominently in the Product's Chrome Web Store page and in the Product's user interface."

This matters because it forbids sending visited URLs to a pack server. The design sends none.

### 3.2 Firefox AMO

Link: [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)

- Section 4, Development Practices: "Add-ons must be self-contained and not load remote code for execution."
- Section 4: "Add-ons must only request those permissions that are necessary for them to function."
- Section 3.1: "Add-ons are not allowed to contain obfuscated code, nor code that hides the purpose of the functionality involved. If external resources are used in combination with add-on code, the functionality of the code must not be obscured."
- Section 3.1: "Add-ons may contain transpiled, minified or otherwise machine-generated code, but Mozilla needs to review a copy of the source code before any of these steps have been applied."
- Section 6: "Add-ons must limit data transmission to what is necessary for functionality, and must use the data only for the purpose for which it was transmitted. For the purposes of this policy, data transmission refers to any data that is collected, used, transferred, shared, or handled outside of the add-on or the local browser."
- Section 6.1: "Transmitting or facilitating the transmission of ancillary information (e.g. any data not required for the add-on's functionality as stated in the description) is prohibited." and "The transmission of browsing activity is only permitted as part of the add-on's primary function."
- Section 6.2.1: "It must accurately state the data collection practices in the extension manifest, including when it does not collect data, in line with the Firefox add-on data classification taxonomy."

Conclusion: allowed in principle. The ban is on remote code for execution, not data, and pack data is not executed. Points for review:

- Source review: the matcher and validator are ordinary source in the repo with a reproducible build, as today. Keep them readable (no generated parsers) so "the functionality of the code must not be obscured" holds.
- Data collection: fetching a static JSON file sends no browsing activity or graph content, but it is a request to a server the add-on does not otherwise talk to, and the current manifest says `data_collection_permissions: { required: ['none'] }` with the comment "Data only goes to the user's own Logseq API server." That comment and possibly the value need to change (open question 2). An opt-in with a clear toggle and listing text keeps the add-on on the safe side of section 6.
- The `host_permissions` entry is `<all_urls>` already (`wxt.config.ts`), so a fetch needs no new Firefox permission. Narrowing it is a separate decision, see 3.5.

### 3.3 Microsoft Edge Add-ons

Link: [Developer policies for the Microsoft Edge Add-ons website](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) (page metadata `updated_at: 2026-08-13`). The URL I first tried, `learn.microsoft.com/en-us/microsoft-edge/extensions/store-policies/developer-policies`, returned 404; the link above is the canonical URL the page itself declares.

- 1.1.7 Obfuscation: "Extensions with obfuscated code aren't allowed. This includes code within your extension package, as well as any external code or resource fetched from the web. You may be asked to refactor parts of your code, if it is not reviewable."
- 1.2.1 Content security policies: "For example, your extension should not download a remote script and subsequently run that script in a manner that is not consistent with the described functionality."
- 1.2.4 Extension updates: "Unless otherwise permitted by Microsoft, your extension must be updated only through Partner Center and the Microsoft Edge Add-ons website."
- 1.5.1: "Your extension may collect, access, use, or transmit personal information (including web browsing activity) only if required by and only for use in a prominently disclosed, user-facing feature."
- 1.5.2: "Your privacy policy must be kept up-to-date as you add new features and functionality to your extension."
- 1.6 Permissions: "Your extension must only request those permissions that are necessary for functioning and may not request permission for functionalities that go beyond the capabilities required to perform and function as declared." and "Requesting permissions or features solely for the purpose of "future proofing" is not allowed."

Conclusion: allowed in principle; pack data is neither a script nor obfuscated, and the extension does not run it as code. Two things to handle: (a) keep pack files plainly readable, because 1.1.7 covers "any external code or resource fetched from the web" (no packed or encoded values; `sha256` in the index is fine); (b) 1.2.4 says updates go through Partner Center. A pack update changes data, not the extension package, so it should not count, but the policy does not say so. Describe pack updates as data refreshes in the review notes and listing, and treat a reviewer question as possible (open question 4). Edge Add-ons also ships the same Chromium engine, so the Chrome analysis carries over, but the Edge policy text above is what reviewers apply.

### 3.4 Safari / Mac App Store

Link: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (page text "Last Updated: October 16, 2026"; fetched 2026-11-24).

- 2.5.2: "Apps should be self-contained in their bundles, and may not read or write data outside the designated container area, nor may they download, install, or execute code which introduces or changes features or functionality of the app, including other apps. Educational apps designed to teach, develop, or allow students to test executable code may, in limited circumstances, download code provided that such code is not used for other purposes. Such apps must make the source code provided by the app completely viewable and editable by the user."
- 4.4: "Apps hosting or containing extensions must comply with the App Extension Programming Guide, the Safari app extensions documentation, or the Safari web extensions documentation and should include some functionality, such as help screens and settings interfaces where possible. You should clearly and accurately disclose what extensions are made available in the app's marketing text, and the extensions may not include marketing, advertising, or in-app purchases."
- 4.4.2: "Safari extensions must run on the current version of Safari on the relevant Apple operating system. They may not interfere with System or Safari UI elements and must never include malicious or misleading content or code. Violating this rule will lead to removal from the Apple Developer Program. Safari extensions should not claim access to more websites than strictly necessary to function."

Project status, from `docs/src/content/docs/index.mdx`: "Firefox 127 or later. Safari is not supported." So this is a forward-looking check, not a release gate.

Conclusion: uncertain, riskiest of the four. 2.5.2 forbids downloading "code which introduces or changes features or functionality" and says nothing on data, so the text itself does not prohibit JSON. But a reviewer could read "rules that change how recall works" as changing functionality. Mitigations: the data is inert and validated, the feature is opt-in and off by default, the bundled snapshot (phase 1) keeps the app complete without any download, and review notes say plainly that the download is declarative data with no code path. I cannot predict Apple's reading; if Safari support is added, submit with the pack feature present and ask App Review early rather than assuming. Also 4.4.2 argues against broad host access, which the extension already has (`<all_urls>`).

### 3.5 Manifest permissions

- Current: `permissions: ['storage', 'activeTab', 'contextMenus']` and `host_permissions: ['<all_urls>']` (`wxt.config.ts`). The extension already has access to every origin, so a background `fetch` of the pack host needs no new permission. No `alarms` is needed because of the timestamp check in 2.4.
- `<all_urls>` makes the store ask "why this much", and the pack feature does not change that argument; it adds no new capability to the permission set.
- Alternative if host access is ever narrowed: add `optional_host_permissions` for the pack origin and request it with `permissions.request` when the user turns subscriptions on. For third-party packs, request the pack's origin at subscription time. This matches the "narrowest permissions" text above (Chrome Use of Permissions, AMO section 4, Edge 1.6) and shows the user which origin is contacted. Cost: a browser prompt per origin and slightly more code. Recommend it only if the host permission is reduced for other reasons.
- Firefox: MV3 host permissions are granted by the user, from Firefox 127 per the comment in `wxt.config.ts`. An optional host permission fits that model.

### 3.6 Privacy policy changes

The repo has no standalone privacy policy page. A grep for "privacy" (case-insensitive, repo excluding `node_modules`) finds only the sections below. Chrome requires a link in the dashboard field if the product "handles any user data", so the owner should confirm what the dashboards link to today; this doc could not check it.

Existing text that would change:

`store/en/description.md`, section "Privacy":

> - It sends data only to the Logseq API server you set up.
> - It stores your connection settings, templates, search engine and recall rule settings, highlights and comments in your browser. Highlights and comments are not sent to Logseq.

`docs/src/content/docs/index.mdx`, "Your notes stay yours":

> The extension only talks to the Logseq HTTP API server you run.

`docs/src/content/docs/blog/logseq-copilot-2-0.mdx`, "Privacy" (historical, should not be edited, but readers will compare): "sends data only to the Logseq API server you configure."

`wxt.config.ts`, Firefox: comment "Data only goes to the user's own Logseq API server." and `data_collection_permissions: { required: ['none'] }`.

Also `recall-rules.mdx` says "Two rules come with the extension. You can edit or delete both." which stops being true with the built-in rules in this PR and packs.

What the policy must say once subscriptions exist:

- Off by default. The user turns on pack updates, or adds a pack, in the options page.
- Domain contacted: the official index and pack host only (the GitHub Pages domain chosen in phase 2, named in the policy), and, for a third-party pack, the host the user entered.
- What is sent: an HTTPS GET for `index.json` and for the packs the user subscribed to, with conditional-request headers. No visited URL, page title, browsing history, search query, Logseq content, tokens or settings, and no cookies or identifiers set by the extension.
- What the request unavoidably exposes: the user's IP address and user agent to the server (GitHub or the third-party host), and, by the pack files requested, which packs the user is subscribed to. The host may log these under its own policy.
- How to stop: the toggle, plus removing a pack deletes its cached copy.
- The Chrome Limited Use statement is not needed for this feature because no user data is received or used, but the policy should still say no user data is transferred to third parties.
- Update the AMO and Edge dashboard answers and the Firefox `data_collection_permissions` declaration to match.

## 4. Conflict resolution

### 4.1 Precedence

Order: user override > subscribed pack > built-in.

Reasons:

- The user is the only party who can see their own graph and how they browse. Their explicit edit must always win, including "disable this rule".
- A subscribed pack is a deliberate user choice, newer and more specialised than the code shipped with the release, so it should beat built-ins and let packs fix a built-in without waiting for a store release.
- Built-ins are the offline floor: they work with no subscription, and a pack can replace but not remove them (the user can disable one).
- Safety: a broken or hostile pack must not be able to override what the user decided.

How it combines with today's "all matching rules combine" behaviour:

- URL-identity fields (`keepQueryParams`, `urlForms`, `ignoreQueryParams`, `ignoreHashFragments`, `ignorePathSegments`) are resolved as one winner per page, the highest tier then the most specific rule, instead of chaining several rules' transforms. Chaining two rules' `urlForms` or `keepQueryParams` can give a result neither author meant and would depend on rule order.
- The existing catch-all `Single-page apps` rule (`.*`) is a built-in. It applies as a floor: its `ignoreHashFragments` is applied unless the winning rule sets that field.
- Fields that already combine (scope depth: deepest, keywords: collected, pages: restricted/excluded, max results: smallest) keep their current behaviour across all tiers. Packs cannot set most of them anyway (1.2).

### 4.2 Within a pack and across packs

- Within a pack: CI rejects two rules with the same `id`, and two rules whose host/path globs are identical. Overlapping but different globs are allowed; the more specific one wins: exact host over wildcard host, then more literal path segments, then no `**` over `**`.
- Across packs (same domain from two packs): the more specific rule wins; on a tie the pack the user subscribed to first wins, and the options page shows a "Also matches in <other pack>" label on both rules so the conflict is visible. The user can disable either rule. Resolution is deterministic: tie-break last by `pack:<packId>/<ruleId>` in lexicographic order, so the same install always gives the same result.
- Pack authors cannot claim a tier above another pack. There is no priority field in the schema.

### 4.3 Ids

- `builtin:<ruleId>` for built-ins, `pack:<packId>/<ruleId>` for pack rules. Pack and rule ids match `[a-z0-9][a-z0-9-]*`.
- User-created rules use ids the extension generates and never start with `builtin:` or `pack:`; the editor and the import path reject them.
- `packId` is the file name stem in the repo and is permanent. To move a rule between packs, CI requires `renamedFrom` on the new rule.

### 4.4 Overrides and what happens when packs change

An override stays what it is for built-ins: a stored copy with the same id. For packs the stored copy also records `basedOn: { packId, version }`.

- The pack changes a rule the user overrode: the user's copy stays active. The UI marks it "Pack updated" and offers Compare and Reset. Reset deletes the copy and the pack version takes over. Nothing the user saved is changed silently.
- The pack renames a rule: the pack lists `renamedFrom` (map of old id to new id, see 1.3). On refresh the extension rewrites the id in the user's stored copy and keeps the override. Without `renamedFrom`, a rename counts as a removal.
- The pack removes a rule the user overrode: the stored copy is kept as an orphan with the label "Source removed". It keeps working as written. The user can keep it as a custom rule (new generated id) or delete it. A user who only disabled the rule has no orphan to clean up, so the disable copy is dropped.
- The user unsubscribes from a pack: all its rules disappear from the merged set; overrides become orphans as above.
- The pack removes a rule the user did not override: it disappears.
- Unknown schema or failed validation on a refresh: the last good copy stays, so nothing changes under the user.

### 4.5 Showing the source in the UI

Every rule row carries one short chip, no explanatory text:

- `Built-in`
- `Pack: <pack name> v<version>`
- `Pack · third-party` (a different style, so the unreviewed case is visible)
- `Custom`
- `Edited` on an override, with a reset action
- `Source removed` on an orphan

The Test URL box shows which rule produced the address and its chip, and lists the other rules that matched but lost, each with its chip. Rules are grouped by source in the list, user rules first, so the order on screen is the precedence order.

## 5. Phased plan

1. Phase 0, this PR: built-in rules in code, `keepQueryParams`, `urlForms`, merge by id.
2. Phase 1, no network: define the schema, JSON Schema files, glob matcher (`match` on `RecallRuleConfig`), and validator in the extension. Move the four built-ins into pack-format JSON files that the build bundles. Create the `recall-packs` repo with CI and `tests` fixtures. No store-visible change except the format.
3. Phase 2, opt-in subscription to the official index only: one fetch path, caching with ETag, `sha256` check, limits, the options UI with source chips and orphan handling, privacy policy and listing updates, dashboard disclosures, `data_collection_permissions` decision. Submit with review notes that cite the policy sections in section 3.
4. Phase 3, index signing with a bundled public key.
5. Phase 4, third-party pack URLs: explicit add flow, optional host permission per origin, "third-party" labelling. Only after phases 2 and 3 pass store review.

## 6. Open questions

1. Which domain hosts the index: a `github.io` URL, or a project-owned domain that survives a repo move? The privacy policy must name it.
2. Firefox: is `data_collection_permissions: { required: ['none'] }` still accurate with an opt-in subscription fetch, or must it change? Ask AMO review before phase 2 ships.
3. Does Edge treat remote data refresh as an "update" under 1.2.4? Ask Edge support, or ship with explicit review notes and see.
4. If Safari is ever added, will App Review accept downloaded rule data under 2.5.2? Only a real submission answers this.
5. GitHub Pages, `raw.githubusercontent.com` and jsDelivr limits and caching rules were not checked for this doc. Read the current terms before choosing.
6. Is Ed25519 verification available across the minimum supported browser versions, or is a bundled library needed?
7. Moderation policy for the community repo: who merges, how a bad rule is pulled quickly, and whether `version` can be rolled back.
8. Should `requireQueryParams` or other match fields be added later, and at what `schemaVersion`? Keep the grammar small until a real site needs it.
9. Does the user want pack rules to be able to set keywords at all (currently no)? A hostile pack hiding notes is the concern.
10. Where does the project's privacy policy live today for the Chrome dashboard link? It is not in this repo.

## Appendix: what was fetched

Fetched and read on 2026-11-24:

- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- https://developer.chrome.com/docs/extensions/develop/migrate/improve-security
- https://developer.chrome.com/docs/webstore/program-policies/permissions
- https://developer.chrome.com/docs/webstore/program-policies/privacy
- https://developer.chrome.com/docs/webstore/program-policies/limited-use
- https://extensionworkshop.com/documentation/publish/add-on-policies/
- https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies
- https://developer.apple.com/app-store/review/guidelines/

URLs that returned 404 and were replaced: `developer.chrome.com/docs/webstore/program-policies/policies-overview` (the single-page version `policies.md.txt` and the per-section pages above were used instead) and `learn.microsoft.com/en-us/microsoft-edge/extensions/store-policies/developer-policies` (replaced by the canonical URL above).

Not fetched, so nothing in this doc relies on them: GitHub rate-limit and Pages documentation, jsDelivr terms, Apple's Safari web extension documentation, Mozilla's data classification taxonomy page.
