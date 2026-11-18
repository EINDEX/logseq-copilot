import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/hooks/use-settings';
import { PageSection } from './page-layout';
import { ShortcutRecorder } from './ShortcutRecorder';


export const ClipNoteOptions = () => {
  const { settings: logseqConfig, updateSettings } = useSettings();
  const updateConfig = (key: string, value: string | boolean) => {
    updateSettings({ [key]: value });
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

        <Label htmlFor="highlight-clipped-text">Highlight clipped text</Label>
        <Switch
          id="highlight-clipped-text"
          // On unless the user turned it off, also while the settings load.
          checked={logseqConfig?.highlightClippedText ?? true}
          onCheckedChange={(checked) => updateConfig('highlightClippedText', checked)}
        />

        <Label htmlFor="save-images">Save images to Logseq</Label>
        <div className="flex items-center gap-2">
          <Switch
            id="save-images"
            checked={logseqConfig?.saveImagesToLogseq ?? false}
            onCheckedChange={(checked) => updateConfig('saveImagesToLogseq', checked)}
          />
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
            Experimental
          </Badge>
        </div>

        <Label htmlFor="clip-shortcut">Clip Shortcut</Label>
        <ShortcutRecorder />
      </div>
    </PageSection>
  );
};
