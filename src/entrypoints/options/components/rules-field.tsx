import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/react';
import { checkTemplatePattern } from '@/utils/template-rules';

interface RulesFieldProps {
  id?: string;
  value?: string[];
  /** `undefined`: no rules. */
  onChange: (rules: string[] | undefined) => void;
}

// Examples of URL patterns: values, not words.
const PLACEHOLDER = 'github.com, *.example.com, github.com/*/issues/*';

/**
 * The URL patterns a template is chosen for: the patterns as removable rows,
 * and a field that adds one once it is valid (checked as it is typed).
 */
export const RulesField: React.FC<RulesFieldProps> = ({ id, value = [], onChange }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const typed = text.trim();
  const check = typed ? checkTemplatePattern(typed) : null;
  const error = check && !check.ok ? check.error : null;

  const add = () => {
    if (!typed || error) return;
    if (!value.includes(typed)) onChange([...value, typed]);
    setText('');
  };

  const remove = (rule: string) => {
    const rest = value.filter((item) => item !== rule);
    onChange(rest.length > 0 ? rest : undefined);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5" aria-label={t('options.templates.rules.patterns')}>
          {value.map((rule) => (
            <li
              key={rule}
              className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 py-1 pl-3 pr-1 font-mono text-sm"
            >
              <span className="truncate">{rule}</span>
              <button
                type="button"
                aria-label={t('options.templates.rules.remove', { rule })}
                onClick={() => remove(rule)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={PLACEHOLDER}
          aria-invalid={error ? true : undefined}
          className="font-mono"
        />
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={!typed || !!error}
          aria-label={t('options.templates.rules.addLabel')}
        >
          <Plus className="size-4" />
          {t('options.templates.rules.add')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};
