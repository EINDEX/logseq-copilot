# Changelog

## [2.0.0](https://github.com/EINDEX/logseq-copilot/compare/v1.15.2...v2.0.0) (2026-10-21)


### Features

* add recall rules configuration and integrate into options sidebar ([6988735](https://github.com/EINDEX/logseq-copilot/commit/698873567876d6a4fa9f13476cd0a2b35e1bac48))
* add version management scripts and pre-build hooks in package.json ([9055f06](https://github.com/EINDEX/logseq-copilot/commit/9055f067acc4c4fa88da9343fbc31fe6aae11626))
* **content:** use closed shadow roots in packaged builds ([f545090](https://github.com/EINDEX/logseq-copilot/commit/f5450905827d989d6acfa70cf845a2f4c41129db))
* implement highlights management system with sidebar integration and persistent highlight storage ([ae0d690](https://github.com/EINDEX/logseq-copilot/commit/ae0d690578ad3a0688837dc52a7a3492195313b6))
* integrate recall rules processing into hybrid search and URL search functionality ([46038ad](https://github.com/EINDEX/logseq-copilot/commit/46038ade94f8ac1eff735f2b94491124a436226d))
* migrate to WXT (file + DB graph support, integration tests) ([3a3e2bf](https://github.com/EINDEX/logseq-copilot/commit/3a3e2bffb38ee789d7713db11e13d9b5f59eed90))
* **options:** show the package version in the sidebar footer (from local WIP) ([e821373](https://github.com/EINDEX/logseq-copilot/commit/e8213739a021345ffeb9314d4f9c7d92249b695e))
* **recall-rules:** ship the built-in rules with English copy ([72150a8](https://github.com/EINDEX/logseq-copilot/commit/72150a8c480eb5d3c426f4bc1a9b515074e08035))


### Bug Fixes

* **background:** create context menus on install/update instead of every startup ([af40eb0](https://github.com/EINDEX/logseq-copilot/commit/af40eb0428e411700fa343039cb08604e4f80508))
* change TODO/DONE markers through webext-core request/response messaging ([9fd2405](https://github.com/EINDEX/logseq-copilot/commit/9fd2405cf7300801a159af0b7a997465744d3d43))
* **ci:** publish only validated release tags ([13bc90b](https://github.com/EINDEX/logseq-copilot/commit/13bc90bf102e86b2853372bba2fb289b52c4c4e8))
* **ci:** publish to current store APIs ([7188bf4](https://github.com/EINDEX/logseq-copilot/commit/7188bf4fa62af80c79ff99095920b9038e5c8b28))
* **clip:** fall back to page clip when there is no text selection ([094a210](https://github.com/EINDEX/logseq-copilot/commit/094a210c74d89463bbbbeff487beb5bcdbd1fa4a))
* **clip:** import turndown via ESM so content script has no runtime require ([526aee0](https://github.com/EINDEX/logseq-copilot/commit/526aee0447c858cbbce51c27e5c70cebf6d6ce55))
* **content:** do not block startup on highlight restore ([87ef1f2](https://github.com/EINDEX/logseq-copilot/commit/87ef1f27a7cd666370fac826687dac09804299ca))
* **content:** harden search-engine sidebar re-search ([4ec0f8e](https://github.com/EINDEX/logseq-copilot/commit/4ec0f8eb83b42e22a31ac15575888a335f25e754))
* **content:** keep the floating clip button small and off the selection ([7330876](https://github.com/EINDEX/logseq-copilot/commit/7330876160d2483595a0bdced1c69bf44a19a189))
* **content:** make the clip float button clickable ([a9264f1](https://github.com/EINDEX/logseq-copilot/commit/a9264f1dbaaa8cf3d2a1b629e277ca28b31b39c9))
* **content:** mount highlight popup and sidebar without the float button ([7a8a35c](https://github.com/EINDEX/logseq-copilot/commit/7a8a35c9ed1954580402cb77ad1999eb6514b92d))
* **content:** relay quick capture commands through the in-memory bus ([0779205](https://github.com/EINDEX/logseq-copilot/commit/0779205249b96d98162069efcf7bfad463b3a49b))
* **content:** search engine pages use keyword search only ([a1a350c](https://github.com/EINDEX/logseq-copilot/commit/a1a350c440fed0b27cb2c6817c5033bfdb1c4b84))
* **db:** call logseq.Editor.getPage, detect block hits, use status property for markers ([bbd0322](https://github.com/EINDEX/logseq-copilot/commit/bbd0322abaa79a60c11c0452a7b3e17eee37dc49))
* **highlight:** keep the comment popup open when clicking inside it ([0263a60](https://github.com/EINDEX/logseq-copilot/commit/0263a6087607591c98385afd6ce0555797ed1ba9))
* highlights work without the float button; options connection check ([1f0e479](https://github.com/EINDEX/logseq-copilot/commit/1f0e479c008728e805db26a6431984a49e1701d1))
* **highlights:** follow the host page theme for dark highlight colors ([13dfde5](https://github.com/EINDEX/logseq-copilot/commit/13dfde5f9ab4a504675adbfd62e848245f014063))
* **highlights:** limit the in-page sidebar to the current page ([ced244d](https://github.com/EINDEX/logseq-copilot/commit/ced244dbbec015d0c20820f1bd91ceb4c16fb68d))
* **highlights:** stop trusting DOM CustomEvents for the comment popup ([ec5a95b](https://github.com/EINDEX/logseq-copilot/commit/ec5a95b386c3f33a5d170b6f1344d5a40c74febd))
* **highlights:** tint page highlights with the Logseq teal ([6644d4b](https://github.com/EINDEX/logseq-copilot/commit/6644d4b4de42945129102b3e0c09eef275b628ec))
* **highlight:** support Firefox when resolving the clicked caret ([ab0c78b](https://github.com/EINDEX/logseq-copilot/commit/ab0c78bcbbbc528b6faacd82a2582bcda978243c))
* **migration:** migrate legacy clip settings into templates on install/update ([54b6e06](https://github.com/EINDEX/logseq-copilot/commit/54b6e06a36125098f5fad6ef31cd82d644dbda82))
* **options:** add /templates route and hide the AI configuration page ([ae317ea](https://github.com/EINDEX/logseq-copilot/commit/ae317ea0c8680ccad21d0146de4da0c2c855b0df))
* **options:** debounce the connection check and stay on the options page ([77501ef](https://github.com/EINDEX/logseq-copilot/commit/77501efa19bcd2965cd78394ebc6f133c270af5d))
* **popup:** search the current tab as soon as the popup opens ([0dea628](https://github.com/EINDEX/logseq-copilot/commit/0dea6285032dab09755690b2edb8105804483bf5))
* **popup:** tint search keyword marks in the popup too ([fe6ec63](https://github.com/EINDEX/logseq-copilot/commit/fe6ec638ca29ae8734d20023a67221415dea322a))
* **recall-rules:** apply page scope filters to hybridSearch page results ([a6e5d02](https://github.com/EINDEX/logseq-copilot/commit/a6e5d023d25976d314d09646d4436bba38aa43d8))
* **recall-rules:** keep the exclude and prefer keyword drafts apart ([06de2e3](https://github.com/EINDEX/logseq-copilot/commit/06de2e335c35e45d0c059d7993c6f04e000f6b21))
* **recall-rules:** match scope pages exactly and fail closed ([4c0e725](https://github.com/EINDEX/logseq-copilot/commit/4c0e725fca215d63f6b94829c8204c6b1fcecad2))
* remove Chromium-only assumptions for Firefox ([72a8429](https://github.com/EINDEX/logseq-copilot/commit/72a84299a2267318afc1d7e2ad4efcf1b32eff49))
* **search:** escape quotes and backslashes in DB.q query strings ([6597a52](https://github.com/EINDEX/logseq-copilot/commit/6597a5232da5f946b228fb0794db245b119fbab8))
* **search:** highlight all matches, escape regex, isolate marked state, pick file service when not a DB graph ([603305d](https://github.com/EINDEX/logseq-copilot/commit/603305d233fda5bf2bbd3ef2e521513ccf2a2c24))
* **search:** read uuid from DB search results (Logseq 2.x) ([05af5a7](https://github.com/EINDEX/logseq-copilot/commit/05af5a7f1bcaf5b7bd92f82c1084ef00c8f2b8bc))
* throw readable LogseqError and surface connection/API failures ([1349072](https://github.com/EINDEX/logseq-copilot/commit/13490726f3dc992ba8a9054eb05228f67d3aacad))
* **ui:** use Logseq teal tokens and make dark mode work everywhere ([0e58dd3](https://github.com/EINDEX/logseq-copilot/commit/0e58dd3864727cd32aea3c84c2bfdd0ea3b532d7))
* use hostname and port as the single source of Logseq connection config ([fe33572](https://github.com/EINDEX/logseq-copilot/commit/fe33572f285bd60f362c9ce8c4a9b425cb22aefd))


### Code Refactoring

* **log:** route all console output through the logger ([2e0de4a](https://github.com/EINDEX/logseq-copilot/commit/2e0de4abce466ab014998bd6a5ded8fb575a51d1))
* **options:** one full-width page layout with flat sections ([60f7053](https://github.com/EINDEX/logseq-copilot/commit/60f70532d5cf188ffbbd744e1e7a5cc6ab62673b))
* rename normal logseq client to markdown (from local WIP) ([9f1e5ae](https://github.com/EINDEX/logseq-copilot/commit/9f1e5aeb1236ea544e666f3504420a8b719010fc))
* **ui:** drop result count badges in search results (from local WIP) ([3f0509a](https://github.com/EINDEX/logseq-copilot/commit/3f0509a0382c7ec9d597ce35d0e788e71975d352))
