import type { RecallRuleConfig } from '@/utils/storage';

/**
 * Recall rules shipped with the extension: they are code, not stored data, so
 * an update can improve them. The effective rules are the stored rules plus
 * every built-in whose id is not stored (`mergeBuiltinRules`). A stored rule
 * with a built-in's id is the user's override of it: to turn a built-in off,
 * store a copy with `enabled: false`; to reset it, delete the stored copy.
 */

const builtin = (
  rule: Pick<RecallRuleConfig, 'id' | 'name' | 'description' | 'urlPattern'> & {
    queryProcessing: Pick<
      RecallRuleConfig['queryProcessing'],
      'keepQueryParams' | 'urlForms'
    >;
  },
): RecallRuleConfig => ({
  ...rule,
  enabled: true,
  builtin: true,
  queryProcessing: {
    ignoreHashFragments: true,
    ignoreQueryParams: false,
    excludeKeywords: [],
    includeKeywords: [],
    ignorePathSegments: [],
    ...rule.queryProcessing,
  },
  searchScope: {},
  resultFiltering: { prioritizeRecent: false },
});

export const BUILTIN_RECALL_RULES: RecallRuleConfig[] = [
  builtin({
    id: 'builtin:youtube-video',
    name: 'YouTube videos',
    description:
      'A video is the same page whatever its time, playlist or share parameters, and under youtu.be and /shorts links.',
    // Video pages only: playlist and channel pages are not governed by it.
    urlPattern:
      '^https?://((www|m)\\.)?youtube\\.com/(watch([?/]|$)|shorts/)|^https?://youtu\\.be/',
    queryProcessing: {
      keepQueryParams: ['v'],
      urlForms: [
        'youtube.com/watch?v={id}',
        'youtu.be/{id}',
        'youtube.com/shorts/{id}',
      ],
    },
  }),
  builtin({
    id: 'builtin:bilibili-video',
    name: 'Bilibili videos',
    description:
      'A video is the same page whatever its tracking parameters; the part (p) still tells parts of a video apart.',
    // b23.tv short links cannot be expanded offline. The page itself redirects
    // to bilibili.com/video/... before the recall runs, so only clips that
    // stored a b23.tv link are missed.
    urlPattern:
      '^https?://((www|m)\\.)?bilibili\\.com/video/(BV[0-9A-Za-z]+|av[0-9]+)',
    queryProcessing: {
      keepQueryParams: ['p'],
      urlForms: ['bilibili.com/video/{id}'],
    },
  }),
  builtin({
    id: 'builtin:hn-item',
    name: 'Hacker News items',
    description: 'Each item (id) is its own page.',
    urlPattern: '^https?://news\\.ycombinator\\.com/item([?/]|$)',
    queryProcessing: { keepQueryParams: ['id'] },
  }),
  builtin({
    id: 'builtin:wechat-article',
    name: 'WeChat articles',
    description:
      'A long article link is the same article whatever its tracking parameters. Short /s/ links need nothing.',
    // Short `/s/<token>` links are path-based and match as they are.
    urlPattern: '^https?://mp\\.weixin\\.qq\\.com/s([?/]|$)',
    queryProcessing: { keepQueryParams: ['__biz', 'mid', 'idx', 'sn'] },
  }),
];

const BUILTIN_BY_ID = new Map(BUILTIN_RECALL_RULES.map((rule) => [rule.id, rule]));

export const isBuiltinRuleId = (id: string): boolean => BUILTIN_BY_ID.has(id);

export const getBuiltinRule = (id: string): RecallRuleConfig | undefined => {
  const rule = BUILTIN_BY_ID.get(id);
  return rule && structuredClone(rule);
};

/** Stored rules, then every built-in that is not stored (a stored one is an override). */
export const mergeBuiltinRules = (stored: RecallRuleConfig[]): RecallRuleConfig[] => {
  const ids = new Set(stored.map((rule) => rule.id));
  return [
    ...stored,
    ...BUILTIN_RECALL_RULES.filter((rule) => !ids.has(rule.id)).map((rule) =>
      structuredClone(rule),
    ),
  ];
};

/**
 * What to store for a list of effective rules: a built-in that is unchanged
 * stays code, so it is dropped (a later version of it then applies).
 */
/** JSON with sorted keys, so equal rules compare equal in any key order. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

export const rulesToStore = (rules: RecallRuleConfig[]): RecallRuleConfig[] =>
  rules.filter((rule) => {
    const original = BUILTIN_BY_ID.get(rule.id);
    return !original || stable(original) !== stable(rule);
  });
