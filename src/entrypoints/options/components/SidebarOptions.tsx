import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useStorageItem } from '@/hooks/use-storage-item';
import log from '@/utils/logger';
import { hasNativeSidebar, usesInPageSidebar } from '@/utils/sidebar';
import {
  arcDetectedItem,
  inPageSidebarItem,
  inPageSidebarPinnedItem,
} from '@/utils/storage';
import { PageSection } from './page-layout';

/**
 * The sidebar drawn on pages instead of the browser's own, and its pin.
 * Browsers without one always draw it, so they get no switch for it, only the
 * pin. The switch shows the sidebar in use, Arc detection included, until the
 * user turns it; the pin is there while the sidebar on pages is in use. It is
 * the same pin as the one in the sidebar's header.
 */
export const SidebarOptions = () => {
  const native = hasNativeSidebar();
  // null while loading.
  const [inPage, setInPage] = useState<boolean | null>(native ? null : true);
  const pinned = useStorageItem(inPageSidebarPinnedItem);

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

  const change = (checked: boolean) => {
    setInPage(checked);
    inPageSidebarItem
      .setValue(checked)
      .catch((error) =>
        log.error('[options] Failed to save the sidebar setting:', error),
      );
  };

  const pin = (checked: boolean) => {
    inPageSidebarPinnedItem
      .setValue(checked)
      .catch((error) => log.error('[options] Failed to save the pin:', error));
  };

  return (
    <PageSection title="Sidebar">
      <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
        {native && (
          <>
            <Label htmlFor="in-page-sidebar">In-page sidebar</Label>
            <Switch
              id="in-page-sidebar"
              checked={inPage ?? false}
              disabled={inPage === null}
              onCheckedChange={change}
            />
          </>
        )}
        {inPage && (
          <>
            <div className="space-y-1">
              <Label htmlFor="pin-in-page-sidebar">Pin</Label>
              <p id="pin-in-page-sidebar-hint" className="text-sm text-muted-foreground">
                Pages make room for it, and it stays open.
              </p>
            </div>
            <Switch
              id="pin-in-page-sidebar"
              aria-describedby="pin-in-page-sidebar-hint"
              checked={pinned ?? false}
              disabled={pinned === undefined}
              onCheckedChange={pin}
            />
          </>
        )}
      </div>
    </PageSection>
  );
};
