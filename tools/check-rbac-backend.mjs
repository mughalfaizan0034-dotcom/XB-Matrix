#!/usr/bin/env node
// Backend RBAC canonicalization guard.
//
// Bans inline role-string comparisons outside the canonical permissions
// module(s). Capability decisions must compose named guards from
// apps/api/src/lib/permissions.ts so the frontend useCan() mirror and
// the backend never drift (D-005).
//
// Forbidden patterns inside apps/api/src/** and apps/worker/src/**:
//   - actor.effectiveRole === '...'      (any inline actor role check)
//   - <field>.role === 'super_admin'     (or other role-string literal)
//   - <expr>.includes('super_admin')     (single or double-quoted)
//
// Allowed locations (exempt):
//   - apps/api/src/lib/permissions.ts        (canonical guard module)
//
// Intentionally simple — one pass over a known set of paths with three
// regexes. No AST, no per-file directives. Re-tighten later if needed.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const SCAN_ROOTS = [
  'apps/api/src',
  'apps/worker/src',
];
const EXEMPT_PATHS = new Set([
  // Canonical guard module. The only place that can name roles.
  ['apps', 'api', 'src', 'lib', 'permissions.ts'].join(sep),
]);

const ROLE_LITERALS = [
  'super_admin',
  'internal_manager',
  'internal_staff',
  'organization_admin',
  'organization_user',
];
const ROLE_ALT = ROLE_LITERALS.join('|');

const PATTERNS = [
  {
    name: 'inline actor role compare',
    regex: /effectiveRole\s*[!=]==/,
  },
  {
    name: 'inline role-string compare',
    regex: new RegExp(String.raw`\.role\s*[!=]==\s*['"](?:${ROLE_ALT})['"]`),
  },
  {
    name: 'includes(role-literal)',
    regex: new RegExp(String.raw`\.includes\(\s*['"](?:${ROLE_ALT})['"]\s*\)`),
  },
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') continue;
      walk(full, out);
    } else if (st.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const root of SCAN_ROOTS) {
  walk(join(repoRoot, root), files);
}

const violations = [];
for (const file of files) {
  const rel = relative(repoRoot, file);
  if (EXEMPT_PATHS.has(rel)) continue;
  let lines;
  try {
    lines = readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    continue;
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Skip line-comments so doc references in JSDoc don't trip the guard.
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    for (const { name, regex } of PATTERNS) {
      if (regex.test(line)) {
        violations.push({ file: rel, line: i + 1, pattern: name, text: line.trim() });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Backend RBAC guard: forbidden inline role checks detected.');
  console.error('Compose capability guards from apps/api/src/lib/permissions.ts instead.');
  console.error('');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]`);
    console.error(`    ${v.text}`);
  }
  console.error('');
  console.error(`${violations.length} violation(s) across ${new Set(violations.map((v) => v.file)).size} file(s).`);
  process.exit(1);
}

console.log(`Backend RBAC guard: OK (${files.length} files scanned).`);
