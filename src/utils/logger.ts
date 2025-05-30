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
    if (import.meta.env.WXT_ENV === 'development') {
      console.debug(prefix, ...message);
    }
  }
}

const log = new Logger();

export default log;
