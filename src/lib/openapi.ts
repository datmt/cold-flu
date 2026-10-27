// OpenAPI 3.x -> importable requests. Pure: takes the parsed spec, returns plain data.

type Obj = Record<string, unknown>;

export interface OpenApiRequest {
  tag: string | null;
  name: string;
  description: string;
  curl: string;
}

export interface OpenApiImport {
  title: string;
  /** Seeds the new environment: BASE_URL plus one entry per path parameter. */
  env: Record<string, string>;
  requests: OpenApiRequest[];
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const envName = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');

function resolveRef<T>(root: Obj, node: T): T {
  // Local refs only; a ref to something missing resolves to {} so one bad ref can't kill the import.
  for (let i = 0; i < 10 && isObj(node) && typeof node.$ref === 'string'; i++) {
    let cur: unknown = root;
    for (const part of node.$ref.replace(/^#\/?/, '').split('/').filter(Boolean)) {
      cur = isObj(cur) ? cur[decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
    }
    node = (isObj(cur) ? cur : {}) as T;
  }
  return node;
}

/** Example value for a schema: explicit example/default/enum first, else built from the shape. */
export function exampleFromSchema(root: Obj, schema: unknown, depth = 0): unknown {
  const s = resolveRef(root, schema);
  if (!isObj(s) || depth > 6) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (Array.isArray(s.allOf)) {
    const parts = s.allOf.map((p) => exampleFromSchema(root, p, depth + 1));
    return Object.assign({}, ...parts.filter(isObj));
  }
  const alt = (s.oneOf ?? s.anyOf) as unknown[] | undefined;
  if (Array.isArray(alt) && alt.length) return exampleFromSchema(root, alt[0], depth + 1);

  const type = s.type ?? (s.properties ? 'object' : undefined);
  switch (type) {
    case 'object': {
      const out: Obj = {};
      for (const [k, v] of Object.entries(isObj(s.properties) ? s.properties : {})) {
        const sub = resolveRef(root, v);
        if (isObj(sub) && sub.readOnly) continue;
        out[k] = exampleFromSchema(root, v, depth + 1);
      }
      return out;
    }
    case 'array': return [exampleFromSchema(root, s.items, depth + 1)];
    case 'integer': case 'number': return 0;
    case 'boolean': return false;
    case 'string':
      return ({ 'date-time': '2024-01-01T00:00:00Z', date: '2024-01-01', uuid: '00000000-0000-0000-0000-000000000000', email: 'user@example.com' } as Record<string, string>)[s.format as string] ?? 'string';
    default: return null;
  }
}

const shq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

export function openApiToRequests(spec: unknown): OpenApiImport {
  if (!isObj(spec) || typeof spec.openapi !== 'string' || !spec.openapi.startsWith('3.')) {
    throw new Error('Not an OpenAPI 3.x document (missing "openapi: 3.x")');
  }
  const root = spec;
  const info = isObj(root.info) ? root.info : {};
  const server = Array.isArray(root.servers) && isObj(root.servers[0]) ? root.servers[0] : {};
  let baseUrl = typeof server.url === 'string' ? server.url : '';
  for (const [k, v] of Object.entries(isObj(server.variables) ? server.variables : {})) {
    baseUrl = baseUrl.replaceAll(`{${k}}`, String(isObj(v) ? (v.default ?? '') : ''));
  }
  const env: Record<string, string> = { BASE_URL: baseUrl.replace(/\/$/, '') };
  const requests: OpenApiRequest[] = [];

  for (const [path, rawItem] of Object.entries(isObj(root.paths) ? root.paths : {})) {
    const item = resolveRef(root, rawItem);
    if (!isObj(item)) continue;
    for (const method of METHODS) {
      const op = resolveRef(root, item[method]);
      if (!isObj(op)) continue;

      // Path-level params first; an operation-level param with the same in+name overrides.
      const params = new Map<string, Obj>();
      for (const raw of [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
        const p = resolveRef(root, raw);
        if (isObj(p) && typeof p.name === 'string') params.set(`${p.in}:${p.name}`, p);
      }

      let url = `{{env.BASE_URL}}${path.replace(/\{([^}]+)\}/g, (_, n: string) => {
        const key = envName(n);
        const p = params.get(`path:${n}`);
        env[key] ??= String(p && isObj(p.schema) ? (exampleFromSchema(root, p.schema) ?? '') : '');
        return `{{env.${key}}}`;
      })}`;

      const query: string[] = [];
      const headers: string[] = [];
      for (const p of params.values()) {
        if (!p.required) continue;
        const ex = String(p.example ?? exampleFromSchema(root, p.schema) ?? '');
        if (p.in === 'query') query.push(`${encodeURIComponent(p.name as string)}=${encodeURIComponent(ex)}`);
        if (p.in === 'header') headers.push(`${p.name as string}: ${ex}`);
      }
      if (query.length) url += `?${query.join('&')}`;

      let body: string | null = null;
      const reqBody = resolveRef(root, op.requestBody);
      const content = isObj(reqBody) && isObj(reqBody.content) ? reqBody.content : {};
      const json = Object.entries(content).find(([t]) => /json/i.test(t));
      if (json && isObj(json[1])) {
        const media = json[1];
        body = JSON.stringify(media.example ?? exampleFromSchema(root, media.schema), null, 2);
        headers.push(`Content-Type: ${json[0]}`);
      }

      const lines = [`curl -X ${method.toUpperCase()} ${shq(url)}`];
      for (const h of headers) lines.push(`  -H ${JSON.stringify(h)}`);
      if (body) lines.push(`  -d ${shq(body)}`);

      requests.push({
        tag: Array.isArray(op.tags) && typeof op.tags[0] === 'string' ? op.tags[0] : null,
        name: String(op.summary || op.operationId || `${method.toUpperCase()} ${path}`),
        description: typeof op.description === 'string' ? op.description : '',
        curl: lines.join(' \\\n'),
      });
    }
  }

  return { title: typeof info.title === 'string' && info.title ? info.title : 'OpenAPI', env, requests };
}
