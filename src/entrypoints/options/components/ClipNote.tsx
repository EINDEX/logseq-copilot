import {
  LogseqCopliotConfig,
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
} from '@/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import React, { useEffect } from 'react';
import { browser } from 'wxt/browser';

export const ClipNoteOptions = () => {
  const [init, setInit] = React.useState(false);

  const [logseqConfig, setLogseqConfig] = React.useState<LogseqCopliotConfig>();

  const [clipShortCut, setClipShortCut] = React.useState<string>('');

  useEffect(() => {
    if (!init) {
      getLogseqCopliotConfig().then((config) => {
        setLogseqConfig(config);
        setInit(true);
      });

      browser.commands
        .getAll()
        .then((commands) =>
          commands.forEach(
            (command) =>
              command.name === 'clip' && setClipShortCut(command.shortcut || ''),
          ),
        );
    }
  });

  const updateConfig = (key: string, value: string | boolean) => {
    if (!logseqConfig) return;
    setLogseqConfig({
      ...logseqConfig,
      [key]: value,
    });
    saveLogseqCopliotConfig({
      [key]: value,
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig(e.target.name, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  };

  const onClipNoteLocationSelect = (value: string) => {
    updateConfig('clipNoteLocation', value);
  };

  const updateCustomPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('clipNoteCustomPage', event.target.value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clip Note</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[200px_1fr] gap-4 items-center">
          <Label htmlFor="floating-button">Floating Button</Label>
          <Switch
            id="floating-button"
            checked={logseqConfig?.enableClipNoteFloatButton || false}
            onCheckedChange={(checked) => updateConfig('enableClipNoteFloatButton', checked)}
          />

          <Label htmlFor="clip-shortcut">Clip Shortcuts</Label>
          <Input
            id="clip-shortcut"
            name="clip-shortcut"
            value={clipShortCut}
            readOnly={true}
          />

          <div className="col-span-2 text-right">
            <a
              href="https://www.makeuseof.com/open-browser-extensions-keyboard-shortcut/"
              className="text-sm text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Guide to change Shortcut for Extension/Add-ons
            </a>
          </div>

          <Label>Clip Location</Label>
          <RadioGroup
            defaultValue="journal"
            value={logseqConfig?.clipNoteLocation || 'journal'}
            onValueChange={onClipNoteLocationSelect}
          >
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="journal" id="journal" />
                <Label htmlFor="journal">Journal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="currentPage" id="currentPage" />
                <Label htmlFor="currentPage">Current Page</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="customPage" id="customPage" />
                <Label htmlFor="customPage">Custom Page</Label>
              </div>
            </div>
          </RadioGroup>

          <Label htmlFor="custom-page">Custom Page Name</Label>
          <Input
            id="custom-page"
            disabled={logseqConfig?.clipNoteLocation !== 'customPage'}
            name="customPage"
            value={logseqConfig?.clipNoteCustomPage || ''}
            onChange={updateCustomPage}
            placeholder="Custom Page Name"
          />
        </div>
      </CardContent>
    </Card>
  );
};
