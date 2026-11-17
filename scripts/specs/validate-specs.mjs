#!/usr/bin/env node
/**
 * Specification validator for the spec-first repository (see specs/README.md).
 *
 * Zero dependencies on purpose: it runs in CI with plain `node`, without
 * `npm ci`, and adds nothing to package-lock.json.
 *
 * What it checks (rule codes appear in every message):
 *   FM-*    front matter: present, required keys, allowed values, unique spec ids
 *   SEC-*   mandatory sections for domain / feature specs and the feature template
 *   ID-*    requirement IDs: format, registered prefix, unique, defined in the right spec
 *   COL-*   requirement tables: required columns and allowed Status values
 *   IMP-*   Implementation paths exist in the repository
 *   VER-*   Verification references resolve (test files exist, TC ids are defined)
 *   REF-*   every ID referenced in specs or in source comments is defined (or external)
 *   API-*   specs/api/openapi.json is well-formed, ids/refs resolve, and it matches
 *           the HTTP calls the app actually makes
 *   MTX-*   specs/traceability/matrix.md is up to date (only with --check-matrix)
 *
 * Usage:
 *   node scripts/specs/validate-specs.mjs                 validate, exit 1 on errors
 *   node scripts/specs/validate-specs.mjs --strict        warnings fail too
 *   node scripts/specs/validate-specs.mjs --write-matrix  regenerate the traceability matrix
 *   node scripts/specs/validate-specs.mjs --check-matrix  fail if the matrix is stale
 *   node scripts/specs/validate-specs.mjs --root <dir>    validate another checkout (tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Conventions (mirrored in specs/CONVENTIONS.md — change both together)
// ---------------------------------------------------------------------------

export const REQ_TYPES = ['FR', 'BR', 'NFR', 'SEC', 'DATA', 'INT', 'API'];
export const OTHER_TYPES = ['AC', 'TC', 'GAP'];
const ALL_TYPES = [...REQ_TYPES, ...OTHER_TYPES];

/** <PREFIX>-<TYPE>-<NNN>, e.g. CALL-BR-004. */
export const ID_PATTERN = new RegExp(`^([A-Z][A-Z0-9]{1,7})-(${ALL_TYPES.join('|')})-(\\d{3})$`);
const ID_SCAN = new RegExp(`\\b([A-Z][A-Z0-9]{1,7})-(${ALL_TYPES.join('|')})-(\\d{3})\\b`, 'g');

export const REQ_STATUSES = ['Implemented', 'Partial', 'Unconfirmed', 'Planned', 'Deprecated'];
export const GAP_STATUSES = ['Open', 'Confirmed', 'Resolved', 'Accepted'];
export const SPEC_STATUSES = ['Draft', 'In Review', 'Approved', 'Deprecated'];
export const SPEC_TYPES = [
  'index', 'process', 'standard', 'product', 'architecture', 'adr',
  'domain', 'feature', 'api', 'plan', 'template', 'traceability',
];
const FRONT_MATTER_KEYS = ['id', 'title', 'type', 'status', 'owner', 'last_reviewed'];

/** Required columns per ID type (case-insensitive header match). */
const COLUMNS = {
  REQ: ['ID', 'Requirement', 'Status', 'Implementation', 'Verification'],
  AC: ['ID', 'Criterion', 'Verifies'],
  TC: ['ID', 'Scenario', 'Expected', 'Verifies'],
  GAP: ['ID', 'Observation', 'Status'],
};

/** Source folders scanned for HTTP calls and for requirement-ID comments. */
const SOURCE_DIRS = ['app', 'api', 'components', 'config', 'constants', 'hooks', 'lib', 'providers', 'views'];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const toPosix = (p) => p.split(path.sep).join('/');

function walk(dir, filter) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').split('\n');
}

/** Strip markdown decoration from a table cell: **bold**, `code`, links. */
function plain(cell) {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .trim();
}

function splitRow(line) {
  // Split on unescaped pipes; drop the empty first/last cells of `| a | b |`.
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return cells.map((c) => c.replace(/\\\|/g, '|').trim());
}

/** Remove inline code spans — IDs inside backticks are examples, not references. */
function withoutInlineCode(text) {
  return text.replace(/`[^`]*`/g, '');
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseFrontMatter(lines) {
  if (lines[0]?.trim() !== '---') return null;
  const data = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '---') return { data, endLine: i + 1 };
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return null; // unterminated
}

/**
 * Parse a markdown spec into headings, ID tables and prose lines (with
 * line numbers). Fenced code blocks are skipped entirely.
 */
export function parseSpec(lines) {
  const headings = [];
  const tables = [];
  const prose = [];
  let inFence = false;
  let current = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      current = null;
      continue;
    }
    if (inFence) continue;

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) headings.push({ level: h[1].length, text: h[2].trim(), line: lineNo });

    if (/^\s*\|/.test(line)) {
      const cells = splitRow(line);
      if (!current) {
        current = { header: cells.map(plain), headerLine: lineNo, rows: [] };
        tables.push(current);
      } else if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        // separator row
      } else {
        current.rows.push({ cells, line: lineNo });
      }
    } else {
      current = null;
      prose.push({ text: line, line: lineNo });
    }
  }
  return { headings, tables, prose };
}

/** `a/b.ts:12`, `a/b.ts#L12`, `a/b.ts` → `a/b.ts`. Only backticked tokens count. */
export function extractPaths(cell) {
  const out = [];
  for (const m of cell.matchAll(/`([^`]+)`/g)) {
    const token = m[1].trim();
    if (!/[/.]/.test(token) || /\s/.test(token)) continue;
    out.push(token.replace(/#L\d+(-L?\d+)?$/, '').replace(/:\d+(-\d+)?$/, ''));
  }
  return out;
}

function idType(id) {
  const m = id.match(ID_PATTERN);
  if (!m) return null;
  return REQ_TYPES.includes(m[2]) ? 'REQ' : m[2];
}

// ---------------------------------------------------------------------------
// HTTP call extraction (for API drift detection)
// ---------------------------------------------------------------------------

function loadEndpointConstants(root) {
  const file = path.join(root, 'api', 'endpoints.ts');
  const map = {};
  if (!fs.existsSync(file)) return map;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) map[m[1]] = m[2];
  return map;
}

/** Normalise `/a/${x}` and `/a/{x}` to `/a/{}` so code and contract compare. */
export function normalisePath(p) {
  return p
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '') || '/';
}

export function extractHttpCalls(root) {
  const constants = loadEndpointConstants(root);
  const calls = [];
  const callRe = new RegExp(
    `\\baxios\\.(${HTTP_METHODS.join('|')})\\s*(?:<[^>]*>)?\\(\\s*(?:'([^']+)'|"([^"]+)"|\`([^\`]+)\`|ApiEndpoints\\.(\\w+))`,
    'g',
  );
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(path.join(root, dir), (n) => SOURCE_EXT.test(n))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(callRe)) {
        const raw = m[2] ?? m[3] ?? m[4] ?? constants[m[5]];
        if (!raw || !raw.startsWith('/')) continue;
        const line = text.slice(0, m.index).split('\n').length;
        calls.push({
          method: m[1].toUpperCase(),
          path: normalisePath(raw),
          file: toPosix(path.relative(root, file)),
          line,
        });
      }
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validate({ root, checkMatrix = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (file, line, rule, msg) => errors.push({ file, line, rule, msg });
  const warn = (file, line, rule, msg) => warnings.push({ file, line, rule, msg });

  const specsDir = path.join(root, 'specs');
  const registryFile = path.join(specsDir, 'registry.json');
  if (!fs.existsSync(specsDir)) {
    err('specs', 0, 'STRUCT-001', 'specs/ directory is missing');
    return { errors, warnings, ids: new Map() };
  }
  if (!fs.existsSync(registryFile)) {
    err('specs/registry.json', 0, 'STRUCT-002', 'registry.json is missing');
    return { errors, warnings, ids: new Map() };
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  } catch (e) {
    err('specs/registry.json', 0, 'STRUCT-003', `registry.json is not valid JSON: ${e.message}`);
    return { errors, warnings, ids: new Map() };
  }
  const prefixes = registry.prefixes ?? {};
  const external = registry.external ?? {};
  const requiredSections = registry.requiredSections ?? {};

  for (const required of registry.requiredFiles ?? []) {
    if (!fs.existsSync(path.join(root, required))) {
      err(required, 0, 'STRUCT-004', `required file or directory is missing: ${required}`);
    }
  }

  const specFiles = walk(specsDir, (n) => n.endsWith('.md'));
  const ids = new Map(); // id -> { file, line, type, status, title, impl, verification }
  const references = []; // { id, file, line }
  const pendingVerification = []; // { refs, file, line, id }
  const specIds = new Map();

  for (const abs of specFiles) {
    const rel = toPosix(path.relative(root, abs));
    const lines = readLines(abs);
    const fm = parseFrontMatter(lines);

    // ---- front matter
    if (!fm) {
      err(rel, 1, 'FM-001', 'missing or unterminated front matter (--- ... ---)');
      continue;
    }
    const meta = fm.data;
    for (const key of FRONT_MATTER_KEYS) {
      if (!meta[key]) err(rel, 1, 'FM-002', `front matter is missing "${key}"`);
    }
    if (meta.type && !SPEC_TYPES.includes(meta.type)) {
      err(rel, 1, 'FM-003', `type "${meta.type}" is not one of: ${SPEC_TYPES.join(', ')}`);
    }
    if (meta.status && !SPEC_STATUSES.includes(meta.status)) {
      err(rel, 1, 'FM-004', `status "${meta.status}" is not one of: ${SPEC_STATUSES.join(', ')}`);
    }
    if (meta.last_reviewed && !/^\d{4}-\d{2}-\d{2}$/.test(meta.last_reviewed)) {
      err(rel, 1, 'FM-005', `last_reviewed "${meta.last_reviewed}" is not YYYY-MM-DD`);
    }
    if (meta.id) {
      if (specIds.has(meta.id)) {
        err(rel, 1, 'FM-006', `spec id "${meta.id}" is also used by ${specIds.get(meta.id)}`);
      } else specIds.set(meta.id, rel);
    }

    const parsed = parseSpec(lines);

    // ---- mandatory sections
    const sectionKey = meta.type === 'template' && meta.template_for ? `template:${meta.template_for}` : meta.type;
    const needed = requiredSections[sectionKey] ?? [];
    const present = new Set(
      parsed.headings.filter((h) => h.level === 2).map((h) => h.text.replace(/^\d+(\.\d+)*\.?\s*/, '').toLowerCase()),
    );
    for (const section of needed) {
      if (!present.has(section.toLowerCase())) {
        err(rel, fm.endLine, 'SEC-001', `missing mandatory section "## ${section}" for type "${sectionKey}"`);
      }
    }

    // Templates hold placeholder IDs, and the generated matrix only repeats IDs defined
    // elsewhere (counting its references would make regeneration non-idempotent) —
    // structure only for both.
    if (meta.type === 'template' || meta.type === 'traceability') continue;

    // ---- ID tables
    for (const table of parsed.tables) {
      if (table.header[0]?.toUpperCase() !== 'ID') continue;
      const header = table.header.map((h) => h.toLowerCase());
      const col = (name) => header.indexOf(name.toLowerCase());

      for (const row of table.rows) {
        const id = plain(row.cells[0] ?? '');
        if (!ID_PATTERN.test(id)) {
          err(rel, row.line, 'ID-001', `"${id}" does not match <PREFIX>-<TYPE>-<NNN> (types: ${ALL_TYPES.join(', ')})`);
          continue;
        }
        const [, prefix] = id.match(ID_PATTERN);
        const type = idType(id);

        if (external[prefix]) {
          err(rel, row.line, 'ID-002', `${id} uses external prefix ${prefix}; it is owned by ${external[prefix].source} and cannot be defined here`);
          continue;
        }
        if (!prefixes[prefix]) {
          err(rel, row.line, 'ID-003', `${id} uses unregistered prefix "${prefix}" (add it to specs/registry.json)`);
        } else if (prefixes[prefix].spec && prefixes[prefix].spec !== rel) {
          err(rel, row.line, 'ID-004', `${id} must be defined in ${prefixes[prefix].spec} (prefix owner)`);
        }
        if (ids.has(id)) {
          const first = ids.get(id);
          err(rel, row.line, 'ID-005', `duplicate requirement ID ${id} (first defined at ${first.file}:${first.line})`);
          continue;
        }

        const missing = COLUMNS[type].filter((c) => col(c) === -1);
        if (missing.length) {
          err(rel, table.headerLine, 'COL-001', `table defining ${type} IDs is missing column(s): ${missing.join(', ')}`);
        }
        const cell = (name) => (col(name) >= 0 ? row.cells[col(name)] ?? '' : '');

        const entry = {
          file: rel,
          line: row.line,
          type,
          title: plain(cell(type === 'REQ' ? 'Requirement' : type === 'AC' ? 'Criterion' : type === 'TC' ? 'Scenario' : 'Observation')),
          status: plain(cell('Status')),
          impl: cell('Implementation'),
          verification: cell(type === 'REQ' ? 'Verification' : 'Verifies'),
        };
        ids.set(id, entry);

        if (type === 'REQ' || type === 'GAP') {
          const allowed = type === 'REQ' ? REQ_STATUSES : GAP_STATUSES;
          if (col('Status') >= 0 && !allowed.includes(entry.status)) {
            err(rel, row.line, 'COL-002', `${id} status "${entry.status}" is not one of: ${allowed.join(', ')}`);
          }
        }

        if (type === 'REQ') {
          if (!plain(entry.title)) err(rel, row.line, 'COL-003', `${id} has an empty Requirement`);
          const implPaths = extractPaths(entry.impl);
          if (!implPaths.length && !['Planned', 'Deprecated'].includes(entry.status)) {
            err(rel, row.line, 'IMP-001', `${id} is "${entry.status}" but names no Implementation path`);
          }
          for (const p of implPaths) {
            if (!fs.existsSync(path.join(root, p))) {
              err(rel, row.line, 'IMP-002', `${id} Implementation path does not exist: ${p}`);
            }
          }
          const v = entry.verification;
          const testPaths = extractPaths(v);
          for (const p of testPaths) {
            if (!fs.existsSync(path.join(root, p))) {
              err(rel, row.line, 'VER-001', `${id} Verification test file does not exist: ${p}`);
            }
          }
          const tcRefs = [...withoutInlineCode(v).matchAll(ID_SCAN)].map((m) => m[0]);
          if (tcRefs.length) pendingVerification.push({ id, refs: tcRefs, file: rel, line: row.line });
          if (!testPaths.length && !tcRefs.length && !['Planned', 'Deprecated'].includes(entry.status)) {
            warn(rel, row.line, 'VER-002', `${id} has no verification (no test file, no TC id)`);
          }
        }
      }
    }

    // ---- references anywhere in the document (prose and table cells)
    for (const p of parsed.prose) {
      for (const m of withoutInlineCode(p.text).matchAll(ID_SCAN)) references.push({ id: m[0], file: rel, line: p.line });
    }
    for (const table of parsed.tables) {
      for (const row of table.rows) {
        row.cells.slice(1).forEach((c) => {
          for (const m of withoutInlineCode(c).matchAll(ID_SCAN)) references.push({ id: m[0], file: rel, line: row.line });
        });
      }
    }
  }

  // ---- verification references must be TC/AC ids that exist
  for (const v of pendingVerification) {
    for (const ref of v.refs) {
      const t = ids.get(ref);
      if (!t) continue; // reported by REF-001 below
      if (!['TC', 'AC'].includes(t.type)) {
        err(v.file, v.line, 'VER-003', `${v.id} Verification references ${ref}, which is not a TC or AC`);
      }
    }
  }

  // ---- references in source code comments
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(path.join(root, dir), (n) => SOURCE_EXT.test(n))) {
      const rel = toPosix(path.relative(root, file));
      readLines(file).forEach((text, i) => {
        for (const m of text.matchAll(ID_SCAN)) references.push({ id: m[0], file: rel, line: i + 1, code: true });
      });
    }
  }

  const externalRefs = new Map();
  for (const ref of references) {
    const [, prefix] = ref.id.match(ID_PATTERN);
    if (external[prefix]) {
      externalRefs.set(ref.id, (externalRefs.get(ref.id) ?? 0) + 1);
      continue;
    }
    if (!ids.has(ref.id)) {
      err(ref.file, ref.line, 'REF-001', `${ref.id} is referenced but not defined in any spec`);
    }
  }

  // ---- AC / TC "Verifies" must point at requirements
  for (const [id, entry] of ids) {
    if (entry.type !== 'AC' && entry.type !== 'TC') continue;
    const refs = [...withoutInlineCode(entry.verification).matchAll(ID_SCAN)].map((m) => m[0]);
    if (!refs.length) err(entry.file, entry.line, 'VER-004', `${id} "Verifies" names no requirement ID`);
  }

  // ---- OpenAPI contract
  validateOpenApi({ root, ids, external, err, warn });

  // ---- traceability matrix
  if (checkMatrix) {
    const matrixFile = path.join(root, 'specs', 'traceability', 'matrix.md');
    const expected = renderMatrix(ids, externalRefs);
    const actual = fs.existsSync(matrixFile) ? fs.readFileSync(matrixFile, 'utf8').replace(/\r\n?/g, '\n') : '';
    if (stripGenerated(actual) !== stripGenerated(expected)) {
      err('specs/traceability/matrix.md', 0, 'MTX-001', 'traceability matrix is stale — run `npm run specs:matrix` and commit the result');
    }
  }

  return { errors, warnings, ids, externalRefs };
}

function validateOpenApi({ root, ids, external, err, warn }) {
  const rel = 'specs/api/openapi.json';
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return;

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(rel, 0, 'API-001', `openapi.json is not valid JSON: ${e.message}`);
    return;
  }
  if (!/^3\.\d+\.\d+$/.test(String(doc.openapi ?? ''))) err(rel, 0, 'API-002', 'openapi must be a 3.x.y version string');
  if (!doc.info?.title || !doc.info?.version) err(rel, 0, 'API-003', 'info.title and info.version are required');
  if (!doc.paths || typeof doc.paths !== 'object') {
    err(rel, 0, 'API-004', 'paths object is required');
    return;
  }

  // $ref resolution (local refs only).
  const resolve = (ref) =>
    ref.startsWith('#/')
      ? ref.slice(2).split('/').reduce((node, key) => (node == null ? undefined : node[key.replace(/~1/g, '/').replace(/~0/g, '~')]), doc)
      : undefined;
  const visit = (node, where) => {
    if (Array.isArray(node)) node.forEach((n, i) => visit(n, `${where}[${i}]`));
    else if (node && typeof node === 'object') {
      if (typeof node.$ref === 'string' && resolve(node.$ref) === undefined) {
        err(rel, 0, 'API-005', `unresolved $ref "${node.$ref}" at ${where}`);
      }
      for (const [k, v] of Object.entries(node)) visit(v, `${where}.${k}`);
    }
  };
  visit(doc, '$');

  const operationIds = new Set();
  const documented = new Set();
  for (const [p, item] of Object.entries(doc.paths)) {
    if (!p.startsWith('/')) err(rel, 0, 'API-006', `path "${p}" must start with "/"`);
    const templated = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const where = `${method.toUpperCase()} ${p}`;
      documented.add(`${method.toUpperCase()} ${normalisePath(p)}`);
      if (!op.operationId) err(rel, 0, 'API-007', `${where} has no operationId`);
      else if (operationIds.has(op.operationId)) err(rel, 0, 'API-008', `duplicate operationId "${op.operationId}"`);
      else operationIds.add(op.operationId);
      if (!op.responses || !Object.keys(op.responses).length) err(rel, 0, 'API-009', `${where} has no responses`);
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((x) => (x.$ref ? resolve(x.$ref) : x));
      for (const name of templated) {
        if (!params.some((x) => x?.in === 'path' && x?.name === name)) {
          err(rel, 0, 'API-010', `${where} does not declare path parameter "${name}"`);
        }
      }
      const reqs = op['x-requirements'] ?? [];
      if (!reqs.length) warn(rel, 0, 'API-011', `${where} has no x-requirements (traceability to specs)`);
      for (const id of reqs) {
        const m = String(id).match(ID_PATTERN);
        if (!m) err(rel, 0, 'API-012', `${where} x-requirements "${id}" is not a valid ID`);
        else if (!external[m[1]] && !ids.has(id)) err(rel, 0, 'API-013', `${where} x-requirements ${id} is not defined in any spec`);
      }
    }
  }

  // Drift: every HTTP call the app makes must be in the contract.
  const inCode = new Map();
  for (const call of extractHttpCalls(root)) {
    const key = `${call.method} ${call.path}`;
    if (!inCode.has(key)) inCode.set(key, call);
  }
  for (const [key, call] of inCode) {
    if (!documented.has(key)) {
      err(call.file, call.line, 'API-014', `${key} is called by the app but not documented in ${rel}`);
    }
  }
  for (const key of documented) {
    if (!inCode.has(key)) warn(rel, 0, 'API-015', `${key} is documented but no call to it was found in the app`);
  }
}

// ---------------------------------------------------------------------------
// Traceability matrix
// ---------------------------------------------------------------------------

const GENERATED_MARK = '<!-- generated by scripts/specs/validate-specs.mjs — do not edit by hand -->';
const stripGenerated = (text) => text.replace(/^last_reviewed:.*$/m, '').trim();

export function renderMatrix(ids, externalRefs = new Map()) {
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const reqs = [...ids.entries()].filter(([, e]) => e.type === 'REQ').sort(([a], [b]) => a.localeCompare(b));

  const byStatus = {};
  let verified = 0;
  let automated = 0;
  for (const [, e] of reqs) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    const v = e.verification;
    if (extractPaths(v).length || [...withoutInlineCode(v).matchAll(ID_SCAN)].length) verified += 1;
    if (extractPaths(v).length) automated += 1;
  }

  const out = [
    '---',
    'id: SPEC-TRACE-MATRIX',
    'title: Requirement Traceability Matrix',
    'type: traceability',
    'status: Approved',
    'owner: Generated',
    'last_reviewed: 2026-11-06',
    '---',
    '',
    GENERATED_MARK,
    '',
    '# Requirement Traceability Matrix',
    '',
    'Regenerate with `npm run specs:matrix`. CI fails when this file is stale.',
    'How to read it: [specs/CONVENTIONS.md](../CONVENTIONS.md#traceability).',
    '',
    '## Summary',
    '',
    `- Requirements: ${reqs.length}`,
    ...Object.keys(byStatus).sort().map((s) => `- ${s}: ${byStatus[s]}`),
    `- With any verification (test or test case): ${verified}`,
    `- With an automated test: ${automated}`,
    '',
    '## Requirements',
    '',
    '| Requirement | Status | Summary | Spec | Implementation | Verification |',
    '|---|---|---|---|---|---|',
  ];
  for (const [id, e] of reqs) {
    const spec = `[${path.posix.basename(e.file)}](../${e.file.replace(/^specs\//, '')})`;
    out.push(`| ${id} | ${esc(e.status)} | ${esc(short(e.title))} | ${spec} | ${esc(e.impl) || '—'} | ${esc(e.verification) || '—'} |`);
  }
  const gaps = [...ids.entries()].filter(([, e]) => e.type === 'GAP').sort(([a], [b]) => a.localeCompare(b));
  if (gaps.length) {
    const open = gaps.filter(([, e]) => e.status === 'Open').length;
    out.push(
      '',
      '## Known gaps and open questions',
      '',
      `${gaps.length} recorded, ${open} open. Each needs a decision from its owner. Resolve it in its spec, then regenerate.`,
      '',
      '| Gap | Status | Observation | Spec |',
      '|---|---|---|---|',
    );
    for (const [id, e] of gaps) {
      const spec = `[${path.posix.basename(e.file)}](../${e.file.replace(/^specs\//, '')})`;
      out.push(`| ${id} | ${esc(e.status)} | ${esc(short(e.title, 140))} | ${spec} |`);
    }
  }
  if (externalRefs.size) {
    out.push('', '## External requirement references', '', 'IDs owned by another repository, with how often specs and source comments cite them.', '', '| External ID | References |', '|---|---|');
    for (const id of [...externalRefs.keys()].sort()) out.push(`| ${id} | ${externalRefs.get(id)} |`);
  }
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const args = new Set(argv);
  const rootIdx = argv.indexOf('--root');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = rootIdx >= 0 ? path.resolve(argv[rootIdx + 1]) : path.resolve(here, '..', '..');

  if (args.has('--write-matrix')) {
    const { errors, ids, externalRefs } = validate({ root });
    const target = path.join(root, 'specs', 'traceability', 'matrix.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, renderMatrix(ids, externalRefs));
    console.log(`Wrote ${toPosix(path.relative(root, target))} (${[...ids.values()].filter((e) => e.type === 'REQ').length} requirements)`);
    if (errors.length) console.log(`Note: ${errors.length} validation error(s) remain — run npm run specs:validate`);
    return 0;
  }

  const { errors, warnings, ids } = validate({ root, checkMatrix: args.has('--check-matrix') });
  const fmt = (x) => `${x.file}${x.line ? `:${x.line}` : ''}  [${x.rule}]  ${x.msg}`;
  for (const w of warnings) console.log(`warning  ${fmt(w)}`);
  for (const e of errors) console.log(`error    ${fmt(e)}`);

  const counts = {};
  for (const e of ids.values()) counts[e.type] = (counts[e.type] ?? 0) + 1;
  console.log(
    `\nSpec validation: ${errors.length} error(s), ${warnings.length} warning(s). ` +
      `IDs: ${Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(' ') || 'none'}`,
  );
  if (errors.length) return 1;
  if (args.has('--strict') && warnings.length) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
