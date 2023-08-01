import { browserAction } from 'webextension-polyfill';
import { blockRending, logseqEscape, setExtensionBadge } from './utils';

describe('renderBlock', () => {
  test('should format date as logseq time format', () => {
    const clipNoteTemplate = '{{time}}';
    const time = new Date('2021-08-19T16:31:00+0800');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      time: time,
      data: '',
      preferredDateFormat: 'yyyy-MM-dd',
    });

    expect(renderBlock).toEqual('16:31');
  });

  test('should format date as logseq date format', () => {
    const clipNoteTemplate = '[[{{date}}]]';
    const time = new Date('2021-08-19T16:31:00+0800');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      time: time,
      data: '',
      preferredDateFormat: 'yyyy-MM-dd',
    });

    expect(renderBlock).toEqual('[[2021-08-19]]');
  });

  test('should format link as markdown', () => {
    const clipNoteTemplate = '[{{title}}]({{url}})';
    const time = new Date('2021-08-19T16:31:00+0800');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      title: 'Logseq Copilot',
      url: 'https://logseq-copilot.eindex.me',
      time: time,
      data: '',
      preferredDateFormat: 'yyyy-MM-dd',
    });

    expect(renderBlock).toEqual(
      '[Logseq Copilot](https://logseq-copilot.eindex.me)',
    );
  });

  test('should escape logseq double link keywords', () => {
    const clipNoteTemplate = '{{content}}';
    const time = new Date('2021-08-19T16:31:00+0800');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      time: time,
      data: '[[test]]{{test}}',
      preferredDateFormat: 'yyyy-MM-dd',
    });

    expect(renderBlock).toEqual('\\[\\[test]]\\{\\{test}}');
  });
});

describe('test logseq_copliot', () => {
  it('test logseq-copliot.logseqEscape', () => {
    let str = '[[a]]';
    let result = logseqEscape(str);
    let expected = '\\[\\[a]]';
    expect(result).toEqual(expected);
  });

  it('test logseq-copliot.logseqEscape', () => {
    let str = '((a))';
    let result = logseqEscape(str);
    let expected = '\\(\\(a))';
    expect(result).toEqual(expected);
  });

  it('test logseq-copliot.logseqEscape', () => {
    let str = '{{a}}';
    let result = logseqEscape(str);
    let expected = '\\{\\{a}}';
    expect(result).toEqual(expected);
  });
});

describe('setExtensionBadge', () => {
  beforeEach(() => {
    browser.browserAction.setBadgeText.mockClear();
    browser.browserAction.setBadgeTextColor.mockClear();
    browser.browserAction.setBadgeBackgroundColor.mockClear();
  });

  it('should set badge text', async () => {
    const text = 'test';
    await setExtensionBadge(text, 1);
    
    expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith({ text, tabId: 1 });
    expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#4caf50", tabId: 1 });
    expect(browser.browserAction.setBadgeTextColor).toHaveBeenCalledWith({ color: "#ffffff", tabId: 1 });

  });
});
