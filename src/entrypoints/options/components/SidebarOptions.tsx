import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import log from '@/utils/logger';
import { hasNativeSidebar, usesInPageSidebar } from '@/utils/sidebar';
import { arcDetectedItem, inPageSidebarItem } from '@/utils/storage';
import { PageSection } from './page-layout';

/**
 * The sidebar drawn on pages instead of the browser's own. Browsers without
 * one always draw it, so they get no switch. The switch shows the sidebar in
 * use, Arc detection included, until the user turns it.
 */
export const SidebarOptions = () => {
  const native = hasNativeSidebar();
  // null while loading.
  const [inPage, setInPage] = useState<boolean | null>(null);

  useEffect(() => {
    if (!native) return;
    const read = () =>
      usesInPageSidebar()
        .then(setInPage)
        .catch((error) =>
          log.error('[options] Failed to read the sidebar setting:', error),
        );
    read();
    const unwatch = [inPageSidebarItem.watch(read), arcDetectedItem.watch(read)];
    return () => unwatch.forEach((stop) => stop());
  }, [native]);

  if (!native) return null;

  const change = (checked: boolean) => {
    setInPage(checked);
    inPageSidebarItem
      .setValue(checked)
      .catch((error) =>
        log.error('[options] Failed to save the sidebar setting:', error),
      );
  };

  return (
    <PageSection title="Sidebar">
      <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
        <Label htmlFor="in-page-sidebar">In-page sidebar</Label>
        <Switch
          id="in-page-sidebar"
          checked={inPage ?? false}
          disabled={inPage === null}
          onCheckedChange={change}
        />
      </div>
    </PageSection>
  );
};
