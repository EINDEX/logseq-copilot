import { describe, expect, it } from 'vitest';
import { runOnPage } from './page-queue';

const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
};

describe('runOnPage', () => {
  it('runs the tasks of one page one after the other, in order', async () => {
    const events: string[] = [];
    const first = gate();
    const a = runOnPage('Page', async () => {
      events.push('a start');
      await first.promise;
      events.push('a end');
    });
    const b = runOnPage('page ', async () => {
      events.push('b start');
    });
    await Promise.resolve();
    expect(events).toEqual(['a start']);
    first.open();
    await Promise.all([a, b]);
    expect(events).toEqual(['a start', 'a end', 'b start']);
  });

  it('does not hold up another page', async () => {
    const blocked = gate();
    void runOnPage('One', () => blocked.promise);
    await expect(runOnPage('Two', async () => 'done')).resolves.toBe('done');
    blocked.open();
  });

  it('keeps going after a task failed, and hands the failure to its caller', async () => {
    const failing = runOnPage('P', async () => {
      throw new Error('nope');
    });
    const next = runOnPage('P', async () => 'ok');
    await expect(failing).rejects.toThrow('nope');
    await expect(next).resolves.toBe('ok');
  });
});
