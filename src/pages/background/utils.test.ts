import { blockRending, logseqEscape } from './utils';

describe('renderBlock', () => {
  test('should format date as logseq time format', () => {
    const clipNoteTemplate = '{{time}}';
    const time = new Date('2021-08-19T16:31:00+0000');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      time: time,
      data: '',
      preferredDateFormat: 'yyyy-MM-dd',
    });

    const offset = time.getTimezoneOffset();
    const newTime = new Date(time.getTime() - offset * 60 * 1000);
    const expectTime = newTime.toISOString().split('T')[1];

    expect(expectTime.startsWith(renderBlock)).toBeTruthy();
  });

  test('should format date as logseq date format', () => {
    const clipNoteTemplate = '[[{{date}}]]';
    const time = new Date('2021-08-19T16:30:00+0000');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      time: time,
      data: '',
      preferredDateFormat: 'yyyy-MM-dd',
    });

    const offset = time.getTimezoneOffset();
    const newTime = new Date(time.getTime() - offset * 60 * 1000);
    const expectDate = newTime.toISOString().split('T')[0];

    expect(renderBlock).toEqual(`[[${expectDate}]]`);
  });

  test('should suit all date format in logseq', () => {
    const dateFormatMap: Map<string, string> = new Map([
      ['do MMM yyyy', '20th Aug 2021'],
      ['do MMMM yyyy', '20th August 2021'],
      ['MMM do, yyyy', 'Aug 20th, 2021'],
      ['MMMM do, yyyy', 'August 20th, 2021'],
      ['E, dd-MM-yyyy', 'Fri, 20-08-2021'],
      ['E, dd.MM.yyyy', 'Fri, 20.08.2021'],
      ['E, MM/dd/yyyy', 'Fri, 08/20/2021'],
      ['E, yyyy/MM/dd', 'Fri, 2021/08/20'],
      ['EEE, dd-MM-yyyy', 'Fri, 20-08-2021'],
      ['EEE, dd.MM.yyyy', 'Fri, 20.08.2021'],
      ['EEE, MM/dd/yyyy', 'Fri, 08/20/2021'],
      ['EEE, yyyy/MM/dd', 'Fri, 2021/08/20'],
      ['EEEE, dd-MM-yyyy', 'Friday, 20-08-2021'],
      ['EEEE, dd.MM.yyyy', 'Friday, 20.08.2021'],
      ['EEEE, MM/dd/yyyy', 'Friday, 08/20/2021'],
      ['EEEE, yyyy/MM/dd', 'Friday, 2021/08/20'],
      ['dd-MM-yyyy', '20-08-2021'],
      ['MM/dd/yyyy', '08/20/2021'],
      ['MM-dd-yyyy', '08-20-2021'],
      ['MM_dd_yyyy', '08_20_2021'],
      ['yyyy/MM/dd', '2021/08/20'],
      ['yyyy-MM-dd', '2021-08-20'],
      ['yyyy-MM-dd EEEE', '2021-08-20 Friday'],
      ['yyyy_MM_dd', '2021_08_20'],
      ['yyyyMMdd', '20210820'],
      ['yyyy年MM月dd日', '2021年08月20日'],
    ]);

    const clipNoteTemplate = '{{date}}';
    const time = new Date('2021-08-19T16:30:00+0000');
    Array.from(dateFormatMap.keys()).forEach((dateFormat: string) => {
      const renderBlock = blockRending({
        clipNoteTemplate: clipNoteTemplate,
        time: time,
        data: '',
        preferredDateFormat: dateFormat,
      });

      expect(renderBlock).toEqual(`${dateFormatMap.get(dateFormat)}`);
    });
  });

  test('should format link as markdown', () => {
    const clipNoteTemplate = '[{{title}}]({{url}})';
    const time = new Date('2021-08-19T16:31:00+0000');
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

// describe('setExtensionBadge', () => {
//   beforeEach(() => {
//     browser.browserAction.setBadgeText.mockClear();
//     browser.browserAction.setBadgeTextColor.mockClear();
//     browser.browserAction.setBadgeBackgroundColor.mockClear();
//   });

//   it('should set badge text', async () => {
//     const text = 'test';
//     await setExtensionBadge(text, 1);

//     expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith({
//       text,
//       tabId: 1,
//     });
//     expect(browser.browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
//       color: '#4caf50',
//       tabId: 1,
//     });
//     expect(browser.browserAction.setBadgeTextColor).toHaveBeenCalledWith({
//       color: '#ffffff',
//       tabId: 1,
//     });
//   });
// });
