# UI translations

The extension UI in English (`en.json`, the source), Simplified Chinese
(`zh-CN.json`) and Traditional Chinese as used in Taiwan (`zh-TW.json`).
i18next with react-i18next; the files are bundled into the extension, nothing
is loaded over the network.

The browser's own strings (store description, keyboard command names) are
in `public/_locales/<locale>/messages.json` instead (`__MSG_…__` in
`wxt.config.ts`). The browser picks those by its own UI language: they do not
follow the language setting of the extension. That is a browser limit.

## Using strings in code

| Where                                                 | How                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| React component (options, sidebar, content script UI) | `const { t } = useTranslation();` from `@/i18n/react`, then `t('options.settings.title')`. The component re-renders when the language changes. |
| Non-React code that runs in a context with React UI   | `t` from `@/i18n/core`, called when the text is shown.                                                                                         |
| Background (service worker)                           | `t` from `@/i18n/core`. Never import `@/i18n/react` there: it bundles React.                                                                   |
| Dates, relative times                                 | `intlLocale(i18n.language)` (`@/i18n/language`) or `currentLocale()` (`@/i18n/core`) as the `Intl` locale. English is `en-US`.                 |

Each JS context starts i18n once, in its entrypoint:

```ts
void initI18n(); // synchronous: t() works at once, in the browser language
watchUiLanguage(); // follows the setting (local:uiLanguage)
```

`initI18n()` starts in the browser's UI language, then reads the stored
setting and switches if it differs. UI never waits for it. Before
`initI18n()`, `t()` returns English (development builds warn). In the background,
`watchUiLanguage(onChange)` is registered synchronously at startup;
`onChange` rebuilds the context menu. Extension pages also call
`followDocumentLanguage()` for `<html lang>`.

Unit tests run in English (`src/test/setup-i18n.ts`). A test of another
language calls `i18n.changeLanguage('zh-CN')` and switches back to `en`.

## Rules for keys

- **Sections.** The first part of a key is the UI it belongs to: `common.*`
  (words several parts share), `options.*` (options page), `sidebar.*`
  (browser sidebar and the sidebar drawn on pages), `content.*` (UI in web
  pages: search card, clip toast, clip panel, highlight popup),
  `background.*` (context menu, badges).
- **Nested, dotted, camelCase.** `options.settings.language.label` is
  `{"options": {"settings": {"language": {"label": …}}}}`. Name a key for
  what it is, not for its English words. `_` only starts a plural suffix.
- **Never build a key at run time.** `` t(`options.${name}`) `` cannot be
  type checked or found by a search. When the key depends on a value, map the
  values to full keys in a constant:

  ```ts
  const SCOPE_LABELS = {
    page: 'options.recall.scope.page',
    site: 'options.recall.scope.site',
  } as const;
  t(SCOPE_LABELS[scope]);
  ```

- **No `t()` at module load.** A module-level constant keeps the key and the
  component translates it when it renders (see `CLIP_MENUS` in
  `src/entrypoints/background/context-menus.ts`). Text translated at load
  stays in the first language.
- **Plain text only.** `t()` does not escape HTML (`escapeValue: false`):
  React escapes what it renders, and context menu titles, attributes and
  `textContent` take text as is. Never put `t()` output into `innerHTML`,
  `insertAdjacentHTML` or `dangerouslySetInnerHTML`. For markup in a string,
  use `<Trans>`.
- **Plurals.** `key_one` / `key_other` in English (`t('key', { count })`).
  Chinese has `_other` only. Allowed suffixes: `_zero`, `_one`, `_two`,
  `_few`, `_many`, `_other`.
- **Placeholders.** `{{name}}`. A translation has exactly the placeholders of
  the English string (a plural form may leave out `{{count}}`).
- **Not translated.** The brand names Logseq and Logseq Copilot. Anything
  written into Logseq: default template names (Clip, Task, Reading note, …),
  template content, properties. The user's own data (template names, page
  names).
- A key added to `en.json` and not yet to a translation shows in English
  (`fallbackLng: 'en'`). A translation may not have a key `en.json` lacks.

## File format

i18next JSON v4, one file per language, the keys nested. Canonical form:
`JSON.stringify(<keys sorted at every level>, null, 2) + '\n'`, which
Prettier leaves alone. `node scripts/format-locales.mjs` rewrites the files
in it. `src/locales/locales.test.ts` checks the form, the keys, the plural
suffixes and the placeholders.

`pnpm typecheck` checks every key in code against `en.json`
(`src/i18n/i18next.d.ts`).

## Glossary

| English                                  | zh-CN                  | zh-TW                  | Why                                                                                                                                                      |
| ---------------------------------------- | ---------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logseq, Logseq Copilot                   | Logseq, Logseq Copilot | Logseq, Logseq Copilot | Brand names: never translated.                                                                                                                           |
| graph                                    | 图谱                   | 圖譜                   | Logseq's own word. Translated so a sentence reads naturally.                                                                                             |
| page                                     | 页面                   | 頁面                   | A Logseq page and a web page are both 页面/頁面; add 网页/網頁 or "Logseq" where it is unclear.                                                          |
| block                                    | 块                     | 區塊                   | The unit of a Logseq outline.                                                                                                                            |
| journal                                  | 日志                   | 日誌                   | Logseq's daily page.                                                                                                                                     |
| clip (verb, noun)                        | 剪藏                   | 剪存                   | Save a selection or link into Logseq. 剪藏 is the usual word in mainland note apps; in Taiwan 剪輯 means video editing, so 剪存 (cut and keep).          |
| highlight                                | 高亮                   | 醒目標示               | Marked text on a web page.                                                                                                                               |
| recall (notes about this page or search) | 相关笔记               | 相關筆記               | A feature, not a word users know: say what it shows. "Recall rule" → 相关笔记规则 / 相關筆記規則.                                                        |
| template                                 | 模板                   | 範本                   |                                                                                                                                                          |
| tag                                      | 标签                   | 標籤                   |                                                                                                                                                          |
| property                                 | 属性                   | 屬性                   | A Logseq block or page property.                                                                                                                         |
| task                                     | 任务                   | 待辦事項               | A TODO block. The Task template name stays "Task".                                                                                                       |
| sidebar                                  | 侧边栏                 | 側邊欄                 |                                                                                                                                                          |
| search engine                            | 搜索引擎               | 搜尋引擎               |                                                                                                                                                          |
| shortcut                                 | 快捷键                 | 快速鍵                 |                                                                                                                                                          |
| settings, options                        | 设置                   | 設定                   |                                                                                                                                                          |
| API token                                | API token              | API token              | Kept in English: Logseq's API server dialog shows it in English, and users copy it from there. Words around it are translated (授权 token / 授權 token). |
| host, port                               | 主机，端口             | 主機，連接埠           | First use may add the English in parentheses: 主机（host）.                                                                                              |
| connect, connection                      | 连接                   | 連線                   |                                                                                                                                                          |
| link                                     | 链接                   | 連結                   |                                                                                                                                                          |
| file                                     | 文件                   | 檔案                   |                                                                                                                                                          |
| default                                  | 默认                   | 預設                   |                                                                                                                                                          |
| video                                    | 视频                   | 影片                   |                                                                                                                                                          |
| network                                  | 网络                   | 網路                   |                                                                                                                                                          |
| information                              | 信息                   | 資訊                   |                                                                                                                                                          |

zh-TW is written in Taiwan usage, not converted from zh-CN character by
character (设置 → 設定, not 設置; 搜索 → 搜尋; 程序 → 程式).

## Style

- Short and plain. Address the user as 你 (zh-TW 你), never 您.
- Buttons and menu items start with a verb: 检查连接, 打开侧边栏.
- Full-width Chinese punctuation: ，。：；！？（）. Quotes: zh-CN “ ”,
  zh-TW 「 」.
- **Spacing.** One half-width space between Chinese and Latin letters or
  digits (`Logseq 中没有相关笔记`, `3 个页面`). No space next to full-width
  punctuation (`无法连接到 Logseq。`). Why: it is the common convention of
  both mainland and Taiwan software, and it keeps names like Logseq legible.
- Keep the English meaning, not the English sentence: reorder freely.

## Review checklist (pull requests that touch translations)

1. **Accurate**: says what the English says, in the UI's context. No added
   or dropped meaning.
2. **Terms**: as in the glossary, the same word for the same thing.
3. **Placeholders and plurals**: every `{{x}}` kept, unchanged; plural keys
   with valid suffixes (the tests check this, review the wording).
4. **Length**: about as long as the English or shorter. Buttons, menu items,
   badges and the search card have little room; check the screenshots.
5. **zh-TW in Taiwan usage**: 設定, 檔案, 連結, 搜尋, 影片, 預設, 資訊, 網路, 程式, 快速鍵.
6. **Not translated**: brand names, anything written into Logseq (default
   template names and content), the user's own data.
7. **Format**: canonical JSON (`node scripts/format-locales.mjs`), no key
   that `en.json` lacks.

## Weblate

When the project uses Weblate: file format "i18next JSON v4", monolingual
files, source language `en` (`src/locales/en.json` as the base and template
file), file mask `src/locales/*.json`. `public/_locales` is a separate
component, format "WebExtension JSON".
