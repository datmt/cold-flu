// Run: node checks/s8-parity.check.mjs  (Node >= 23 strips TS types on import)
// Cookie jar across steps, setEnv write-back to the environment row, -F name=@file multipart.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const src = new URL('../src/', import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's8-parity-'));
fs.symlinkSync(src.pathname, path.join(tmp, 'src'));
process.chdir(tmp);
const upload = path.join(tmp, 'hello.txt');
fs.writeFileSync(upload, 'file-contents-42');

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.url === '/login') res.setHeader('set-cookie', ['sid=abc; Path=/', 'theme=dark; Path=/other']);
    res.end(JSON.stringify({ cookie: req.headers.cookie ?? '', ctype: req.headers['content-type'] ?? '', body: Buffer.concat(chunks).toString() }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const db = await import('../src/lib/db/index.ts');
const { executeChain } = await import('../src/lib/executor/index.ts');

const env = db.createEnvironment({ name: 'E', variables: { BASE: base }, functions: '' });
const chain = db.createChain({ name: 'Parity', description: '', mode: 'chain', environment_id: env.id });
const mk = (name, type, extra = {}) => db.createStep({ chain_id: chain.id, name, type, curl_template: '', transform_code: '', ...extra });
const login = mk('Login', 'curl', { curl_template: 'curl {{env.BASE}}/login' });
const me = mk('Me', 'curl', { curl_template: 'curl {{env.BASE}}/me' });
const other = mk('Explicit', 'curl', { curl_template: 'curl -H "Cookie: sid=manual" {{env.BASE}}/me' });
const save = mk('Save', 'transform', { transform_code: 'context.setEnv("TOKEN", "t-" + 7); return 1;' });
const form = mk('Form', 'curl', { curl_template: `curl -F title=hi -F 'doc=@${upload};type=text/plain' {{env.BASE}}/up` });
db.addStepDependency(me.id, login.id);
db.addStepDependency(other.id, me.id);
db.addStepDependency(save.id, other.id);
db.addStepDependency(form.id, save.id);

const run = db.getRun(await executeChain(chain.id));
const by = Object.fromEntries(run.steps.map((s) => [s.step_name, s]));
for (const s of run.steps) assert.equal(s.status, 'completed', `${s.step_name}: ${s.error}`);
const res = (n) => JSON.parse(by[n].response_body);

assert.equal(res('Me').cookie, 'sid=abc'); // jar sent; /other-scoped cookie withheld
assert.equal(res('Explicit').cookie, 'sid=manual'); // explicit header wins
assert.equal(db.getEnvironment(env.id).variables.TOKEN, 't-7'); // persisted
assert.match(res('Form').ctype, /^multipart\/form-data; boundary=/);
assert.match(res('Form').body, /name="doc"; filename="hello.txt"/);
assert.match(res('Form').body, /file-contents-42/);
assert.match(res('Form').body, /name="title"\r\n\r\nhi/);

// persistEnv=false (load tests): setEnv must leave the stored environment alone.
db.updateEnvironment(env.id, { variables: { BASE: base } });
await executeChain(chain.id, undefined, false);
assert.equal(db.getEnvironment(env.id).variables.TOKEN, undefined);

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('s8-parity ok');
