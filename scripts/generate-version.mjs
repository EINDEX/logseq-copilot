#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import semver from 'semver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const packageJsonPath = join(projectRoot, 'package.json');

/**
 * Writes are opt-in: in CI (GitHub Actions sets CI=true) the script never
 * touches package.json, because publish.yml derives the zip file name from
 * package.json's version.
 */
const isCI = !!process.env.CI;

function readPackageJson() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8'));
}

/** package.json version reduced to X.Y.Z (drops a 4th dev build number). */
function getBaseVersion() {
  return readPackageJson().version.split('.').slice(0, 3).join('.');
}

function writeVersion(version) {
  if (isCI) {
    console.log(`CI detected, not writing package.json (would be ${version})`);
    return false;
  }
  const packageJson = readPackageJson();
  packageJson.version = version;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated package.json version to ${version}`);
  return true;
}

/**
 * Get git commit messages since the last tag
 */
function getCommitsSinceLastTag() {
  try {
    // Get the latest tag
    const latestTag = execSync('git describe --tags --abbrev=0', {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    // Get commits since the latest tag
    const commits = execSync(`git log ${latestTag}..HEAD --oneline --pretty=format:"%s"`, {
      encoding: 'utf8',
      cwd: projectRoot
    }).trim();

    return commits ? commits.split('\n') : [];
  } catch (error) {
    // No reachable tag (e.g. a shallow CI clone) or no git at all: there is
    // no reliable range to analyze, so keep the current version.
    console.warn('Warning: no git tag found, keeping current version');
    return [];
  }
}

/**
 * Simple parser for conventional commits
 */
function parseConventionalCommit(message) {
  // Match conventional commit format: type(scope): description
  const conventionalRegex = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
  const match = message.match(conventionalRegex);

  if (match) {
    return {
      type: match[1],
      scope: match[2],
      breaking: !!match[3],
      description: match[4],
      isConventional: true
    };
  }

  // Check for breaking change in body
  const hasBreaking = message.includes('BREAKING CHANGE:') || message.includes('BREAKING-CHANGE:');

  return {
    type: null,
    scope: null,
    breaking: hasBreaking,
    description: message,
    isConventional: false
  };
}

/**
 * Analyze commits to determine version bump type
 */
function analyzeCommits(commits) {
  let hasMajor = false;
  let hasMinor = false;
  let hasPatch = false;

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit);

    // Check for breaking changes
    if (parsed.breaking) {
      hasMajor = true;
      continue;
    }

    // Check commit type
    switch (parsed.type) {
      case 'feat':
        hasMinor = true;
        break;
      case 'fix':
      case 'perf':
      case 'refactor':
      case 'build':
      case 'revert':
        hasPatch = true;
        break;
      case 'docs':
      case 'style':
      case 'test':
      case 'chore':
      case 'ci':
        // These don't bump version by default
        break;
      default:
        // If no conventional commit type but has content, consider it a patch
        if (!parsed.isConventional && commit.trim()) {
          hasPatch = true;
        }
        break;
    }
  }

  if (hasMajor) return 'major';
  if (hasMinor) return 'minor';
  if (hasPatch) return 'patch';
  return null;
}

/**
 * Generate version based on git commits
 */
function generateVersion() {
  try {
    const currentVersion = getBaseVersion();

    console.log(`Current version: ${currentVersion}`);

    // Get commits since last tag
    const commits = getCommitsSinceLastTag();

    if (commits.length === 0) {
      console.log('No new commits found, keeping current version');
      return currentVersion;
    }

    console.log(`Found ${commits.length} commits since last version:`);
    commits.forEach(commit => console.log(`  - ${commit}`));

    // Analyze commits to determine bump type
    const bumpType = analyzeCommits(commits);

    if (!bumpType) {
      console.log('No version-bumping commits found, keeping current version');
      return currentVersion;
    }

    // Generate new version
    const newVersion = semver.inc(currentVersion, bumpType);

    if (!newVersion) {
      console.error('Failed to generate new version');
      return currentVersion;
    }

    console.log(`Bump type: ${bumpType}`);
    console.log(`New version: ${newVersion}`);

    writeVersion(newVersion);

    return newVersion;
  } catch (error) {
    console.error('Error generating version:', error.message);
    // Return current version on error
    return readPackageJson().version;
  }
}

/**
 * Generate version based on commit count if no conventional commits
 */
function generateVersionFromCommitCount() {
  try {
    const baseVersion = getBaseVersion();

    // Get total commit count
    const commitCount = execSync('git rev-list --count HEAD', {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    // Generate development version (X.Y.Z.N: browsers accept up to four
    // numeric parts, each at most 65535)
    const devVersion = `${baseVersion}.${commitCount % 65535}`;

    console.log(`Generated development version: ${devVersion}`);

    writeVersion(devVersion);

    return devVersion;
  } catch (error) {
    console.error('Error generating version from commit count:', error.message);
    return readPackageJson().version;
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const isDev = args.includes('--dev');
  const isDryRun = args.includes('--dry-run');

  let version;

  if (isDryRun) {
    version = previewVersion();
  } else if (isDev) {
    version = generateVersionFromCommitCount();
  } else {
    version = generateVersion();
  }

  console.log(`Final version: ${version}`);
}

/**
 * Preview what the next version would be without updating files
 */
function previewVersion() {
  try {
    const currentVersion = getBaseVersion();

    console.log(`Current version: ${currentVersion}`);

    // Get commits since last tag
    const commits = getCommitsSinceLastTag();

    if (commits.length === 0) {
      console.log('No new commits found, would keep current version');
      return currentVersion;
    }

    console.log(`Found ${commits.length} commits since last version:`);
    commits.forEach(commit => console.log(`  - ${commit}`));

    // Analyze commits to determine bump type
    const bumpType = analyzeCommits(commits);

    if (!bumpType) {
      console.log('No version-bumping commits found, would keep current version');
      return currentVersion;
    }

    // Generate new version
    const newVersion = semver.inc(currentVersion, bumpType);

    if (!newVersion) {
      console.error('Failed to generate new version');
      return currentVersion;
    }

    console.log(`Bump type: ${bumpType}`);
    console.log(`Would update to: ${newVersion}`);
    console.log('(DRY RUN - no files were modified)');

    return newVersion;
  } catch (error) {
    console.error('Error previewing version:', error.message);
    return readPackageJson().version;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
} 