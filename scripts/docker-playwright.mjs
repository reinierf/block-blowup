// scripts/docker-playwright.mjs
// Run Playwright inside the pinned Linux image, the same one CI uses, so visual baselines
// match CI pixel for pixel. Usage: node scripts/docker-playwright.mjs [playwright args…]
// node_modules lives in a named Docker volume, so the host's (e.g. Windows) install is untouched.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const version = JSON.parse(
  readFileSync('node_modules/@playwright/test/package.json', 'utf8'),
).version;
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const args = process.argv.slice(2).join(' ');

// Pass through an extra root CA (e.g. antivirus TLS scanning) so npm inside the container
// can reach the registry the same way the host does.
const extraCa = process.env.NODE_EXTRA_CA_CERTS;
const caArgs =
  extraCa && existsSync(extraCa)
    ? ['-v', `${extraCa}:/tmp/extra-ca.pem:ro`, '-e', 'NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem']
    : [];

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--ipc=host',
    '-v',
    `${process.cwd()}:/work`,
    '-v',
    'blowup_node_modules:/work/node_modules',
    '-w',
    '/work',
    '-e',
    'VISUAL=1',
    '-e',
    'CI=1',
    ...caArgs,
    image,
    'bash',
    '-c',
    `npm ci --no-audit --no-fund && npx playwright test ${args}`,
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
