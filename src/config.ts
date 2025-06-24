// Re-export from the new storage utilities for backward compatibility
export type { LogseqCopliotConfig } from './utils/storage';
export {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
  storageItems,
} from './utils/storage';
