/**
 * `Editor.getBlock` answers for one recall request. A block is read once
 * whether it is asked for by uuid (search hits, references) or by id
 * (parents): both keys point at the same answer once it is known.
 */
export class BlockCache {
  private blocks = new Map<string, Promise<any>>();

  constructor(private load: (ref: number | string) => Promise<any>) {}

  get(ref: number | string): Promise<any> {
    const key = String(ref);
    const cached = this.blocks.get(key);
    if (cached) return cached;
    const pending = this.load(ref).then((block) => {
      if (block?.uuid) {
        this.blocks.set(block.uuid, pending);
        if (block.id !== undefined) this.blocks.set(String(block.id), pending);
      }
      return block;
    });
    this.blocks.set(key, pending);
    return pending;
  }

  /** A block read some other way (a query answer), so get() does not ask again. */
  add(block: any): void {
    if (!block?.uuid || this.blocks.has(block.uuid)) return;
    const known = Promise.resolve(block);
    this.blocks.set(block.uuid, known);
    if (block.id !== undefined) this.blocks.set(String(block.id), known);
  }
}
