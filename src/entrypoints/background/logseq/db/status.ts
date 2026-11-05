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
