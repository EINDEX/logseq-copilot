/**
 * Page rules of a clip template: URL patterns that pick the template for the
 * pages they match.
 *
 * A pattern is a host, then an optional path. Scheme, query and fragment of
 * the page are ignored (a scheme typed in a pattern is dropped).
 * - Host: `github.com` (that host only), `*.example.com` (any subdomain of it,
 *   not `example.com` itself), optionally with `:port` (without one, any port).
 * - Path: literal segments; `*` stands for one segment; a trailing `/*` or
 *   `/**` stands for the rest of the path (none or more segments). No path:
 *   every path of the host. A trailing slash makes no difference.
 *
 * Priority when several templates match a page: an exact host beats a `*.`
 * host, then more literal path segments beat fewer, then the earlier template
 * in the list wins.
 */
import { t } from '@/i18n/core';

interface ParsedPattern {
  host: string;
  /** `*.host`: any subdomain of `host`. */
  subdomains: boolean;
  port?: string;
  /** Literal segments, or `*` for any one. */
  segments: string[];
  /** A trailing `/*` or `/**`: the rest of the path, whatever it is. */
  rest: boolean;
}

export type PatternCheck =
  | { ok: true; pattern: ParsedPattern }
  | { ok: false; error: string };

const HOST_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SEGMENT = /^[A-Za-z0-9._~%@:+,;=!$&'()-]+$/;

const invalid = (error: string): PatternCheck => ({ ok: false, error });

const parse = (input: string): PatternCheck => {
  let text = input.trim();
  if (!text) return invalid(t('options.templates.pattern.empty'));
  if (/\s/.test(text)) return invalid(t('options.templates.pattern.noSpaces'));
  text = text.replace(/^https?:\/\//i, '').replace(/[?#].*$/, '');
  const slash = text.indexOf('/');
  const hostPart = (slash < 0 ? text : text.slice(0, slash)).toLowerCase();
  const pathPart = slash < 0 ? '' : text.slice(slash);

  let host = hostPart;
  let port: string | undefined;
  const colon = host.lastIndexOf(':');
  if (colon >= 0) {
    port = host.slice(colon + 1);
    host = host.slice(0, colon);
    if (!/^\d{1,5}$/.test(port)) return invalid(t('options.templates.pattern.invalidPort'));
  }
  const subdomains = host.startsWith('*.');
  if (subdomains) host = host.slice(2);
  if (!host) return invalid(t('options.templates.pattern.missingHost'));
  if (!host.split('.').every((label) => HOST_LABEL.test(label))) {
    return invalid(
      host.includes('*')
        ? t('options.templates.pattern.wildcardFirstLabel')
        : t('options.templates.pattern.invalidHost'),
    );
  }

  const parts = pathPart.split('/').filter(Boolean);
  // No path: every path of the host.
  let rest = parts.length === 0;
  const segments: string[] = [];
  for (const [index, part] of parts.entries()) {
    const last = index === parts.length - 1;
    if (part === '**' || (part === '*' && last)) {
      if (!last) return invalid(t('options.templates.pattern.doubleStarEnd'));
      rest = true;
    } else if (part === '*') {
      segments.push('*');
    } else if (part.includes('*')) {
      return invalid(t('options.templates.pattern.wildcardWholeSegment'));
    } else if (!SEGMENT.test(part)) {
      return invalid(t('options.templates.pattern.invalidPath'));
    } else {
      segments.push(part);
    }
  }
  return { ok: true, pattern: { host, subdomains, port, segments, rest } };
};

/** Whether `pattern` is one the editor accepts, and why not otherwise. */
export const checkTemplatePattern = (pattern: string): { ok: true } | { ok: false; error: string } => {
  const parsed = parse(pattern);
  return parsed.ok ? { ok: true } : parsed;
};

/** How well a pattern fits a page, or null when it does not. */
const specificity = (
  pattern: ParsedPattern,
  url: URL,
): { exactHost: number; literals: number } | null => {
  const host = url.hostname.toLowerCase();
  if (pattern.subdomains) {
    if (!host.endsWith(`.${pattern.host}`)) return null;
  } else if (host !== pattern.host) {
    return null;
  }
  if (pattern.port !== undefined && url.port !== pattern.port) return null;

  const path = url.pathname.split('/').filter(Boolean);
  if (path.length < pattern.segments.length) return null;
  if (!pattern.rest && path.length !== pattern.segments.length) return null;
  for (const [index, segment] of pattern.segments.entries()) {
    if (segment !== '*' && segment !== path[index]) return null;
  }
  return {
    exactHost: pattern.subdomains ? 0 : 1,
    literals: pattern.segments.filter((segment) => segment !== '*').length,
  };
};

/**
 * The templates whose rules match `url`, the one to use first: the most
 * specific match wins (see the top of this file). A template counts once, with
 * its best pattern. Invalid patterns and pages that are not http(s) match
 * nothing.
 */
export const matchTemplateRules = <T extends { rules?: string[] }>(
  url: string | URL | null | undefined,
  templateList: readonly T[],
): T[] => {
  if (!url) return [];
  let page: URL;
  try {
    page = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return [];
  }
  if (page.protocol !== 'http:' && page.protocol !== 'https:') return [];

  const matches: { template: T; index: number; exactHost: number; literals: number }[] = [];
  templateList.forEach((template, index) => {
    let best: { exactHost: number; literals: number } | null = null;
    for (const rule of template.rules ?? []) {
      const parsed = parse(rule);
      if (!parsed.ok) continue;
      const fit = specificity(parsed.pattern, page);
      if (
        fit &&
        (!best ||
          fit.exactHost > best.exactHost ||
          (fit.exactHost === best.exactHost && fit.literals > best.literals))
      ) {
        best = fit;
      }
    }
    if (best) matches.push({ template, index, ...best });
  });
  return matches
    .sort(
      (a, b) =>
        b.exactHost - a.exactHost || b.literals - a.literals || a.index - b.index,
    )
    .map(({ template }) => template);
};
