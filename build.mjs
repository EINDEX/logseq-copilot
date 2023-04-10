import archiver from 'archiver';
import autoprefixer from 'autoprefixer';
import * as dotenv from 'dotenv';
import esbuild from 'esbuild';
import postcssPlugin from 'esbuild-style-plugin';
import fs from 'fs-extra';
import process from 'node:process';
import tailwindcss from 'tailwindcss';
import getManifest from './src/manifest.json.cjs';
import remToPx from 'postcss-rem-to-pixel';

dotenv.config();

const outdir = 'build';

const nodeEnv = JSON.stringify(process.env.NODE_ENV || 'production');
const VERSION = `${process.env.VERSION}` || '0.0.0';

async function deleteOldDir() {
  await fs.remove(outdir);
}

async function runEsbuild() {
  await esbuild.build({
    entryPoints: [
      'src/pages/content/index.tsx',
      'src/pages/background/index.ts',
      'src/pages/options/index.tsx',
      'src/pages/popup/index.tsx',
    ],
    bundle: true,
    outdir: outdir,
    treeShaking: true,
    minify: nodeEnv === 'production' ? true : false,
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': nodeEnv,
      'process.env.VERSION': JSON.stringify(VERSION),
    },
    jsxFragment: 'Fragment',
    jsx: 'automatic',
    loader: {
      '.png': 'dataurl',
      '.woff2': 'dataurl',
    },
    plugins: [
      postcssPlugin({
        postcss: {
          plugins: [tailwindcss, autoprefixer, remToPx],
        },
      }),
    ],
  });
}

async function zipFolder(dir, version) {
  const output = fs.createWriteStream(`${dir}-${version}.zip`);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });
  archive.pipe(output);
  archive.directory(dir, false);
  await archive.finalize();
}

async function copyFiles(entryPoints, targetDir) {
  await fs.ensureDir(targetDir);
  await Promise.all(
    entryPoints.map(async (entryPoint) => {
      await fs.copy(entryPoint.src, `${targetDir}/${entryPoint.dst}`);
    }),
  );
}

async function build() {
  await deleteOldDir();
  await runEsbuild();

  const commonFiles = [
    { src: 'build/content/index.js', dst: 'content-script.js' },
    { src: 'build/content/index.css', dst: 'content-script.css' },
    { src: 'build/background/index.js', dst: 'background.js' },
    { src: 'build/options/index.js', dst: 'options.js' },
    { src: 'build/options/index.css', dst: 'options.css' },
    { src: 'build/popup/index.js', dst: 'popup.js' },
    { src: 'build/popup/index.css', dst: 'popup.css' },
    { src: 'src/pages/options/index.html', dst: 'options.html' },
    { src: 'src/pages/popup/index.html', dst: 'popup.html' },
    { src: 'src/assets', dst: 'assets' },
  ];

  // chromium
  await copyFiles([...commonFiles], `./${outdir}/chrome`);
  await fs.writeFile(
    `./${outdir}/chrome/manifest.json`,
    JSON.stringify(getManifest('chrome')),
  );
  await zipFolder(`./${outdir}/chrome`, VERSION);

  // edge
  await copyFiles([...commonFiles], `./${outdir}/edge`);
  await fs.writeFile(
    `./${outdir}/edge/manifest.json`,
    JSON.stringify(getManifest('edge')),
  );
  await zipFolder(`./${outdir}/edge`, VERSION);

  // firefox
  await copyFiles([...commonFiles], `./${outdir}/firefox`);
  await fs.writeFile(
    `./${outdir}/firefox/manifest.json`,
    JSON.stringify(getManifest('firefox')),
  );
  await zipFolder(`./${outdir}/firefox`, VERSION);

  console.log('Build success.');
}

build();
