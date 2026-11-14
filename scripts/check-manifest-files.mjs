#!/usr/bin/env node
// Fails when a built manifest.json names a file that is not in the build.
// Chrome loads such a package; Edge Add-ons rejects it ("Manifest file
// reference ... does not exist in the zip archive").
//
// Usage: node scripts/check-manifest-files.mjs .output/chrome-mv3 [...]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const asList = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];

// An icon is a path or a { size: path } map.
const icons = (value) =>
  typeof value === 'string' ? [value] : Object.values(value ?? {});

function referencedFiles(manifest) {
  const refs = [];
  const add = (field, values) => {
    for (const file of asList(values)) refs.push({ field, file });
  };

  add('icons', icons(manifest.icons));
  for (const key of ['action', 'browser_action', 'page_action']) {
    add(`${key}.default_icon`, icons(manifest[key]?.default_icon));
    add(`${key}.default_popup`, manifest[key]?.default_popup);
  }
  add('background.service_worker', manifest.background?.service_worker);
  add('background.scripts', manifest.background?.scripts);
  add('background.page', manifest.background?.page);
  add('options_ui.page', manifest.options_ui?.page);
  add('options_page', manifest.options_page);
  add('side_panel.default_path', manifest.side_panel?.default_path);
  add('sidebar_action.default_panel', manifest.sidebar_action?.default_panel);
  add('sidebar_action.default_icon', icons(manifest.sidebar_action?.default_icon));
  add('devtools_page', manifest.devtools_page);
  add('chrome_url_overrides', Object.values(manifest.chrome_url_overrides ?? {}));
  for (const [i, script] of (manifest.content_scripts ?? []).entries()) {
    add(`content_scripts[${i}].js`, script.js);
    add(`content_scripts[${i}].css`, script.css);
  }
  for (const entry of manifest.web_accessible_resources ?? []) {
    // MV2 lists paths, MV3 lists { resources, matches } objects.
    add(
      'web_accessible_resources',
      typeof entry === 'string' ? entry : entry.resources,
    );
  }
  if (manifest.default_locale) {
    add('default_locale', `_locales/${manifest.default_locale}/messages.json`);
  }
  return refs;
}

function listFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? listFiles(full, base)
      : [path.relative(base, full).split(path.sep).join('/')];
  });
}

// web_accessible_resources may use `*` globs.
const globToRegExp = (glob) =>
  new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );

function check(dir) {
  const manifest = JSON.parse(
    readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
  );
  const files = listFiles(dir);
  const missing = referencedFiles(manifest).filter(({ file }) => {
    const rel = file.replace(/^\//, '');
    return rel.includes('*')
      ? !files.some((f) => globToRegExp(rel).test(f))
      : !existsSync(path.join(dir, rel));
  });
  for (const { field, file } of missing) {
    console.error(`✖ ${dir}: ${field} -> ${file} is not in the build`);
  }
  if (!missing.length) console.log(`✔ ${dir}: every manifest file exists`);
  return missing.length === 0;
}

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('Usage: check-manifest-files.mjs <build dir> [...]');
  process.exit(2);
}
const results = dirs.map(check);
process.exit(results.every(Boolean) ? 0 : 1);
