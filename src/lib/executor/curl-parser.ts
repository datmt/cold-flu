export interface ParsedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function normalizeCurl(curlStr: string) {
  return curlStr
    .replace(/\\\r?\n/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function tokenize(command: string) {
  const tokens: string[] = [];
  let current = "";
  let state: "normal" | "single" | "double" = "normal";
  let tokenStarted = false;

  const pushCurrent = () => {
    if (tokenStarted) {
      tokens.push(current);
      current = "";
      tokenStarted = false;
    }
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (state === "normal") {
      if (/\s/.test(char)) {
        pushCurrent();
        continue;
      }

      if (char === "'") {
        state = "single";
        tokenStarted = true;
        continue;
      }

      if (char === '"') {
        state = "double";
        tokenStarted = true;
        continue;
      }

      if (char === "\\") {
        const next = command[index + 1];
        if (next) {
          current += next;
          tokenStarted = true;
          index += 1;
        }
        continue;
      }

      current += char;
      tokenStarted = true;
      continue;
    }

    if (state === "single") {
      if (char === "'") {
        state = "normal";
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      state = "normal";
      continue;
    }

    if (char === "\\") {
      const next = command[index + 1];
      if (next) {
        index += 1;
        switch (next) {
          case "n":  current += "\n"; break;
          case "t":  current += "\t"; break;
          case "r":  current += "\r"; break;
          case "\\": current += "\\"; break;
          case '"':  current += '"';  break;
          case "u": {
            const hex = command.slice(index + 1, index + 5);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              current += String.fromCharCode(parseInt(hex, 16));
              index += 4;
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

    current += char;
  }

  pushCurrent();
  return tokens;
}

function setHeader(headers: Record<string, string>, entry: string) {
  const separatorIndex = entry.indexOf(":");
  if (separatorIndex === -1) {
    headers[entry.trim()] = "";
    return;
  }

  const key = entry.slice(0, separatorIndex).trim();
  const value = entry.slice(separatorIndex + 1).trim();
  headers[key] = value;
}

function hasHeader(headers: Record<string, string>, key: string) {
  return Object.keys(headers).some((headerKey) => headerKey.toLowerCase() === key.toLowerCase());
}

export function parseCurl(curlStr: string): ParsedRequest {
  const normalized = normalizeCurl(curlStr);
  if (!normalized) {
    throw new Error("Curl template is empty");
  }

  const tokens = tokenize(normalized);
  if (tokens[0] === "curl") {
    tokens.shift();
  }

  let method = "";
  let url = "";
  const headers: Record<string, string> = {};
  const bodyParts: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    switch (token) {
      case "-X":
      case "--request":
        method = (tokens[index + 1] ?? "GET").toUpperCase();
        index += 1;
        break;
      case "-H":
      case "--header":
        setHeader(headers, tokens[index + 1] ?? "");
        index += 1;
        break;
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
        bodyParts.push(tokens[index + 1] ?? "");
        index += 1;
        break;
      case "--json":
        bodyParts.push(tokens[index + 1] ?? "");
        if (!hasHeader(headers, "Content-Type")) {
          headers["Content-Type"] = "application/json";
        }
        index += 1;
        break;
      case "--user":
      case "-u": {
        const credentials = tokens[index + 1] ?? "";
        headers.Authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
        index += 1;
        break;
      }
      default:
        if (!token.startsWith("-") && !url) {
          url = token;
        }
        break;
    }
  }

  if (!url) {
    throw new Error("Unable to determine URL from curl command");
  }

  const body = bodyParts.length > 0 ? bodyParts.join("&") : undefined;

  return {
    method: method || (body ? "POST" : "GET"),
    url,
    headers,
    body,
  };
}
