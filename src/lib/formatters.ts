export function isJsonLike(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function formatLooseJson(value: string): string {
  if (!isJsonLike(value)) {
    return value;
  }

  let indent = 0;
  let inString = false;
  let escape = false;
  let stringChar: '"' | "'" | null = null;
  let out = '';

  const addIndent = () => {
    out += '  '.repeat(indent);
  };

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];

    if (!inString && ch === '{' && value[i + 1] === '{') {
      const end = value.indexOf('}}', i + 2);
      if (end !== -1) {
        out += value.slice(i, end + 2);
        i = end + 1;
        continue;
      }
    }

    if (escape) {
      out += ch;
      escape = false;
      continue;
    }

    if (ch === '\\') {
      out += ch;
      if (inString) {
        escape = true;
      }
      continue;
    }

    if ((ch === '"' || ch === "'") && (!inString || ch === stringChar)) {
      inString = !inString;
      stringChar = inString ? (ch as '"' | "'") : null;
      out += ch;
      continue;
    }

    if (inString) {
      out += ch;
      continue;
    }

    switch (ch) {
      case '{':
      case '[':
        out += ch;
        indent += 1;
        out += '\n';
        addIndent();
        break;
      case '}':
      case ']':
        indent = Math.max(indent - 1, 0);
        out += '\n';
        addIndent();
        out += ch;
        break;
      case ',':
        out += ch;
        out += '\n';
        addIndent();
        break;
      case ':':
        out += ': ';
        break;
      default:
        out += ch;
        break;
    }
  }

  return out;
}

export function prettyJsonLike(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return formatLooseJson(value);
  }
}
