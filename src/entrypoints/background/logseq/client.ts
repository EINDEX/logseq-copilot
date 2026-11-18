import { getLogseqCopliotConfig } from '@/config';
import { log } from '@/utils';
import { toLogseqError } from './error';
import { buildLogseqOrigin, formatLogseqAddress } from '@/utils/connection';

export type LogseqPageResponse = {
  name: string;
  uuid: string;
  'journal?': boolean;
};

export type LogseqResponseType<T> = {
  status: number;
  msg: string;
  response: T;
  count?: number;
};

/** Escape text for use inside a double-quoted string of a Logseq query. */
export const escapeQueryString = (text: string) =>
  text.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

export default class LogseqClientBase {
  baseFetch = async (method: string, args: any[]) => {
    log.debug(`Logseq Method ${method}, Args -> \n`, args);
    const config = await getLogseqCopliotConfig();
    const address = formatLogseqAddress(config.logseqHostName, config.logseqPort);
    let resp: Response;
    try {
      const origin = buildLogseqOrigin(
        config.logseqHostName,
        config.logseqPort,
      );
      const apiUrl = new URL(`${origin}/api`);
      resp = await fetch(apiUrl, {
        mode: 'cors',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.logseqAuthToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          method: method,
          args: args,
        }),
      });
    } catch (e) {
      throw toLogseqError(e, address);
    }

    if (resp.status !== 200) {
      throw toLogseqError(resp);
    }
    return resp;
  };

  baseJson = async (method: string, args: any[]) => {
    const resp = await this.baseFetch(method, args);
    const data = await resp.json();
    log.debug(`Logseq Method ${method}, Response -> \n`, data);
    return data;
  };

  /**
   * For methods that answer a string: the API sends it as plain text, not
   * JSON. A failure comes back as JSON `{ error }` (status 200): it throws,
   * with Logseq's reply in the message.
   */
  baseText = async (method: string, args: any[]): Promise<string> => {
    const resp = await this.baseFetch(method, args);
    const text = await resp.text();
    if (resp.headers.get('content-type')?.includes('json')) {
      const data = JSON.parse(text);
      if (data && typeof data === 'object' && 'error' in data) {
        log.debug(`Logseq Method ${method}, Response -> \n`, data);
        throw new Error(`Logseq refused ${method}: ${text.slice(0, 500)}`);
      }
      return typeof data === 'string' ? data : text;
    }
    return text;
  };

  public isDBGraph = async () => {
    return await this.baseJson('logseq.App.checkCurrentIsDBGraph', []);
  };
}
