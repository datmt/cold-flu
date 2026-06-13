export interface ParsedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function normalizeCurl(curlStr: string): string {
  return curlStr
    .replace(/\\\r?\n/g, " ")   // Linux/macOS backslash continuation
    .replace(/\^\r?\n/g, " ")   // Windows CMD caret continuation
    .replace(/\r?\n/g, " ")
    .trim();
}

export function tokenizeCurl(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let state: "normal" | "single" | "double" = "normal";
  let tokenStarted = false;

  const push = () => {
    if (tokenStarted) {
      tokens.push(current);
      current = "";
      tokenStarted = false;
    }
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (state === "normal") {
      if (/\s/.test(ch)) { push(); continue; }
      if (ch === "'") { state = "single"; tokenStarted = true; continue; }
      if (ch === '"') { state = "double"; tokenStarted = true; continue; }
      if (ch === "\\") {
        const next = command[i + 1];
        if (next) { current += next; tokenStarted = true; i++; }
        continue;
      }
      current += ch;
      tokenStarted = true;
      continue;
    }

    if (state === "single") {
      if (ch === "'") { state = "normal"; } else { current += ch; }
      continue;
    }

    // double-quoted
    if (ch === '"') { state = "normal"; continue; }
    if (ch === "\\") {
      const next = command[i + 1];
      if (next) {
        i++;
        switch (next) {
          case "n":  current += "\n"; break;
          case "t":  current += "\t"; break;
          case "r":  current += "\r"; break;
          case "\\": current += "\\"; break;
          case '"':  current += '"';  break;
          case "u": {
            const hex = command.slice(i + 1, i + 5);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              current += String.fromCharCode(parseInt(hex, 16));
              i += 4;
            } else {
              current += next;
            }
            break;
          }
          default: current += next; break;
        }
      }
      continue;
    }
    current += ch;
  }

  push();
  return tokens;
}

// Flags that consume no additional token
const NO_VALUE_FLAGS = new Set([
  "-k", "--insecure",
  "-L", "--location", "--location-trusted",
  "-s", "--silent",
  "-S", "--show-error",
  "-v", "--verbose",
  "--compressed",
  "--no-keepalive",
  "--http1.0", "--http1.1", "--http2", "--http2-prior-knowledge",
  "-4", "--ipv4", "-6", "--ipv6",
  "-g", "--globoff",
  "-f", "--fail",
  "-N", "--no-buffer",
  "--raw", "--tr-encoding",
  "--digest", "--negotiate", "--ntlm", "--anyauth",
  "-n", "--netrc", "--netrc-optional",
  "--disable-eprt", "--disable-epsv",
  "--path-as-is",
  "--ssl", "--ssl-reqd",
  "--tlsv1", "--tlsv1.0", "--tlsv1.1", "--tlsv1.2", "--tlsv1.3",
  "--sslv2", "--sslv3",
]);

// Flags that consume exactly one following token (ignored for parsed output)
const ONE_VALUE_IGNORE_FLAGS = new Set([
  "-x", "--proxy",
  "--proxy-user", "--proxy-header",
  "--connect-timeout", "--max-time", "-m",
  "--limit-rate",
  "-o", "--output",
  "--cacert", "--capath",
  "--cert", "--key", "--pass",
  "--cert-type", "--key-type",
  "--ciphers", "--tls-max",
  "--resolve",
  "--interface", "--dns-servers",
  "--retry", "--retry-delay", "--retry-max-time",
  "--max-redirs",
  "-w", "--write-out",
  "--trace", "--trace-ascii", "--trace-time",
  "--netrc-file",
  "--dns-interface", "--dns-ipv4-addr", "--dns-ipv6-addr",
  "--local-port",
  "--socks4", "--socks4a", "--socks5", "--socks5-hostname",
  "--keepalive-time",
  "--speed-limit", "--speed-time",
  "--hostpubmd5",
]);

function setHeader(headers: Record<string, string>, entry: string): void {
  // Handle "X-Empty-Header;" (semicolon means remove/empty per curl spec)
  const cleaned = entry.endsWith(";") ? entry.slice(0, -1) : entry;
  const idx = cleaned.indexOf(":");
  if (idx === -1) {
    if (cleaned.trim()) headers[cleaned.trim()] = "";
    return;
  }
  headers[cleaned.slice(0, idx).trim()] = cleaned.slice(idx + 1).trim();
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === key.toLowerCase());
}

// Expand combined short flags like -kL into ["-k", "-L"]
// Only expands known no-value single-char flags; stops at unknown/value-taking chars.
const SHORT_NO_VALUE = new Set(["k", "L", "s", "S", "v", "g", "f", "N", "n", "4", "6"]);

function expandToken(token: string): string[] {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2) return [token];
  // e.g. "-kLs" → ["-k", "-L", "-s"]
  const chars = token.slice(1).split("");
  const expanded: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (SHORT_NO_VALUE.has(c)) {
      expanded.push(`-${c}`);
    } else {
      // Value-taking or unknown: keep remainder as a single flag
      expanded.push(`-${chars.slice(i).join("")}`);
      break;
    }
  }
  return expanded;
}

export function parseCurl(curlStr: string): ParsedRequest {
  const normalized = normalizeCurl(curlStr);
  if (!normalized) throw new Error("Curl template is empty");

  const rawTokens = tokenizeCurl(normalized);
  if (rawTokens[0]?.toLowerCase() === "curl") rawTokens.shift();

  // Expand combined short flags
  const tokens: string[] = rawTokens.flatMap(expandToken);

  let method = "";
  let url = "";
  const headers: Record<string, string> = {};
  const bodyParts: string[] = [];
  const formParts: string[] = [];
  const urlEncodeParams: string[] = [];
  let useGet = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (NO_VALUE_FLAGS.has(token)) continue;
    if (ONE_VALUE_IGNORE_FLAGS.has(token)) { i++; continue; }

    switch (token) {
      case "-X":
      case "--request":
        method = (tokens[++i] ?? "GET").toUpperCase();
        break;

      case "-I":
      case "--head":
        method = "HEAD";
        break;

      case "-G":
      case "--get":
        useGet = true;
        break;

      case "-H":
      case "--header":
        setHeader(headers, tokens[++i] ?? "");
        break;

      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-ascii":
      case "--data-binary": {
        const val = tokens[++i] ?? "";
        // @file references: keep as-is (executor would need to read file, preserve literal)
        bodyParts.push(val);
        break;
      }

      case "--json":
        bodyParts.push(tokens[++i] ?? "");
        if (!hasHeader(headers, "Content-Type")) headers["Content-Type"] = "application/json";
        if (!hasHeader(headers, "Accept")) headers["Accept"] = "application/json";
        break;

      case "--data-urlencode": {
        const raw = tokens[++i] ?? "";
        // curl formats: "name=value", "=value", "name@file", "@file", "content"
        const atIdx = raw.indexOf("@");
        const eqIdx = raw.indexOf("=");
        if (atIdx !== -1 && (eqIdx === -1 || atIdx < eqIdx)) {
          // file reference — keep as placeholder
          const name = raw.slice(0, atIdx);
          urlEncodeParams.push(name ? `${encodeURIComponent(name)}=@${raw.slice(atIdx + 1)}` : `@${raw.slice(atIdx + 1)}`);
        } else if (eqIdx === -1) {
          urlEncodeParams.push(encodeURIComponent(raw));
        } else {
          const name = raw.slice(0, eqIdx);
          const val = raw.slice(eqIdx + 1);
          urlEncodeParams.push(`${encodeURIComponent(name)}=${encodeURIComponent(val)}`);
        }
        break;
      }

      case "-F":
      case "--form":
      case "--form-string":
        formParts.push(tokens[++i] ?? "");
        break;

      case "-u":
      case "--user": {
        const creds = tokens[++i] ?? "";
        headers["Authorization"] = `Basic ${typeof Buffer !== "undefined" ? Buffer.from(creds).toString("base64") : btoa(creds)}`;
        break;
      }

      case "-b":
      case "--cookie": {
        const cookie = tokens[++i] ?? "";
        // Skip if it looks like a file path (curl reads cookies from file)
        if (!cookie.startsWith("/") && !cookie.startsWith("./") && !cookie.startsWith("~")) {
          headers["Cookie"] = cookie;
        }
        break;
      }

      case "-c":
      case "--cookie-jar":
        i++; // output file — skip
        break;

      case "-A":
      case "--user-agent":
        headers["User-Agent"] = tokens[++i] ?? "";
        break;

      case "-e":
      case "--referer":
        headers["Referer"] = tokens[++i] ?? "";
        break;

      default:
        if (!token.startsWith("-") && !url) {
          url = token;
        }
        break;
    }
  }

  if (!url) throw new Error("Unable to determine URL from curl command");

  // -F: multipart form data
  if (formParts.length > 0 && !hasHeader(headers, "Content-Type")) {
    headers["Content-Type"] = "multipart/form-data";
  }

  // -G: append all data params as query string, force GET
  if (useGet) {
    const qParts = [...bodyParts, ...urlEncodeParams];
    if (qParts.length > 0) {
      url += (url.includes("?") ? "&" : "?") + qParts.join("&");
    }
    return { method: "GET", url, headers, body: undefined };
  }

  const allBodyParts = [...bodyParts, ...urlEncodeParams];
  if (formParts.length > 0) {
    allBodyParts.push(
      ...formParts.map((p) => {
        const eq = p.indexOf("=");
        if (eq === -1) return encodeURIComponent(p);
        return `${encodeURIComponent(p.slice(0, eq))}=${encodeURIComponent(p.slice(eq + 1))}`;
      }),
    );
  }

  const body = allBodyParts.length > 0 ? allBodyParts.join("&") : undefined;

  return {
    method: method || (body ? "POST" : "GET"),
    url,
    headers,
    body,
  };
}
