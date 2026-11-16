import { expect, test } from './fixtures';
import { googleUrl } from './pages';

test.describe('options: connection', () => {
  test('entering host, port and token connects and saves them', async ({ ext, logseq }) => {
    // Start unconfigured: wrong port and no token.
    await ext.setStorage({ logseqHostName: 'localhost', logseqPort: 1, logseqAuthToken: '' });
    const options = await ext.openPage('options.html#/settings');
    // Edits made before the settings have loaded are dropped (Connect.tsx
    // ignores onChange until then), so wait for the stored host to show.
    await expect.poll(() => options.inputValue('input[name="logseqHostName"]')).toBe('localhost');

    await options.fill('input[name="logseqHostName"]', logseq.host);
    await options.fill('input[name="logseqPort"]', String(logseq.port));
    await options.fill('input[name="logseqAuthToken"]', logseq.token);

    // Every change is saved and re-checked right away.
    await expect.poll(() => ext.getStorage('logseqHostName')).toBe(logseq.host);
    await expect.poll(() => ext.getStorage('logseqPort')).toBe(logseq.port);
    await expect.poll(() => ext.getStorage('logseqAuthToken')).toBe(logseq.token);
    // The check (debounced) uses the values above: the starting ones (port 1,
    // no token) cannot connect.
    await options.expectButton(`Connected to Logseq v${logseq.version}!`);
  });

  test('a wrong token shows a readable error', async ({ ext }) => {
    await ext.connect({ token: 'wrong-token' });
    const options = await ext.openPage('options.html#/settings');
    await options.expectText(/The authorization token is wrong \(Logseq returned HTTP 401\)/);
  });

  test('an unreachable Logseq names the address that was tried', async ({ ext }) => {
    // Nothing listens on port 1: the fetch fails without an HTTP answer.
    await ext.setStorage({ logseqHostName: 'localhost', logseqPort: 1, logseqAuthToken: 'token' });
    const options = await ext.openPage('options.html#/settings');
    await options.expectText(
      'Cannot connect to Logseq at localhost:1. Check that Logseq is running and its HTTP API server is started on this address.',
    );
    await options.expectButton('Connect');
  });
});

test.describe('options: recall rules', () => {
  test('an excluded page no longer shows up in the search sidebar', async ({ page, ext }) => {
    await ext.connect();
    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    await page.goto(googleUrl('copilot'));
    await expect(sidebar.getByText('Copilot Test Page', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('another page mentioning copilot')).toBeVisible();

    const options = await ext.openPage('options.html#/recall-rules');
    await options.clickButton('Add rule');
    await options.fill('#name', 'E2E exclude Another Page');
    await options.fill('#urlPattern', 'google\\.com');
    // Second "Page name" input: "Exclude these pages" (the first is "Only search these pages").
    const pageNameInput = 'input[placeholder="Page name"]';
    await options.fill(pageNameInput, 'Another Page', 1);
    await options.press(pageNameInput, 'Enter', 1);
    await options.clickButton('Save rule');
    await expect
      .poll(async () =>
        ((await ext.getStorage('recallRulesConfig')) ?? []).some((r: any) =>
          r.searchScope?.excludePages?.includes('Another Page'),
        ),
      )
      .toBe(true);
    await options.close();

    await page.reload();
    await expect(sidebar.getByText('Copilot Test Page', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('another page mentioning copilot')).toHaveCount(0);
  });
});

test.describe('options: template editor', () => {
  // Real key presses and IME input go through Playwright's keyboard and CDP.
  test.skip(({ browserName }) => browserName !== 'chromium', 'typed with real key presses, Chromium only');

  const template = (content: string) => ({
    id: 'typed',
    name: 'Typed',
    content,
    clipNoteLocation: 'journal',
    clipNoteCustomPage: '',
  });
  const storedContent = async (ext: { getStorage: (key: string) => Promise<any> }) =>
    ((await ext.getStorage('templates')) ?? []).find((t: any) => t.id === 'typed')?.content;

  test('typing a block, Enter, Tab and a {{content}} variable stores plain outline text', async ({ ext }) => {
    await ext.setStorage({ templates: [template('')] });
    const options = await ext.openPage('options.html#/template/typed');
    const page = options.page!;
    const editor = page.locator('#template-content');
    await editor.click();

    await page.keyboard.type('Reading note');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('{{');
    await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
    await page.getByRole('option', { name: /^content/ }).click();

    await expect(editor.locator('.cm-tpl-chip[data-variable="content"]')).toBeVisible();
    await expect.poll(() => storedContent(ext)).toBe('- Reading note\n  - {{content}}');
  });

  test('a variable picked with the keyboard, and the list closed with Escape', async ({ ext }) => {
    await ext.setStorage({ templates: [template('')] });
    const options = await ext.openPage('options.html#/template/typed');
    const page = options.page!;
    await page.locator('#template-content').click();

    await page.keyboard.type('{{');
    await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0);

    await page.keyboard.type('ur');
    await expect(
      page.locator('.cm-tooltip-autocomplete [aria-selected="true"]'),
    ).toBeVisible();
    // CodeMirror ignores Tab as "accept" for the first 75 ms of a tooltip
    // (`interactionDelay`), and Tab then indents instead.
    await page.waitForTimeout(150);
    await page.keyboard.press('Tab');
    await expect.poll(() => storedContent(ext)).toBe('{{url}}');
  });

  test('Chinese text typed in is stored', async ({ ext }) => {
    await ext.setStorage({ templates: [template('')] });
    const options = await ext.openPage('options.html#/template/typed');
    const page = options.page!;
    await page.locator('#template-content').click();

    await page.keyboard.insertText('剪藏笔记');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText('来源：');
    await expect.poll(() => storedContent(ext)).toBe('- 剪藏笔记\n  - 来源：');
  });

  test('an input method composition ends up as the committed text only', async ({ ext }) => {
    await ext.setStorage({ templates: [template('')] });
    const options = await ext.openPage('options.html#/template/typed');
    const page = options.page!;
    await page.locator('#template-content').click();
    const client = await page.context().newCDPSession(page);

    await client.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
    await client.send('Input.imeSetComposition', { text: 'nihao', selectionStart: 5, selectionEnd: 5 });
    await client.send('Input.insertText', { text: '你好' });
    await page.keyboard.press('Enter');
    await client.send('Input.imeSetComposition', { text: 'shi', selectionStart: 3, selectionEnd: 3 });
    await client.send('Input.insertText', { text: '世' });

    await expect.poll(() => storedContent(ext)).toBe('- 你好\n  - 世');
  });

  test('opening a template and switching the mode writes nothing', async ({ ext }) => {
    const content = '- [{{title}}]({{url}})\n  - {{content}}';
    await ext.setStorage({ templates: [template(content)] });
    const options = await ext.openPage('options.html#/template/typed');
    const page = options.page!;
    await expect(page.locator('#template-content .cm-tpl-chip[data-variable="title"]')).toBeVisible();

    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await expect(page.locator('#template-content')).toContainText('- [{{title}}]({{url}})');
    await page.getByRole('button', { name: 'Outline', exact: true }).click();
    await expect(page.locator('#template-content .cm-tpl-chip[data-variable="title"]')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await storedContent(ext)).toBe(content);
  });

  test('a template the outline would change opens in Text', async ({ ext }) => {
    await ext.setStorage({ templates: [template('intro\n- one\n- two')] });
    const options = await ext.openPage('options.html#/template/typed');
    const page = options.page!;
    await expect(page.locator('#template-content')).toContainText('intro');
    await expect(page.getByRole('button', { name: 'Outline', exact: true })).toBeDisabled();
    await expect(page.locator('#template-content .cm-tpl-bullet')).toHaveCount(0);
  });
});

test.describe('options: template pin and default', () => {
  const template = (id: string, name: string) => ({
    id,
    name,
    content: `- ${name} [{{title}}]({{url}})`,
    clipNoteLocation: 'journal',
    clipNoteCustomPage: '',
  });

  test('a pin toggle pins a template, a star makes it the default', async ({ ext }) => {
    await ext.connect();
    await ext.setStorage({ templates: [template('alpha', 'Alpha'), template('beta', 'Beta')] });
    const options = await ext.openPage('options.html#/template/alpha');

    // The default (the first) is always pinned, so its pin is not a toggle.
    await options.click('[aria-label="Pinned"]:not([disabled])');
    await expect
      .poll(async () => ((await ext.getStorage('templates')) ?? []).find((t: any) => t.id === 'beta')?.pinned)
      .toBe(true);

    await options.click('[aria-label="Default template"][aria-pressed="false"]');
    await expect.poll(() => ext.getStorage('defaultTemplateId')).toBe('beta');
  });
});
