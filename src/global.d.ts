import type Browser from 'webextension-polyfill';

declare global {
  var browser: Browser.Browser;
}
