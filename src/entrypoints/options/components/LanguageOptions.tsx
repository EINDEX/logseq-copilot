import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  LANGUAGE_NAMES,
  parseUiLanguage,
  UI_LANGUAGES,
  type UiLanguage,
} from '@/i18n/language';
import { useTranslation } from '@/i18n/react';
import log from '@/utils/logger';
import { uiLanguageItem } from '@/utils/storage';
import { PageSection } from './page-layout';

/**
 * The language of the extension UI. Each language is named in itself; every
 * open page, sidebar and the context menu switch when it changes.
 */
export const LanguageOptions = () => {
  const { t } = useTranslation();
  // null while loading.
  const [setting, setSetting] = useState<UiLanguage | null>(null);

  useEffect(() => {
    uiLanguageItem
      .getValue()
      .then((value) => setSetting(parseUiLanguage(value)))
      .catch((error) =>
        log.error('[options] Failed to read the UI language:', error),
      );
    return uiLanguageItem.watch((value) => setSetting(parseUiLanguage(value)));
  }, []);

  const change = (value: string) => {
    const next = parseUiLanguage(value);
    setSetting(next);
    uiLanguageItem
      .setValue(next)
      .catch((error) =>
        log.error('[options] Failed to save the UI language:', error),
      );
  };

  return (
    <PageSection>
      <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
        <Label id="ui-language-label">
          {t('options.settings.language.label')}
        </Label>
        <RadioGroup
          aria-labelledby="ui-language-label"
          value={setting ?? 'auto'}
          disabled={setting === null}
          onValueChange={change}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {UI_LANGUAGES.map((language) => (
            <div key={language} className="flex items-center gap-2">
              <RadioGroupItem value={language} id={`ui-language-${language}`} />
              <Label
                htmlFor={`ui-language-${language}`}
                lang={language === 'auto' ? undefined : language}
              >
                {language === 'auto'
                  ? t('options.settings.language.auto')
                  : LANGUAGE_NAMES[language]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </PageSection>
  );
};
