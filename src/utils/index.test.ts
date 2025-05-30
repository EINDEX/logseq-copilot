import { blockRending, logseqEscape } from '.';

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
      ['do MMM yyyy', '19th Aug 2021'],
      ['do MMMM yyyy', '19th August 2021'],
      ['MMM do, yyyy', 'Aug 19th, 2021'],
      ['MMMM do, yyyy', 'August 19th, 2021'],
      ['E, dd-MM-yyyy', 'Thu, 19-08-2021'],
      ['E, dd.MM.yyyy', 'Thu, 19.08.2021'],
      ['E, MM/dd/yyyy', 'Thu, 08/19/2021'],
      ['E, yyyy/MM/dd', 'Thu, 2021/08/19'],
      ['EEE, dd-MM-yyyy', 'Thu, 19-08-2021'],
      ['EEE, dd.MM.yyyy', 'Thu, 19.08.2021'],
      ['EEE, MM/dd/yyyy', 'Thu, 08/19/2021'],
      ['EEE, yyyy/MM/dd', 'Thu, 2021/08/19'],
      ['EEEE, dd-MM-yyyy', 'Thursday, 19-08-2021'],
      ['EEEE, dd.MM.yyyy', 'Thursday, 19.08.2021'],
      ['EEEE, MM/dd/yyyy', 'Thursday, 08/19/2021'],
      ['EEEE, yyyy/MM/dd', 'Thursday, 2021/08/19'],
      ['dd-MM-yyyy', '19-08-2021'],
      ['MM/dd/yyyy', '08/19/2021'],
      ['MM-dd-yyyy', '08-19-2021'],
      ['MM_dd_yyyy', '08_19_2021'],
      ['yyyy/MM/dd', '2021/08/19'],
      ['yyyy-MM-dd', '2021-08-19'],
      ['yyyy-MM-dd EEEE', '2021-08-19 Thursday'],
      ['yyyy_MM_dd', '2021_08_19'],
      ['yyyyMMdd', '20210819'],
      ['yyyy年MM月dd日', '2021年08月19日'],
    ]);

    const clipNoteTemplate = '{{date}}';
    const time = new Date('2021-08-19T12:00:00+0000');
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

    expect(renderBlock).toEqual('\\[[test]]\\{{test}}');
  });

  test('should keeping url as same as before', () => {
    const clipNoteTemplate = '{{content}}';
    const time = new Date('2021-08-19T16:31:00+0800');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      time: time,
      data: '[url](url)',
      preferredDateFormat: 'yyyy-MM-dd',
    });

    expect(renderBlock).toEqual('[url](url)');
  });
});

describe('test logseq_copliot', () => {
  it('test logseq-copliot.logseqEscape', () => {
    let str = '[[a]]';
    let result = logseqEscape(str);
    let expected = '\\[[a]]';
    expect(result).toEqual(expected);
  });

  it('test logseq-copliot.logseqEscape', () => {
    let str = '((a))';
    let result = logseqEscape(str);
    let expected = '\\((a))';
    expect(result).toEqual(expected);
  });

  it('test logseq-copliot.logseqEscape', () => {
    let str = '{{a}}';
    let result = logseqEscape(str);
    let expected = '\\{{a}}';
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
