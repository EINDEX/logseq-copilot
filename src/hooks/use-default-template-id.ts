import { useEffect, useState } from 'react';
import { defaultTemplateIdItem } from '@/utils/storage';
import log from '@/utils/logger';

/**
 * The stored id of the default template, `null` until the user chooses. It
 * may name a template that is gone: resolve it with `resolveDefaultTemplate`.
 */
export function useDefaultTemplateId(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    defaultTemplateIdItem.getValue().then(
      (value) => {
        if (current) setId(value);
      },
      (error) => log.debug('[useDefaultTemplateId] Failed to read it', error),
    );
    const stop = defaultTemplateIdItem.watch((value) => {
      if (current) setId(value);
    });
    return () => {
      current = false;
      stop();
    };
  }, []);

  return id;
}
