/**
 * Tests for scripts/specs/validate-specs.mjs (requirements SFR-FR-001 … SFR-NFR-001 in
 * specs/CONVENTIONS.md). Run: npm run specs:test
 *
 * Each test builds a small, valid fixture repository in a temp directory, breaks one
 * thing, and checks the validator reports exactly that rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { validate, renderMatrix, normalisePath, extractPaths } from './validate-specs.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-specs.mjs');
const REPO_ROOT = path.resolve(path.dirname(SCRIPT), '..', '..');

const SECTIONS = ['Overview', 'Functional Requirements', 'Known Gaps and Open Questions'];

const front = (id, type = 'domain', extra = '') =>
  `---\nid: ${id}\ntitle: ${id}\ntype: ${type}\nstatus: Draft\nowner: tests\nlast_reviewed: 2026-11-06\n${extra}---\n`;

const domainSpec = (rows, { gaps = '', sections = SECTIONS } = {}) =>
  [
    front('SPEC-DEMO'),
    '# Demo',
    ...sections.map((s) => {
      if (s === 'Functional Requirements') {
        return `## ${s}\n\n| ID | Requirement | Status | Implementation | Verification |\n|---|---|---|---|---|\n${rows}\n\n| ID | Scenario | Expected | Verifies |\n|---|---|---|---|\n| DEMO-TC-001 | do it | works | DEMO-FR-001 |\n`;
      }
      if (s === 'Known Gaps and Open Questions') {
        return `## ${s}\n\n| ID | Observation | Status |\n|---|---|---|\n| DEMO-GAP-001 | unknown | Open |\n${gaps}`;
      }
      return `## ${s}\n\nText.\n`;
    }),
  ].join('\n');

const GOOD_ROW = '| DEMO-FR-001 | The app does a thing. | Implemented | `src/thing.ts` | DEMO-TC-001 |';

function makeRepo({ spec = domainSpec(GOOD_ROW), openapi, source, extraFiles = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-test-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write('specs/registry.json', JSON.stringify({
    requiredFiles: ['specs/domains/demo.md'],
    prefixes: { DEMO: { name: 'Demo', spec: 'specs/domains/demo.md' }, OTHER: { name: 'Other', spec: 'specs/domains/other.md' } },
    external: { EXT: { name: 'External', source: 'another repo' } },
    requiredSections: { domain: SECTIONS, 'template:feature': ['Overview', 'Acceptance Criteria'] },
  }));
  write('specs/domains/demo.md', spec);
  write('src/thing.ts', 'export const thing = 1;\n');
  if (openapi) write('specs/api/openapi.json', typeof openapi === 'string' ? openapi : JSON.stringify(openapi));
  if (source) write('api/client.ts', source);
  for (const [rel, text] of Object.entries(extraFiles)) write(rel, text);
  return root;
}

const rules = (result) => result.errors.map((e) => e.rule);

const OPENAPI_OK = {
  openapi: '3.0.3',
  info: { title: 't', version: '1' },
  paths: {
    '/things/{id}': {
      get: {
        operationId: 'getThing',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } } },
        'x-requirements': ['DEMO-FR-001', 'EXT-FR-009'],
      },
    },
  },
  components: { schemas: { Thing: { type: 'object' } } },
};

// ---------------------------------------------------------------------------

test('a valid fixture produces no errors', () => {
  const r = validate({ root: makeRepo() });
  assert.deepEqual(r.errors, []);
  assert.equal(r.ids.get('DEMO-FR-001').status, 'Implemented');
});

test('SFR-FR-001: missing and invalid front matter are reported', () => {
  const noFm = validate({ root: makeRepo({ spec: '# No front matter\n' }) });
  assert.ok(rules(noFm).includes('FM-001'));

  const badStatus = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW).replace('status: Draft', 'status: Done') }) });
  assert.ok(rules(badStatus).includes('FM-004'));

  const badDate = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW).replace('2026-11-06', '06/11/2026') }) });
  assert.ok(rules(badDate).includes('FM-005'));
});

test('SFR-FR-002: a missing mandatory section is reported for specs and the feature template', () => {
  const r = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW, { sections: ['Overview', 'Functional Requirements'] }) }) });
  const sec = r.errors.find((e) => e.rule === 'SEC-001');
  assert.ok(sec);
  assert.match(sec.msg, /Known Gaps and Open Questions/);

  const template = `${front('SPEC-T', 'template', 'template_for: feature\n')}\n## 1. Overview\n\nx\n`;
  const t = validate({ root: makeRepo({ extraFiles: { 'specs/templates/feature-spec.md': template } }) });
  assert.ok(t.errors.some((e) => e.rule === 'SEC-001' && /Acceptance Criteria/.test(e.msg)));
});

test('SFR-FR-003: malformed, unregistered, misplaced and duplicate IDs are reported', () => {
  const malformed = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW.replace('DEMO-FR-001', 'DEMO-FR-1')) }) });
  assert.ok(rules(malformed).includes('ID-001'));

  const unregistered = validate({ root: makeRepo({ spec: domainSpec(`${GOOD_ROW}\n| NOPE-FR-001 | x | Implemented | \`src/thing.ts\` | DEMO-TC-001 |`) }) });
  assert.ok(rules(unregistered).includes('ID-003'));

  const misplaced = validate({ root: makeRepo({ spec: domainSpec(`${GOOD_ROW}\n| OTHER-FR-001 | x | Implemented | \`src/thing.ts\` | DEMO-TC-001 |`) }) });
  assert.ok(rules(misplaced).includes('ID-004'));

  const external = validate({ root: makeRepo({ spec: domainSpec(`${GOOD_ROW}\n| EXT-FR-001 | x | Implemented | \`src/thing.ts\` | DEMO-TC-001 |`) }) });
  assert.ok(rules(external).includes('ID-002'));

  const dup = validate({ root: makeRepo({ spec: domainSpec(`${GOOD_ROW}\n${GOOD_ROW}`) }) });
  const e = dup.errors.find((x) => x.rule === 'ID-005');
  assert.ok(e, 'duplicate reported');
  assert.match(e.msg, /DEMO-FR-001.*first defined at specs\/domains\/demo\.md:\d+/);
});

test('SFR-FR-004: bad status, missing columns and missing paths are reported', () => {
  const status = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW.replace('Implemented', 'Done')) }) });
  assert.ok(rules(status).includes('COL-002'));

  const columns = domainSpec(GOOD_ROW).replace('| ID | Requirement | Status | Implementation | Verification |', '| ID | Requirement | Status | Implementation | Tests |');
  assert.ok(rules(validate({ root: makeRepo({ spec: columns }) })).includes('COL-001'));

  const impl = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW.replace('src/thing.ts', 'src/missing.ts')) }) });
  assert.ok(rules(impl).includes('IMP-002'));

  const noImpl = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW.replace('`src/thing.ts`', '')) }) });
  assert.ok(rules(noImpl).includes('IMP-001'));

  const planned = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW.replace('Implemented | `src/thing.ts`', 'Planned |')) }) });
  assert.ok(!rules(planned).includes('IMP-001'), 'Planned rows may omit Implementation');

  const test = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW.replace('DEMO-TC-001 |', '`tests/missing.test.ts` |')) }) });
  assert.ok(rules(test).includes('VER-001'));

  const noVer = validate({ root: makeRepo({ spec: domainSpec(GOOD_ROW.replace('DEMO-TC-001 |', ' |')) }) });
  assert.ok(noVer.warnings.some((w) => w.rule === 'VER-002'));
});

test('SFR-FR-005: unresolved references in specs and source are reported; external ones are not', () => {
  const prose = domainSpec(GOOD_ROW).replace('Text.', 'See DEMO-BR-042 and EXT-BR-007, but not `DEMO-BR-099`.');
  const r = validate({ root: makeRepo({ spec: prose }) });
  const refs = r.errors.filter((e) => e.rule === 'REF-001').map((e) => e.msg);
  assert.equal(refs.length, 1);
  assert.match(refs[0], /DEMO-BR-042/);

  const code = validate({ root: makeRepo({ source: '// implements DEMO-FR-001 and DEMO-FR-777 (EXT-FR-009)\n' }) });
  const codeRefs = code.errors.filter((e) => e.rule === 'REF-001');
  assert.equal(codeRefs.length, 1);
  assert.equal(codeRefs[0].file, 'api/client.ts');
  assert.equal(code.externalRefs.get('EXT-FR-009'), 1);
});

test('SFR-FR-006: OpenAPI structure, x-requirements and code drift are checked', () => {
  const source = "import axios from 'axios';\nexport const a = () => axios.get(`/things/${id}`);\n";
  const ok = validate({ root: makeRepo({ openapi: OPENAPI_OK, source }) });
  assert.deepEqual(ok.errors, []);

  assert.ok(rules(validate({ root: makeRepo({ openapi: '{ not json' }) })).includes('API-001'));

  const broken = structuredClone(OPENAPI_OK);
  const get = broken.paths['/things/{id}'].get;
  delete get.operationId;
  get.parameters = [];
  get.responses['200'].content['application/json'].schema.$ref = '#/components/schemas/Nope';
  get['x-requirements'] = ['DEMO-FR-404'];
  const b = rules(validate({ root: makeRepo({ openapi: broken }) }));
  for (const rule of ['API-005', 'API-007', 'API-010', 'API-013']) assert.ok(b.includes(rule), `expected ${rule}`);

  const drift = validate({ root: makeRepo({ openapi: OPENAPI_OK, source: `${source}export const b = () => axios.post('/undocumented', {});\n` }) });
  const d = drift.errors.find((e) => e.rule === 'API-014');
  assert.ok(d);
  assert.match(d.msg, /POST \/undocumented/);

  const unused = validate({ root: makeRepo({ openapi: OPENAPI_OK }) });
  assert.ok(unused.warnings.some((w) => w.rule === 'API-015'));
});

test('SFR-FR-007: the matrix lists requirements and gaps, and a stale matrix fails --check-matrix', () => {
  const root = makeRepo();
  const r = validate({ root });
  const matrix = renderMatrix(r.ids, r.externalRefs);
  assert.match(matrix, /\| DEMO-FR-001 \| Implemented \|/);
  assert.match(matrix, /\| DEMO-GAP-001 \| Open \|/);

  assert.ok(rules(validate({ root, checkMatrix: true })).includes('MTX-001'));
  fs.mkdirSync(path.join(root, 'specs/traceability'), { recursive: true });
  fs.writeFileSync(path.join(root, 'specs/traceability/matrix.md'), matrix);
  assert.ok(!rules(validate({ root, checkMatrix: true })).includes('MTX-001'));
});

test('SFR-NFR-001: the CLI prints file:line [RULE] and exits non-zero on errors', () => {
  const bad = makeRepo({ spec: domainSpec(`${GOOD_ROW}\n${GOOD_ROW}`) });
  const run = spawnSync(process.execPath, [SCRIPT, '--root', bad], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /specs\/domains\/demo\.md:\d+ {2}\[ID-005\]/);

  const good = makeRepo();
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--root', good], { encoding: 'utf8' }).status, 0);

  const warnOnly = makeRepo({ spec: domainSpec(GOOD_ROW.replace('DEMO-TC-001 |', ' |')) });
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--root', warnOnly], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--root', warnOnly, '--strict'], { encoding: 'utf8' }).status, 1);
});

test('helpers: path normalisation and backticked path extraction', () => {
  assert.equal(normalisePath('/doctor-profiles/pmdc/${encodeURIComponent(x)}'), '/doctor-profiles/pmdc/{}');
  assert.equal(normalisePath('/doctor-profiles/pmdc/{pmdcNumber}'), '/doctor-profiles/pmdc/{}');
  assert.deepEqual(extractPaths('`api/calls.ts:120`, `lib/x.ts#L4-L9`, `not a path`, plain.ts'), ['api/calls.ts', 'lib/x.ts']);
});

test('the repository\'s own specs validate cleanly', () => {
  const r = validate({ root: REPO_ROOT, checkMatrix: true });
  assert.deepEqual(r.errors.map((e) => `${e.file}:${e.line} [${e.rule}] ${e.msg}`), []);
});
