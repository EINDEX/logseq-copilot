/** What a clip message resolves with: where the clip went, and the blocks of it. */
export interface ClipResult {
  /** The page the clip went to. */
  page: string;
  /** The graph the clip went to. */
  graph: string;
  /** The template the clip was written with. */
  templateId: string;
  /**
   * The one node the clip added to the page: its new root, or, when the clip
   * joined an earlier clip of the same web page, the child appended to that
   * block.
   */
  rootUuid: string;
  /**
   * False when the clip joined an earlier one and had nothing to add (a page
   * clip with an outline template that has no content): `rootUuid` is then the
   * existing block, which the clip did not write.
   */
  added: boolean;
  /**
   * The block that holds the note when the note is a block of its own: a
   * bullet that has only `{{note}}`, or the child block a template without
   * `{{note}}` gets. Absent with no note, or when the note is part of another
   * block's text.
   */
  noteBlockUuid?: string;
  /** The text written to `noteBlockUuid`, as the block stores it. */
  noteBlockText?: string;
}
