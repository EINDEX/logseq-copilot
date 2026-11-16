export const STATUS_PROPERTY = ':logseq.property/status';
const STATUS_IDENT_PREFIX = `${STATUS_PROPERTY}.`;

/**
 * DB graphs keep the task state in the `logseq.property/status` property, e.g.
 * `{ ident: ':logseq.property/status.todo', title: 'Todo' }`, not as a text
 * prefix. Returns the equivalent file-graph style marker (TODO, DONE, ...).
 */
export const getBlockMarker = (block: any): string => {
  const ident = block?.[STATUS_PROPERTY]?.ident;
  return typeof ident === 'string' && ident.startsWith(STATUS_IDENT_PREFIX)
    ? ident.slice(STATUS_IDENT_PREFIX.length).toUpperCase()
    : '';
};

// Marker -> title of the built-in status choice (Backlog, Todo, Doing,
// In Review, Done, Canceled). Logseq clears the property for unknown titles,
// so only markers with an exact counterpart are accepted.
export const STATUS_TITLE_BY_MARKER: Record<string, string> = {
  TODO: 'Todo',
  DOING: 'Doing',
  DONE: 'Done',
  CANCELED: 'Canceled',
  CANCELLED: 'Canceled',
};

// The markers a template may start with: those above, and the LATER / NOW
// workflow of file graphs.
const TEMPLATE_STATUS_TITLE_BY_MARKER: Record<string, string> = {
  ...STATUS_TITLE_BY_MARKER,
  LATER: 'Todo',
  NOW: 'Doing',
};

const LEADING_MARKER = /^(TODO|LATER|NOW|DOING|DONE|CANCELED|CANCELLED) /;

/**
 * A DB graph does not read `TODO ` at the start of a block as a task: split
 * the marker off the first line, with the title of the status it stands for.
 * Content without a leading marker comes back unchanged, without a status.
 */
export const splitTaskMarker = (
  content: string,
): { content: string; status?: string } => {
  const match = LEADING_MARKER.exec(content);
  if (!match) return { content };
  return {
    content: content.slice(match[0].length),
    status: TEMPLATE_STATUS_TITLE_BY_MARKER[match[1]],
  };
};
