// Polite, honest crawler for one site. No server code here: give it a fetch function and a host guard, and it runs
// anywhere (local server today, a serverless function later).
// Rules: robots.txt respected, honest User-Agent, 10 s per request, at most MAX_PAGES pages, same site only, no logins.

export const USER_AGENT = 'A2PKitChecker/0.1 (+one-off read of public pages to check SMS registration readiness)';
export const UA_TOKEN = 'a2pkitchecker';
export const MAX_PAGES = 10;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const PAUSE_MS = 250;

// Which links are worth following, best first. Matched against link text and URL path.
const ROLE_PATTERNS = [
  ['privacy', /privacy/i],
  ['terms', /\bterms\b|conditions|\btos\b|sms[-\s]?terms|terms[-_]of/i],
  ['optin', /opt[-\s]?in|sms|text(ing)? (us|alerts|updates)|subscribe|sign[-\s]?up|get updates|join/i],
  ['contact', /contact|get in touch|book|appointment|schedule|quote|estimate/i],
  ['about', /about/i],
  ['services', /services?|what we do/i],
];

export function normaliseInput(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new CrawlError('empty', 'Enter your website address.');
  if (/\s/.test(s)) throw new CrawlError('invalid', 'A website address can’t contain spaces.');
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
  if (hasScheme && !/^https?:\/\//i.test(s)) throw new CrawlError('invalid', 'Use a web address that starts with https:// or http://.');
  let u;
  try { u = new URL(hasScheme ? s : 'https://' + s); } catch { throw new CrawlError('invalid', 'That doesn’t look like a website address.'); }
  if (!u.hostname.includes('.')) throw new CrawlError('invalid', 'That doesn’t look like a website address (it needs a dot, like example.com).');
  if (u.username || u.password) throw new CrawlError('invalid', 'Leave out any username or password from the address.');
  u.hash = '';
  return { url: u.href, schemeGiven: hasScheme };
}

export class CrawlError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Registrable-ish domain: last two labels (good enough for .com/.net/.co etc.; we only use it for a warning).
export function siteKey(host) {
  const h = host.toLowerCase().replace(/^www\./, '');
  const parts = h.split('.');
  // fixture.test counts as a suffix so each test site is its own domain
  const twoPartTld = /^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$|^fixture\.test$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoPartTld ? -3 : -2).join('.');
}

// --- robots.txt (RFC 9309 subset: groups, Allow/Disallow, longest match wins, * and $) ---
export function parseRobots(text) {
  const groups = []; let cur = null; let lastWasUA = false;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasUA = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (cur) cur.rules.push({ allow: key === 'allow', path: val });
      lastWasUA = false;
    } else lastWasUA = false;
  }
  return groups;
}

export function robotsAllows(groups, path, token = UA_TOKEN) {
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const g of use) for (const r of g.rules) {
    if (r.path === '') continue; // "Disallow:" with nothing = allow all
    if (ruleMatches(r.path, path) &&(!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}

// RFC 9309 match: * stands for any run of characters and a final $ pins the end. Each literal piece is found once, left to
// right, so a rule full of * can't make the check slow (a RegExp built from the rule could backtrack for minutes).
export function ruleMatches(rule, path) {
  const anchored = rule.endsWith('$');
  const pieces = (anchored ? rule.slice(0, -1) : rule).split('*');
  if (!path.startsWith(pieces[0])) return false;
  let pos = pieces[0].length;
  if (pieces.length === 1) return !anchored || pos === path.length;
  for (let i = 1; i < pieces.length - 1; i++) {
    const at = path.indexOf(pieces[i], pos);
    if (at < 0) return false;
    pos = at + pieces[i].length;
  }
  const last = pieces[pieces.length - 1];
  return anchored ? path.length - last.length >= pos && path.endsWith(last) : path.indexOf(last, pos) >= 0;
}

// Reads at most MAX_BYTES of the body as it arrives, then stops the download (a huge page is never held in memory).
// If the connection drops part-way, the part that arrived is kept.
async function readCapped(res) {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const parts = []; let n = 0;
  try {
    while (n < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = value.subarray(0, MAX_BYTES - n);
      parts.push(take); n += take.length;
    }
  } catch { /* keep what arrived */ } finally { reader.cancel().catch(() => {}); }
  const buf = new Uint8Array(n); let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return buf;
}

// --- tiny HTML helpers for link discovery only (the rules engine parses pages properly in the browser) ---
export function extractLinks(html, baseUrl) {
  const out = [];
  // A plain left-to-right scan (find <a, its >, then the next </a>), so a page of unclosed links stays quick.
  const open = /<a\b/gi, close = /<\/a>/gi; let m;
  while ((m = open.exec(html))) {
    const gt = html.indexOf('>', m.index);
    if (gt < 0) break;
    close.lastIndex = gt + 1;
    const c = close.exec(html);
    if (!c) break;
    open.lastIndex = c.index + c[0].length;
    const attrs = html.slice(m.index + 2, gt), inner = html.slice(gt + 1, c.index);
    const hm = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const h = hm && (hm[1] ?? hm[2] ?? hm[3]);
    if (!h || /^(mailto:|tel:|javascript:|#)/i.test(h)) continue;
    let abs; try { abs = new URL(h.replace(/&amp;/g, '&'), baseUrl); } catch { continue; }
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = '';
    const text = inner.replace(/<[^<>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ url: abs.href, text });
  }
  return out;
}

export function linkRoles(link) {
  const hay = `${link.text} ${new URL(link.url).pathname.replace(/[-_/]/g, ' ')}`;
  return ROLE_PATTERNS.filter(([, re]) => re.test(hay)).map(([r]) => r);
}

// fetchImpl(url, {signal, headers, redirect:'manual'}) -> Response-like. guardHost(url) throws CrawlError if not allowed.
export async function crawl(input, { fetchImpl = fetch, guardHost = async () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxPages = MAX_PAGES } = {}) {
  const started = Date.now();
  const { url: firstUrl, schemeGiven } = normaliseInput(input);
  const notes = [];
  const pages = [];

  async function get(url) {
    const chain = [];
    let cur = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await guardHost(cur);
      let res;
      try {
        res = await fetchImpl(cur, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } });
      } catch (e) {
        if (e instanceof CrawlError) throw e; // a refused address stops the check, the same as a refused first address
        const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
        return { url, finalUrl: cur, chain, status: 0, error: timedOut ? 'timeout' : 'unreachable', errorDetail: String(e && e.cause ? e.cause.code || e.cause.message : e.message || e) };
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), cur).href;
        chain.push({ from: cur, to: next, status: res.status });
        await res.body?.cancel?.().catch(() => {});
        cur = next; continue;
      }
      const type = res.headers.get('content-type') || '';
      let body = '';
      if (/text\/html|xhtml|text\/plain/i.test(type) || !type) {
        body = new TextDecoder('utf-8', { fatal: false }).decode(await readCapped(res));
      } else await res.body?.cancel?.().catch(() => {});
      return { url, finalUrl: cur, chain, status: res.status, contentType: type, html: body };
    }
    return { url, finalUrl: cur, chain, status: 0, error: 'too-many-redirects' };
  }

  // 1. Home page: https first; if the address had no scheme and https fails to connect, try http (as browsers did).
  let home = await get(firstUrl);
  if (!schemeGiven && home.status === 0 && home.error !== 'timeout') {
    const httpUrl = firstUrl.replace(/^https:/, 'http:');
    const viaHttp = await get(httpUrl);
    if (viaHttp.status) { notes.push('https-failed-http-worked'); home = viaHttp; }
  }
  const origin = new URL(home.finalUrl).origin;

  // 2. robots.txt for the final origin.
  let robots = { found: false, allowed: true };
  try {
    const r = await get(origin + '/robots.txt');
    if (r.status === 200 && r.html && !/<html/i.test(r.html.slice(0, 500))) {
      const groups = parseRobots(r.html);
      robots = { found: true, groups };
    }
  } catch (e) { if (e instanceof CrawlError) throw e; }
  const allowed = (u) => !robots.found || robotsAllows(robots.groups, new URL(u).pathname + new URL(u).search);
  if (!allowed(home.finalUrl)) {
    return { ok: false, reason: 'robots', message: 'This site’s robots.txt asks automated tools not to read its pages, so we stopped. You can still use the hand checklist and build every page.', input, startUrl: firstUrl, finalUrl: home.finalUrl, pages: [], notes, elapsedMs: Date.now() - started };
  }
  pages.push({ ...home, roles: ['home'], linkText: '' });
  if (!home.status || home.status >= 400 || !home.html) {
    return { ok: true, input, startUrl: firstUrl, finalUrl: home.finalUrl, robots: { found: robots.found }, pages, notes, elapsedMs: Date.now() - started };
  }

  // 3. Follow the useful same-site links: home first, then one level deeper from contact/opt-in/privacy/terms pages.
  const homeKey = siteKey(new URL(home.finalUrl).hostname);
  const seen = new Set([home.url, home.finalUrl]);
  const queue = [];
  const enqueue = (links, from) => {
    for (const l of links) {
      const host = new URL(l.url).hostname;
      if (siteKey(host) !== homeKey) continue;
      if (seen.has(l.url)) continue;
      const roles = linkRoles(l);
      if (!roles.length) continue;
      seen.add(l.url);
      const rank = Math.min(...roles.map((r) => ROLE_PATTERNS.findIndex(([n]) => n === r)));
      queue.push({ url: l.url, text: l.text, roles, rank, from });
    }
    queue.sort((a, b) => a.rank - b.rank);
  };
  enqueue(extractLinks(home.html, home.finalUrl), home.finalUrl);
  let skippedByRobots = 0;
  while (queue.length && pages.length < maxPages) {
    const next = queue.shift();
    if (!allowed(next.url)) { skippedByRobots++; continue; }
    await sleep(PAUSE_MS);
    const p = await get(next.url);
    if (seen.has(p.finalUrl) && p.finalUrl !== next.url && pages.some((x) => x.finalUrl === p.finalUrl)) continue;
    seen.add(p.finalUrl);
    pages.push({ ...p, roles: next.roles, linkText: next.text, linkedFrom: next.from });
    if (p.html && next.roles.some((r) => ['contact', 'optin', 'privacy', 'terms'].includes(r))) enqueue(extractLinks(p.html, p.finalUrl), p.finalUrl);
  }
  if (skippedByRobots) notes.push(`robots-skipped-${skippedByRobots}`);
  return { ok: true, input, startUrl: firstUrl, finalUrl: home.finalUrl, sameSite: siteKey(new URL(firstUrl).hostname) === homeKey, robots: { found: robots.found }, pages, notes, elapsedMs: Date.now() - started };
}
