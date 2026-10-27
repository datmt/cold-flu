// Run: node checks/curl-parser.check.mjs  (Node >= 23 strips TS types on import)
import assert from 'node:assert/strict';

import { optionsToFlags, parseCurl } from '../src/lib/executor/curl-parser.ts';

const p = (cmd) => parseCurl(cmd);

assert.deepEqual(p('curl https://x.io').options, {});
assert.equal(p('curl -k https://x.io').options.insecure, true);
assert.equal(p('curl --insecure https://x.io').options.insecure, true);
assert.equal(p('curl -L https://x.io').options.followRedirects, true);
assert.equal(p('curl --location https://x.io').options.followRedirects, true);
assert.equal(p('curl -kL https://x.io').options.followRedirects, true);
assert.equal(p('curl -m 5 https://x.io').options.maxTime, 5);
assert.equal(p('curl --max-time 2.5 https://x.io').options.maxTime, 2.5);
assert.equal(p('curl --connect-timeout 3 https://x.io').options.connectTimeout, 3);
assert.equal(p('curl -x http://proxy:8080 https://x.io').options.proxy, 'http://proxy:8080');
assert.equal(p('curl --proxy http://p:1 https://x.io').options.proxy, 'http://p:1');
const tls = p('curl --cert c.pem --key k.pem --cacert ca.pem https://x.io').options;
assert.deepEqual(tls, { cert: 'c.pem', key: 'k.pem', cacert: 'ca.pem' });

// Option values must not be mistaken for the URL.
assert.equal(p('curl -m 5 https://x.io').url, 'https://x.io');
assert.equal(p('curl -x http://proxy:8080 https://x.io').url, 'https://x.io');

// Warnings: unsupported flags surface, harmless ones don't, bad values do.
assert.deepEqual(p('curl -s -v --compressed https://x.io').warnings, []);
assert.deepEqual(p('curl --retry 3 https://x.io').warnings, ['Ignored curl flag: --retry']);
assert.deepEqual(p('curl --frobnicate https://x.io').warnings, ['Unknown curl flag: --frobnicate']);
assert.deepEqual(p('curl -m abc https://x.io').warnings, ['Invalid value for -m: abc']);

// Round trip: flags emitted by the UI rebuild parse back to the same options.
const opts = { followRedirects: true, insecure: true, maxTime: 7, connectTimeout: 2, proxy: "http://p'q:1", cert: 'c', key: 'k', cacert: 'ca' };
assert.deepEqual(p(`curl ${optionsToFlags(opts).join(' ')} https://x.io`).options, opts);

console.log('curl-parser check: ok');
