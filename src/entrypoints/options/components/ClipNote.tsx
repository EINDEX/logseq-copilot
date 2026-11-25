import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/use-settings';
import { useTranslation } from '@/i18n/react';
import { PageSection } from './page-layout';
import { ShortcutRecorder } from './ShortcutRecorder';


export const ClipNoteOptions = () => {
  const { t } = useTranslation();
  const { settings: logseqConfig, updateSettings } = useSettings();
  const updateConfig = (key: string, value: string | boolean) => {
    updateSettings({ [key]: value });
  };

  return (
    <PageSection title={t('options.settings.clipNote.title')}>
      <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
        <Label htmlFor="floating-button">{t('options.settings.clipNote.floatingButton')}</Label>
        <Switch
          id="floating-button"
          checked={logseqConfig?.enableClipNoteFloatButton || false}
          onCheckedChange={(checked) => updateConfig('enableClipNoteFloatButton', checked)}
        />

        <Label htmlFor="highlight-clipped-text">{t('options.settings.clipNote.highlightClippedText')}</Label>
        <Switch
          id="highlight-clipped-text"
          // On unless the user turned it off, also while the settings load.
          checked={logseqConfig?.highlightClippedText ?? true}
          onCheckedChange={(checked) => updateConfig('highlightClippedText', checked)}
        />

        <Label htmlFor="clip-shortcut">{t('options.settings.clipNote.shortcut')}</Label>
        <ShortcutRecorder />
      </div>
    </PageSection>
  );
};
