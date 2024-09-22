---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Logseq Copilot"
  text: "Connect Browser and Logseq"
  tagline: A bridge between logseq and browser, building your personal knowledge base easiey.
  actions:
    - theme: brand
      text: Setup
      link: /doc/
    - theme: alt
      text: Chrome
      link: https://chrome.google.com/webstore/detail/logseq-copilot/hihgfcgbmnbomabfdbajlbpnacndeihl
    - theme: alt
      text: Edge
      link: https://microsoftedge.microsoft.com/addons/detail/logseq-copilot/ebigopegbohijaikegebaaboaomaifoi
    - theme: alt
      text: Firefox
      link: https://addons.mozilla.org/en-US/firefox/addon/logseq-copilot/

features:
  - icon: 🔍
    title: Recall your notes when your search
    details: Search your Logseq notes when you search in your browser.
  - icon: 📝
    title: Quick Capture with Notes
    details: Record highlights with your idea immediately. [WIP] sub
                  featrue for noting everywhere.
  - icon: 📔
    title: Bring note to page
    details: Search your Logseq notes by the tabs you are currently using.
---

<script setup>
import Reviews from './components/Reviews.vue'
</script>


## Reviews

<Reviews />
