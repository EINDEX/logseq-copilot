import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { recallRulesConfig } from '@/utils/storage';
import { BUILTIN_RECALL_RULES } from '@/utils/recall-builtin-rules';
import { useRecallRules } from './use-recall-rules';

const YT = 'builtin:youtube-video';

const mount = async () => {
  const hook = renderHook(() => useRecallRules());
  await act(async () => {});
  return hook;
};

const storedIds = async () => (await recallRulesConfig.getValue()).map((r) => r.id);

describe('useRecallRules with built-in rules', () => {
  beforeEach(() => fakeBrowser.reset());

  it('lists the built-ins and says which ones they are', async () => {
    const { result } = await mount();
    const ids = result.current.recallRules.map((r) => r.id);
    for (const rule of BUILTIN_RECALL_RULES) expect(ids).toContain(rule.id);
    expect(ids).toContain('default-spa');
    expect(result.current.isBuiltin(YT)).toBe(true);
    expect(result.current.isBuiltin('default-spa')).toBe(false);
    expect(result.current.isOverridden(YT)).toBe(false);
    // Nothing is stored just by looking.
    expect(await fakeBrowser.storage.local.get('recallRulesConfig')).toEqual({});
  });

  it('saving an edited built-in stores an override, and resetToBuiltin removes it', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.updateRecallRule(YT, { name: 'My YouTube' });
    });
    expect(result.current.isOverridden(YT)).toBe(true);
    expect(result.current.getRecallRule(YT)?.name).toBe('My YouTube');
    // Only the override is stored, not the other built-ins.
    expect((await storedIds()).filter((id) => id.startsWith('builtin:'))).toEqual([YT]);

    await act(async () => {
      await result.current.resetToBuiltin(YT);
    });
    expect(result.current.isOverridden(YT)).toBe(false);
    expect(result.current.getRecallRule(YT)?.name).toBe('YouTube videos');
    expect((await storedIds()).filter((id) => id.startsWith('builtin:'))).toEqual([]);
  });

  it('toggling a built-in stores a disabled copy; toggling back stores nothing', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.toggleRecallRule(YT);
    });
    expect(result.current.getRecallRule(YT)?.enabled).toBe(false);
    expect(result.current.isOverridden(YT)).toBe(true);
    await act(async () => {
      await result.current.toggleRecallRule(YT);
    });
    expect(result.current.isOverridden(YT)).toBe(false);
    expect(await storedIds()).not.toContain(YT);
  });

  it('a rule of the user is stored next to the built-ins, not instead of them', async () => {
    const { result } = await mount();
    const base = result.current.getRecallRule(YT)!;
    await act(async () => {
      await result.current.addRecallRule({ ...base, name: 'Mine', builtin: undefined });
    });
    const stored = await recallRulesConfig.getValue();
    // The default rules are stored with it, as before; the built-ins are not.
    expect(stored.map((r) => r.id).filter((id) => id.startsWith('builtin:'))).toEqual([]);
    expect(stored[0].name).toBe('Mine');
    expect(result.current.recallRules[0].name).toBe('Mine');
    expect(result.current.recallRules.map((r) => r.id)).toContain(YT);
  });

  it('deleting a built-in resets it', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.updateRecallRule(YT, { enabled: false });
      await result.current.deleteRecallRule(YT);
    });
    expect(result.current.isOverridden(YT)).toBe(false);
    expect(result.current.getRecallRule(YT)?.enabled).toBe(true);
  });

  it('reordering does not store the built-ins', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.reorderRules([...result.current.recallRules].reverse());
    });
    expect((await storedIds()).filter((id) => id.startsWith('builtin:'))).toEqual([]);
  });
});
