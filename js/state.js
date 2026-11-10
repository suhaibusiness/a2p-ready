// Project state: a blank project, and merge() for anything read back from this browser or a project file.
export const BLANK = {
  business: { legalName: '', dba: '', entity: '', hasEin: '', street: '', city: '', state: '', zip: '', country: 'US', phone: '', email: '',
    website: '', noWebsite: false, industry: '', services: '', area: '', sends: { reminders: false, updates: false, quotes: false, replies: false, marketing: false }, marketingPerMonth: 4 },
  check: null, // { url, report } — the rule results only, never the pages' HTML
  build: { siteUrl: '', mode: 'mailto', actionUrl: '', privacyKind: '', visited: false },
  urls: {}, answers: {}, pendingCheck: false,
};
export const clone = (o) => JSON.parse(JSON.stringify(o));
// A saved project or a project file can come from anyone (and this browser's storage is shared with the other tools
// on the same site), so every value is reshaped to the type the app writes, every choice to one the app offers, and
// every link to a web address. Nothing read back can then reach the page as markup or stop the app.
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const one = (v, ok, d) => (ok.includes(v) ? v : d);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
export const webUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '');
const STATUS = ['pass', 'fail', 'warn', 'advice', 'manual', 'skip'], PAGES = ['site', 'privacy', 'terms', 'optin'];
// Copies only the keys `fns` knows, in the order they were saved; fns[k] returns undefined to drop a key.
const keep = (o, fns) => Object.fromEntries(Object.entries(isObj(o) ? o : {}).filter(([k]) => fns[k]).map(([k, v]) => [k, fns[k](v)]).filter(([, v]) => v !== undefined));
const optStr = (v) => (typeof v === 'string' ? v : undefined);
const result = (r) => (isObj(r) && STATUS.includes(r.status) && PAGES.includes(r.group) ? keep(r, {
  id: optStr, group: (v) => v, title: optStr, status: (v) => v, note: optStr, fix: optStr, advice: (v) => (typeof v === 'boolean' ? v : undefined),
  build: (v) => (PAGES.includes(v) ? v : null),
  codes: (v) => (Array.isArray(v) ? v.filter((c) => typeof c === 'string' && /^\d{5}$/.test(c)) : []),
  links: (v) => (Array.isArray(v) ? v.filter((l) => isObj(l) && /^\d{5}$/.test(l.code) && webUrl(l.url)).map((l) => ({ code: l.code, url: l.url })) : undefined),
  evidence: (v) => (Array.isArray(v) ? v.filter(isObj).map((e) => keep(e, { url: (u) => webUrl(u) || undefined, snippet: optStr })) : []),
}) : null);
function report(r) {
  if (!isObj(r) || !Array.isArray(r.results)) return null;
  const out = keep(r, {
    results: (v) => v.map(result).filter(Boolean),
    counts: (v) => ({ ...keep(v, Object.fromEntries(STATUS.map((k) => [k, (x) => num(x, 0)]))), ...Object.fromEntries(STATUS.filter((k) => !isObj(v) || !(k in v)).map((k) => [k, 0])) }),
    found: (v) => keep(v, { privacy: webUrl, terms: webUrl, optin: webUrl }),
    pages: (v) => (Array.isArray(v) ? v.filter(isObj).map((p) => keep(p, { url: (u) => str(u), status: (x) => num(x, undefined), words: (x) => num(x, undefined),
      roles: (x) => (Array.isArray(x) ? x.filter((y) => typeof y === 'string') : undefined) })) : []),
    finalUrl: (v) => webUrl(v) || undefined, checkedAt: optStr,
    pasted: (v) => (Array.isArray(v) ? v.filter(isObj).map((x) => keep(x, { url: (u) => str(u), role: optStr, kind: optStr })) : undefined),
  });
  for (const k of ['results', 'pages']) out[k] ||= [];
  out.counts ||= Object.fromEntries(STATUS.map((k) => [k, 0]));
  return out;
}
export function merge(j) {
  const s = clone(BLANK);
  if (!isObj(j)) return s;
  const b = isObj(j.business) ? j.business : {};
  for (const k of Object.keys(s.business)) {
    if (k === 'sends') for (const x of Object.keys(s.business.sends)) s.business.sends[x] = isObj(b.sends) && typeof b.sends[x] === 'boolean' ? b.sends[x] : false;
    else if (k === 'noWebsite') s.business.noWebsite = b.noWebsite === true;
    else if (k === 'marketingPerMonth') s.business.marketingPerMonth = num(b.marketingPerMonth, 4);
    else s.business[k] = str(b[k], s.business[k]);
  }
  const bu = isObj(j.build) ? j.build : {};
  s.build = keep({ ...s.build, ...bu }, { siteUrl: webUrl, mode: (v) => one(v, ['mailto', 'action', 'highlevel'], 'mailto'), actionUrl: (v) => (/^https:/i.test(webUrl(v)) ? v : ''),
    privacyKind: (v) => one(v, ['', 'full', 'section'], ''), visited: (v) => v === true, tab: (v) => (PAGES.includes(v) ? v : undefined) });
  const rep = isObj(j.check) ? report(j.check.report) : null;
  s.check = rep ? { url: str(j.check.url), report: rep } : null;
  s.urls = keep(j.urls, { privacy: webUrl, terms: webUrl, optin: webUrl });
  s.answers = keep(j.answers, { description: optStr, flow: optStr, optinMsg: optStr, optoutMsg: optStr, helpMsg: optStr, keywords: optStr,
    samples: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : undefined), hasLinks: (v) => (typeof v === 'boolean' ? v : undefined),
    hasPhone: (v) => (typeof v === 'boolean' ? v : undefined) });
  s.pendingCheck = j.pendingCheck === true;
  return s;
}
