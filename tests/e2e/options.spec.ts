import { expect, test } from './fixtures';
import { googleUrl } from './pages';

test.describe('options: connection', () => {
  test('entering host, port and token connects and saves them', async ({ ext, logseq }) => {
    // Start unconfigured: wrong port and no token.
    await ext.setStorage({ logseqHostName: 'localhost', logseqPort: 1, logseqAuthToken: '' });
    const options = await ext.openPage('options.html#/settings');

    await options.fill('input[name="logseqHostName"]', logseq.host);
    await options.fill('input[name="logseqPort"]', String(logseq.port));
    await options.fill('input[name="logseqAuthToken"]', logseq.token);

    // Every change is saved and re-checked right away.
    await options.expectButton(`Connected to Logseq v${logseq.version}!`);
    expect(await ext.getStorage('logseqHostName')).toBe(logseq.host);
    expect(await ext.getStorage('logseqPort')).toBe(logseq.port);
    expect(await ext.getStorage('logseqAuthToken')).toBe(logseq.token);
  });

  test('a wrong token shows a readable error', async ({ ext }) => {
    await ext.connect({ token: 'wrong-token' });
    const options = await ext.openPage('options.html#/settings');
    await options.expectButton(/Token not correct, Please checking your Logseq Authorization Setting/);
  });
});

test.describe('options: recall rules', () => {
  test('an excluded page no longer shows up in the search sidebar', async ({ page, ext }) => {
    await ext.connect();
    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    await page.goto(googleUrl('copilot'));
    await expect(sidebar.getByText('Hello from copilot integration test')).toBeVisible();
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
    await expect(sidebar.getByText('Hello from copilot integration test')).toBeVisible();
    await expect(sidebar.getByText('another page mentioning copilot')).toHaveCount(0);
  });
});
