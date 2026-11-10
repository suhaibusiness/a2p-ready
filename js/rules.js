// Rules engine. Runs in the browser on the crawler's raw HTML (DOMParser). Every rule id, code and source is in RULES.md.
// Status: pass | warn | fail | advice (our reading of an ambiguous source, never a fail) | skip (needs something else
// first) | manual (we couldn't read it, so check by hand).
import { siteKey, linkRoles } from '../lib/crawl.mjs';

export const GROUPS = { site: 'Your website', privacy: 'Privacy policy', terms: 'SMS terms', optin: 'Opt-in form' };
const TW = (c) => `https://www.twilio.com/docs/api/errors/${c}`;

// title: what carriers want, in plain words. fix: what to do. build: which kit page fixes it (step 3).
export const RULES = {
  W1: { group: 'site', title: 'Your website loads', codes: ['30891', '30922'], fix: 'Make sure the address opens a working page with your business on it. A parked or for-sale domain, an error page or a site that times out gets rejected. If you don’t have a website yet, build one in step 3.', build: 'site' },
  W2: { group: 'site', title: 'It uses https://', codes: ['30964'], fix: 'Turn on SSL (the padlock) with your web host. Most hosts do this for free in one click. Then use the https:// address everywhere in your registration.', build: null },
  W3: { group: 'site', title: 'No login needed', codes: ['30921'], fix: 'Reviewers must see your site without signing in. Make your home page, opt-in form, privacy policy and terms public.', build: 'site' },
  W4: { group: 'site', title: 'It stays on your own domain', codes: ['30907', '30922'], fix: 'Your address forwards to a different domain. Register the address people actually land on, and make sure that site is clearly your business.', build: null },
  W5: { group: 'site', title: 'No placeholder or “coming soon” text', codes: ['30919', '30891'], fix: 'Remove leftover template text (like [Company Name] or lorem ipsum) and any “under construction” notice before you register.', build: 'site' },
  W6: { group: 'site', title: 'It’s a real website, not just a form', codes: ['30920'], fix: 'Carriers reject a site that is only a form or a single landing page. Add pages that describe your business and services, or use the small site the kit builds in step 3.', build: 'site' },
  W7: { group: 'site', title: 'More than one page', codes: ['30919'], fix: 'HighLevel says single-page sites with no about section get rejected. Add an About or Services page and link it from your home page.', build: 'site' },
  W8: { group: 'site', title: 'It describes your business', codes: ['30919'], fix: 'Your home page has very little text. Say who you are, what you do and where you work, in a few sentences.', build: 'site' },
  W9: { group: 'site', title: 'Your business name is on the site', codes: ['30919', '30907', '30918'], fix: 'Show the name you register with (legal name or DBA) on your site. The footer, about page, privacy policy or terms all count.', build: 'site' },
  W10: { group: 'site', title: 'Contact details are on the site', codes: ['30919'], fix: 'Add a phone number or email address customers can use, for example in the footer or on a contact page.', build: 'site' },
  W11: { group: 'site', title: 'The site says you send texts', codes: ['30919'], fix: 'Add a sentence that explains what text messages you send, such as appointment reminders, and link to your opt-in form.', build: 'site' },
  W12: { group: 'site', title: 'Social links go to your own pages', codes: ['30891'], fix: 'Point each social icon at your own page (facebook.com/yourbusiness), or remove it. HighLevel lists links to a network’s home page as a cause of website rejections.', build: null, advice: true },
  W13: { group: 'site', title: 'We could read your pages', codes: [], fix: '', build: null },
  P1: { group: 'privacy', title: 'There is a privacy policy', codes: ['30908', '30933', '30536'], fix: 'Publish a privacy policy on your site and link it from every page (the footer is fine) and from your opt-in form. Step 3 builds one.', build: 'privacy' },
  P2: { group: 'privacy', title: 'It says mobile numbers aren’t shared', codes: ['30908', '30932'], fix: 'Add: “No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging opt-in data and consent will not be shared with any third parties.”', build: 'privacy' },
  P3: { group: 'privacy', title: 'Nothing says you share data for marketing', codes: ['30908', '30932'], fix: 'Remove or reword the sentence that says you may share personal information or phone numbers for marketing, or state clearly that it excludes text messaging opt-in data and phone numbers.', build: 'privacy' },
  P4: { group: 'privacy', title: 'It mentions message frequency', codes: ['30908', '30917'], fix: 'Add a line such as “Message frequency varies.” to the text messaging part of your privacy policy.', build: 'privacy' },
  P5: { group: 'privacy', title: 'It says “Message and data rates may apply”', codes: ['30908', '30917'], fix: 'Add “Message and data rates may apply.” to the text messaging part of your privacy policy.', build: 'privacy' },
  T1: { group: 'terms', title: 'There are SMS terms on your site', codes: ['30934', '30882', '30522'], fix: 'Publish SMS terms on your own domain (not a PDF or another site) and link them from your opt-in form and footer. Step 3 builds them.', build: 'terms' },
  T2: { group: 'terms', title: 'Terms name your business or programme', codes: ['30557'], fix: 'Name your business (or your text programme) in the SMS terms.', build: 'terms' },
  T3: { group: 'terms', title: 'Terms say what messages you send', codes: ['30559'], fix: 'Say what the texts are for, such as appointment reminders, job updates or offers.', build: 'terms' },
  T4: { group: 'terms', title: 'Terms mention message frequency', codes: ['30558'], fix: 'Add “Message frequency varies.” (or a number, like “up to 4 messages a month”).', build: 'terms' },
  T5: { group: 'terms', title: 'Terms say how to get help', codes: ['30560'], fix: 'Add “Reply HELP for help” and your support email or phone number.', build: 'terms' },
  T6: { group: 'terms', title: 'Terms say how to opt out', codes: ['30561'], fix: 'Add “Reply STOP to opt out at any time.”', build: 'terms' },
  T7: { group: 'terms', title: 'Terms say “Message and data rates may apply”', codes: ['30562'], fix: 'Add “Message and data rates may apply.”', build: 'terms' },
  T8: { group: 'terms', title: 'Terms say carriers aren’t liable', codes: ['30563'], fix: 'Add “Carriers are not liable for delayed or undelivered messages.”', build: 'terms' },
  F1: { group: 'optin', title: 'We found your opt-in form', codes: ['30543', '30891'], fix: 'If you collect phone numbers on your website, reviewers need a live link to that form. If people opt in another way (by texting a keyword, on paper or in person), describe that in your registration instead. Step 3 builds a form.', build: 'optin' },
  F2: { group: 'optin', title: 'A separate box just for texts', codes: ['30925', '30896'], fix: 'Add a checkbox whose label is about text messages only. Accepting your terms or submitting the form is not consent to texts.', build: 'optin' },
  F3: { group: 'optin', title: 'The box starts unticked', codes: ['30925', '30931'], fix: 'Remove the pre-ticked state so the customer has to tick the box themselves.', build: 'optin' },
  F4: { group: 'optin', title: 'Ticking the box is optional', codes: ['30923', '30931'], fix: 'Let people submit the form without ticking the SMS box. Consent can’t be a condition of using your service.', build: 'optin' },
  F5: { group: 'optin', title: 'Text consent is on its own', codes: ['30556', '30925', '30931'], fix: 'Keep the SMS box separate from accepting your terms and from email or phone-call consent. Use one box per channel.', build: 'optin' },
  F6: { group: 'optin', title: 'Marketing texts have their own box', codes: ['30913'], fix: 'If you send offers as well as reminders or updates, use two boxes: one for informational texts and one for marketing texts.', build: 'optin' },
  C1: { group: 'optin', title: 'It says “text messages” or “SMS”', codes: ['30551'], fix: 'Say “text messages (SMS)”, not just “communications” or “updates”.', build: 'optin' },
  C2: { group: 'optin', title: 'It names your business', codes: ['30568'], fix: 'Put your business name in the consent text: “…text messages from Your Business”.', build: 'optin' },
  C3: { group: 'optin', title: 'It says what the texts are for', codes: ['30544'], fix: 'Say what you’ll send, such as appointment reminders or quote updates.', build: 'optin' },
  C4: { group: 'optin', title: 'It mentions message frequency', codes: ['30545'], fix: 'Add “Message frequency varies.” next to the box.', build: 'optin' },
  C5: { group: 'optin', title: 'It says “Message and data rates may apply”', codes: ['30569'], fix: 'Add “Message and data rates may apply.” next to the box.', build: 'optin' },
  C6: { group: 'optin', title: 'It says how to opt out (STOP)', codes: ['30547'], fix: 'Add “Reply STOP to opt out.” next to the box.', build: 'optin' },
  C7: { group: 'optin', title: 'It says how to get help (HELP)', codes: ['30570'], fix: 'Add “Reply HELP for help.” next to the box.', build: 'optin' },
  C8: { group: 'optin', title: 'Privacy and Terms links sit by the box', codes: ['30549', '30550', '30564'], fix: 'Put visible links to your Privacy Policy and SMS Terms right under the checkbox, not only in the footer or a pop-up.', build: 'optin' },
  C9: { group: 'optin', title: 'It says consent isn’t a condition of purchase', codes: ['30923'], fix: 'Twilio asks for “Consent is not a condition of purchase.” when that applies to your flow. It costs nothing to add.', build: 'optin', advice: true },
};
for (const [id, r] of Object.entries(RULES)) { r.id = id; r.links = r.codes.map((c) => ({ code: c, url: TW(c) })); }

// ---------- text helpers ----------
export const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const SUFFIX = /\b(l l c|llc|pllc|inc|incorporated|co|corp|corporation|company|ltd|limited|llp|lp)\b/g;
export function nameVariants(b) {
  return [b && b.legalName, b && b.dba].filter(Boolean).map((n) => norm(n).replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim()).filter((n) => n.length >= 3);
}
export function hasName(text, b) {
  const t = ' ' + norm(text) + ' ';
  return nameVariants(b).some((n) => t.includes(' ' + n + ' '));
}
const RX = {
  freq: /message frequency|msg\.? frequency|frequency var|messages? (per|a|each) (day|week|month)|msgs?\s*\/\s*(day|wk|week|mo|month)|up to \d+ (messages|msgs|texts)|\b(\d+|one|two|three|four|five|six|ten) (messages|msgs|texts) (a|per|each) (day|week|month)|recurring (messages|msgs)/i,
  rates: /\b(message|msg)s?\s*(and|&|&amp;)\s*data rates/i,
  stop: /\bSTOP\b|\b(reply|text|send)\s+["“'‘]?stop\b/i,
  stopStrict: /\bSTOP\b|\b(reply|text|send)\s+["“'‘]?stop\b/,
  help: /\bHELP\b|\b(reply|text|send)\s+["“'‘]?help\b/,
  sms: /\b(sms|text messag\w*|texts|text alerts?|text updates?|text reminders?|texting|mobile messages?)\b/i,
  purpose: /\b(reminders?|appointments?|quotes?|estimates?|updates?|offers?|promotions?|promotional|marketing|notifications?|confirmations?|alerts?|deliver(y|ies)|deals?|discounts?|follow-?ups?|bookings?|order status|arrival)\b/i,
  promo: /\b(offers?|promotions?|promotional|marketing|deals?|discounts?|specials?|coupons?|sales)\b/i,
  info: /\b(reminders?|appointments?|updates?|confirmations?|notifications?|alerts?|follow-?ups?|arrival|order status|account)\b/i,
  phone: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/,
  email: /(?<![a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // starts only where a run starts, so a long run is read once
  placeholder: /under construction|coming soon|lorem ipsum|\[(company|business|your|insert|client)[^\]]{0,30}\]|\{\{\s*[\w.]+\s*\}\}|your business name here|insert (company|business) name/i,
  parked: /domain (is |may be )?(for sale|parked)|buy this domain|this domain is parked|parked (free|domain)|domain parking|is available for purchase/i,
  negation: /\b(not|never|no|won['’]t|will not|don['’]t|do not|does not|without|exclud\w*)\b/i,
  shareVerb: /\b(shar\w*|sell\w*|sold|rent\w*|disclos\w*|transfer\w*|provid\w* (it |them |your [\w ]{1,60})?to)\b/i,
  third: /\b(third[- ]part\w*|partners?|affiliates?|other companies|advertisers?|vendors?)\b/i,
  mktg: /\b(marketing|promotion\w*|advertis\w*)\b/i,
  mobileData: /\b(mobile|phone|sms|text\w*|opt[- ]?in)\b/i,
  carrier: /\bcarriers?\b[^.]{0,90}\b(not (be )?(liable|responsible))|\b(not (be )?(liable|responsible))\b[^.]{0,90}\b(delayed|undelivered)\b/i,
  agreeTerms: /\b(agree|accept|consent)\w*\b[^.]{0,40}\b(terms|privacy policy|conditions)\b|\bterms of (service|use)\b/i,
  otherChannels: /\b(e-?mails?|phone calls?|calls|voicemails?|newsletters?)\b/i,
};
export { RX };

function snippet(text, re, max = 170) {
  const m = re ? text.match(re) : null;
  if (!m) return text.slice(0, max).trim() + (text.length > max ? '…' : '');
  const i = m.index;
  const a = Math.max(0, i - 60), b = Math.min(text.length, i + m[0].length + 90);
  return (a > 0 ? '…' : '') + text.slice(a, b).trim() + (b < text.length ? '…' : '');
}
const sentences = (t) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---------- parse one crawled page ----------
export function parsePage(p) {
  // a space before block tags so "<h1>A</h1><p>B" reads "A B", not "AB"
  const html = String(p.html || '').replace(/<(\/?(?:p|div|h[1-6]|li|br|td|th|tr|section|article|header|footer|nav|label|button|option|form|ul|ol|dt|dd|main|aside|blockquote|span|a|input|textarea)\b)/gi, ' <$1');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = p.finalUrl || p.url;
  const body = doc.body || doc.createElement('body');
  const strip = (el) => { const c = el.cloneNode(true); c.querySelectorAll('script,style,noscript,template,svg').forEach((n) => n.remove()); return c; };
  const all = strip(body);
  const text = clean(all.textContent);
  const content = strip(body); // main content, without site chrome
  content.querySelectorAll('nav,header,footer,[role=navigation],[role=contentinfo]').forEach((n) => n.remove());
  const main = content.querySelector('main,article,[role=main]');
  const contentText = clean((main || content).textContent);
  const links = [...doc.querySelectorAll('a[href]')].map((a) => {
    let url = null; try { url = new URL(a.getAttribute('href'), base).href; } catch {}
    return { url, raw: a.getAttribute('href'), text: clean(a.textContent) || clean(a.getAttribute('aria-label')) || clean(a.getAttribute('title')), el: a };
  }).filter((l) => l.url);
  const words = text ? text.split(' ').length : 0;
  const scripts = doc.querySelectorAll('script[src]').length;
  const appRoot = !!doc.querySelector('#root,#app,#__next,#__nuxt,[data-reactroot]');
  return { ...p, doc, text, contentText, words, links, scripts, appRoot, url: base };
}

const isOk = (p) => p && p.status >= 200 && p.status < 300 && p.html;
const label = (el) => {
  const doc = el.ownerDocument;
  if (el.id) { const l = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return clean(l.textContent); }
  const wrap = el.closest('label'); if (wrap) return clean(wrap.textContent);
  const al = el.getAttribute('aria-label'); if (al) return clean(al);
  return clean(el.parentElement ? el.parentElement.textContent : '');
};
function isPhoneInput(el) {
  if (el.type === 'tel') return true;
  if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'email', 'password'].includes(el.type)) return false;
  const hay = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete'), el.id || el.closest('label') ? label(el) : ''].join(' ');
  return /phone|mobile|cell|\btel\b/i.test(hay);
}
const SMS_LABEL = /\b(sms|text messag\w*|texts|text alerts?|text updates?|text reminders?|texting)\b/i;

// ---------- the site check ----------
// crawl: the /api/check result. business: {legalName, dba}. Returns {results:[...], meta}.
export function checkSite(crawl, business = {}) {
  const out = {};
  const set = (id, status, evidence = [], note = '') => { out[id] = { ...RULES[id], status, evidence, note }; };
  const pages = (crawl.pages || []).map(parsePage);
  const home = pages[0];
  const named = nameVariants(business).length > 0;
  const ids = Object.keys(RULES);
  const ev = (p, re, text) => ({ url: p.finalUrl || p.url, snippet: snippet(text ?? p.text, re) });

  // W1: does the home page load?
  if (!home || !home.status || home.status >= 400 || !home.html) {
    const why = !home ? 'No response.' : home.error === 'timeout' ? 'The site took longer than 10 seconds to answer.' : home.error === 'too-many-redirects' ? 'The address redirects too many times.' : home.status ? `The server answered with error ${home.status}.` : 'We couldn’t connect to this address (it may not exist, or the server is down).';
    if (home && (home.status === 401 || home.status === 403)) { set('W1', 'pass'); set('W3', 'fail', [{ url: home.finalUrl, snippet: `The server answered ${home.status} (sign-in or access denied).` }]); }
    else set('W1', 'fail', [{ url: (home && home.finalUrl) || crawl.startUrl, snippet: why }]);
    for (const id of ids) if (!out[id]) set(id, 'skip', [], 'We couldn’t load your home page, so this wasn’t checked.');
    return finish(out, pages, crawl);
  }
  if (RX.parked.test(home.text)) {
    set('W1', 'fail', [ev(home, RX.parked)], 'This looks like a parked or for-sale domain.');
    for (const id of ids) if (!out[id]) set(id, 'skip', [], 'Your domain looks parked, so this wasn’t checked.');
    return finish(out, pages, crawl);
  }
  set('W1', 'pass', [{ url: home.finalUrl, snippet: `Loaded (${home.status}).` }]);

  // W2 https, W4 same domain
  const https = home.finalUrl.startsWith('https:');
  set('W2', https ? 'pass' : 'fail', [{ url: home.finalUrl, snippet: https ? 'Served over https.' : (crawl.notes || []).includes('https-failed-http-worked') ? 'https:// didn’t connect, so we used http://, which carriers reject.' : 'This page is served over plain http://.' }]);
  set('W4', crawl.sameSite === false ? 'warn' : 'pass', crawl.sameSite === false ? [{ url: home.finalUrl, snippet: `${crawl.startUrl} forwards to ${home.finalUrl}` }] : []);

  // W3 login wall
  const pw = home.doc.querySelector('input[type=password]');
  if (pw && home.words < 150) set('W3', 'fail', [ev(home, /sign in|log ?in|password/i)], 'Your home page asks for a password.');
  else set('W3', 'pass');

  // W13 readable (JavaScript-only)
  const jsOnly = (p) => p.words < 20 && (p.scripts || p.appRoot);
  const readable = pages.filter((p) => isOk(p) && !jsOnly(p));
  if (jsOnly(home)) {
    set('W13', 'manual', [{ url: home.finalUrl, snippet: `Only ${home.words} words of text without JavaScript.` }],
      'We couldn’t read this page: it builds itself with JavaScript, which we don’t run. Carriers’ reviewers use a normal browser, so check the items below by hand.');
    if (!readable.length) {
      for (const id of ids) if (!out[id]) set(id, 'manual', [], HAND[RULES[id].group]);
      return finish(out, pages, crawl);
    }
  } else set('W13', 'pass');

  // site content rules
  const ph = readable.find((p) => RX.placeholder.test(p.text));
  set('W5', ph ? 'fail' : 'pass', ph ? [ev(ph, RX.placeholder)] : []);

  const homeSite = siteKey(new URL(home.finalUrl).hostname);
  const internal = (p) => [...new Set(p.links.filter((l) => /^https?:/.test(l.url) && siteKey(new URL(l.url).hostname) === homeSite)
    .map((l) => { const u = new URL(l.url); return u.origin + u.pathname.replace(/\/$/, '').replace(/\.html?$/, '').replace(/\/index$/, ''); })
    .filter((u) => u !== new URL(home.finalUrl).origin + new URL(home.finalUrl).pathname.replace(/\/$/, '').replace(/\/index(\.html?)?$/, '')))];
  const homeLinks = internal(home);
  const formEls = [...home.doc.querySelectorAll('form')];
  const formWords = formEls.reduce((n, f) => n + clean(f.textContent).split(' ').filter(Boolean).length, 0);
  const outside = home.words - formWords;
  if (formEls.length && outside < 80 && homeLinks.length === 0) set('W6', 'fail', [{ url: home.finalUrl, snippet: `A form, ${Math.max(outside, 0)} words of other text and no links to other pages.` }]);
  else set('W6', 'pass');
  set('W7', homeLinks.length >= 2 ? 'pass' : 'warn', [{ url: home.finalUrl, snippet: homeLinks.length ? `Links to ${homeLinks.length} other page${homeLinks.length === 1 ? '' : 's'} on your site.` : 'No links to other pages on your site.' }]);
  set('W8', home.words >= 150 ? 'pass' : 'warn', [{ url: home.finalUrl, snippet: `About ${home.words} words on the home page.` }]);

  if (!named) set('W9', 'skip', [], 'Add your business name in step 1 to check this.');
  else { const hit = readable.find((p) => hasName(p.text, business)); set('W9', hit ? 'pass' : 'fail', hit ? [ev(hit, new RegExp(nameVariants(business)[0].split(' ').map(escapeRe).join('\\W+'), 'i'))] : [{ url: home.finalUrl, snippet: `We looked for “${business.dba || business.legalName}” on ${readable.length} page${readable.length === 1 ? '' : 's'}.` }]); }

  const contact = readable.find((p) => RX.phone.test(p.text) || RX.email.test(p.text) || p.links.some((l) => /^(tel|mailto):/i.test(l.raw)));
  const looked = `on ${readable.length} page${readable.length === 1 ? '' : 's'}`;
  set('W10', contact ? 'pass' : 'fail', contact ? [ev(contact, RX.phone.test(contact.text) ? RX.phone : RX.email)] : [{ url: home.finalUrl, snippet: `No phone number or email address found ${looked}.` }]);
  const texting = readable.find((p) => RX.sms.test(p.text));
  set('W11', texting ? 'pass' : 'fail', texting ? [ev(texting, RX.sms)] : [{ url: home.finalUrl, snippet: `No mention of text messages or SMS found ${looked}.` }]);
  const bare = [];
  for (const p of readable) for (const l of p.links) {
    try { const u = new URL(l.url); if (/^(www\.)?(facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest)\.com$/i.test(u.hostname) && (u.pathname === '/' || u.pathname === '')) bare.push({ url: p.finalUrl, snippet: `“${l.text || 'icon'}” links to ${u.href}` }); } catch {}
  }
  set('W12', bare.length ? 'advice' : 'pass', bare.slice(0, 3));

  // ---------- privacy ----------
  const roleOf = (p, r) => (p.roles || []).includes(r);
  const privacy = readable.find((p) => roleOf(p, 'privacy') && /privacy/i.test(p.text) && p.words >= 40);
  const offsite = (role) => { for (const p of readable) for (const l of p.links) { if (linkRoles({ url: l.url, text: l.text }).includes(role) && /^https?:/.test(l.url) && siteKey(new URL(l.url).hostname) !== homeSite) return { url: p.finalUrl, snippet: `“${l.text}” links to ${l.url}` }; } return null; };
  if (privacy) {
    set('P1', 'pass', [{ url: privacy.finalUrl, snippet: snippet(privacy.contentText, /privacy/i) }]);
    const t = privacy.contentText || privacy.text, ss = sentences(t);
    const ok = ss.find((s) => RX.mobileData.test(s) && RX.shareVerb.test(s) && RX.negation.test(s));
    set('P2', ok ? 'pass' : 'fail', ok ? [{ url: privacy.finalUrl, snippet: ok }] : [{ url: privacy.finalUrl, snippet: 'No sentence saying mobile numbers or opt-in data won’t be shared.' }]);
    const bad = ss.filter((s) => RX.shareVerb.test(s) && RX.third.test(s) && RX.mktg.test(s) && !RX.negation.test(s));
    const badMobile = bad.find((s) => RX.mobileData.test(s));
    if (badMobile) set('P3', 'fail', [{ url: privacy.finalUrl, snippet: badMobile }]);
    else if (bad.length) set('P3', 'warn', [{ url: privacy.finalUrl, snippet: bad[0] }], 'This sharing clause doesn’t mention phone numbers, but reviewers may read it as covering them. Say that it excludes text messaging opt-in data.');
    else set('P3', 'pass');
    set('P4', RX.freq.test(t) ? 'pass' : 'fail', [{ url: privacy.finalUrl, snippet: RX.freq.test(t) ? snippet(t, RX.freq) : 'No message frequency found.' }]);
    set('P5', RX.rates.test(t) ? 'pass' : 'fail', [{ url: privacy.finalUrl, snippet: RX.rates.test(t) ? snippet(t, RX.rates) : 'No “Message and data rates may apply” found.' }]);
  } else {
    const off = offsite('privacy');
    if (off) { set('P1', 'warn', [off], 'Your privacy policy is on another site, so we couldn’t read it. Check the items below by hand.'); for (const id of ['P2', 'P3', 'P4', 'P5']) set(id, 'manual', [], HAND.privacy); }
    else { set('P1', 'fail', [{ url: home.finalUrl, snippet: `No privacy policy link found on ${readable.length} page${readable.length === 1 ? '' : 's'}.` }]); for (const id of ['P2', 'P3', 'P4', 'P5']) set(id, 'skip', [], 'Checked once you have a privacy policy.'); }
  }

  // ---------- terms ----------
  const termsPages = readable.filter((p) => roleOf(p, 'terms') && p.words >= 30);
  const termsScore = (p) => [RX.stopStrict, RX.help, RX.freq, RX.rates, RX.carrier, RX.sms].filter((re) => re.test(p.contentText)).length;
  const terms = termsPages.sort((a, b) => termsScore(b) - termsScore(a))[0];
  if (terms) {
    const t = terms.contentText || terms.text;
    set('T1', 'pass', [{ url: terms.finalUrl, snippet: snippet(t, /terms/i) }]);
    const e = (re, missing) => (re.test(t) ? [{ url: terms.finalUrl, snippet: snippet(t, re) }] : [{ url: terms.finalUrl, snippet: missing }]);
    if (!named) set('T2', 'skip', [], 'Add your business name in step 1 to check this.');
    else set('T2', hasName(t, business) ? 'pass' : 'fail', hasName(t, business) ? [{ url: terms.finalUrl, snippet: snippet(t, new RegExp(nameVariants(business)[0].split(' ').map(escapeRe).join('\\W+'), 'i')) }] : [{ url: terms.finalUrl, snippet: 'Your business name isn’t in the terms text.' }]);
    set('T3', RX.purpose.test(t) ? 'pass' : 'fail', e(RX.purpose, 'No description of what messages you send.'));
    set('T4', RX.freq.test(t) ? 'pass' : 'fail', e(RX.freq, 'No message frequency found.'));
    const sup = RX.help.test(t) || RX.email.test(t) || RX.phone.test(t);
    set('T5', sup ? 'pass' : 'fail', e(RX.help.test(t) ? RX.help : RX.email.test(t) ? RX.email : RX.phone, 'No HELP instructions or support contact.'));
    set('T6', RX.stop.test(t) ? 'pass' : 'fail', e(RX.stop, 'No STOP instructions.'));
    set('T7', RX.rates.test(t) ? 'pass' : 'fail', e(RX.rates, 'No “Message and data rates may apply”.'));
    set('T8', RX.carrier.test(t) ? 'pass' : 'fail', e(RX.carrier, 'No line saying carriers aren’t liable for delayed or undelivered messages.'));
  } else {
    const off = offsite('terms');
    set('T1', 'fail', off ? [off] : [{ url: home.finalUrl, snippet: `No terms page found on ${readable.length} page${readable.length === 1 ? '' : 's'}.` }], off ? 'Your terms are on another domain. Twilio says the terms URL must be on the same domain as your website.' : '');
    for (const id of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']) set(id, 'skip', [], 'Checked once you have SMS terms on your site.');
  }

  // ---------- opt-in forms ----------
  const forms = [];
  const embeds = [];
  for (const p of readable) {
    for (const f of p.doc.querySelectorAll('form')) if ([...f.querySelectorAll('input,textarea')].some(isPhoneInput)) forms.push({ page: p, form: f });
    for (const fr of p.doc.querySelectorAll('iframe[src]')) if (/form|leadconnector|msgsndr|typeform|jotform|hubspot|wufoo|calendly|booking/i.test(fr.getAttribute('src'))) embeds.push({ url: p.finalUrl, snippet: `Embedded form: ${fr.getAttribute('src')}` });
  }
  const optinIds = ['F2', 'F3', 'F4', 'F5', 'F6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];
  if (!forms.length) {
    if (embeds.length) { set('F1', 'manual', embeds.slice(0, 2), 'We found an embedded form we can’t look inside. Check the items below by hand on the live page.'); for (const id of optinIds) set(id, 'manual', [], HAND.optin); }
    else { set('F1', 'warn', [{ url: home.finalUrl, snippet: `No form asking for a phone number on ${readable.length} page${readable.length === 1 ? '' : 's'}.` }]); for (const id of optinIds) set(id, 'skip', [], 'No opt-in form found to check.'); }
    return finish(out, pages, crawl);
  }
  set('F1', 'pass', forms.map((f) => ({ url: f.page.finalUrl, snippet: 'Form with a phone number field.' })).slice(0, 3));
  // Evaluate every phone form and every SMS checkbox in it; report the worst case per rule.
  const ORDER = { fail: 3, warn: 2, advice: 1, pass: 0 };
  const worst = {};
  const put = (id, status, e) => { if (!worst[id] || ORDER[status] > ORDER[worst[id].status]) worst[id] = { status, evidence: [e] }; else if (worst[id].status === status && status !== 'pass' && worst[id].evidence.length < 3) worst[id].evidence.push(e); };
  for (const { page, form } of forms) {
    const container = form.parentElement && !/^(body|main|html)$/i.test(form.parentElement.tagName) ? form.parentElement : form;
    const formText = clean(strip2(container).textContent);
    const boxes = [...form.querySelectorAll('input[type=checkbox]')].filter((c) => SMS_LABEL.test(label(c)));
    const url = page.finalUrl;
    if (!boxes.length) {
      put('F2', 'fail', { url, snippet: snippet(formText, null) + ' (no checkbox for text messages)' });
      for (const id of ['F3', 'F4', 'F5', 'F6']) put(id, 'pass', { url, snippet: '' });
      ctaChecks(formText, container, url, null);
      continue;
    }
    put('F2', 'pass', { url, snippet: label(boxes[0]) });
    for (const c of boxes) {
      const l = label(c);
      put('F3', c.hasAttribute('checked') ? 'fail' : 'pass', { url, snippet: (c.hasAttribute('checked') ? '[ticked by default] ' : '') + l });
      put('F4', c.hasAttribute('required') || /\(required\)|\brequired\b/i.test(l) ? 'fail' : 'pass', { url, snippet: (c.hasAttribute('required') ? '[required to submit] ' : '') + l });
      put('F5', RX.agreeTerms.test(l) || RX.otherChannels.test(l) ? 'fail' : 'pass', { url, snippet: l });
      put('F6', RX.promo.test(l) && RX.info.test(l) ? 'warn' : 'pass', { url, snippet: l });
      ctaChecks(l + ' ' + formText, container, url, l);
    }
  }
  function ctaChecks(t, container, url, l) {
    const s = (re) => ({ url, snippet: snippet(l || t, re) });
    put('C1', RX.sms.test(t) ? 'pass' : 'fail', s(RX.sms));
    put('C2', !named ? 'pass' : hasName(t, business) ? 'pass' : 'fail', s(null));
    put('C3', RX.purpose.test(l || t) ? 'pass' : 'fail', s(RX.purpose));
    put('C4', RX.freq.test(t) ? 'pass' : 'fail', s(RX.freq));
    put('C5', RX.rates.test(t) ? 'pass' : 'fail', s(RX.rates));
    put('C6', RX.stop.test(t) ? 'pass' : 'fail', s(RX.stop));
    put('C7', RX.help.test(t) ? 'pass' : 'fail', s(RX.help));
    const ls = [...container.querySelectorAll('a[href]')].map((a) => linkRoles({ url: new URL(a.getAttribute('href'), url).href, text: clean(a.textContent) }));
    const hasP = ls.some((r) => r.includes('privacy')), hasT = ls.some((r) => r.includes('terms'));
    put('C8', hasP && hasT ? 'pass' : 'fail', { url, snippet: hasP && hasT ? 'Privacy and Terms links are inside the form.' : `Missing next to the form: ${[!hasP && 'Privacy Policy link', !hasT && 'Terms link'].filter(Boolean).join(' and ')}.` });
    put('C9', /not (a )?condition of (any )?purchase/i.test(t) ? 'pass' : 'advice', s(/condition of/i));
  }
  for (const id of optinIds) {
    const w = worst[id]; if (!w) { set(id, 'pass'); continue; }
    if (id === 'C2' && !named) { set(id, 'skip', [], 'Add your business name in step 1 to check this.'); continue; }
    set(id, w.status, w.status === 'pass' ? w.evidence.slice(0, 1).filter((e) => e.snippet) : w.evidence);
  }
  return finish(out, pages, crawl);
}

function strip2(el) { const c = el.cloneNode(true); c.querySelectorAll('script,style,noscript,template,svg,select,option').forEach((n) => n.remove()); return c; }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// What to check by hand when we couldn't read a page.
export const HAND = {
  site: 'Open your site in a browser and check: it loads over https:// without a login; it shows your business name, what you do, contact details, and a sentence about the texts you send; there is more than one page.',
  privacy: 'Open your privacy policy and check it says: mobile numbers and text opt-in data are not shared with third parties for marketing; message frequency; “Message and data rates may apply”.',
  terms: 'Open your SMS terms and check they include: your business name; what texts you send; message frequency; HELP and a support contact; STOP to opt out; “Message and data rates may apply”; carriers are not liable for delayed or undelivered messages.',
  optin: 'Open your opt-in form and check: a separate SMS checkbox that starts unticked and is optional; its text names your business, says what you send, the frequency, “Message and data rates may apply”, Reply STOP and Reply HELP; links to your Privacy Policy and SMS Terms right under it.',
};

function finish(out, pages, crawl) {
  const results = Object.keys(RULES).map((id) => out[id]).filter(Boolean);
  const count = (s) => results.filter((r) => r.status === s).length;
  const found = {
    privacy: pages.find((p) => (p.roles || []).includes('privacy') && isOk(p))?.finalUrl || '',
    terms: pages.filter((p) => (p.roles || []).includes('terms') && isOk(p)).map((p) => p.finalUrl)[0] || '',
    optin: (results.find((r) => r.id === 'F1' && r.status === 'pass')?.evidence[0] || {}).url || '',
  };
  return { results, counts: { pass: count('pass'), fail: count('fail'), warn: count('warn'), advice: count('advice'), skip: count('skip'), manual: count('manual') }, found, pages: pages.map((p) => ({ url: p.finalUrl, status: p.status, words: p.words, roles: p.roles })), finalUrl: crawl.finalUrl, checkedAt: new Date().toISOString() };
}

// ---------- registration answers (R1-R11) ----------
export const LIMITS = { description: [40, 4096], flow: [40, 2048], sample: [20, 1024], reply: [20, 320], keywords: [0, 255] };
const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at)\b/i;
export const ANSWER_RULES = {
  R1: { title: 'Campaign description is 40-4,096 characters', codes: ['30886'] },
  R2: { title: 'Opt-in flow is 40-2,048 characters and includes your form, privacy and terms URLs', codes: ['30909', '30917', '30896'] },
  R3: { title: '2 to 5 sample messages, 20-1,024 characters, each with your business name and opt-out wording', codes: ['30893', '30911'] },
  R4: { title: 'No public link shorteners', codes: ['30892', '30963'] },
  R5: { title: 'Every link uses https://', codes: ['30964'] },
  R6: { title: 'Opt-in reply: business name, frequency, rates, HELP and STOP, 20-320 characters', codes: ['30896', '30917'] },
  R7: { title: 'Opt-out reply: business name, confirms no more messages, 20-320 characters', codes: ['30887'] },
  R8: { title: 'Help reply: business name and a phone or email, 20-320 characters', codes: ['30890', '30936'] },
  R9: { title: 'Keywords are letters and numbers, 255 characters at most', codes: [] },
  R10: { title: 'No two answers are the same', codes: ['30911'] },
  R11: { title: 'Embedded links and phone numbers are declared', codes: ['30889'] },
};
export function checkAnswers(a, business = {}) {
  const r = [];
  const add = (id, ok, detail) => r.push({ id, ...ANSWER_RULES[id], status: ok ? 'pass' : 'fail', detail: ok ? '' : detail });
  const len = (s) => String(s || '').length;
  const within = (s, [lo, hi]) => len(s) >= lo && len(s) <= hi;
  const name = (s) => !nameVariants(business).length || hasName(s, business);
  add('R1', within(a.description, LIMITS.description), `It is ${len(a.description)} characters.`);
  const urls = [a.optinUrl, a.privacyUrl, a.termsUrl].filter(Boolean);
  const missing = urls.filter((u) => !String(a.flow || '').includes(u));
  add('R2', within(a.flow, LIMITS.flow) && !missing.length, !within(a.flow, LIMITS.flow) ? `It is ${len(a.flow)} characters.` : `Missing: ${missing.join(', ')}`);
  const samples = (a.samples || []).filter((s) => String(s).trim());
  const badS = samples.map((s, i) => [i + 1, !within(s, LIMITS.sample) ? `${len(s)} characters` : !name(s) ? 'no business name' : !/\bstop\b/i.test(s) ? 'no opt-out wording' : ''].filter(Boolean)).filter((x) => x.length > 1);
  add('R3', samples.length >= 2 && samples.length <= 5 && !badS.length, samples.length < 2 || samples.length > 5 ? `You have ${samples.length} samples; you need 2 to 5.` : badS.map(([i, why]) => `Sample ${i}: ${why}`).join('; '));
  const allText = [a.description, a.flow, ...samples, a.optinMsg, a.optoutMsg, a.helpMsg].join('\n');
  add('R4', !SHORTENERS.test(allText), `Found ${(allText.match(SHORTENERS) || [''])[0]}`);
  const http = allText.match(/\bhttp:\/\/\S+/i);
  add('R5', !http, `Found ${http && http[0]}`);
  const optin = a.optinMsg || '';
  const optinMiss = [!name(optin) && 'business name', !RX.freq.test(optin) && 'frequency', !RX.rates.test(optin) && 'rates', !RX.help.test(optin) && 'HELP', !RX.stopStrict.test(optin) && 'STOP', !within(optin, LIMITS.reply) && `${len(optin)} characters`].filter(Boolean);
  add('R6', !optinMiss.length, `Missing: ${optinMiss.join(', ')}`);
  const out = a.optoutMsg || '';
  const outMiss = [!name(out) && 'business name', !/(no (more|further)|won['’]t (receive|get)|will not (receive|get)|unsubscribed|opted out)/i.test(out) && 'confirmation that no more messages will be sent', !within(out, LIMITS.reply) && `${len(out)} characters`].filter(Boolean);
  add('R7', !outMiss.length, `Missing: ${outMiss.join(', ')}`);
  const help = a.helpMsg || '';
  const helpMiss = [!name(help) && 'business name', !(RX.phone.test(help) || RX.email.test(help)) && 'phone or email', !within(help, LIMITS.reply) && `${len(help)} characters`].filter(Boolean);
  add('R8', !helpMiss.length, `Missing: ${helpMiss.join(', ')}`);
  const kw = String(a.keywords || '');
  add('R9', /^[A-Za-z0-9, ]*$/.test(kw) && kw.length <= 255, 'Use only letters and numbers, separated by commas.');
  const fields = [a.description, a.flow, ...samples, a.optinMsg, a.optoutMsg, a.helpMsg].map((s) => norm(s)).filter(Boolean);
  add('R10', new Set(fields).size === fields.length, 'Two of your answers are identical. Each one must be different.');
  const sLinks = samples.some((s) => /https?:\/\/|www\.|(?<![a-z0-9-])[a-z0-9-]+\.(com|net|org|co|us|io)\b/i.test(s));
  const sPhone = samples.some((s) => RX.phone.test(s));
  add('R11', sLinks === !!a.hasLinks && sPhone === !!a.hasPhone, `Your samples ${sLinks ? 'contain' : 'don’t contain'} links and ${sPhone ? 'contain' : 'don’t contain'} phone numbers; set the two “embedded” answers to match.`);
  return r;
}

// ---------- business details (B1-B7) ----------
export const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|zoho|yandex|mail)\.[a-z.]+$/i;
export const FORBIDDEN = {
  cannabis: ['Cannabis, CBD or hemp', '30940'], rx: ['Prescription drugs', '30941'], loans: ['Loans or lending', '30942'],
  debtcollect: ['Third-party debt collection', '30943'], gambling: ['Gambling or betting', '30944'], sweepstakes: ['Sweepstakes or contests', '30945'],
  crypto: ['Cryptocurrency', '30947'], invest: ['High-risk investing or stock alerts', '30948'], debtrelief: ['Debt relief or consolidation', '30949'],
  credit: ['Credit repair', '30950'], leadgen: ['Selling leads to other businesses, or MLM', '30951'], firearms: ['Firearms or explosives', '30957'],
  tobacco: ['Tobacco or vape', '30958'],
};
export function checkBusiness(b) {
  const r = [];
  const add = (id, status, title, detail, codes = []) => r.push({ id, status, title, detail, codes });
  if (FORBIDDEN[b.industry]) add('B6', 'fail', 'This kind of business can’t register', `Carriers don’t allow ${FORBIDDEN[b.industry][0].toLowerCase()} content on standard business texting (Twilio ${FORBIDDEN[b.industry][1]}). Resubmitting won’t change that, so we’ve stopped here rather than take you through the rest.`, [FORBIDDEN[b.industry][1]]);
  if (b.entity === 'sole' && (b.hasEin === 'yes' || /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|ltd|pllc|llp)\b\.?/i.test(b.legalName || '')))
    add('B1', 'fail', 'You probably aren’t a sole proprietor', b.hasEin === 'yes' ? 'You have an EIN, so register as a Standard (or Low-Volume Standard) brand. Sole Proprietor registration is only for people without an EIN.' : 'Your legal name ends in LLC, Inc. or similar, which is a registered business. Choose “Registered business”.', ['30903', '30915']);
  if (b.entity === 'registered') {
    add('B2', 'warn', 'Use your legal name exactly as the IRS has it', 'Copy it letter for letter from your IRS CP 575 or 147C letter, including LLC or Inc. Not from a W-9 or your website.', ['30918', '30894']);
    if (FREE_MAIL.test(b.email || '')) add('B3', 'warn', 'Use an email address on your own domain', 'Reviewers can reject Gmail, Yahoo and similar addresses for registered businesses. Use one like you@yourbusiness.com, ideally matching your website.', ['30881']);
    add('B7', 'advice', 'New EIN?', 'If your EIN is only a few weeks old, the registry may not find it yet. Twilio says new EINs can take 30-90 days to show up everywhere; HighLevel lists EINs under 15 days old as a common rejection.', []);
  }
  if (b.entity === 'sole') {
    if (b.email && !FREE_MAIL.test(b.email)) add('B4', 'warn', 'HighLevel wants a public email for sole proprietors', 'HighLevel says business-domain emails aren’t eligible for Sole Proprietor brands. Use a personal address such as Gmail or Outlook there.', []);
    add('B5', 'advice', 'Use a real mobile number', 'Sole Proprietor registration texts a one-time code to your mobile. It must be a US or Canadian mobile number; internet (VoIP) numbers don’t work.', []);
  }
  return r;
}

// Use-case suggestion (advice; RULES.md section G).
export function useCase(b) {
  const s = b.sends || {};
  const info = s.reminders || s.updates || s.quotes;
  if (b.entity === 'sole') return { name: 'Sole Proprietor', why: 'Sole proprietors without an EIN use the Sole Proprietor campaign type.' };
  if (s.marketing && info) return { name: 'Mixed (or Low Volume Mixed)', why: 'You send offers as well as reminders or updates. HighLevel’s Mixed use case covers “promotional offers plus account or appointment notifications”. Low Volume Mixed costs less if you send fewer messages.' };
  if (s.marketing) return { name: 'Marketing', why: 'You only send offers and promotions.' };
  return { name: 'Customer Care', why: 'Reminders, job updates and quote follow-ups answer something the customer asked for. HighLevel’s Customer Care examples include service request confirmations.' };
}

// ---------- pasted pages (the static site has no crawler) ----------
// slots: [{ role: 'home'|'privacy'|'terms'|'optin', url, text }], home first. Text can be page source (best) or the
// page's visible text. What a paste can't show (does it load, https, redirects; links and forms in plain text) is
// handed back as a check by hand, never passed or failed on a guess.
export const looksHtml = (s) => /<(html|head|body|div|p|a|form|main|section|span|h[1-6]|input)\b/i.test(String(s || ''));
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textToHtml = (s) => '<body><main>' + String(s).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => `<p>${escHtml(l)}</p>`).join('') + '</main></body>';
export function checkPasted(slots, business = {}) {
  const given = slots.filter((s) => s.text && s.text.trim());
  const pages = given.map((s) => ({ url: s.url, finalUrl: s.url, status: 200, contentType: 'text/html', html: looksHtml(s.text) ? s.text : textToHtml(s.text), roles: [s.role], linkText: '' }));
  const homeText = given[0] && !looksHtml(given[0].text);
  const anyText = given.some((s) => !looksHtml(s.text));
  const report = checkSite({ ok: true, startUrl: pages[0]?.url, finalUrl: pages[0]?.url, sameSite: true, notes: [], pages }, business);
  const by = Object.fromEntries(report.results.map((r) => [r.id, r]));
  const hand = (id, note) => { if (by[id]) Object.assign(by[id], { status: 'manual', evidence: [], note }); };
  if (by.W1?.status === 'pass') hand('W1', 'You pasted this page, so we can’t see how it loads for a reviewer. Open your address in a private window: it should load with no login.');
  if (by.W2?.status === 'pass') hand('W2', 'Check that your address starts with https:// and shows a padlock in the address bar.');
  hand('W4', 'Check that your address doesn’t forward to a different domain when you open it.');
  if (homeText) for (const id of ['W6', 'W7', 'W12']) if (by[id] && by[id].status !== 'skip') hand(id, 'Plain text has no links, so we couldn’t check this. Paste the page source to check it, or look at your home page’s links yourself.');
  if (anyText && by.F1 && by.F1.status !== 'pass' && by.F1.status !== 'manual') {
    hand('F1', 'Plain text has no forms or tick boxes, so we couldn’t check your opt-in form. Paste the page source of the page with your form to check it.');
    for (const id of ['F2', 'F3', 'F4', 'F5', 'F6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']) hand(id, HAND.optin);
  }
  const said = { P1: ['privacy', 'You said you don’t have a privacy policy yet.'], T1: ['terms', 'You said you don’t have SMS terms yet.'] };
  for (const [id, [role, snip]] of Object.entries(said)) if (by[id]?.status === 'fail' && !given.some((s) => s.role === role) && !by[id].note) by[id].evidence = [{ url: '', snippet: snip }];
  for (const k of Object.keys(report.counts)) report.counts[k] = report.results.filter((r) => r.status === k).length;
  report.pasted = given.map((s) => ({ url: s.url, role: s.role, kind: looksHtml(s.text) ? 'source' : 'text' }));
  return report;
}
