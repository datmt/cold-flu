// Worker thread entry for a load test. Plain .mjs because Turbopack doesn't bundle server workers:
// it loads the TS sources directly via Node's type stripping (Node >= 22.18), the same way checks/ does.
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

const src = new URL('../../', import.meta.url);
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

const { markCancelled, runLoadTest } = await import('./load-test-run.ts');
parentPort.on('message', (msg) => {
  if (msg === 'cancel') markCancelled(workerData.id);
});
await runLoadTest(workerData);
process.exit(0);
