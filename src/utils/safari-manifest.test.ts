import { describe, expect, it } from 'vitest';
import { dropUnsupportedSafariKeys } from './safari-manifest';

const manifest = () => ({
  permissions: ['storage', 'sidePanel', 'activeTab'],
  side_panel: { default_path: 'sidepanel.html' },
  web_accessible_resources: [
    {
      resources: ['content-scripts/content.css'],
      matches: ['<all_urls>'],
      use_dynamic_url: true,
    },
  ],
});

describe('dropUnsupportedSafariKeys', () => {
  it('drops side_panel, the sidePanel permission and use_dynamic_url', () => {
    expect(dropUnsupportedSafariKeys(manifest())).toEqual({
      permissions: ['storage', 'activeTab'],
      web_accessible_resources: [
        {
          resources: ['content-scripts/content.css'],
          matches: ['<all_urls>'],
        },
      ],
    });
  });

  it('copes with a manifest that has none of them', () => {
    expect(dropUnsupportedSafariKeys({})).toEqual({});
  });
});
