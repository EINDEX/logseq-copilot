import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ParseKeys } from 'i18next';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/use-settings';
import { useTranslation } from '@/i18n/react';
import { PageSection } from './page-layout';

/** An experimental switch: a boolean setting that is off until the user turns it on. */
interface ExperimentalSwitch {
  /** Element id; the label points at it. */
  id: string;
  /** Key of the label text. */
  label: ParseKeys;
  /** Key in the settings. */
  setting: 'saveImagesToLogseq';
}

/** Add a switch here and it shows in the section. */
const EXPERIMENTAL_SWITCHES: ExperimentalSwitch[] = [
  { id: 'save-images', label: 'options.settings.experimental.saveImages', setting: 'saveImagesToLogseq' },
];

export const ExperimentalOptions = () => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <PageSection>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="experimental-switches"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex cursor-pointer items-center gap-1 text-base font-semibold select-none hover:text-foreground/80"
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {t('options.settings.experimental.title')}
      </button>
      <div id="experimental-switches" hidden={!open} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('options.settings.experimental.description')}
        </p>
        <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
          {EXPERIMENTAL_SWITCHES.map(({ id, label, setting }) => (
            <div key={id} className="contents">
              <Label htmlFor={id}>{t(label)}</Label>
              <Switch
                id={id}
                checked={settings?.[setting] ?? false}
                onCheckedChange={(checked) => updateSettings({ [setting]: checked })}
              />
            </div>
          ))}
        </div>
      </div>
    </PageSection>
  );
};
