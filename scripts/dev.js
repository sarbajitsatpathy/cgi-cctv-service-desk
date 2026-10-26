// Starts wrangler dev with local D1 state outside the (deeply nested) project
// directory. On Windows, SQLite cannot create its database file when the path
// approaches MAX_PATH, which makes every D1 query fail with an opaque error.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const persist = join(tmpdir(), 'cgi-cctv-service-desk-state');
mkdirSync(persist, { recursive: true });

const wrangler = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const child = spawn(
  process.execPath,
  [wrangler, 'dev', '--port', '8787', '--persist-to', persist, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
