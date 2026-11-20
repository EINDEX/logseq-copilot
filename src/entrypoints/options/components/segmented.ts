import { cn } from '@/lib/utils';

/** The track of a segmented control (Outline / Text, Save to). */
export const segmentedGroupClass = 'inline-flex gap-0.5 rounded-md bg-muted p-0.5';

/** One segment of a segmented control; the pressed one is raised. */
export const segmentClass = (pressed: boolean, disabled = false) =>
  cn(
    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    pressed
      ? 'bg-background text-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground',
    disabled && 'cursor-not-allowed opacity-50 hover:text-muted-foreground',
  );
