import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { IconCheck, IconEdit, IconLinkOff, IconTrash } from '@tabler/icons-react';
import type { HighlightData } from '@/types/highlight';
import { highlightColor } from '@/utils/highlight-manager';
import { HighlightImage } from './HighlightImage';
import log from '@/utils/logger';
import { intlLocale } from '@/i18n/language';
import { useTranslation } from '@/i18n/react';
import type { TFunction } from 'i18next';

/**
 * The list of highlights shown in the browser sidebar. It only renders what it
 * gets in props and never reads storage or the page, so it runs in an
 * extension page. Keep it free of imports from the content script entrypoint.
 */
interface HighlightListProps {
  highlights: HighlightData[];
  /** Highlights whose clip was found deleted in Logseq: shown as removed from it. */
  removedFromLogseq?: ReadonlySet<string>;
  /** A highlight was clicked. */
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Lets the user edit notes in the list. Without it, notes are read-only. */
  onUpdateNote?: (id: string, note: string) => void | Promise<void>;
  /** Shown instead of the list when there are no highlights. */
  empty?: ReactNode;
}

const formatDate = (timestamp: number, locale: string, t: TFunction) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return t('sidebar.highlights.justNow');
  if (diffHours < 24) return t('sidebar.highlights.hoursAgo', { hours: diffHours });
  if (diffDays < 7) return t('sidebar.highlights.daysAgo', { days: diffDays });

  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

/**
 * The bar beside a quote: the color the page paints the highlight with, at
 * full strength. The tint itself is translucent (50% on light pages, 35% on
 * dark ones), too faint for a thin line; its own hue matches it on the page.
 */
export const quoteBarColor = (color: string | undefined) =>
  highlightColor(color).light.replace(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+).*$/,
    'rgb($1, $2, $3)',
  );

const truncateText = (text: string, maxLength: number = 100) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

interface NoteEditorProps {
  note: string;
  onSave: (note: string) => Promise<void>;
  onCancel: () => void;
}

/** Edits one note in place. Cmd/Ctrl+Enter saves, Escape cancels. */
function NoteEditor({ note, onSave, onCancel }: NoteEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (draft.trim() === note) {
      onCancel();
      return;
    }

    setSaving(true);
    try {
      await onSave(draft);
    } catch (error) {
      // The editor stays open with the draft.
      log.error('Failed to save note:', error);
      setSaving(false);
    }
  };

  return (
    <div
      className="mt-1.5 space-y-2 pl-[15px]"
      onClick={(e) => e.stopPropagation()}
    >
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        placeholder={t('sidebar.highlights.notePlaceholder')}
        aria-label={t('common.note')}
        className="min-h-[60px] text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="h-7 px-3">
          <IconCheck className="h-3 w-3 mr-1" />
          {saving ? t('common.saving') : t('common.save')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="h-7 px-3"
        >
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

export function HighlightList({
  highlights,
  removedFromLogseq,
  onSelect,
  onDelete,
  onUpdateNote,
  empty,
}: HighlightListProps) {
  const { t, i18n } = useTranslation();
  const locale = intlLocale(i18n.language);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (highlights.length === 0) {
    return <>{empty}</>;
  }

  return (
    <ul className="-mx-2 divide-y">
      {highlights.map((highlight) => (
        <li key={highlight.id} className="py-1">
          <div
            className="group cursor-pointer rounded-md px-2 py-2 transition-colors hover:bg-accent/60"
            onClick={() => onSelect(highlight.id)}
          >
            {/* The highlighted text as a quote, its bar in the color of
                the highlight on the page. */}
            <blockquote
              className="m-0 border-l-[3px] border-solid pl-3 text-sm leading-relaxed text-foreground"
              style={{ borderLeftColor: quoteBarColor(highlight.color) }}
            >
              {highlight.image ? (
                <>
                  <HighlightImage image={highlight.image} />
                  {highlight.image.alt && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {truncateText(highlight.image.alt, 80)}
                    </span>
                  )}
                </>
              ) : (
                truncateText(highlight.range.textContent, 120)
              )}
            </blockquote>

            {/* Note if exists */}
            {editingId === highlight.id ? (
              <NoteEditor
                note={highlight.note ?? ''}
                onSave={async (note) => {
                  await onUpdateNote?.(highlight.id, note);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              highlight.note && (
                <p className="mt-1.5 pl-[15px] text-xs text-muted-foreground">
                  {truncateText(highlight.note, 80)}
                </p>
              )
            )}

            {/* Metadata, tags and actions */}
            <div className="mt-1.5 flex items-center justify-between gap-2 pl-[15px] text-xs text-muted-foreground">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span>{formatDate(highlight.createdAt, locale, t)}</span>
                {removedFromLogseq?.has(highlight.id) && !highlight.logseq && (
                  <span className="inline-flex items-center gap-1" data-removed-from-logseq>
                    <IconLinkOff className="h-3 w-3" aria-hidden />
                    {t('common.removedFromLogseq')}
                  </span>
                )}
                {highlight.tags?.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="px-1.5 py-0 text-xs font-normal"
                  >
                    {tag}
                  </Badge>
                ))}
                {highlight.tags && highlight.tags.length > 3 && (
                  <Badge
                    variant="secondary"
                    className="px-1.5 py-0 text-xs font-normal"
                  >
                    +{highlight.tags.length - 3}
                  </Badge>
                )}
              </div>
              {/* Shown on hover, and while a button has keyboard focus */}
              <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 transition-opacity">
                {onUpdateNote && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('sidebar.highlights.editNote')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(highlight.id);
                    }}
                    className="h-6 w-6 p-0"
                  >
                    <IconEdit className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('sidebar.highlights.delete')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(highlight.id);
                  }}
                  className="h-6 w-6 p-0 hover:text-destructive"
                >
                  <IconTrash className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
