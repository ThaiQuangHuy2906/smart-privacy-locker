'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const forbidden = [
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!replace_me|$)\S+/,
];
const scan = ['node-red', 'dashboard', 'supabase', 'tools', 'tests'];
const ignored = new Set(['node_modules', '.git', '.pio']);
let findings = 0;
function visit(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    if (ignored.has(path.basename(target))) return;
    for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
    return;
  }
  if (!/\.(?:js|json|md|sql|html|css|example)$/.test(target)) return;
  const text = fs.readFileSync(target, 'utf8');
  for (const pattern of forbidden) if (pattern.test(text)) { findings += 1; process.stderr.write(`forbidden pattern: ${path.relative(root, target)}\n`); }
}
for (const entry of scan) visit(path.join(root, entry));
if (findings) process.exitCode = 1;
else process.stdout.write('Configuration/secret assertions: PASS (0 findings)\n');
