import { LogseqResponseType } from './client';

export type LogseqClientError = LogseqResponseType<null>;
//   msg: string;
//   status: number;
//   response: null;
// };

export const TokenNotCurrect: LogseqClientError = {
  msg: 'Token not currect, Please checking your Logseq Authorization Setting.',
  status: 401,
  response: null,
};

export const LogseqVersionIsLower: LogseqClientError = {
  msg: 'Logseq version is lower, Please upgrade your Logseq version.\nhttps://logseq.com/downloads',
  status: 500,
  response: null,
};

export const CannotConnectWithLogseq: LogseqClientError = {
  msg: 'Cannot connect with Logseq, Please make sure your Logseq Host is correct.',
  status: 500,
  response: null,
};

export const NoSearchingResult: LogseqClientError = {
  msg: 'Not found.',
  status: 404,
  response: null,
};

export const UnknownIssues: LogseqClientError = {
  msg: 'Unknow issues, may you can connect with author.',
  status: 500,
  response: null,
};
