// Run: node checks/openapi.check.mjs  (Node >= 23 strips TS types on import)
import assert from 'node:assert/strict';

import { openApiToRequests } from '../src/lib/openapi.ts';
import { parseCurl } from '../src/lib/executor/curl-parser.ts';

const spec = {
  openapi: '3.0.3',
  info: { title: 'Pets' },
  servers: [{ url: 'https://{host}/v1/', variables: { host: { default: 'api.pets.io' } } }],
  paths: {
    '/pets/{petId}': {
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: ['pets'], summary: 'Get pet', parameters: [{ name: 'verbose', in: 'query', required: true, schema: { type: 'boolean' } }, { name: 'skip', in: 'query', schema: { type: 'string' } }] },
    },
    '/pets': {
      post: {
        tags: ['pets'], operationId: 'addPet',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
      },
    },
  },
  components: { schemas: { Pet: { type: 'object', required: ['name'], properties: { id: { type: 'integer', readOnly: true }, name: { type: 'string', example: 'rex' }, tags: { type: 'array', items: { type: 'string' } }, parent: { $ref: '#/components/schemas/Pet' } } } } },
};

const out = openApiToRequests(spec);
assert.equal(out.title, 'Pets');
assert.deepEqual(out.env, { BASE_URL: 'https://api.pets.io/v1', petId: '0' });
assert.equal(out.requests.length, 2);

const get = parseCurl(out.requests[0].curl);
assert.equal(out.requests[0].name, 'Get pet');
assert.equal(out.requests[0].tag, 'pets');
assert.equal(get.method, 'GET');
assert.equal(get.url, '{{env.BASE_URL}}/pets/{{env.petId}}?verbose=false'); // optional `skip` omitted

const post = parseCurl(out.requests[1].curl);
assert.equal(out.requests[1].name, 'addPet');
assert.equal(post.method, 'POST');
assert.equal(post.headers['Content-Type'], 'application/json');
const body = JSON.parse(post.body);
assert.equal(body.name, 'rex');
assert.ok(!('id' in body), 'readOnly skipped');
assert.deepEqual(body.tags, ['string']);
assert.ok(body.parent && typeof body.parent === 'object', 'recursive $ref terminates');

assert.throws(() => openApiToRequests({ swagger: '2.0' }), /OpenAPI 3/);
console.log('openapi check: ok');
