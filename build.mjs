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

const env = JSON.stringify(process.env.NODE_ENV || 'production');

async function deleteOldDir() {
  await fs.remove(outdir);
}

async function runEsbuild() {
  await esbuild.build({
    entryPoints: [
      'src/pages/content/index.tsx',
      'src/pages/background/index.ts',
      'src/pages/options/index.tsx',
    ],
    bundle: true,
    outdir: outdir,
    treeShaking: true,
    minify: env === 'production' ? true : false,
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': env,
      'process.env.AXIOM_TOKEN': JSON.stringify(
        process.env.AXIOM_TOKEN || 'UNDEFINED',
      ),
    },
    jsxFragment: 'Fragment',
    jsx: 'automatic',
    loader: {
      '.png': 'dataurl',
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

async function zipFolder(dir) {
  const output = fs.createWriteStream(`${dir}.zip`);
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
    { src: 'src/pages/options/index.html', dst: 'options.html' },
    { src: 'src/assets', dst: 'assets' },
  ];

  // chromium
  await copyFiles([...commonFiles], `./${outdir}/chrome`);
  await fs.writeFile(
    `./${outdir}/chrome/manifest.json`,
    JSON.stringify(getManifest('chrome')),
  );
  await zipFolder(`./${outdir}/chrome`);

  // edge
  await copyFiles([...commonFiles], `./${outdir}/edge`);
  await fs.writeFile(
    `./${outdir}/edge/manifest.json`,
    JSON.stringify(getManifest('edge')),
  );
  await zipFolder(`./${outdir}/edge`);

  console.log('Build success.');
}

build();
