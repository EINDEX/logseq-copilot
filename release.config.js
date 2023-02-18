module.exports = {
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
      },
    ],
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [{path: 'build/chrome.zip', label: "Chrome version"}, {path:'build/edge.zip', label: "Edge version"}],
      },
    ],
  ],
  branches: ['main'],
};
