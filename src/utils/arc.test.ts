import { describe, expect, it } from 'vitest';
import { hasArcPalette } from './arc';

const style = (properties: Record<string, string>) => ({
  getPropertyValue: (name: string) => properties[name] ?? '',
});

describe('hasArcPalette', () => {
  it('finds the palette Arc puts on every page', () => {
    expect(
      hasArcPalette(
        style({
          '--arc-palette-background': '#1E1E2EFF',
          '--arc-palette-title': '#CDD6F4FF',
        }),
      ),
    ).toBe(true);
  });

  it('needs only one of its colors', () => {
    expect(hasArcPalette(style({ '--arc-palette-title': ' #fff ' }))).toBe(true);
  });

  it('is not fooled by an empty value', () => {
    expect(hasArcPalette(style({ '--arc-palette-background': ' ' }))).toBe(
      false,
    );
  });

  it('is not other browsers, nor a page with its own custom properties', () => {
    expect(hasArcPalette(style({}))).toBe(false);
    expect(hasArcPalette(style({ '--palette-background': '#000' }))).toBe(false);
  });

  it('reads a real computed style', () => {
    document.documentElement.style.setProperty(
      '--arc-palette-background',
      '#101010',
    );
    try {
      expect(hasArcPalette(getComputedStyle(document.documentElement))).toBe(
        true,
      );
    } finally {
      document.documentElement.style.removeProperty('--arc-palette-background');
    }
    expect(hasArcPalette(getComputedStyle(document.documentElement))).toBe(
      false,
    );
  });
});
