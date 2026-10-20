#!/usr/bin/env node

// Local dev builds only. Release versions are owned by release-please
// (see RELEASING.md); this never produces one.
//
// Writes X.Y.Z.N into package.json, where X.Y.Z is the current version and N
// is the commit count, so a locally loaded build can be told apart from the
// published one (browsers accept up to four numeric parts, each <= 65535).
// Do not commit the result; `pnpm version:reset` restores package.json.

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = join(projectRoot, 'package.json');

// CI builds must keep the release version: publish.yml derives zip names from it.
if (process.env.CI) {
  console.log('CI detected, not writing package.json');
  process.exit(0);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const baseVersion = packageJson.version.split('.').slice(0, 3).join('.');
const commitCount = execSync('git rev-list --count HEAD', {
  encoding: 'utf8',
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'ignore'],
}).trim();

const devVersion = `${baseVersion}.${commitCount % 65535}`;
packageJson.version = devVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(`Updated package.json version to ${devVersion}`);
