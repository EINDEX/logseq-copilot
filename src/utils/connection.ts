export const DEFAULT_LOGSEQ_HOST_NAME = 'localhost';
export const DEFAULT_LOGSEQ_PORT = 12315;

// IPv6 literals must be bracketed inside a URL.
const toUrlHost = (hostName: string): string => {
  const host = hostName.trim();
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
};

/**
 * A hostname is valid when it is non-empty and, put behind `http://`, parses
 * to exactly that host: no scheme, port, path, credentials or whitespace.
 */
export const isValidLogseqHostName = (hostName: string): boolean => {
  const host = toUrlHost(hostName);
  if (!host) return false;
  try {
    return new URL(`http://${host}`).hostname === host.toLowerCase();
  } catch {
    return false;
  }
};

export const isValidLogseqPort = (port: number): boolean =>
  Number.isInteger(port) && port >= 1 && port <= 65535;

/**
 * The origin (scheme://host:port) of the Logseq HTTP API server. The single
 * source of truth is `logseqHostName` + `logseqPort`, as edited in the options.
 */
export const buildLogseqOrigin = (hostName: string, port: number): string => {
  return new URL(`http://${toUrlHost(hostName)}:${port}`).origin;
};
