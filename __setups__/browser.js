require('jest-webextension-mock');

const getDetails = (details, cb) => {
    if (cb !== undefined) {
      return cb();
    }
    return Promise.resolve();
  };

browser.action = browser.browserAction;
browser.action.setBadgeTextColor = jest.fn();


