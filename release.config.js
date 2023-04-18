module.exports = {
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
      },
    ],
    '@semantic-release/release-notes-generator',
    "@semantic-release/changelog",
    ["@semantic-release/git", {
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    [
      '@semantic-release/github',
      {
        assets: [
          {path:'build/chrome-*.zip', label: "Chrome version"}, 
          {path:'build/edge-*.zip', label: "Edge version"},
          {path:'build/firefox-*.zip', label: "Firefox version"}
      ],
      },
    ],
  ],
  branches: ['release'],
};
