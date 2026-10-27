// Run: node checks/openapi-route.check.mjs  (Node >= 23 strips TS types on import)
// OpenAPI import route + step-rename ref rewrite, against a throwaway DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const src = new URL('../src/', import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    // Mimic the TS bundler resolver: `@/` alias and extensionless relative imports.
    const base = spec.startsWith('@/') ? new URL(spec.slice(2), src)
      : spec.startsWith('.') && ctx.parentURL?.endsWith('.ts') && !path.extname(spec) ? new URL(spec, ctx.parentURL)
      : null;
    if (base) {
      const file = new URL(`${base.href}.ts`);
      spec = (fs.existsSync(file) ? file : new URL(`${base.href}/index.ts`)).href;
    }
    return next(spec, ctx);
  },
});

// DB lives at <cwd>/data and reads schema from <cwd>/src/lib/db.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-route-'));
fs.symlinkSync(src.pathname, path.join(tmp, 'src'));
process.chdir(tmp);

const db = await import('../src/lib/db/index.ts');
const { POST } = await import('../src/app/api/chains/import-openapi/route.ts');

const post = async (spec) => {
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ spec }) }));
  return { status: res.status, body: await res.json() };
};

// YAML in, simple chains + tag folder + env out.
const yaml = `
openapi: 3.0.0
info: { title: Shop }
servers: [{ url: 'https://shop.io' }]
paths:
  /items/{id}:
    get: { tags: [items], summary: Get item }
  /ping:
    get: { summary: Ping }
`;
const ok = await post(yaml);
assert.equal(ok.status, 201);
assert.equal(ok.body.chain_ids.length, 2);
assert.equal(ok.body.folders, 1);
const env = db.getEnvironment(ok.body.environment_id);
assert.deepEqual(env.variables, { BASE_URL: 'https://shop.io', id: '' });
const chains = ok.body.chain_ids.map((id) => db.getChain(id));
assert.ok(chains.every((c) => c.mode === 'simple' && c.environment_id === env.id));
assert.equal(chains.filter((c) => c.folder_id).length, 1);
assert.match(chains[0].steps[0].curl_template, /\{\{env\.BASE_URL\}\}\/items\/\{\{env\.id\}\}/);

assert.equal((await post('swagger: "2.0"')).status, 400);

// Renaming a step rewrites `steps.<old>.` refs in sibling templates + code, not look-alikes.
const chain = db.createChain({ name: 'R', mode: 'chain' });
const a = db.createStep({ chain_id: chain.id, name: 'Step 1', type: 'curl', curl_template: 'curl https://x' });
const b = db.createStep({ chain_id: chain.id, name: 'B', type: 'curl', curl_template: "curl https://x/{{steps.Step 1.body.id}}/{{steps.Step 10.body}}" });
const c = db.createStep({ chain_id: chain.id, name: 'C', type: 'transform', transform_code: 'return context.steps.Step 1.bodyParsed;' });
db.updateStep(a.id, { name: 'Login' });
assert.equal(db.getStep(b.id).curl_template, 'curl https://x/{{steps.Login.body.id}}/{{steps.Step 10.body}}');
assert.equal(db.getStep(c.id).transform_code, 'return context.steps.Login.bodyParsed;');

console.log('openapi-route check ok');
