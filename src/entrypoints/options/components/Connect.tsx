import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useEffect } from 'react';
import { log } from '@/utils';
import { useSettings } from '@/hooks/use-settings';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import type { LogseqCopliotConfig } from '@/utils/storage';
import { isValidLogseqHostName, isValidLogseqPort } from '@/utils/connection';

/** Wait this long after the last edit before checking the connection. */
export const CHECK_DEBOUNCE_MS = 600;

/**
 * Why the connection settings cannot be checked yet, or null when they can.
 * An empty token is the "not configured yet" state, not an error.
 */
const validateConnection = (
  config: Pick<LogseqCopliotConfig, 'logseqHostName' | 'logseqPort' | 'logseqAuthToken'>,
): string | null => {
  if (!isValidLogseqHostName(config.logseqHostName)) {
    return 'Logseq Host is not a valid hostname!';
  }
  if (!isValidLogseqPort(config.logseqPort)) {
    return 'Logseq Port must be between 1 and 65535!';
  }
  if (!config.logseqAuthToken) {
    return 'Auth Token is missing';
  }
  return null;
};

export const LogseqConnectOptions = () => {
  const { settings: logseqConfig, loading: settingsLoading, updateSettings } = useSettings();
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [buttonMessage, setButtonMessage] = React.useState('Connect');
  const [notice, setNotice] = React.useState('');
  const [graph, setGraph] = React.useState<string | null>(null);
  const [showToken, setShowToken] = React.useState(false);
  // Only the newest check may update the state; older ones are stale.
  const latestCheck = React.useRef(0);
  const checkedOnce = React.useRef(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    const { name, value } = e.target;
    setNotice('');
    updateSettings({ [name]: value });
  };

  const changeLogseqPort = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    let port = e.target.value;
    if (port === '' || parseInt(port) < 0) {
      port = '0'
    }
    setNotice('');
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
          setButtonMessage(resp.msg || 'Connection failed');
          return false;
        }
      }
      const version = await service.getVersion();
      const graphName: string | null = await service.getGraph().catch(() => null);
      if (isStale()) return false;
      setConnected(true);
      setGraph(graphName || null);
      setButtonMessage(`Connected to Logseq v${version}!`);
      return true;
    } catch (error) {
      log.error('Connection check failed:', error);
      if (isStale()) return false;
      setConnected(false);
      setGraph(null);
      setButtonMessage(
        error instanceof Error && error.message ? error.message : 'Connection error',
      );
      return false;
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  // The settings are already saved on every change (updateSettings), so
  // "Connect" only tests them and keeps the user on this page.
  const save = async () => {
    if (!logseqConfig) {
      setButtonMessage('Configuration is not loaded yet!');
      return;
    }

    const invalid = validateConnection(logseqConfig);
    if (invalid) {
      setConnected(false);
      setButtonMessage(invalid);
      return;
    }

    setNotice('');
    if (await checkConnection(true)) {
      setNotice('Settings saved and connected to Logseq.');
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
      // Nothing is wrong with an empty token yet; the user has not started.
      setButtonMessage(logseqAuthToken ? invalid : 'Connect');
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
    <Card>
      <CardHeader>
        <CardTitle>Logseq Connect</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 items-center">
          <Label className="col-span-2 text-sm">Host</Label>
          <Label className="text-sm">Port (1 ~ 65535)</Label>

          <Input
            className="col-span-2"
            name="logseqHostName"
            placeholder="Logseq Host"
            onChange={onChange}
            value={logseqConfig?.logseqHostName || ''}
          />
          <Input
            type="number"
            min={1}
            max={65535}
            name="logseqPort"
            placeholder="Port"
            onChange={changeLogseqPort}
            value={logseqConfig?.logseqPort || ''}
          />

          <Label className="text-sm">Authorization Token</Label>
          <div className="col-span-3 relative">
            <Input
              name="logseqAuthToken"
              type={showToken ? 'text' : 'password'}
              onChange={onChange}
              value={logseqConfig?.logseqAuthToken || ''}
              placeholder="Logseq Authorization Token"
              className="pr-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7"
              onClick={triggerShowToken}
            >
              {showToken ? 'Hide' : 'Show'}
            </Button>
          </div>

          <Button
            className="col-span-3"
            onClick={save}
            variant="outline"
            disabled={loading}
          >
            {loading ? 'Connecting...' : buttonMessage}
          </Button>

          {notice && (
            <p role="status" className="col-span-3 text-sm text-primary">
              {notice}
            </p>
          )}

          <div className="col-span-3 flex items-center justify-between">
            {connected && graph ? (
              <a
                className="text-sm text-primary hover:underline"
                href={`logseq://graph/${graph}`}
              >
                Open {graph} in Logseq
              </a>
            ) : (
              <span />
            )}
            <a
              className={`text-sm hover:underline ${!connected ? 'text-destructive' : 'text-primary'}`}
              href="https://logseq-copilot.eindex.me/doc/setup"
              target="_blank"
              rel="noopener noreferrer"
            >
              Guide to Connection
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
