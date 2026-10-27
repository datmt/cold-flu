// Run: node checks/step-metrics.check.mjs  (Node >= 23 strips TS types on import)
// Real chain run against a local server: duration_ms + response_size land in run_steps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-metrics-'));
fs.symlinkSync(src.pathname, path.join(tmp, 'src'));
process.chdir(tmp);

const BODY = '{"msg":"héllo"}'; // é = 2 bytes, so byte size != string length
const DELAY = 80;
const server = http.createServer((req, res) => {
  setTimeout(() => {
    res.writeHead(req.url === '/missing' ? 404 : 200, { 'content-type': 'application/json' });
    res.end(BODY);
  }, DELAY);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const db = await import('../src/lib/db/index.ts');
const { executeChain } = await import('../src/lib/executor/index.ts');

// Tiny body limit: stored body is cut, but response_size must report the full body.
db.setRetention({ ...db.getRetention(), maxBodyBytes: 5 });

const chain = db.createChain({ name: 'Metrics', description: '', mode: 'chain' });
const mk = (name, type, extra = {}) => db.createStep({ chain_id: chain.id, name, type, curl_template: '', transform_code: '', ...extra });
mk('Ok', 'curl', { curl_template: `curl ${base}/ok` });
mk('Missing', 'curl', { curl_template: `curl ${base}/missing` });
mk('Dead', 'curl', { curl_template: 'curl http://127.0.0.1:1/' });
mk('Calc', 'transform', { transform_code: 'return { a: 1 };' });

const run = db.getRun(await executeChain(chain.id));
const by = Object.fromEntries(run.steps.map((s) => [s.step_name, s]));
const size = Buffer.byteLength(BODY);

assert.equal(by.Ok.status, 'completed');
assert.ok(by.Ok.duration_ms >= DELAY - 5, `Ok duration ${by.Ok.duration_ms}`);
assert.equal(by.Ok.response_size, size);
assert.equal(by.Ok.body_truncated, true);

// HTTP 4xx still records timing + size.
assert.equal(by.Missing.status, 'failed');
assert.ok(by.Missing.duration_ms >= DELAY - 5, `Missing duration ${by.Missing.duration_ms}`);
assert.equal(by.Missing.response_size, size);

// Network error: duration recorded, no response so no size.
assert.equal(by.Dead.status, 'failed');
assert.equal(typeof by.Dead.duration_ms, 'number');
assert.equal(by.Dead.response_size, null);

assert.equal(by.Calc.status, 'completed');
assert.equal(by.Calc.response_size, Buffer.byteLength('{"a":1}'));
assert.ok(by.Calc.duration_ms < DELAY);

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('step-metrics ok');
