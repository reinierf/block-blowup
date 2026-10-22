// scripts/check-prod-build.ts
// `npm run check:prod` (after `vite build`): fail if test-only code reached the
// production bundle. The `?seed&test=1` hook must exist only in dev and test builds.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['__blowup', 'installTestHook'];
const dir = 'dist/assets';

const offenders: string[] = [];
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.js')) continue;
  const text = readFileSync(join(dir, file), 'utf8');
  for (const word of FORBIDDEN) if (text.includes(word)) offenders.push(`${file}: ${word}`);
}

if (offenders.length) {
  console.error('Test-only code found in the production build:\n  ' + offenders.join('\n  '));
  process.exit(1);
}
console.log(`Production build is clean (${FORBIDDEN.join(', ')} absent).`);
