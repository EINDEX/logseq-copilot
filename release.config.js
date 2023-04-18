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
    "@semantic-release/git",
  ],
  branches: ['release'],
};
