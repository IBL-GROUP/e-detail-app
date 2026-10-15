#!/usr/bin/env node
/**
 * Bumps the app version before EVERY build — sandbox and production alike:
 *
 *   expo.version              1.0.8 -> 1.0.9   (patch; what people see)
 *   expo.android.versionCode  36    -> 37      (what Android compares)
 *   expo.ios.buildNumber      7     -> 8       (if present)
 *
 * ONE SEQUENCE ACROSS BOTH BRANCHES. Sandbox and prod ship the same Android
 * package (com.searle.edetailing), and Android refuses to install a lower
 * versionCode over a higher one — so a sandbox APK numbered below the prod app
 * cannot be put on a phone that has prod. The next number is therefore taken
 * from the HIGHEST of this checkout and the sandbox / prod branches (local and
 * origin), then incremented. No two builds, in either environment, ever share
 * a version name or code.
 *
 * Run by `npm run build:sandbox` / `npm run build:prod`. EAS's own autoIncrement
 * is off in eas.json for that reason — leaving it on would bump the code twice.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'app.json');
const raw = fs.readFileSync(file, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const config = JSON.parse(raw);
const expo = config.expo;

const parse = (version) => {
  const parts = String(version ?? '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
};
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** app.json as another branch has it, or null when that ref is missing. */
function appJsonAt(ref) {
  try {
    const text = execSync(`git show ${ref}:app.json`, {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return JSON.parse(text).expo;
  } catch {
    return null;
  }
}

const candidates = [expo, ...['sandbox', 'prod', 'origin/sandbox', 'origin/prod'].map(appJsonAt)]
  .filter(Boolean);

let highestVersion = parse(expo.version);
let highestCode = Number(expo.android?.versionCode) || 0;
for (const other of candidates) {
  const version = parse(other.version);
  if (compare(version, highestVersion) > 0) highestVersion = version;
  highestCode = Math.max(highestCode, Number(other.android?.versionCode) || 0);
}

const before = { version: expo.version, versionCode: expo.android?.versionCode };

expo.version = [highestVersion[0], highestVersion[1], highestVersion[2] + 1].join('.');
if (expo.android) expo.android.versionCode = highestCode + 1;
if (expo.ios?.buildNumber != null) {
  expo.ios.buildNumber = String((Number.parseInt(expo.ios.buildNumber, 10) || 0) + 1);
}

fs.writeFileSync(file, JSON.stringify(config, null, 2).split('\n').join(eol) + eol);
console.log(
  `[bump-version] version ${before.version} -> ${expo.version}, ` +
    `versionCode ${before.versionCode} -> ${expo.android?.versionCode} ` +
    `(next after the highest across sandbox + prod)`,
);
