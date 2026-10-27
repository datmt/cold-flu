// Per-run cookie jar. Scoped by hostname + path prefix only: no Domain/Secure/SameSite handling.
// ponytail: host-only matching; add Domain/Secure matching if a chain needs cross-subdomain cookies.
type Cookie = { name: string; value: string; host: string; path: string };

export class CookieJar {
  private cookies: Cookie[] = [];

  /** Store Set-Cookie header values from a response to `url`. */
  store(url: string, setCookies: string[]) {
    const u = new URL(url);
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      if (eq < 1) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      let path = u.pathname.replace(/\/[^/]*$/, '') || '/';
      let expired = false;
      for (const a of attrs) {
        const [k, v = ''] = a.split('=');
        const key = k.toLowerCase();
        if (key === 'path' && v.startsWith('/')) path = v;
        if (key === 'max-age' && Number(v) <= 0) expired = true;
        if (key === 'expires' && Date.parse(v) < Date.now()) expired = true;
      }
      this.cookies = this.cookies.filter((c) => !(c.name === name && c.host === u.hostname && c.path === path));
      if (!expired) this.cookies.push({ name, value, host: u.hostname, path });
    }
  }

  /** Cookie header value for a request to `url`, or '' when none match. */
  header(url: string) {
    const u = new URL(url);
    return this.cookies
      .filter((c) => c.host === u.hostname && (u.pathname === c.path || u.pathname.startsWith(c.path.endsWith('/') ? c.path : `${c.path}/`)))
      .sort((a, b) => b.path.length - a.path.length)
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }
}
