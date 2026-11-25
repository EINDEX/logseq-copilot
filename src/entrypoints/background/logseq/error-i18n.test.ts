import { afterEach, describe, expect, test } from 'vitest';
import { i18n } from '@/i18n/core';
import { checkTemplatePattern } from '@/utils/template-rules';
import {
  LogseqError,
  TokenNotCurrect,
  UnknownIssues,
  cannotConnectWithLogseq,
  toLogseqError,
} from './error';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Logseq errors in the UI language', () => {
  test('zh-CN: the message of a thrown error is Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    const err = toLogseqError(new TypeError('Failed to fetch'), '127.0.0.1:12315');
    expect(err.message).toBe(
      '无法连接到 127.0.0.1:12315 上的 Logseq。请检查 Logseq 是否正在运行，并且 HTTP API 服务器已在该地址启动。',
    );
    expect(err.msg).toBe(err.message);
  });

  test('zh-TW: placeholders are filled', async () => {
    await i18n.changeLanguage('zh-TW');
    expect(new LogseqError(cannotConnectWithLogseq('a:1')).message).toContain('a:1');
    expect(toLogseqError({ status: 500 }).message).toBe('Logseq 回傳 HTTP 500。');
  });

  test('a constant made at load follows the language when it is read', async () => {
    expect(UnknownIssues.msg).toBe('Unexpected error while talking to Logseq.');
    await i18n.changeLanguage('zh-CN');
    expect(UnknownIssues.msg).toBe('与 Logseq 通信时出现意外错误。');
    expect(new LogseqError(TokenNotCurrect).message).toContain('HTTP 401');
    expect(new LogseqError(TokenNotCurrect).message).toContain('授权 token');
  });

  test('a utility message is translated where it is made', async () => {
    await i18n.changeLanguage('zh-TW');
    expect(checkTemplatePattern('a b')).toEqual({ ok: false, error: '不能包含空格' });
  });
});
