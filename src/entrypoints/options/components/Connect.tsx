import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useEffect } from 'react';
import { log } from '@/utils';
import { useSettings } from '@/hooks/use-settings';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import { settings } from '@/utils/storage';

export const LogseqConnectOptions = () => {
  const { settings: logseqConfig, loading: settingsLoading, updateSettings } = useSettings();
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [buttonMessage, setButtonMessage] = React.useState('Connect');
  const [showToken, setShowToken] = React.useState(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    const { name, value } = e.target;
    updateSettings({ [name]: value });
  };

  const changeLogseqPort = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    let port = e.target.value;
    if (port === '' || parseInt(port) < 0) {
      port = '0'
    }
    updateSettings({ logseqPort: parseInt(port) });
  }

  const triggerShowToken = () => setShowToken(!showToken);

  const save = async () => {
    if (!logseqConfig) {
      setButtonMessage('Configuration is not loaded yet!');
      return;
    }

    try {
      if (logseqConfig.logseqHost) new URL(`http://${logseqConfig.logseqHost}`);
    } catch (error) {
      setConnected(false);
      setButtonMessage('Logseq Host is not a valid hostname!');
      return;
    }

    try {
      // 配置已经通过 updateSettings 自动保存，不需要手动调用 settings.setValue
      log.info('Configuration saved!');

      if (await checkConnection()) { // 使用当前已保存的配置进行连接检查
        const service = await getLogseqService();
        const graph = await service.getGraph();
        log.info(`Logseq Graph -> ${graph}`);
        if (graph) {
          window.location.href = `logseq://graph/${graph}`;
        } else {
          setButtonMessage('Connected, but no graph found or specified.');
        }
      } else {
        setButtonMessage('Connection failed. Check console.');
      }
    } catch (error) {
      log.error("Save operation failed:", error);
      setButtonMessage('Save failed. Check console.');
      setLoading(false); // 确保在错误时停止加载
    }
  };


  useEffect(() => {
    if (settingsLoading || !logseqConfig) return;

    const initializeConnection = async () => {
      log.debug('config', logseqConfig);
      if (logseqConfig.logseqAuthToken === '') {
        setLoading(false);
        return;
      }

      await checkConnection();
    };

    initializeConnection();
  }, [settingsLoading, logseqConfig]);

  const checkConnection = async (currentConfig?: typeof logseqConfig): Promise<boolean> => {
    const configToUse = currentConfig || logseqConfig;
    if (!configToUse || !configToUse.logseqAuthToken) { // 确保有 token 才尝试连接
      setLoading(false);
      setConnected(false);
      setButtonMessage('Auth Token is missing');
      return false;
    }

    setLoading(true);
    try {
      // getLogseqService 会内部获取配置，不需要传递参数
      const service = await getLogseqService();
      const resp = await service.showMsg('Logseq Copilot Connect!');
      const connectStatus = resp.msg === 'success';
      setConnected(connectStatus);
      if (connectStatus) {
        const version = await service.getVersion();
        setButtonMessage(`Connected to Logseq v${version}!`);
      } else {
        setButtonMessage(resp.msg || 'Connection failed');
      }
      return connectStatus;
    } catch (error) {
      log.error('Connection check failed:', error);
      setConnected(false);
      setButtonMessage('Connection error');
      return false;
    } finally {
      setLoading(false);
    }
  };

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

          <div className="col-span-3 text-right">
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
