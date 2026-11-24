import { useState, type ComponentType, type MouseEvent } from 'react';
import { IconNotes, IconRefresh, IconSettings } from '@tabler/icons-react';
import {
  Check,
  ChevronDown,
  FilePlus,
  LoaderCircle,
  Pin,
  PinOff,
  Search,
  TextSelect,
  X,
} from 'lucide-react';
import { HighlightList } from '@/components/HighlightList';
import { LogseqResultList } from '@/components/LogseqResultList';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClipTemplateOption } from '@/hooks/use-clip-templates';
import { TASK_TEMPLATE_ID } from '@/utils/default-templates';
import type { ClipAction, ClipActions } from '@/hooks/use-clip-actions';
import type { LogseqSearch } from '@/hooks/use-logseq-search';
import type { PageRecallState } from '@/hooks/use-page-recall';
import type { HighlightData } from '@/types/highlight';
import type { LogseqSearchResult } from '@/types/logseqBlock';
import { graphUrl } from '@/utils/logseq-url';

/** Whether the list of a recall or search result would show anything. */
const hasResults = (result: LogseqSearchResult | null): result is LogseqSearchResult =>
  !!result &&
  ((result.blocks ?? []).some((block) => block.html || block.children?.length) ||
    (result.pages ?? []).some((page) => !!page?.name));

/**
 * Web links in Logseq blocks open in a new tab: followed in place they would
 * take the sidebar page (or, drawn on a page, the page itself) elsewhere.
 * `logseq:` links are the host's (openLogseqLinksFromBackground).
 */
const openWebLinksInNewTab = (event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0) return;
  // No instanceof: in a content script the element may come from another
  // realm (Firefox Xrays).
  const link = (event.target as Element | null)?.closest?.('a[href]') as
    | HTMLAnchorElement
    | null
    | undefined;
  if (!link || typeof link.href !== 'string' || !/^https?:$/.test(link.protocol)) return;
  event.preventDefault();
  window.open(link.href, '_blank', 'noopener,noreferrer');
};

/**
 * Contained: scrolling past the end does not scroll the page under an in-page
 * sidebar.
 */
const MAIN_CLASS = 'flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2';

/** Why Logseq could not be searched, with a retry. */
const ErrorRow = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex items-start gap-2 px-1.5 py-1">
    <p className="min-w-0 flex-1 py-1 text-xs leading-4 text-muted-foreground">{message}</p>
    <Button
      variant="ghost"
      size="sm"
      onClick={onRetry}
      className="h-6 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <IconRefresh className="h-3.5 w-3.5" stroke={1.75} />
      Retry
    </Button>
  </div>
);

const EmptyState = ({ children }: { children: string }) => (
  <div className="py-10 text-center">
    <IconNotes aria-hidden className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" stroke={1.5} />
    <p className="text-sm text-muted-foreground">{children}</p>
  </div>
);

/**
 * What a search of the graph found. Nothing while it is under way: the box
 * shows that.
 */
const SearchResults = ({ search }: { search: LogseqSearch }) => {
  if (search.loading) return null;
  const result = hasResults(search.result) ? search.result : null;
  if (!search.error && !result) return <EmptyState>Nothing found</EmptyState>;
  return (
    <section aria-label="Search results" className="-mx-1.5" onClick={openWebLinksInNewTab}>
      {search.error ? (
        <ErrorRow message={search.error} onRetry={search.retry} />
      ) : (
        result && (
          <LogseqResultList
            graph={result.graph}
            blocks={result.blocks ?? []}
            pages={result.pages}
            variant="sidebar"
          />
        )
      )}
    </section>
  );
};

interface ClipButtonProps {
  action: ClipAction;
  clip: ClipActions;
  icon: ComponentType<{ className?: string }>;
  label: string;
  disabled: boolean;
  onClick: () => void;
  /** The button is the left half of a split button. */
  split?: boolean;
}

/**
 * A clip action: a spinner while it clips, a check for a moment once it has,
 * marked invalid (and described by #clip-error) when it failed.
 */
const ClipButton = ({ action, clip, icon: Icon, label, disabled, onClick, split }: ClipButtonProps) => {
  const failed = clip.error?.action === action;
  const ActionIcon =
    clip.clipping === action ? LoaderCircle : clip.done === action ? Check : Icon;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-invalid={failed || undefined}
      aria-describedby={failed ? 'clip-error' : undefined}
      data-done={clip.done === action || undefined}
      // A press must not take the selection off the page the sidebar is
      // drawn on (and focus has nothing to do on these buttons).
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`h-8 min-w-0 gap-1.5 px-2 font-normal dark:aria-invalid:border-destructive data-[done]:text-foreground ${
        split ? 'flex-1 justify-center rounded-r-none' : ''
      }`}
    >
      <ActionIcon
        aria-hidden
        className={
          clip.clipping === action
            ? 'animate-spin text-muted-foreground'
            : clip.done === action
            ? 'text-primary'
            : 'text-muted-foreground'
        }
      />
      <span className="truncate">{label}</span>
    </Button>
  );
};

interface TemplateMenuProps {
  /** What the menu is for, e.g. "Clip page". */
  label: string;
  templates: ClipTemplateOption[];
  shortcuts: Record<string, string>;
  disabled: boolean;
  /** Inside the panel: a shadow root does not style a menu on the page's body. */
  container: HTMLElement | null;
  onPick: (templateId: string) => void;
}

/** The shortcut of a template: `clip` is the first template's, `clip-task` the Task one's. */
const shortcutOf = (
  template: ClipTemplateOption,
  index: number,
  shortcuts: Record<string, string>,
): string | undefined =>
  index === 0 ? shortcuts.clip : template.id === TASK_TEMPLATE_ID ? shortcuts['clip-task'] : undefined;

/** The chevron half of a split clip button: pick the template to clip with. */
const TemplateMenu = ({ label, templates, shortcuts, disabled, container, onPick }: TemplateMenuProps) => (
  // Not modal: it must not lock the page of an in-page sidebar.
  <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      {/*
        A plain button: Button does not forward its ref (React 18), and the
        menu is placed from the element the trigger gives it.
      */}
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label} with a template`}
        onMouseDown={(event) => event.preventDefault()}
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className: '-ml-px h-8 w-7 shrink-0 rounded-l-none px-0 font-normal text-muted-foreground',
        })}
      >
        <ChevronDown aria-hidden className="h-3.5 w-3.5" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" container={container} className="min-w-44">
      {templates.map((template, index) => {
        const shortcut = shortcutOf(template, index, shortcuts);
        return (
          <DropdownMenuItem key={template.id} onSelect={() => onPick(template.id)}>
            <span className="truncate">{template.name}</span>
            {shortcut && (
              <span className="ml-auto pl-3 text-xs text-muted-foreground">{shortcut}</span>
            )}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
);

/** The pin of the in-page sidebar (SidebarPanelProps.pin). */
export interface SidebarPin {
  /** Pinned: the page makes room for the sidebar, in every tab. */
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  /**
   * The page's site, for a site that pushing breaks: the pinned sidebar
   * covers the pages of a site the user takes out (`pushes` false).
   */
  site?: { host: string; pushes: boolean; onPushesChange: (pushes: boolean) => void };
}

interface PinButtonsProps {
  pin: SidebarPin;
  /** Inside the panel: a shadow root does not style a menu on the page's body. */
  container: HTMLElement | null;
}

/**
 * Pin, one click either way; once pinned, a chevron for the site of the page.
 * On a site taken out, the pin shows crossed out: pinned, but not here.
 */
const PinButtons = ({ pin, container }: PinButtonsProps) => {
  const { pinned, site } = pin;
  const here = pinned && (site?.pushes ?? true);
  const Icon = pinned && !here ? PinOff : Pin;
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="sm"
        aria-label="Pin"
        title="Pin"
        aria-pressed={pinned}
        onClick={() => pin.onPinnedChange(!pinned)}
        className={`h-7 w-7 p-0 hover:text-foreground ${
          pinned ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <Icon className={`h-4 w-4 ${here ? 'fill-current' : ''}`} />
      </Button>
      {pinned && site && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            {/* A plain button: Button does not forward its ref (TemplateMenu). */}
            <button
              type="button"
              aria-label={`Pin on ${site.host}`}
              className={buttonVariants({
                variant: 'ghost',
                size: 'sm',
                className: '-ml-1 h-7 w-4 p-0 text-muted-foreground hover:text-foreground',
              })}
            >
              <ChevronDown aria-hidden className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" container={container} className="min-w-44">
            <DropdownMenuCheckboxItem
              checked={site.pushes}
              onCheckedChange={(checked) => site.onPushesChange(checked === true)}
            >
              <span className="truncate">{site.host}</span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export interface SidebarPanelProps {
  /**
   * `loading` while the highlights of the page are being read, `unavailable`
   * for a page that cannot have highlights (or none at all), `ready` once
   * `highlights` are those of the page.
   */
  status: 'loading' | 'unavailable' | 'ready';
  highlights: HighlightData[];
  /** Highlights whose clip was found deleted in Logseq (usePageHighlights). */
  removedFromLogseq?: ReadonlySet<string>;
  /** A message about the last action on a highlight, above the panel body. */
  notice: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateNote: (id: string, note: string) => Promise<void>;
  /** What the Logseq graph has about the page (usePageRecall). */
  recall: PageRecallState;
  onRetryRecall: () => void;
  /**
   * A search of the graph typed in the header (useLogseqSearch). While one
   * is shown, it takes the place of the page's highlights and recall.
   */
  search: LogseqSearch;
  /** Clip page and Clip selection, run by the host (useClipActions). */
  clip: ClipActions;
  /**
   * The clip templates, default first. With two or more, the clip buttons get
   * a menu to clip with another one.
   */
  templates?: ClipTemplateOption[];
  /** The shortcuts set for the commands of the extension, by command name. */
  shortcuts?: Record<string, string>;
  /** The page has a selection that Clip selection would clip. */
  canClipSelection: boolean;
  /**
   * The pointer has come over the clip buttons, before any click on them
   * (the browser sidebar asks the page whether it has a selection).
   */
  onClipActionsPointerEnter?: () => void;
  onOpenSettings: () => void;
  /** Shows a pin button in the header (the in-page sidebar). */
  pin?: SidebarPin;
  /** Shows a close button in the header. */
  onClose?: () => void;
}

/**
 * The sidebar: the browser's own (an extension page) and the one drawn on
 * pages of browsers without it. The page's highlights, then what Logseq has
 * about the page, a full-width line between them; a part with nothing to
 * show is left out. It only renders its props (`logseq:` links are left to
 * the host), and fills the height of its parent. Keep it free of imports from
 * the content script entrypoint.
 */
export function SidebarPanel({
  status,
  highlights,
  removedFromLogseq,
  notice,
  onSelect,
  onDelete,
  onUpdateNote,
  recall,
  onRetryRecall,
  search,
  clip,
  templates = [],
  shortcuts = {},
  canClipSelection,
  onClipActionsPointerEnter,
  onOpenSettings,
  pin,
  onClose,
}: SidebarPanelProps) {
  // State, not a ref: the menus need the element once it is there.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const splitClips = templates.length >= 2;
  const graph = recall.result?.graph ?? search.result?.graph;
  const searching = search.submitted !== null;
  const showHighlights = status === 'ready' && highlights.length > 0;
  const recallResult = hasResults(recall.result) ? recall.result : null;
  const showRecall = !!recall.error || !!recallResult;
  // Nothing at all only once both are known: no empty state that flashes
  // before the results.
  const settled = status !== 'loading' && !recall.loading;
  const unavailable = status === 'unavailable';

  return (
    <div ref={setRoot} className="flex h-full flex-col bg-background text-foreground">
      <header className="shrink-0 border-b px-3 pb-3">
        <div className="flex h-12 items-center gap-1">
          {graph && (
            <a
              href={graphUrl(graph)}
              title={`Open ${graph} in Logseq`}
              className="inline-flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span
                aria-hidden
                className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] bg-highlight"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#002b36]" />
              </span>
              <span className="truncate">{graph}</span>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label="Settings"
            title="Settings"
            onClick={onOpenSettings}
            className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <IconSettings className="h-4 w-4" stroke={1.75} />
          </Button>
          {pin && <PinButtons pin={pin} container={root} />}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={onClose}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <form
          role="search"
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            search.submit();
          }}
        >
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            aria-label="Search Logseq"
            placeholder="Search Logseq"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && search.query !== '') {
                event.preventDefault();
                search.clear();
              }
            }}
            className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent pl-8 pr-8 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search.loading ? (
            <LoaderCircle
              role="progressbar"
              aria-label="Searching"
              className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          ) : (
            search.query !== '' && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={search.clear}
                className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </form>

        <div
          role="group"
          aria-label="Clip"
          className="mt-2 grid grid-cols-2 gap-2"
          onPointerEnter={onClipActionsPointerEnter}
        >
          <div className="flex min-w-0">
            <ClipButton
              action="page"
              clip={clip}
              icon={FilePlus}
              label="Clip page"
              disabled={clip.clipping !== null}
              onClick={() => clip.clipPage()}
              split={splitClips}
            />
            {splitClips && (
              <TemplateMenu
                label="Clip page"
                templates={templates}
                shortcuts={shortcuts}
                disabled={clip.clipping !== null}
                container={root}
                onPick={clip.clipPage}
              />
            )}
          </div>
          <div className="flex min-w-0">
            <ClipButton
              action="selection"
              clip={clip}
              icon={TextSelect}
              label="Clip selection"
              // It stays as it is while it shows that it has clipped, though
              // the selection it clipped is gone.
              disabled={clip.clipping !== null || (!canClipSelection && clip.done !== 'selection')}
              onClick={() => {
                if (canClipSelection) clip.clipSelection();
              }}
              split={splitClips}
            />
            {splitClips && (
              <TemplateMenu
                label="Clip selection"
                templates={templates}
                shortcuts={shortcuts}
                disabled={clip.clipping !== null || !canClipSelection}
                container={root}
                onPick={(templateId) => {
                  if (canClipSelection) clip.clipSelection(templateId);
                }}
              />
            )}
          </div>
        </div>
        {clip.error && (
          <p
            id="clip-error"
            role="alert"
            className="mt-2 whitespace-pre-line break-words text-xs text-destructive"
          >
            {clip.error.message}
          </p>
        )}
      </header>

      {notice && (
        <div
          role="status"
          className="border-b bg-accent/50 px-4 py-2 text-sm text-muted-foreground"
        >
          {notice}
        </div>
      )}

      {searching && (
        <main className={MAIN_CLASS}>
          <SearchResults search={search} />
        </main>
      )}

      {/* Hidden, not taken out, while a search is shown: a note being edited
          and the scroll position are still there after it. */}
      <main hidden={searching} className={MAIN_CLASS}>
        {showHighlights && (
          <section aria-label="Highlights">
            <HighlightList
              highlights={highlights}
              removedFromLogseq={removedFromLogseq}
              onSelect={onSelect}
              onDelete={onDelete}
              onUpdateNote={onUpdateNote}
            />
          </section>
        )}

        {showHighlights && showRecall && (
          <div role="separator" className="-mx-3 my-2.5 h-px bg-border" />
        )}

        {showRecall && (
          // Rows keep their hover padding; their text lines up with the highlights.
          <section aria-label="In Logseq" className="-mx-1.5" onClick={openWebLinksInNewTab}>
            {recall.error ? (
              <ErrorRow message={recall.error} onRetry={onRetryRecall} />
            ) : (
              recallResult && (
                <LogseqResultList
                  graph={recallResult.graph}
                  blocks={recallResult.blocks ?? []}
                  pages={recallResult.pages}
                  variant="sidebar"
                />
              )
            )}
          </section>
        )}

        {!showHighlights && !showRecall && settled && (
          <EmptyState>
            {unavailable ? 'Not available on this page' : 'Nothing for this page yet'}
          </EmptyState>
        )}
      </main>
    </div>
  );
}
