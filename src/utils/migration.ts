import { browser } from 'wxt/browser';
import { storageItems, templates } from './storage';
import { log } from '@/utils';

/**
 * Migrates existing browser storage data to WXT storage format
 * This should be called once during the extension startup to ensure
 * existing user data is preserved when upgrading to the new storage system
 */
export const migrateToWXTStorage = async (): Promise<void> => {
  try {
    // Check if migration has already been completed
    const migrationCompleted = await storageItems.version.getValue();
    if (migrationCompleted) {
      // Migration already completed, no need to run again
      return;
    }

    log.info('[Migration] Starting migration to WXT storage...');

    // Get all existing data from browser storage
    const existingData = await browser.storage.local.get();

    // If no existing data, no migration needed
    if (!existingData || Object.keys(existingData).length === 0) {
      log.info('[Migration] No existing data found, setting defaults...');
      // Set a version to mark migration as completed
      await storageItems.version.setValue('1.6.0');
      return;
    }

    log.info('[Migration] Found existing data:', Object.keys(existingData));

    // Migrate each field that exists in the old storage
    const migrationPromises: Promise<void>[] = [];

    if (existingData.version !== undefined) {
      migrationPromises.push(
        storageItems.version.setValue(existingData.version),
      );
    }
    if (existingData.logseqHost !== undefined) {
      migrationPromises.push(
        storageItems.logseqHost.setValue(existingData.logseqHost),
      );
    }
    if (existingData.logseqHostName !== undefined) {
      migrationPromises.push(
        storageItems.logseqHostName.setValue(existingData.logseqHostName),
      );
    }
    if (existingData.logseqPort !== undefined) {
      migrationPromises.push(
        storageItems.logseqPort.setValue(existingData.logseqPort),
      );
    }
    if (existingData.logseqAuthToken !== undefined) {
      migrationPromises.push(
        storageItems.logseqAuthToken.setValue(existingData.logseqAuthToken),
      );
    }
    if (existingData.enableClipNoteFloatButton !== undefined) {
      migrationPromises.push(
        storageItems.enableClipNoteFloatButton.setValue(
          existingData.enableClipNoteFloatButton,
        ),
      );
    }
    if (existingData.clipNoteLocation !== undefined) {
      migrationPromises.push(
        storageItems.clipNoteLocation.setValue(existingData.clipNoteLocation),
      );
    }
    if (existingData.clipNoteCustomPage !== undefined) {
      migrationPromises.push(
        storageItems.clipNoteCustomPage.setValue(
          existingData.clipNoteCustomPage,
        ),
      );
    }
    if (existingData.clipNoteTemplate !== undefined) {
      migrationPromises.push(
        storageItems.clipNoteTemplate.setValue(existingData.clipNoteTemplate),
      );
    }

    // Execute all migrations in parallel
    await Promise.all(migrationPromises);

    // Migrate old global template settings to new template system
    if (
      existingData.clipNoteTemplate ||
      existingData.clipNoteLocation ||
      existingData.clipNoteCustomPage
    ) {
      log.info(
        '[Migration] Migrating global template settings to new template system...',
      );

      // Check if templates already exist
      const existingTemplates = await templates.getValue();

      // Only migrate if we have the default template and old settings exist
      if (
        existingTemplates.length === 1 &&
        existingTemplates[0].id === 'default'
      ) {
        const migratedTemplate = {
          id: 'default',
          name: 'Default',
          content:
            existingData.clipNoteTemplate ||
            `#[[Clip]] [{{title}}]({{url}})
{{content}}`,
          clipNoteLocation: existingData.clipNoteLocation || 'journal',
          clipNoteCustomPage: existingData.clipNoteCustomPage || '',
        };

        await templates.setValue([migratedTemplate]);
        log.info(
          '[Migration] Successfully migrated global template settings to default template',
        );
      }
    }

    // Set version to mark migration as completed
    if (!existingData.version) {
      await storageItems.version.setValue('1.6.0');
    }

    log.info('[Migration] Migration to WXT storage completed successfully');

    // Optional: Clean up old storage keys after successful migration
    // Uncomment if you want to remove old data after migration
    // await browser.storage.local.clear();
  } catch (error) {
    log.error('[Migration] Failed to migrate to WXT storage:', error);
    // Don't throw the error to prevent breaking the extension startup
    // The extension should still work with default values
  }
};

/**
 * Gets the migration status
 */
export const getMigrationStatus = async (): Promise<{
  isCompleted: boolean;
  version: string;
}> => {
  const version = await storageItems.version.getValue();
  return {
    isCompleted: !!version,
    version: version || 'unknown',
  };
};
