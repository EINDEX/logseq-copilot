module.exports = {
  transform: {
    '.+\\.ts$': [
      'esbuild-jest',
      {
        loaders: {
          '.ts': 'tsx',
          '.test.ts': 'tsx',
          '.test.js': 'jsx',
          '.js': 'jsx',
        },
      },
    ],
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.ts$',
  moduleFileExtensions: ['ts', 'js'],
  setupFiles: ['./__setups__/browser.js'],
  coverageReporters: ['json-summary', 'text', 'lcov'],
};
