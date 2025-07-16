// Test script to verify @webext-core/messaging integration
import { messaging } from '@/types/messaging';

// Test function to verify messaging works
export const testMessaging = async () => {
  console.log('Testing @webext-core/messaging integration...');

  try {
    // Test search message
    const searchResult = await messaging.sendMessage(
      'logseq:search',
      'test query',
    );
    console.log('Search test result:', searchResult);

    // Test URL search message
    const urlSearchResult = await messaging.sendMessage('logseq:urlSearch', {
      url: 'https://example.com',
      options: { fuzzy: true },
    });
    console.log('URL search test result:', urlSearchResult);

    console.log('Messaging integration test completed successfully!');
  } catch (error) {
    console.error('Messaging integration test failed:', error);
  }
};

// Make test function globally available in dev mode
if (import.meta.env.DEV) {
  (window as any).testMessaging = testMessaging;
  console.log('Messaging test function available: testMessaging()');
}
