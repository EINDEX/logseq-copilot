import { afterEach, describe, expect, test } from 'vitest';
import { CustomSearchEngine } from './searchingEngines';

type EngineConfig = ConstructorParameters<typeof CustomSearchEngine>[0];

// The built-in Kagi entry as stored by current and older versions.
const kagiConfig: EngineConfig = {
  id: 'kagi',
  name: 'Kagi',
  urlPattern: 'kagi\\.com$',
  querySelector: '?q',
  elementSelector: 'div.right-content-box',
  insertPosition: 'first',
};

describe('CustomSearchEngine.gotElement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Kagi', () => {
    test('mounts inside the right sidebar so Kagi keeps the column open', () => {
      document.body.innerHTML = `
        <div class="right-content-box">
          <div class="_0_right_sidebar"></div>
        </div>`;

      const container = new CustomSearchEngine(kagiConfig).gotElement();

      const sidebar = document.querySelector('._0_right_sidebar');
      expect(container).not.toBeNull();
      expect(container?.parentElement).toBe(sidebar);
      expect(sidebar?.firstElementChild).toBe(container);
      // Kagi's `:has(> ._0_right_sidebar > *)` rule now matches, so the box
      // keeps its width. The sidebar is still the box's only child.
      expect(document.querySelector('.right-content-box')?.children).toHaveLength(1);
    });

    test('goes before the content Kagi already has in the sidebar', () => {
      document.body.innerHTML = `
        <div class="right-content-box">
          <div class="_0_right_sidebar"><div class="infobox"></div></div>
        </div>`;

      const container = new CustomSearchEngine(kagiConfig).gotElement();

      const sidebar = document.querySelector('._0_right_sidebar');
      expect(sidebar?.firstElementChild).toBe(container);
      expect(sidebar?.children).toHaveLength(2);
    });

    test('falls back to the box when the sidebar element is missing', () => {
      document.body.innerHTML = '<div class="right-content-box"></div>';

      const container = new CustomSearchEngine(kagiConfig).gotElement();

      const box = document.querySelector('.right-content-box');
      expect(container?.parentElement).toBe(box);
    });

    test('returns null when the right column is missing', () => {
      document.body.innerHTML = '<div id="main"></div>';

      expect(new CustomSearchEngine(kagiConfig).gotElement()).toBeNull();
    });
  });

  test('other engines still mount directly in the configured element', () => {
    document.body.innerHTML = `
      <div class="layout-web__sidebar layout-web__sidebar--web">
        <div class="_0_right_sidebar"></div>
      </div>`;

    const container = new CustomSearchEngine({
      id: 'startpage',
      name: 'Startpage',
      urlPattern: 'startpage\\.com$',
      querySelector: '#q',
      elementSelector: 'div.layout-web__sidebar.layout-web__sidebar--web',
      insertPosition: 'first',
    }).gotElement();

    const sidebarColumn = document.querySelector('.layout-web__sidebar');
    expect(container?.parentElement).toBe(sidebarColumn);
    expect(sidebarColumn?.firstElementChild).toBe(container);
  });
});
