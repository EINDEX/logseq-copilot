/** What a clip message resolves with: where the clip went, and the blocks of it. */
export interface ClipResult {
  /** The page the clip went to. */
  page: string;
  /** The template the clip was written with. */
  templateId: string;
  /** The one top-level block the clip wrote. */
  rootUuid: string;
  /**
   * The block that holds the note when the note is a block of its own: a
   * bullet that has only `{{note}}`, or the child block a template without
   * `{{note}}` gets. Absent with no note, or when the note is part of another
   * block's text.
   */
  noteBlockUuid?: string;
}
