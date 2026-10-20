import { expect, test } from './fixtures';
import { googleUrl } from './pages';

test.describe('options: connection', () => {
  test('entering host, port and token connects and saves them', async ({ page, ext, logseq }) => {
    // Start unconfigured: wrong port and no token.
    await ext.setStorage({ logseqHostName: 'localhost', logseqPort: 1, logseqAuthToken: '' });
    await page.goto(ext.url('options.html#/settings'));

    await page.locator('input[name="logseqHostName"]').fill(logseq.host);
    await page.locator('input[name="logseqPort"]').fill(String(logseq.port));
    await page.locator('input[name="logseqAuthToken"]').fill(logseq.token);

    // Every change is saved and re-checked right away.
    await expect(page.getByRole('button', { name: `Connected to Logseq v${logseq.version}!` })).toBeVisible();
    expect(await ext.getStorage('logseqHostName')).toBe(logseq.host);
    expect(await ext.getStorage('logseqPort')).toBe(logseq.port);
    expect(await ext.getStorage('logseqAuthToken')).toBe(logseq.token);
  });

  test('a wrong token shows a readable error', async ({ page, ext }) => {
    await ext.connect({ token: 'wrong-token' });
    await page.goto(ext.url('options.html#/settings'));
    await expect(
      page.getByRole('button', { name: /Token not correct, Please checking your Logseq Authorization Setting/ }),
    ).toBeVisible();
  });
});

test.describe('options: recall rules', () => {
  test('an excluded page no longer shows up in the search sidebar', async ({ page, ext }) => {
    await ext.connect();
    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    await page.goto(googleUrl('copilot'));
    await expect(sidebar.getByText('Hello from copilot integration test')).toBeVisible();
    await expect(sidebar.getByText('another page mentioning copilot')).toBeVisible();

    const options = await page.context().newPage();
    await options.goto(ext.url('options.html#/recall-rules'));
    await options.getByRole('button', { name: '添加规则' }).first().click();
    await options.locator('#name').fill('E2E exclude Another Page');
    await options.locator('#urlPattern').fill('google\\.com');
    // Second "page name" input: 排除搜索页面 (the first is 限制搜索页面).
    const excludeInput = options.getByPlaceholder('输入页面名称').nth(1);
    await excludeInput.fill('Another Page');
    await excludeInput.press('Enter');
    await options.getByRole('button', { name: '保存规则' }).click();
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

