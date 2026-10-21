import { useState, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  IconCalendar,
  IconCheck,
  IconEdit,
  IconGlobe,
  IconTrash,
} from '@tabler/icons-react';
import type { HighlightData } from '@/types/highlight';
import log from '@/utils/logger';

/**
 * The list of highlights shared by the in-page sidebar and the browser
 * sidebar. It only renders what it gets in props and never reads storage or
 * the page, so it runs in any context (a content script shadow root, an
 * extension page). Keep it free of imports from the content script entrypoint.
 */
interface HighlightListProps {
  highlights: HighlightData[];
  /** A highlight was clicked. */
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Lets the user edit notes in the list. Without it, notes are read-only. */
  onUpdateNote?: (id: string, note: string) => void | Promise<void>;
  /** Extra buttons for a highlight, shown before the edit and delete ones. */
  renderActions?: (highlight: HighlightData) => ReactNode;
  /** Shown instead of the list when there are no highlights. */
  empty?: ReactNode;
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

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
    <div className="mb-2 space-y-2" onClick={(e) => e.stopPropagation()}>
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
        placeholder="Add a note to this highlight..."
        aria-label="Note"
        className="min-h-[60px] text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="h-7 px-3">
          <IconCheck className="h-3 w-3 mr-1" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="h-7 px-3"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function HighlightList({
  highlights,
  onSelect,
  onDelete,
  onUpdateNote,
  renderActions,
  empty,
}: HighlightListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (highlights.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="space-y-3">
      {highlights.map((highlight) => (
        <Card
          key={highlight.id}
          className="group cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-yellow-400 highlights-sidebar-card"
          onClick={() => onSelect(highlight.id)}
        >
          <CardContent className="p-4">
            {/* Highlight text */}
            <div className="mb-2">
              <p className="text-sm font-medium text-foreground leading-relaxed">
                "{truncateText(highlight.range.textContent, 120)}"
              </p>
            </div>

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
                <div className="mb-2 p-2 bg-muted rounded text-xs">
                  <p className="text-muted-foreground">
                    {truncateText(highlight.note, 80)}
                  </p>
                </div>
              )
            )}

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <IconGlobe className="h-3 w-3" />
                <span className="truncate max-w-32">{highlight.hostname}</span>
                <IconCalendar className="h-3 w-3 ml-1" />
                <span>{formatDate(highlight.createdAt)}</span>
              </div>
            </div>

            {/* Tags if exists */}
            {highlight.tags && highlight.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {highlight.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {highlight.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{highlight.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Actions: shown on hover, and while a button has keyboard focus */}
            <div className="flex justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 transition-opacity">
              {renderActions?.(highlight)}
              {onUpdateNote && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Edit note"
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
                aria-label="Delete highlight"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(highlight.id);
                }}
                className="h-6 w-6 p-0 text-destructive"
              >
                <IconTrash className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
