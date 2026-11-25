Samples for `tests/pipeline/store-gate.test.mjs`.

- `amo-addon.json`: AMO `GET /api/v5/addons/addon/logseq-copilot/`, recorded
  2026-11-25 and cut down to the fields the gate reads.
- `edge-product-details.json`: Edge `getproductdetailsbycrxid/ebigopegbohijaikegebaaboaomaifoi`
  (the data the public store page loads), recorded 2026-11-25, cut down.
- `edge-page-changed.html`: the store page shell as the Edge endpoint would
  return it if Microsoft moved the data (the real page HTML has no version).
- `chrome-*.json`: Chrome Web Store API v2 `fetchStatus`, written from the
  documented response schema (the call needs the publish credentials, which
  only the `publish` environment has).
