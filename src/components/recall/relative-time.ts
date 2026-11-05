const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Short relative time of a past moment ("3h ago", "2w ago" in English),
 * `Intl.RelativeTimeFormat` narrow style in `locale`. Times in the future
 * (clock skew) and under a minute read as one minute ago.
 */
export const formatRelativeTime = (time: number, now: number, locale?: string): string => {
  const format = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'auto' });
  const ago = Math.max(MINUTE, now - time);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    ago < HOUR
      ? [ago / MINUTE, 'minute']
      : ago < DAY
        ? [ago / HOUR, 'hour']
        : ago < WEEK
          ? [ago / DAY, 'day']
          : ago < 35 * DAY
            ? [ago / WEEK, 'week']
            : ago < 365 * DAY
              ? [ago / (30 * DAY), 'month']
              : [ago / (365 * DAY), 'year'];
  return format.format(-Math.max(1, Math.round(value)), unit);
};
