// import type { Browser } from 'webextension-polyfill';
// import { deepMock } from 'mockzilla';
import { blockRending } from './utils';

// const [browser, mockBrowser, mockBrowserNode] = deepMock<Browser>(
//   'browser',
//   false,
// );

// jest.mock('webextension-polyfill', () => browser);



describe('renderBlock', () => {
  test('should format date as logseq dateformat', () => {
    const clipNoteTemplate = '{{time}}';
    const time = new Date('2021-08-19T16:31:00+0800');
    const renderBlock = blockRending({
      clipNoteTemplate: clipNoteTemplate,
      time: time,
      data: '',
      preferredDateFormat: 'yyyy-MM-dd',
    });
  });
});
