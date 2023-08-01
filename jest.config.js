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
  setupFilesAfterEnv: ['./src/setupTests.ts'],
};
