const prefix = '[Logseq Copilot]';

class Logger {
  info(...message: any[]) {
    console.info(prefix, ...message);
  }

  error(...message: any[]) {
    console.error(prefix, ...message);
  }

  warn(...message: any[]) {
    console.warn(prefix, ...message);
  }

  debug(...message: any[]) {
    // DEV is replaced with a literal at build time (true for `wxt` dev mode,
    // false for build/zip), so debug output is stripped from packaged builds.
    if (import.meta.env.DEV) {
      console.debug(prefix, ...message);
    }
  }
}

const log = new Logger();

export default log;
