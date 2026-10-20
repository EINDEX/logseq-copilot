import { expect, nonce, test } from './fixtures';

test('the float button clips a mouse selection', async ({ page, ext, logseq, articles }) => {
  const id = nonce('float');
  const url = `https://example.com/e2e/${id}`;
  articles.set(url, { title: `Float page ${id}`, paragraph: `Float button words ${id} end` });

  await ext.connect({ enableClipNoteFloatButton: true });
  await page.goto(url);
  await expect(page.locator('logseq-copilot-popup')).toBeAttached();

  // Drag-select the paragraph with the mouse; mouseup shows the float button.
  const box = (await page.locator('#target').boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection()!.toString())).toContain(id);

  const button = page.locator('logseq-copilot-popup img.quickCapture');
  await expect(button).toBeVisible();
  await button.click();

  await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
});
