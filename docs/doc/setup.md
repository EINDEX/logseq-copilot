---
outline: deep
---
# Setup

Let's setup **Logseq Copilot in less than 5 minutes**.

## Setup Logseq API Server

### Enable API Service

1. Open Logseq `Settings`.
![Open Logseq settings](/screenshots/open-logseq-settings.png)

2. `Features` -> Enable `HTTP APIs Server`
![Enable http APIs Server Feature](/screenshots/enable-api-server-feature.png)

### Seting Authorization Token

1. Go to logseq copilot tool bar, Click `API` icon.
![click api button](/screenshots/click-api-button.png)

2. Click `Authorization tokens`.

![open authorization tokens](/screenshots/open-auth-tokens.png)

3. Click `Add new token`.
![click add new token](/screenshots/click-add-new-token.png)

4. You will see a row as below.
![empty auth tokens](/screenshots/empty-authorization-tokens.png)

5. Fill name as `logseq-copilot`, value is a secret, eg. `secret-value`, then click `Save`.
![fill auth token](/screenshots/fill-auth-token.png)

:::info
The `value` of `Authorization token` is a secret string, suggest to setting like a random string.
:::

### Seting API Server Auto Start

1. Go to logseq copilot tool bar, Click `API` icon.
![click api button](/screenshots/click-api-button.png)

2. Click `Server configurations`.

![click server configurations](/screenshots/click-server-configurations.png)

3. Toggle on `Auto start server with the app launched`.
![toggle on auto start](/screenshots/auto-start.png)

4. Click `Save & Apply`.

### Start Server

1. Go to logseq copilot tool bar, Click `API` icon.
![click api button](/screenshots/click-api-button.png)

2. Click `Start Server`.

![click start server](/screenshots/click-start-server.png)

### Check Server is started

1. Go to logseq copilot tool bar, Click `API` icon.
![click api button](/screenshots/click-api-button.png)

2. If you see something like below, your `API` server is setting correct.

![check api server panel](/screenshots/success-enable-api-server.png)

## Setting up Browser Extension

1. Open `Logseq Copilot` option in your browser.
![Open Logseq Copilot Option](/screenshots/open-logseq-copilot-option.png)

2. Fill the token, the secret `value` you just setting in Logseq `Authorization token`.
![setting token on extension](/screenshots/setting-token-on-extension.png)

3. Click `Conncet`.
![click connect](/screenshots/click-connect.png)

4. If you see something like below.
![success connected](/screenshots/success-connected.png)

:::info
If you see something else, please check [logseq](/doc/setup.md#check-server-is-started).
:::

5. You can use Logseq Copilot now! 🥳🥳🥳
