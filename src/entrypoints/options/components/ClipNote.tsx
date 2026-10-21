import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/use-settings';
import { PageSection } from './page-layout';

import React, { useEffect } from 'react';
import { browser } from 'wxt/browser';

export const ClipNoteOptions = () => {
  const { settings: logseqConfig, updateSettings } = useSettings();
  const [clipShortCut, setClipShortCut] = React.useState<string>('');

  useEffect(() => {
    browser.commands
      .getAll()
      .then((commands) =>
        commands.forEach(
          (command) =>
            command.name === 'clip' && setClipShortCut(command.shortcut || ''),
        ),
      );
  }, []);

  const updateConfig = (key: string, value: string | boolean) => {
    updateSettings({ [key]: value });
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig(e.target.name, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  };



  return (
    <PageSection title="Clip Note">
      <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
        <Label htmlFor="floating-button">Floating Button</Label>
        <Switch
          id="floating-button"
          checked={logseqConfig?.enableClipNoteFloatButton || false}
          onCheckedChange={(checked) => updateConfig('enableClipNoteFloatButton', checked)}
        />

        <Label htmlFor="clip-shortcut">Clip Shortcuts</Label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Input
            id="clip-shortcut"
            name="clip-shortcut"
            value={clipShortCut}
            readOnly={true}
            className="w-48"
          />
          <a
            href="https://www.makeuseof.com/open-browser-extensions-keyboard-shortcut/"
            className="text-sm text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Guide to change Shortcut for Extension/Add-ons
          </a>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Clip location and custom page settings are now configured per template.
        Go to Templates → Select a template to configure these settings.
      </p>
    </PageSection>
  );
};
