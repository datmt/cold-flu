// Run: node checks/export-v2.check.mjs  (Node >= 23 strips TS types on import)
// Export -> import round-trip through the real routes, against a throwaway DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const src = new URL('../src/', import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('@/')) {
      const file = new URL(`${spec.slice(2)}.ts`, src);
      spec = (fs.existsSync(file) ? file : new URL(`${spec.slice(2)}/index.ts`, src)).href;
    }
    return next(spec, ctx);
  },
});

// DB lives at <cwd>/data and reads schema from <cwd>/src/lib/db.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'export-v2-'));
fs.symlinkSync(src.pathname, path.join(tmp, 'src'));
process.chdir(tmp);

const db = await import('../src/lib/db/index.ts');
const { GET } = await import('../src/app/api/chains/[id]/export/route.ts');
const { POST } = await import('../src/app/api/chains/import/route.ts');

const exportVia = async (id) => (await GET(new Request('http://x'), { params: Promise.resolve({ id }) })).json();
const importVia = async (body) => {
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
// Refs are step ids, so they change on import; swap them for step names before comparing.
const normalize = (exp) => {
  const names = new Map(exp.steps.map((s) => [s.ref, s.name]));
  return {
    ...exp,
    steps: exp.steps.map((s) => ({
      ...s,
      ref: undefined,
      depends_on: s.depends_on.map((d) => ({ ...d, ref: names.get(d.ref) })).sort((a, b) => a.ref.localeCompare(b.ref)),
    })),
  };
};

// Chain: Get -> Check (condition) -> true: OnOk, false: OnFail; Done depends on OnOk + OnFail.
const chain = db.createChain({ name: 'Branchy', description: 'd', mode: 'chain' });
const mk = (name, type, extra = {}) => db.createStep({ chain_id: chain.id, name, type, curl_template: '', transform_code: '', ...extra });
const get = mk('Get', 'curl', { curl_template: 'curl https://example.com', cache_enabled: 1, cache_ttl: 60 });
const check = mk('Check', 'condition', { transform_code: 'return context.steps.Get.status === 200;', position_x: 10, position_y: 20 });
const ok = mk('OnOk', 'transform', { transform_code: 'return 1;' });
const fail = mk('OnFail', 'transform', { transform_code: 'return 0;' });
const done = mk('Done', 'curl', { curl_template: 'curl https://example.com/done' });
db.addStepDependency(check.id, get.id);
db.addStepDependency(ok.id, check.id, 'true');
db.addStepDependency(fail.id, check.id, 'false');
db.addStepDependency(done.id, ok.id);
db.addStepDependency(done.id, fail.id);

const first = await exportVia(chain.id);
assert.equal(first.version, 2);
const checkStep = first.steps.find((s) => s.name === 'Check');
assert.equal(checkStep.type, 'condition');
assert.deepEqual(first.steps.find((s) => s.name === 'OnOk').depends_on, [{ ref: check.id, handle: 'true' }]);
assert.deepEqual(first.steps.find((s) => s.name === 'OnFail').depends_on, [{ ref: check.id, handle: 'false' }]);

// v2 round-trip is identical.
const imported = await importVia(first);
assert.equal(imported.status, 201, JSON.stringify(imported.body));
assert.deepEqual(normalize(await exportVia(imported.body.id)), normalize(first));

// Duplicate goes through the same path, so it keeps branches too.
assert.deepEqual(normalize(await exportVia(db.duplicateChain(chain.id).id)), { ...normalize(first), name: 'Copy of Branchy' });

// v1 file (string deps) still imports; deps come in with no handle.
const v1 = {
  version: 1,
  name: 'Old',
  steps: [
    { ref: 'a', name: 'A', type: 'curl', curl_template: 'curl https://a' },
    { ref: 'b', name: 'B', type: 'transform', depends_on: ['a'] },
  ],
};
const old = await importVia(v1);
assert.equal(old.status, 201, JSON.stringify(old.body));
const oldExp = await exportVia(old.body.id);
assert.equal(oldExp.version, 2);
assert.deepEqual(normalize(oldExp).steps[1].depends_on, [{ ref: 'A', handle: null }]);

// Unknown version rejected.
assert.equal((await importVia({ ...first, version: 3 })).status, 400);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('export-v2 check ok');
