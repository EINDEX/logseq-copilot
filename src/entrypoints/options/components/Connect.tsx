import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useEffect } from 'react';
import { log } from '@/utils';
import { useSettings } from '@/hooks/use-settings';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import type { LogseqCopliotConfig } from '@/utils/storage';
import { isValidLogseqHostName, isValidLogseqPort } from '@/utils/connection';
import { useTranslation } from '@/i18n/react';
import { PageSection } from './page-layout';

/** Wait this long after the last edit before checking the connection. */
export const CHECK_DEBOUNCE_MS = 600;

/**
 * Key of why the connection settings cannot be checked yet, or null when
 * they can. An empty token is the "not configured yet" state, not an error.
 */
type ConnectionMessageKey =
  | 'options.connection.invalid.host'
  | 'options.connection.invalid.port'
  | 'options.connection.invalid.token';

const validateConnection = (
  config: Pick<LogseqCopliotConfig, 'logseqHostName' | 'logseqPort' | 'logseqAuthToken'>,
): ConnectionMessageKey | null => {
  if (!isValidLogseqHostName(config.logseqHostName)) {
    return 'options.connection.invalid.host';
  }
  if (!isValidLogseqPort(config.logseqPort)) {
    return 'options.connection.invalid.port';
  }
  if (!config.logseqAuthToken) {
    return 'options.connection.invalid.token';
  }
  return null;
};

type ButtonMessage =
  | ConnectionMessageKey
  | 'options.connection.connect'
  | 'options.connection.connected'
  | 'options.connection.notLoaded';

export const LogseqConnectOptions = () => {
  const { t } = useTranslation();
  const { settings: logseqConfig, loading: settingsLoading, updateSettings } = useSettings();
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  // What the button says: a key, translated when it renders so a language
  // switch applies at once. `connected` carries the Logseq version.
  const [buttonMessage, setButtonMessage] = React.useState<ButtonMessage>('options.connection.connect');
  const [connectedVersion, setConnectedVersion] = React.useState('');
  // Show the "settings saved" notice.
  const [notice, setNotice] = React.useState(false);
  // Why the last check failed. Shown under the button, which cannot wrap.
  // Logseq's own message, or true for the translated generic one.
  const [error, setError] = React.useState<string | true>('');
  const [graph, setGraph] = React.useState<string | null>(null);
  const [showToken, setShowToken] = React.useState(false);
  // Only the newest check may update the state; older ones are stale.
  const latestCheck = React.useRef(0);
  const checkedOnce = React.useRef(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    const { name, value } = e.target;
    setNotice(false);
    setError('');
    updateSettings({ [name]: value });
  };

  const changeLogseqPort = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    let port = e.target.value;
    if (port === '' || parseInt(port) < 0) {
      port = '0'
    }
    setNotice(false);
    setError('');
    updateSettings({ logseqPort: parseInt(port) });
  }

  const triggerShowToken = () => setShowToken(!showToken);

  /**
   * Ask Logseq for its version (and graph) with the current settings.
   *
   * `showToast` additionally calls `showMsg`, which pops a toast inside
   * Logseq. Only an explicit click on the button does that: the automatic
   * check follows every edit and must not spam Logseq.
   */
  const checkConnection = async (showToast: boolean): Promise<boolean> => {
    const check = ++latestCheck.current;
    const isStale = () => check !== latestCheck.current;
    setLoading(true);
    try {
      const service = await getLogseqService();
      if (showToast) {
        const resp = await service.showMsg('Logseq Copilot Connect!');
        if (resp.msg !== 'success') {
          if (isStale()) return false;
          setConnected(false);
          setGraph(null);
          setButtonMessage('options.connection.connect');
          setError(resp.msg || true);
          return false;
        }
      }
      const version = await service.getVersion();
      const graphName: string | null = await service.getGraph().catch(() => null);
      if (isStale()) return false;
      setConnected(true);
      setError('');
      setGraph(graphName || null);
      setConnectedVersion(version);
      setButtonMessage('options.connection.connected');
      return true;
    } catch (err) {
      log.error('Connection check failed:', err);
      if (isStale()) return false;
      setConnected(false);
      setGraph(null);
      setButtonMessage('options.connection.connect');
      setError(err instanceof Error && err.message ? err.message : true);
      return false;
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  // The settings are already saved on every change (updateSettings), so
  // "Connect" only tests them and keeps the user on this page.
  const save = async () => {
    if (!logseqConfig) {
      setButtonMessage('options.connection.notLoaded');
      return;
    }

    const invalid = validateConnection(logseqConfig);
    if (invalid) {
      setConnected(false);
      setError('');
      setButtonMessage(invalid);
      return;
    }

    setNotice(false);
    setError('');
    if (await checkConnection(true)) {
      setNotice(true);
    }
  };

  const logseqHostName = logseqConfig?.logseqHostName;
  const logseqPort = logseqConfig?.logseqPort;
  const logseqAuthToken = logseqConfig?.logseqAuthToken;

  // Check the connection when the settings load and, debounced, after the
  // host, port or token change. Depends on the three values, not on the
  // settings object, which is replaced on every storage reload.
  useEffect(() => {
    if (settingsLoading || logseqHostName === undefined) return;

    const invalid = validateConnection({
      logseqHostName,
      logseqPort: logseqPort as number,
      logseqAuthToken: logseqAuthToken ?? '',
    });
    if (invalid) {
      latestCheck.current++; // drop a check that is still running
      setLoading(false);
      setConnected(false);
      setGraph(null);
      setError('');
      // Nothing is wrong with an empty token yet; the user has not started.
      setButtonMessage(logseqAuthToken ? invalid : 'options.connection.connect');
      return;
    }

    const delay = checkedOnce.current ? CHECK_DEBOUNCE_MS : 0;
    checkedOnce.current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void checkConnection(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [settingsLoading, logseqHostName, logseqPort, logseqAuthToken]);

  return (
    <PageSection
      title={t('options.connection.title')}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="logseqHostName">{t('options.connection.host')}</Label>
          <Input
            id="logseqHostName"
            name="logseqHostName"
            placeholder={t('options.connection.hostPlaceholder')}
            onChange={onChange}
            value={logseqConfig?.logseqHostName || ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="logseqPort">{t('options.connection.port')}</Label>
          <Input
            id="logseqPort"
            type="number"
            min={1}
            max={65535}
            name="logseqPort"
            placeholder={t('options.connection.portPlaceholder')}
            onChange={changeLogseqPort}
            value={logseqConfig?.logseqPort || ''}
          />
        </div>

        <div className="space-y-2 sm:col-span-3">
          <Label htmlFor="logseqAuthToken">{t('options.connection.token')}</Label>
          <div className="relative">
            <Input
              id="logseqAuthToken"
              name="logseqAuthToken"
              type={showToken ? 'text' : 'password'}
              onChange={onChange}
              value={logseqConfig?.logseqAuthToken || ''}
              placeholder={t('options.connection.tokenPlaceholder')}
              className="pr-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7"
              onClick={triggerShowToken}
            >
              {showToken ? t('options.connection.hideToken') : t('options.connection.showToken')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-3">
          <Button onClick={save} variant="outline" disabled={loading}>
            {loading
              ? t('options.connection.connecting')
              : buttonMessage === 'options.connection.connected'
                ? t(buttonMessage, { version: connectedVersion })
                : t(buttonMessage)}
          </Button>
          {connected && graph && (
            <a
              className="text-sm text-primary hover:underline"
              href={`logseq://graph/${graph}`}
            >
              {t('options.connection.openGraph', { graph })}
            </a>
          )}
          <a
            className={`text-sm hover:underline sm:ml-auto ${!connected ? 'text-destructive' : 'text-primary'}`}
            href="https://logseq-copilot.eindex.me/doc/setup"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('options.connection.guide')}
          </a>
        </div>

        {error && !loading && (
          <p role="alert" className="text-sm text-destructive break-words sm:col-span-3">
            {error === true ? t('options.connection.failed') : error}
          </p>
        )}

        {notice && (
          <p role="status" className="text-sm text-primary sm:col-span-3">
            {t('options.connection.saved')}
          </p>
        )}
      </div>
    </PageSection>
  );
};
