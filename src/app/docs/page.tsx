import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '⚡ ColdFlu — Docs',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-sm text-indigo-200">
      {children}
    </code>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 p-4 font-mono text-sm text-gray-200 leading-relaxed">
      {children}
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-200">
      {children}
    </div>
  );
}

function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            <th className="px-4 py-2.5 text-left font-semibold text-gray-300">Expression</th>
            <th className="px-4 py-2.5 text-left font-semibold text-gray-300">Resolves to</th>
            <th className="px-4 py-2.5 text-left font-semibold text-gray-300">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([expr, resolves, note], i) => (
            <tr key={i} className={`border-b border-gray-800/60 ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900/30'}`}>
              <td className="px-4 py-2.5 font-mono text-xs text-indigo-200">{expr}</td>
              <td className="px-4 py-2.5 text-gray-300">{resolves}</td>
              <td className="px-4 py-2.5 text-gray-500">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'interpolation', label: 'Variable interpolation' },
  { id: 'env-vars', label: 'Environment variables' },
  { id: 'step-outputs', label: 'Step outputs' },
  { id: 'array-access', label: 'Array & nested access' },
  { id: 'helpers', label: 'Built-in helpers' },
  { id: 'inline-js', label: 'Inline JS expressions' },
  { id: 'transform', label: 'Transform steps (JS)' },
  { id: 'dag', label: 'DAG & parallel execution' },
  { id: 'cache', label: 'Caching' },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">
      <div>
        <h1 className="text-3xl font-bold text-white">⚡ ColdFlu Docs</h1>
        <p className="mt-2 text-gray-400">
          Reference for variable syntax, transform steps, DAG execution, and more.
        </p>
      </div>

      {/* TOC */}
      <nav className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Contents</p>
        <ol className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {TOC.map(({ id, label }, i) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-sm text-indigo-400 transition hover:text-indigo-300"
              >
                {i + 1}. {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Overview ───────────────────────────────────────────── */}
      <Section id="overview" title="1. Overview">
        <p className="text-gray-300">
          ColdFlu chains HTTP requests into a <strong className="text-white">DAG</strong> (directed acyclic graph).
          Each step can be a <strong className="text-white">Curl step</strong> (makes an HTTP request) or a{' '}
          <strong className="text-white">Transform step</strong> (runs JavaScript and produces a value).
          Steps reference each other using the <Code>{'{{…}}'}</Code> interpolation syntax.
        </p>
        <Note>
          Interpolation is evaluated at <strong>runtime</strong>, just before each step executes.
          Unresolved expressions resolve to an empty string — they never throw.
        </Note>
      </Section>

      {/* ── Interpolation ──────────────────────────────────────── */}
      <Section id="interpolation" title="2. Variable interpolation">
        <p className="text-gray-300">
          Wrap any expression in double curly braces. Expressions are trimmed and case-sensitive.
        </p>
        <Block>{`{{ expression }}       ← spaces around the expression are fine
{{expression}}         ← also works`}</Block>
        <p className="text-gray-300">
          You can use interpolation in a curl step&apos;s URL, header values, and body —
          and also inside the <strong className="text-white">code of a Transform step</strong> (the
          expression is substituted as a raw string before the JS runs).
        </p>
      </Section>

      {/* ── Env vars ───────────────────────────────────────────── */}
      <Section id="env-vars" title="3. Environment variables">
        <p className="text-gray-300">
          Create an <strong className="text-white">Environment</strong> (sidebar → Environments) and assign
          it to a chain. Variables are referenced with the <Code>env.</Code> prefix.
        </p>
        <Table rows={[
          ['{{env.BASE_URL}}', 'value of BASE_URL in the active environment', ''],
          ['{{env.API_KEY}}', 'value of API_KEY', 'Great for secrets & base URLs'],
          ['{{env.TOKEN}}', 'value of TOKEN', ''],
        ]} />
        <Block>{`# Example curl step URL
https://{{env.BASE_URL}}/api/users

# Example header
Authorization: Bearer {{env.TOKEN}}`}</Block>
      </Section>

      {/* ── Step outputs ───────────────────────────────────────── */}
      <Section id="step-outputs" title="4. Step outputs">
        <p className="text-gray-300">
          Reference any completed step by its <strong className="text-white">name</strong> (the label on
          the node). Three sections are available: <Code>body</Code>, <Code>status</Code>,{' '}
          <Code>headers</Code>.
        </p>
        <Table rows={[
          ['{{steps.Login.body}}', 'Full raw response body string', ''],
          ['{{steps.Login.status}}', 'HTTP status code, e.g. 200', 'Always a string'],
          ['{{steps.Login.headers.content-type}}', 'Value of a response header', 'Header name lowercased'],
          ['{{steps.Login.body.token}}', 'Parsed JSON field "token"', 'Requires JSON body'],
          ['{{steps.Login.body.user.id}}', 'Nested field access', 'Dot notation'],
        ]} />
        <Note>
          Step names are <strong>case-sensitive</strong> and must match exactly.
          Rename steps to short, descriptive names (e.g. <Code>Login</Code>, <Code>GetUser</Code>).
        </Note>
      </Section>

      {/* ── Array access ───────────────────────────────────────── */}
      <Section id="array-access" title="5. Array & nested access">
        <p className="text-gray-300">
          Use bracket notation for array indices. You can chain dots and brackets freely.
        </p>
        <Table rows={[
          ['{{steps.Search.body.results[0].id}}', 'id of the first result', ''],
          ['{{steps.Search.body.results[2].name}}', 'name of the third result', ''],
          ['{{steps.Search.body.meta.pages[0].url}}', 'nested array + object', ''],
          ['{{steps.Search.body.tags[0]}}', 'first element of a string array', ''],
        ]} />
        <Block>{`# If step "GetList" returns:
{ "items": [{ "id": 42, "slug": "hello" }, { "id": 99, "slug": "world" }] }

# Access the second item's slug:
{{steps.GetList.body.items[1].slug}}   →  "world"

# Pass as a path param:
https://api.example.com/items/{{steps.GetList.body.items[0].id}}`}</Block>
        <Note>
          Out-of-bounds or missing paths resolve to empty string — they never cause a run failure.
        </Note>
      </Section>

      {/* ── Helpers ────────────────────────────────────────────── */}
      <Section id="helpers" title="6. Built-in $ helpers">
        <p className="text-gray-300">
          These generate dynamic values at runtime and need no arguments.
        </p>
        <Table rows={[
          ['{{$uuid}}', 'Random UUID v4', 'e.g. a1b2c3d4-e5f6-4…'],
          ['{{$timestamp}}', 'Unix timestamp (ms)', 'e.g. 1717000000000'],
          ['{{$isoDate}}', 'ISO 8601 date string', 'e.g. 2026-05-29T16:00:00.000Z'],
          ['{{$random}}', 'Random float 0–1', 'e.g. 0.7342189…'],
        ]} />
        <Block>{`# Idempotency key header
X-Idempotency-Key: {{$uuid}}

# Timestamp in a JSON body
{ "created_at": {{$timestamp}}, "request_id": "{{$uuid}}" }`}</Block>
      </Section>

      {/* ── Inline JS ──────────────────────────────────────────── */}
      <Section id="inline-js" title="7. Inline JS expressions">
        <p className="text-gray-300">
          Prefix any expression with <Code>=</Code> to evaluate arbitrary JavaScript inline.
          The result is stringified and substituted in place — exactly like the other{' '}
          <Code>{'{{…}}'}</Code> expressions.
        </p>
        <Table rows={[
          ['{{= Math.round(Math.random() * 10e10) }}', 'random integer', ''],
          ['{{= Date.now() }}', 'current ms timestamp', ''],
          ['{{= btoa("user:pass") }}', 'base64 encoded string', ''],
          ['{{= context.steps.Login.bodyParsed.items.length }}', 'array length from a step', 'context is in scope'],
          ['{{= context.env.BASE_URL + "/v2" }}', 'concatenate env var', ''],
        ]} />
        <Note>
          <strong>In transform steps, use native JS instead.</strong>{' '}
          The <Code>{'{{= … }}'}</Code> syntax is most useful inside curl step fields (URL, headers, body).
          Inside a transform step&apos;s JS code, just write <code className="font-mono text-indigo-300">Math.round(Math.random() * 10e10)</code> directly.
        </Note>
        <Sub title="Common mistake — missing quotes around string values">
          <p className="text-gray-300">
            When using <Code>{'{{$uuid}}'}</Code> or <Code>{'{{= expr }}'}</Code> inside a JS object
            literal, you must wrap it in quotes — otherwise the interpolated value becomes a bare
            identifier and causes a syntax error.
          </p>
          <Block>{`// ❌ Wrong — uuid is injected as a bare identifier (invalid JS)
return {
  uuid: {{$uuid}},
  txn_id: {{= Math.round(Math.random() * 10e10) }},
};

// ✅ Correct — quoted string, or pure JS
return {
  uuid: "{{$uuid}}",           // interpolated into a string literal
  txn_id: Math.round(Math.random() * 10e10),  // pure JS — no {{ }} needed
};

// ✅ Also correct — pure JS only (no interpolation at all)
return {
  uuid: crypto.randomUUID(),
  txn_id: Math.round(Math.random() * 10e10),
};`}</Block>
        </Sub>
        <Sub title="Using {{= }} in curl step body">
          <Block>{`// Body field of a curl step — inline expressions work great here:
{
  "idempotency_key": "{{= crypto.randomUUID() }}",
  "timestamp": {{= Date.now() }},
  "score": {{= Math.floor(Math.random() * 100) }}
}`}</Block>
        </Sub>
      </Section>

      {/* ── Transform ──────────────────────────────────────────── */}
      <Section id="transform" title="8. Transform steps (JavaScript)">
        <p className="text-gray-300">
          A Transform step runs a JavaScript function and produces an output value that downstream
          steps can reference. It has access to all prior step results and environment variables.
        </p>

        <Sub title="Context object">
          <Table rows={[
            ['context.env', 'Record<string, string>', 'All env variables for the active environment'],
            ['context.steps.Name.body', 'string', 'Raw response body of a completed step'],
            ['context.steps.Name.bodyParsed', 'unknown', 'JSON-parsed body, or null'],
            ['context.steps.Name.status', 'number', 'HTTP status code'],
            ['context.steps.Name.headers', 'Record<string, string>', 'Response headers (lowercased)'],
          ]} />
        </Sub>

        <Sub title="Return value">
          <p className="text-gray-300">
            Whatever you <Code>return</Code> becomes the step&apos;s body. Objects are
            JSON-serialized automatically.
          </p>
        </Sub>

        <Block>{`// Example: extract & transform data from a previous step
const items = context.steps.GetList.bodyParsed.items;
return {
  count: items.length,
  firstId: items[0]?.id,
  names: items.map(i => i.name),
};`}</Block>

        <Sub title="Using {{}} interpolation inside transform code">
          <p className="text-gray-300">
            You can also use the standard interpolation syntax inside transform code — it is
            substituted as a raw string <strong>before</strong> the JS runs.
            This is useful for simple value injection.
          </p>
          <Block>{`// {{steps.Login.body.token}} is replaced with the literal token string
// before this code is executed:
const token = "{{steps.Login.body.token}}";
return { authHeader: "Bearer " + token };`}</Block>
          <Note>
            For complex logic (loops, maps, conditionals) use{' '}
            <Code>context.steps.Name.bodyParsed</Code> directly — it gives you the parsed JS object.
          </Note>
        </Sub>

        <Sub title="Generating dynamic values">
          <Block>{`// Generate a random auth token
return { token: Math.random().toString(36).slice(2) };

// Create a signed timestamp
return { ts: Date.now(), nonce: crypto.randomUUID() };

// Merge two step results
const user = context.steps.GetUser.bodyParsed;
const role = context.steps.GetRole.bodyParsed;
return { ...user, role: role.name };`}</Block>
        </Sub>
      </Section>

      {/* ── DAG ────────────────────────────────────────────────── */}
      <Section id="dag" title="9. DAG & parallel execution">
        <p className="text-gray-300">
          Steps are arranged as a <strong className="text-white">Directed Acyclic Graph</strong>.
          Draw an arrow from step A to step B to declare that B depends on A.
        </p>
        <div className="space-y-3 text-gray-300">
          <p>
            <strong className="text-white">Waves</strong> — steps with no pending dependencies run in the
            same wave (concurrently via <Code>Promise.all</Code>). Wave 0 contains steps with no
            dependencies at all.
          </p>
          <p>
            <strong className="text-white">Fan-out / fan-in</strong> — step 1 → steps 2 & 3 run in
            parallel → step 4 waits for both 2 and 3. Step 4 can reference results from all of them.
          </p>
          <p>
            <strong className="text-white">Blocked steps</strong> — if a dependency fails, all
            downstream steps are marked <Code>failed</Code> without running.
          </p>
        </div>
        <Block>{`Wave 0:  [Login]              ← no deps, runs first
Wave 1:  [GetUser] [GetOrg]   ← both depend on Login, run in parallel
Wave 2:  [Summary]            ← depends on GetUser + GetOrg, runs after both`}</Block>
      </Section>

      {/* ── Cache ──────────────────────────────────────────────── */}
      <Section id="cache" title="10. Caching">
        <p className="text-gray-300">
          Enable caching on any Curl step to reuse the last response and skip the actual HTTP request.
          The cache key is a SHA-256 hash of <Code>method + url + headers + body</Code> after
          interpolation.
        </p>
        <div className="space-y-3 text-gray-300">
          <p>
            <strong className="text-white">TTL</strong> — set a time-to-live in seconds.
            The cache entry expires after this duration.
          </p>
          <p>
            <strong className="text-white">Cache bypass</strong> — uncheck <em>Cache enabled</em> or
            clear the cache via the step&apos;s settings panel.
          </p>
          <p>
            <strong className="text-white">Cache miss on 5xx</strong> — responses with status ≥ 500
            are never cached.
          </p>
          <p>
            Steps served from cache show a <Code>💾 FROM CACHE</Code> badge in the run results.
          </p>
        </div>
      </Section>
    </div>
  );
}
