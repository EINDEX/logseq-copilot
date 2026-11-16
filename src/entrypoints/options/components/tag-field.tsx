import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { sendMessage } from '@/types/messaging';
import type { TemplateTag } from '@/utils/storage';

interface TagFieldProps {
  id?: string;
  value?: TemplateTag;
  /** `undefined`: no tag. */
  onChange: (tag: TemplateTag | undefined) => void;
}

type Load = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The tag a template puts on its clips' first block: a combobox over the
 * tags of the Logseq graph (read when it opens), where a name that is not in
 * the list can be chosen as new. Without Logseq the list stays empty and the
 * field takes any name typed into it.
 */
export const TagField: React.FC<TagFieldProps> = ({ id, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<TemplateTag[]>([]);
  const [load, setLoad] = useState<Load>('idle');

  // Asked once, on the first open; a failed read is asked again the next time.
  const requested = useRef(false);
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    setLoad('loading');
    sendMessage('logseq:listTags').then(
      (list) => {
        setTags(Array.isArray(list) ? list : []);
        setLoad('ready');
      },
      () => {
        requested.current = false;
        setTags([]);
        setLoad('failed');
      },
    );
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const choose = (tag: TemplateTag | undefined) => {
    onChange(tag);
    close();
  };

  const typed = query.trim();
  const matches = useMemo(
    () =>
      tags.filter((tag) => tag.name.toLowerCase().includes(typed.toLowerCase())),
    [tags, typed],
  );
  const exists = tags.some((tag) => tag.name.toLowerCase() === typed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        {/* A plain button: the popover needs a ref to anchor to. */}
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'w-full justify-between font-normal sm:w-72',
          )}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value ? `#${value.name}` : 'No tag'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search or type a tag"
          />
          <CommandList>
            {matches.length === 0 && !typed && (
              <CommandEmpty>
                {load === 'loading' ? 'Loading…' : load === 'failed' ? 'Logseq is not reachable' : 'No tags'}
              </CommandEmpty>
            )}
            {value && !typed && (
              <CommandGroup>
                <CommandItem value="__none__" onSelect={() => choose(undefined)}>
                  <X />
                  No tag
                </CommandItem>
              </CommandGroup>
            )}
            {(matches.length > 0 || (typed && !exists)) && (
              <CommandGroup>
                {matches.map((tag) => (
                  <CommandItem
                    key={tag.uuid ?? tag.name}
                    value={tag.name}
                    onSelect={() => choose(tag)}
                  >
                    <Check
                      className={cn(
                        value?.name.toLowerCase() === tag.name.toLowerCase()
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                    />
                    {tag.name}
                  </CommandItem>
                ))}
                {typed && !exists && (
                  <CommandItem
                    value={`__new__${typed}`}
                    onSelect={() => choose({ name: typed })}
                  >
                    <Plus />
                    {typed}
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
