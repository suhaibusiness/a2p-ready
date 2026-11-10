import { RULES, GROUPS, HAND, checkSite, checkPasted, checkBusiness, useCase, checkAnswers, LIMITS, FORBIDDEN } from './rules.js';
import * as T from './templates.js';
import { makeZip } from './zip.js';
import { explain } from './codes.js';
import { TWILIO_CODES } from './codes-data.js';
import { normaliseInput } from '../lib/crawl.mjs';
import { BLANK, clone, merge, webUrl } from './state.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = T.esc;
// Page text that already has quote marks shows as-is, so it never reads ""Facebook" links.
const quote = (s) => (/["“”]/.test(s) ? `<span class="q">${esc(s)}</span>` : `<q>${esc(s)}</q>`);
const CODE = new Map(TWILIO_CODES.map((c) => [c.code, c]));
// The crawler address comes from <meta name="a2p-crawler">. server.mjs serves it; the static build has none, so the
// check takes pasted pages instead.
const CRAWLER = document.querySelector('meta[name="a2p-crawler"]')?.content || '';

// ---------- state ----------
let S = (() => { try { return merge(JSON.parse(localStorage.getItem('a2p-state') || 'null')); } catch { return clone(BLANK); } })();
function save() { try { localStorage.setItem('a2p-state', JSON.stringify(S)); } catch {} }

// ---------- small helpers ----------
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600); }
async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
  }
  toast(what);
}
function download(name, data, type = 'text/html;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// Re-render a container after the current event finishes, on a fresh element, so listeners never stack up and a
// blur-triggered change can't remove the node it's running in.
const redraw = (el, fn) => setTimeout(() => { if (!el.isConnected) return; const f = el.cloneNode(false); el.replaceWith(f); fn(f); });
const slug = (s) => String(s || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
const ICON = {
  pass: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  fail: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  warn: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v9M12 19v.5"/></svg>',
  advice: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 11v7M12 6v.5"/></svg>',
  manual: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>',
  skip: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
};
const LABEL = { pass: 'Passed', fail: 'Fix', warn: 'Check', advice: 'Tip', manual: 'Check by hand', skip: 'Not checked' };
const badge = (st) => `<span class="st ${st}">${ICON[st] || ''}${LABEL[st] || st}</span>`;
const codeChip = (c) => { const k = CODE.get(c); return `<a class="chip" href="${esc(k ? k.url : `https://www.twilio.com/docs/api/errors/${c}`)}" target="_blank" rel="noopener" title="${esc(k ? k.title : 'Twilio error ' + c)}">Twilio ${esc(c)}</a>`; };

// ---------- business details ----------
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const PROVINCES = 'AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' ');
const INDUSTRIES = [['plumbing', 'Plumbing'], ['hvac', 'Heating and air conditioning'], ['electrical', 'Electrical'], ['roofing', 'Roofing'], ['cleaning', 'Cleaning'],
  ['landscaping', 'Lawn and landscaping'], ['pest', 'Pest control'], ['pool', 'Pool service'], ['painting', 'Painting'], ['handyman', 'Handyman'], ['moving', 'Moving'],
  ['auto', 'Auto repair'], ['salon', 'Salon and beauty'], ['health', 'Health care'], ['fitness', 'Fitness'], ['realestate', 'Real estate'], ['restaurant', 'Restaurant'],
  ['retail', 'Retail'], ['professional', 'Professional services'], ['other', 'Something else']];
const SENDS = [['reminders', 'Appointment reminders', 'The day before, or on the day'], ['updates', 'Job and arrival updates', '“On the way”, “job done”'],
  ['quotes', 'Quote follow-ups', 'Checking they got your quote'], ['replies', 'Replies to questions', 'Two-way chat with customers'],
  ['marketing', 'Offers and promotions', 'Discounts, seasonal deals']];
const digits = (s) => String(s || '').replace(/\D/g, '');
function tenDigits(s) { let d = digits(s); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; }
const fmtPhone = (s) => { const d = tenDigits(s); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : s; };
const forbidden = (b) => !!FORBIDDEN[b.industry];

function validate(b) {
  const e = {};
  if (!b.legalName.trim()) e.legalName = 'Enter your legal business name. For a sole proprietor, that’s usually your own name.';
  if (!b.entity) e.entity = 'Choose how your business is set up.';
  if (b.entity === 'sole' && !b.hasEin) e.hasEin = 'Tell us whether you have an EIN.';
  if (!b.street.trim()) e.street = 'Enter your street address.';
  else if (/\bp\.?\s*o\.?\s*box\b|\bpost office box\b/i.test(b.street)) e.street = 'Carriers need a street address, not a P.O. box.';
  if (!b.city.trim()) e.city = 'Enter your city.';
  const list = b.country === 'CA' ? PROVINCES : STATES;
  if (!list.includes(b.state.trim().toUpperCase())) e.state = b.country === 'CA' ? 'Use the 2-letter province code, like ON.' : 'Use the 2-letter state code, like TX.';
  const zipOk = b.country === 'CA' ? /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(b.zip.trim()) : /^\d{5}(-\d{4})?$/.test(b.zip.trim());
  if (!zipOk) e.zip = b.country === 'CA' ? 'Use a postal code like K1A 0B1.' : 'Use a 5-digit ZIP code, like 78701.';
  const ph = tenDigits(b.phone);
  if (!ph) e.phone = 'Enter the phone number customers call you on.';
  else if (ph.length !== 10 || /^[01]/.test(ph)) e.phone = 'Use a 10-digit US or Canadian number, like (512) 555-0134.';
  if (!b.email.trim()) e.email = 'Enter the email address customers can reach you on.';
  else if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b.email.trim())) e.email = 'That doesn’t look like an email address.';
  if (!b.noWebsite) { try { normaliseInput(b.website); } catch (err) { e.website = b.website.trim() ? err.message : 'Enter your website, or tick “I don’t have a website yet”.'; } }
  if (!b.industry) e.industry = 'Choose the closest match.';
  if (!Object.values(b.sends).some(Boolean)) e.sends = 'Choose at least one kind of text you send.';
  if (b.sends.marketing) { const n = Number(b.marketingPerMonth); if (!Number.isInteger(n) || n < 1 || n > 60) e.marketingPerMonth = 'Enter a whole number from 1 to 60.'; }
  return e;
}
const businessReady = () => !Object.keys(validate(S.business)).length && !forbidden(S.business);

function fieldHtml(name, label, control, hint = '', optional = false) {
  return `<div class="field" data-f="${name}"><label for="f-${name}">${label}${optional ? ' <span class="opt">(optional)</span>' : ''}</label>${control}${hint ? `<p class="hint" id="h-${name}">${hint}</p>` : ''}<p class="err hidden" id="e-${name}"></p></div>`;
}
const input = (name, type = 'text', attrs = '') => `<input type="${type}" id="f-${name}" name="${name}" value="${esc(S.business[name])}" aria-describedby="h-${name} e-${name}" ${attrs}>`;

function renderBusiness(panel) {
  const b = S.business;
  panel.innerHTML = `
  <div class="panel-head"><div><h1>Your business</h1><p>Carriers compare these details with your website and your tax records, so they need to match exactly. It takes about 3 minutes.</p></div></div>
  <div class="form-grid">
  <form id="biz" novalidate>
    <div class="card">
      <h2>Who you are</h2>
      ${fieldHtml('legalName', 'Legal business name', input('legalName', 'text', 'autocomplete="organization"'), 'Exactly as on your IRS letter (CP 575 or 147C), including LLC or Inc. Sole proprietors: your own full name.')}
      ${fieldHtml('dba', 'Name customers know you by', input('dba'), 'Your “doing business as” name, if it’s different. This is the name we put in your texts.', true)}
      <fieldset class="field" data-f="entity" aria-describedby="e-entity"><legend>How is your business set up?</legend>
        <div class="choice-grid">
          <label class="choice"><input type="radio" name="entity" value="registered" ${b.entity === 'registered' ? 'checked' : ''}><div><b>Registered business</b><span>LLC, corporation, partnership, or anyone with an EIN</span></div></label>
          <label class="choice"><input type="radio" name="entity" value="sole" ${b.entity === 'sole' ? 'checked' : ''}><div><b>Sole proprietor</b><span>Just you, trading under your own name, with no EIN</span></div></label>
        </div><p class="err hidden" id="e-entity"></p></fieldset>
      <fieldset class="field ${b.entity === 'sole' ? '' : 'hidden'}" data-f="hasEin" id="ein-q" aria-describedby="e-hasEin"><legend>Do you have an EIN (Employer Identification Number)?</legend>
        <div class="row" style="gap:20px">
          <label class="radio"><input type="radio" name="hasEin" value="no" ${b.hasEin === 'no' ? 'checked' : ''}>No</label>
          <label class="radio"><input type="radio" name="hasEin" value="yes" ${b.hasEin === 'yes' ? 'checked' : ''}>Yes</label>
        </div><p class="err hidden" id="e-hasEin"></p></fieldset>
    </div>
    <div class="card">
      <h2>Where to reach you</h2>
      ${fieldHtml('street', 'Street address', input('street', 'text', 'autocomplete="street-address"'), 'Where the business is based. Not a P.O. box.')}
      <div class="row">
        <div class="w2">${fieldHtml('city', 'City', input('city', 'text', 'autocomplete="address-level2"'))}</div>
        <div>${fieldHtml('state', b.country === 'CA' ? 'Province' : 'State', input('state', 'text', 'autocomplete="address-level1" maxlength="2" style="text-transform:uppercase"'))}</div>
        <div>${fieldHtml('zip', b.country === 'CA' ? 'Postal code' : 'ZIP', input('zip', 'text', 'autocomplete="postal-code" inputmode="text"'))}</div>
      </div>
      ${fieldHtml('country', 'Country', `<select id="f-country" name="country"><option value="US" ${b.country === 'US' ? 'selected' : ''}>United States</option><option value="CA" ${b.country === 'CA' ? 'selected' : ''}>Canada</option></select>`)}
      <div class="row">
        <div>${fieldHtml('phone', 'Business phone', input('phone', 'tel', 'autocomplete="tel" inputmode="tel"'), 'The number customers call. It goes in your help message.')}</div>
        <div>${fieldHtml('email', 'Support email', input('email', 'email', 'autocomplete="email" spellcheck="false"'), 'Where customers can reach you.')}</div>
      </div>
    </div>
    <div class="card">
      <h2>Your website</h2>
      ${fieldHtml('website', 'Website address', input('website', 'url', `inputmode="url" spellcheck="false" placeholder="yourbusiness.com" ${b.noWebsite ? 'disabled' : ''}`), 'The site you’ll give carriers. We’ll check it in the next step.')}
      <label class="check"><input type="checkbox" id="f-noWebsite" ${b.noWebsite ? 'checked' : ''}><span>I don’t have a website yet<span class="sub">We’ll build a small 3-page website (home page, privacy policy and SMS terms) for you in step 3.</span></span></label>
    </div>
    <div class="card">
      <h2>What you do</h2>
      ${fieldHtml('industry', 'Industry', `<select id="f-industry" name="industry" aria-describedby="e-industry"><option value="">Choose one</option>
        <optgroup label="Common">${INDUSTRIES.map(([v, l]) => `<option value="${v}" ${b.industry === v ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>
        <optgroup label="Not allowed on business texting">${Object.entries(FORBIDDEN).map(([v, [l]]) => `<option value="${v}" ${b.industry === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup></select>`)}
      ${fieldHtml('services', 'What you do, in a sentence or two', `<textarea id="f-services" name="services" rows="2" aria-describedby="h-services e-services">${esc(b.services)}</textarea>`, 'Goes on the website we build, if you need one. For example: “Residential plumbing repairs, drain cleaning and water heater installs.”', true)}
      ${fieldHtml('area', 'Where you work', input('area'), 'For example: “Austin and Round Rock, Texas”.', true)}
    </div>
    <div class="card">
      <h2>What you text customers</h2>
      <fieldset class="field" data-f="sends" aria-describedby="e-sends"><legend>Tick everything you send, or plan to</legend>
        <div class="choice-grid">${SENDS.map(([k, l, s]) => `<label class="choice"><input type="checkbox" name="sends" value="${k}" ${b.sends[k] ? 'checked' : ''}><div><b>${l}</b><span>${s}</span></div></label>`).join('')}</div>
        <p class="err hidden" id="e-sends"></p></fieldset>
      <div class="${b.sends.marketing ? '' : 'hidden'}" id="mkt-freq">${fieldHtml('marketingPerMonth', 'Most marketing texts you’ll send one person in a month', input('marketingPerMonth', 'number', 'min="1" max="60" step="1" inputmode="numeric" style="max-width:120px"'), 'Your opt-in wording and terms state this number, so pick one you’ll stick to.')}</div>
    </div>
    <div class="panel-foot"><span></span><button class="btn primary lg" type="submit" id="biz-next">Continue to the website check</button></div>
  </form>
  <aside class="sticky"><div class="card" id="biz-side" aria-live="polite"></div></aside>
  </div>`;

  const form = $('#biz', panel);
  const touched = new Set();
  const showErrors = () => {
    const e = validate(S.business);
    for (const el of $$('[data-f]', form)) {
      const k = el.dataset.f, msg = touched.has(k) ? e[k] : '';
      const box = $(`#e-${k}`, el.closest('.field') || el); if (!box) continue;
      box.textContent = msg || ''; box.classList.toggle('hidden', !msg);
      const ctl = $(`#f-${k}`, form); if (ctl) ctl.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    return e;
  };
  const side = () => {
    const bb = S.business, items = checkBusiness(bb), uc = useCase(bb);
    $('#biz-side').innerHTML = `<h2>Before you register</h2>
      ${forbidden(bb) ? '' : bb.entity ? `<p class="small muted" style="margin-bottom:4px">Suggested campaign type</p><p style="margin-bottom:4px"><b>${esc(uc.name)}</b></p><p class="small muted">${esc(uc.why)}</p>` : '<p class="small muted">Fill in the form and we’ll point out anything that commonly gets businesses like yours rejected.</p>'}
      ${items.length ? `<ul class="biz-list">${items.map((i) => `<li>${badge(i.status)} <b>${esc(i.title)}</b><p>${esc(i.detail)}</p>${i.codes.length ? `<div class="result-foot">${i.codes.map(codeChip).join('')}</div>` : ''}</li>`).join('')}</ul>` : ''}`;
    $('#biz-next').disabled = forbidden(bb);
  };
  form.addEventListener('input', (ev) => {
    const t = ev.target, b2 = S.business;
    if (t.name === 'sends') { b2.sends[t.value] = t.checked; touched.add('sends'); $('#mkt-freq').classList.toggle('hidden', !b2.sends.marketing); }
    else if (t.id === 'f-noWebsite') { b2.noWebsite = t.checked; $('#f-website').disabled = t.checked; touched.add('website'); }
    else if (t.name === 'entity') { b2.entity = t.value; $('#ein-q').classList.toggle('hidden', t.value !== 'sole'); touched.add('entity'); }
    else if (t.name === 'hasEin') { b2.hasEin = t.value; touched.add('hasEin'); }
    else if (t.name === 'country') { b2.country = t.value; $('label[for=f-state]').textContent = t.value === 'CA' ? 'Province' : 'State'; $('label[for=f-zip]').textContent = t.value === 'CA' ? 'Postal code' : 'ZIP'; }
    else if (t.name && t.name in b2) b2[t.name] = t.name === 'marketingPerMonth' ? t.value : t.value;
    save(); side(); showErrors();
  });
  form.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!t.name) return;
    if (t.name === 'phone' && tenDigits(t.value).length === 10) { t.value = fmtPhone(t.value); S.business.phone = t.value; }
    if (t.name === 'state') { t.value = t.value.trim().toUpperCase(); S.business.state = t.value; }
    if (t.name === 'website' && t.value.trim()) S.business.website = t.value.trim();
    if (t.value !== '' || t.type === 'radio' || t.type === 'checkbox') touched.add(t.name === 'noWebsite' ? 'website' : t.name);
    save(); showErrors();
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    Object.keys(validate(BLANK.business)).concat(['hasEin', 'marketingPerMonth', 'website', 'zip', 'state']).forEach((k) => touched.add(k));
    const e = showErrors();
    if (Object.keys(e).length) {
      const first = $$('[data-f]', form).find((el) => e[el.dataset.f]);
      const ctl = first && ($(`#f-${first.dataset.f}`, form) || $('input', first));
      if (ctl) { ctl.focus(); ctl.scrollIntoView({ block: 'center' }); }
      toast(`${Object.keys(e).length === 1 ? 'One thing needs' : Object.keys(e).length + ' things need'} fixing before you continue.`);
      return;
    }
    if (!S.business.noWebsite && S.check?.url !== normaliseInput(S.business.website).url) S.pendingCheck = true;
    save(); location.hash = '#/app/check';
  });
  side();
  if (S.business.legalName || S.business.email) { ['legalName', 'entity', 'email', 'phone', 'website', 'industry', 'sends'].forEach((k) => S.business[k] !== '' && touched.add(k)); showErrors(); }
}

// ---------- website check ----------
function renderCheck(panel) {
  const b = S.business;
  if (b.noWebsite) {
    panel.innerHTML = `<div class="panel-head"><div><h1>Website check</h1><p>Carriers look at your website before they approve your texting.</p></div></div>
      <div class="card"><h2>You don’t have a website yet</h2>
      <p>That’s fine. Carriers do need one, so step 3 builds a small 3-page website (home page, privacy policy and SMS terms), with your contact details and a compliant opt-in form on the home page. You can host it anywhere, or paste it into a HighLevel funnel.</p>
      <div class="actions"><a class="btn primary" href="#/app/build/site">Build my website</a><button class="btn" id="have-site">I do have a website</button></div></div>`;
    $('#have-site').onclick = () => { S.business.noWebsite = false; save(); location.hash = '#/app/business'; setTimeout(() => $('#f-website')?.focus(), 50); };
    return;
  }
  if (!CRAWLER) { if (S.pendingCheck) { S.pendingCheck = false; save(); } return renderPaste(panel); }
  panel.innerHTML = `<div class="panel-head"><div><h1>Website check</h1><p>We read up to 10 public pages of your site, the way a carrier reviewer would, and test each rule that commonly leads to a rejection.</p></div></div>
    <div class="card">
      <form class="check-form" id="check-form" novalidate>
        <label for="check-url" class="sr-only">Website address</label>
        <input type="url" id="check-url" inputmode="url" spellcheck="false" value="${esc(b.website)}" placeholder="yourbusiness.com">
        <button class="btn primary" type="submit" id="check-go">${S.check ? 'Check again' : 'Check my website'}</button>
      </form>
      <p class="hint">We follow your site’s robots.txt, identify ourselves as <code>A2PKitChecker</code>, and only read public pages. It usually takes 10 to 30 seconds.</p>
      <div id="check-status" aria-live="polite"></div>
    </div>
    <div id="check-results"></div>`;
  $('#check-form').addEventListener('submit', (ev) => { ev.preventDefault(); runCheck($('#check-url').value); });
  if (S.pendingCheck) { S.pendingCheck = false; save(); runCheck(b.website); }
  else if (S.check) drawResults();
}

let checking = false;
async function runCheck(raw) {
  if (checking) return;
  const status = $('#check-status'), out = $('#check-results');
  let url;
  try { url = normaliseInput(raw).url; } catch (e) { status.innerHTML = `<p class="err" role="alert">${esc(e.message)}</p>`; $('#check-url').focus(); return; }
  S.business.website = String(raw).trim(); save();
  checking = true; $('#check-go').disabled = true;
  status.innerHTML = `<div class="loading"><span class="spin" aria-hidden="true"></span><span>Reading your pages… This can take up to 30 seconds.</span></div>`;
  out.innerHTML = '';
  let data;
  try {
    const res = await fetch(CRAWLER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: raw }) });
    data = await res.json().catch(() => ({ ok: false, message: `The checker answered with error ${res.status}.` }));
  } catch {
    data = { ok: false, reason: 'offline', message: 'We couldn’t reach the checker. If you’re running the kit on your own computer, start it with “node server.mjs” and reload this page.' };
  }
  checking = false; $('#check-go').disabled = false;
  if (!data.ok) {
    const robots = data.reason === 'robots';
    status.innerHTML = `<div class="note ${robots ? 'warn' : 'fail'}" role="alert" style="margin:16px 0 0"><p><b>${robots ? 'Your site asks tools like ours not to read it.' : 'We couldn’t check that site.'}</b> ${esc(robots ? 'So we didn’t. You can still check it by hand with the list below and build every page in step 3.' : data.message || 'Please try again.')}</p></div>
      ${robots ? `<div class="card" style="margin-top:16px"><h2>Check it by hand</h2>${Object.entries(HAND).map(([g, t]) => `<h3>${esc(GROUPS[g])}</h3><p class="muted">${esc(t)}</p>`).join('')}</div>` : ''}`;
    return;
  }
  const report = checkSite(data, S.business);
  S.check = { url, report };
  save();
  status.innerHTML = '';
  $('#check-go').textContent = 'Check again';
  drawResults();
  renderStepper('check');
  $('#check-results').focus?.();
}

function resultCard(r) {
  const ev = (r.evidence || []).map((e) => `<p class="ev">${webUrl(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(shortUrl(e.url))}</a>` : ''}${e.snippet ? `${e.url ? ': ' : ''}${quote(e.snippet)}` : ''}</p>`).join('');
  const bad = ['fail', 'warn', 'advice', 'manual'].includes(r.status);
  const build = r.build && bad ? `<a class="btn sm" href="#/app/build/${r.build}">${{ site: 'Build a site', privacy: 'Build a privacy policy', terms: 'Build SMS terms', optin: 'Build an opt-in form' }[r.build]}</a>` : '';
  return `<article class="result ${r.status}">
    <div class="result-head"><h3>${esc(r.title)}</h3>${badge(r.status)}</div>
    ${ev}${r.note ? `<p class="ev">${esc(r.note)}</p>` : ''}
    ${bad && r.fix ? `<p class="fix"><b>${r.status === 'advice' ? 'Tip:' : r.status === 'manual' ? 'What to look for:' : 'How to fix:'}</b> ${esc(r.status === 'manual' && !r.fix ? HAND[r.group] : r.fix)}</p>` : ''}
    ${build || r.codes.length ? `<div class="result-foot">${build}${r.codes.map(codeChip).join('')}</div>` : ''}
  </article>`;
}
const shortUrl = (u) => { try { const x = new URL(u); return x.host + (x.pathname === '/' ? '' : x.pathname); } catch { return u; } };
const ORDER = { fail: 0, warn: 1, manual: 2, advice: 3, pass: 4, skip: 5 };

function drawResults() {
  const out = $('#check-results'); if (!out || !S.check) return;
  const { report, url } = S.check;
  const c = report.counts;
  const head = c.fail ? `${c.fail} thing${c.fail === 1 ? '' : 's'} on your site would likely get your registration rejected.` : c.manual ? 'We couldn’t read everything, so a few things need a check by hand.' : 'Nothing on your site would obviously get you rejected.';
  out.tabIndex = -1;
  out.innerHTML = `
    <div class="stats">
      <div class="stat fail"><div class="k">To fix</div><div class="v">${c.fail}</div></div>
      <div class="stat warn"><div class="k">To check</div><div class="v">${c.warn + c.advice}</div></div>
      <div class="stat manual"><div class="k">Check by hand</div><div class="v">${c.manual}</div></div>
      <div class="stat pass"><div class="k">Passed</div><div class="v">${c.pass}</div></div>
    </div>
    <div class="note ${c.fail ? 'fail' : c.manual ? 'warn' : 'pass'}"><p><b>${esc(head)}</b> ${c.fail ? 'Each one is explained below with what we found and how to fix it. Step 3 builds the missing pages for you.' : ''}</p></div>
    ${!S.business.legalName && !S.business.dba ? '<div class="note warn"><p>Add your business name in <a href="#/app/business">step 1</a> and check again, so we can confirm it appears on your site and in your terms.</p></div>' : ''}
    <p class="small muted">Checked ${esc(shortUrl(report.finalUrl || url))} on ${new Date(report.checkedAt).toLocaleString()}. <details style="display:inline"><summary style="display:inline;cursor:pointer">${report.pasted ? 'Pages you pasted' : 'Pages we read'} (${report.pages.length})</summary><ul class="pages">${report.pages.map((p) => `<li>${esc(p.url)}${p.status && p.status !== 200 ? ` (error ${p.status})` : ''}</li>`).join('')}</ul></details></p>
    ${Object.entries(GROUPS).map(([g, name]) => {
      const rs = report.results.filter((r) => r.group === g && r.id !== 'W13').sort((a, b) => ORDER[a.status] - ORDER[b.status]);
      const open = rs.filter((r) => !['pass', 'skip'].includes(r.status)), passed = rs.filter((r) => r.status === 'pass'), skipped = rs.filter((r) => r.status === 'skip');
      return `<section class="group" aria-labelledby="g-${g}"><div class="group-head"><h2 id="g-${g}">${esc(name)}</h2><span class="small muted">${open.length ? `${open.length} to look at · ` : ''}${passed.length} passed</span></div>
        ${open.map(resultCard).join('')}
        ${passed.length ? `<details class="passed"><summary>${passed.length} passed</summary><ul class="passed-list">${passed.map((r) => `<li>${badge('pass')} ${esc(r.title)}</li>`).join('')}</ul></details>` : ''}
        ${skipped.length ? `<details class="passed"><summary>${skipped.length} not checked</summary><ul class="passed-list">${skipped.map((r) => `<li>${badge('skip')} <span>${esc(r.title)}<br><span class="small muted">${esc(r.note)}</span></span></li>`).join('')}</ul></details>` : ''}
      </section>`;
    }).join('')}
    <div class="panel-foot"><a class="btn" href="#/app/business">Back</a><a class="btn primary lg" href="#/app/build">${c.fail || c.manual ? 'Build what’s missing' : 'Continue'}</a></div>`;
}

// ---------- pasted pages (static site, no crawler) ----------
const SLOTS = [
  ['home', 'Home page', 'yourbusiness.com'],
  ['privacy', 'Privacy policy', 'yourbusiness.com/privacy'],
  ['terms', 'SMS terms (or your terms of service)', 'yourbusiness.com/terms'],
  ['optin', 'Page with your sign-up or contact form', 'yourbusiness.com/contact'],
];
function renderPaste(panel) {
  const b = S.business;
  panel.innerHTML = `<div class="panel-head"><div><h1>Website check</h1><p>Paste your website’s pages and we’ll test each rule that commonly gets a registration rejected, the way a carrier reviewer would.</p></div></div>
    <div class="card">
      <h2>How to copy a page</h2>
      <ol class="small paste-how">
        <li>Open the page in Chrome, Edge or Firefox.</li>
        <li>Best: press <kbd>Ctrl</kbd>+<kbd>U</kbd> (Mac: <kbd>Option</kbd>+<kbd>Cmd</kbd>+<kbd>U</kbd>) to see the page source, then select all and copy it. Or select all the text on the page itself and copy that.</li>
        <li>Paste it in the box for that page. Pages are checked in this browser and never uploaded or saved; only the results are kept.</li>
      </ol>
      <p class="hint">Page source lets us check your links, forms and tick boxes. With plain text, those become checks by hand.</p>
      <form id="paste-form" class="paste-form" novalidate>
        ${SLOTS.map(([k, name, ph], i) => `<fieldset class="paste-slot" id="slot-${k}"><legend>${esc(name)}${i ? ' <span class="opt">(optional)</span>' : ''}</legend>
          <div class="field"><label for="p-url-${k}">Page address</label><input type="url" id="p-url-${k}" inputmode="url" spellcheck="false" placeholder="${ph}" value="${i ? '' : esc(b.website)}"></div>
          <div class="field"><label for="p-text-${k}">Page source or text</label><textarea id="p-text-${k}" rows="${i ? 4 : 6}" spellcheck="false"></textarea></div>
          ${k === 'privacy' || k === 'terms' ? `<label class="check"><input type="checkbox" id="p-none-${k}"><span>I don’t have this page yet</span></label>` : ''}
          ${k === 'optin' ? '<p class="hint">Skip this if your form is on one of the pages above.</p>' : ''}
          <p class="err hidden" id="p-err-${k}" role="alert"></p>
        </fieldset>`).join('')}
        <button class="btn primary lg" type="submit" id="check-go">${S.check ? 'Check again' : 'Check these pages'}</button>
      </form>
      <div id="check-status" aria-live="polite"></div>
    </div>
    <div id="check-results"></div>`;
  $('#paste-form').addEventListener('submit', (ev) => { ev.preventDefault(); runPaste(); });
  if (S.check) drawResults();
}
function runPaste() {
  const slots = [], status = $('#check-status');
  let bad = null;
  for (const [k, name] of SLOTS) {
    const urlEl = $(`#p-url-${k}`), textEl = $(`#p-text-${k}`), err = $(`#p-err-${k}`), none = $(`#p-none-${k}`);
    const text = textEl.value, raw = urlEl.value.trim();
    let msg = '';
    if (k === 'home' && !text.trim()) msg = 'Paste your home page first.';
    else if ((k === 'privacy' || k === 'terms') && !text.trim() && !none.checked) msg = `Paste your ${name.toLowerCase()}, or tick “I don’t have this page yet”.`;
    let url = '';
    if (!msg && text.trim()) {
      if (!raw) msg = 'Add this page’s address, so results and your registration answers can point to it.';
      else { try { url = normaliseInput(raw).url; } catch (e) { msg = e.message; } }
    }
    err.textContent = msg; err.classList.toggle('hidden', !msg);
    urlEl.setAttribute('aria-invalid', msg && text.trim() ? 'true' : 'false');
    if (msg && !bad) bad = text.trim() ? urlEl : textEl;
    if (!msg && text.trim()) slots.push({ role: k, url, text });
  }
  if (bad) { bad.focus(); return; }
  S.business.website = $('#p-url-home').value.trim(); save();
  const report = checkPasted(slots, S.business);
  S.check = { url: slots[0].url, report };
  save();
  status.innerHTML = '';
  $('#check-go').textContent = 'Check again';
  drawResults();
  renderStepper('check');
  $('#check-results').focus?.();
}

// ---------- builder ----------
const TABS = [['site', 'Website'], ['privacy', 'Privacy policy'], ['terms', 'SMS terms'], ['optin', 'Opt-in form']];
function needs() {
  const n = { site: !!S.business.noWebsite, privacy: false, terms: false, optin: false };
  const rs = S.check?.report?.results || [];
  for (const r of rs) if (r.build && ['fail', 'manual'].includes(r.status)) n[r.build] = true;
  if (rs.find((r) => r.id === 'W1' && r.status === 'fail')) n.site = true;
  if (S.business.noWebsite) n.privacy = n.terms = n.optin = true;
  return n;
}
const usingSite = () => S.business.noWebsite || needs().site;
function urls() {
  const found = usingSite() ? {} : (S.check?.report?.found || {});
  const auto = T.pageUrls(S.business, { siteUrl: S.build.siteUrl, useBuiltSite: usingSite() }, found);
  return { home: auto.home, privacy: S.urls.privacy || auto.privacy, terms: S.urls.terms || auto.terms, optin: S.urls.optin || auto.optin, auto };
}
function pageFor(tab) {
  const b = S.business, u = urls();
  const o = { mode: S.build.mode, actionUrl: S.build.actionUrl, privacyUrl: u.privacy, termsUrl: u.terms };
  if (tab === 'site') return { name: 'index.html', html: T.sitePages(b, o)['index.html'] };
  if (tab === 'privacy') return S.build.privacyKind === 'section' ? { name: 'privacy-sms-section.html', html: T.privacySmsSection(b), snippet: true } : { name: 'privacy.html', html: T.privacyPage(b, usingSite() ? { site: true } : o) };
  if (tab === 'terms') return { name: 'sms-terms.html', html: T.termsPage(b, usingSite() ? { site: true } : o) };
  return { name: 'opt-in-form.html', html: T.optinForm(b, o), snippet: true };
}
function allFiles() {
  const b = S.business, u = urls(), o = { mode: S.build.mode, actionUrl: S.build.actionUrl, privacyUrl: u.privacy, termsUrl: u.terms };
  const files = usingSite() ? T.sitePages(b, o) : { 'privacy.html': T.privacyPage(b, o), 'sms-terms.html': T.termsPage(b, o), 'opt-in-form.html': T.optinForm(b, o), 'privacy-sms-section.html': T.privacySmsSection(b) };
  files['READ-ME.txt'] = readme(files, u);
  return files;
}
function readme(files, u) {
  const lines = [`Pages for ${T.brand(S.business)}, made with A2P Ready on ${new Date().toLocaleDateString()}.`, '',
    'These come from a template filled with your details. They are not legal advice: read them, make sure they match what you really do, and ask a lawyer if you are unsure.', ''];
  if (usingSite()) lines.push('Upload index.html, privacy.html and sms-terms.html to the same folder on your web host (or paste each into its own HighLevel funnel step).', `They should end up at:\n  ${u.home || '(your site address)/'}\n  ${u.privacy || '(your site)/privacy.html'}\n  ${u.terms || '(your site)/sms-terms.html'}`);
  else lines.push('privacy.html and sms-terms.html are complete pages. Upload them to your site, or copy their text into your own pages.',
    'privacy-sms-section.html is just the text-message section, if you would rather add it to the privacy policy you already have.',
    'opt-in-form.html is the form to paste into your contact page. Its text-message boxes start unticked and are optional.');
  lines.push('', 'Open every page in a private browser window before you submit, to make sure it loads without a login.', '', 'Approval is up to the carriers; this gets you ready, it doesn’t guarantee it.');
  return lines.join('\n');
}

function renderBuild(panel, tab) {
  const n = needs();
  if (!tab || !TABS.some(([k]) => k === tab)) tab = S.build.tab && (S.build.tab !== 'site' || usingSite()) ? S.build.tab : (TABS.find(([k]) => n[k]) || TABS[1])[0];
  if (tab === 'site' && !usingSite() && !n.site) tab = 'privacy';
  S.build.tab = tab; S.build.visited = true;
  if (!S.build.privacyKind) S.build.privacyKind = !usingSite() && S.check?.report?.found?.privacy && !n.privacy ? 'section' : 'full';
  save();
  const u = urls();
  const tabs = TABS.filter(([k]) => k !== 'site' || usingSite() || n.site);
  panel.innerHTML = `<div class="panel-head"><div><h1>Build what’s missing</h1><p>Every page uses your details from step 1. Preview it, then copy the code or download the files. ${S.check || S.business.noWebsite ? '' : 'Run the website check first to see which pages you need.'}</p></div>
      <button class="btn primary" id="zip">Download everything (.zip)</button></div>
    <div class="card" style="margin-bottom:16px">
      <div class="row" style="align-items:flex-end">
        <div class="w2"><label for="site-url">${usingSite() ? 'Where your new site will live' : 'Your website address'}</label>
          <input type="url" id="site-url" spellcheck="false" placeholder="${esc(T.baseUrl(S.business) || 'https://yourbusiness.com')}" value="${esc(S.build.siteUrl || T.baseUrl(S.business))}">
          <p class="hint">${usingSite() ? 'The address you’ll publish these pages at. Using a HighLevel funnel? Put the funnel’s address here, and fix any page address in step 4 once it’s live.' : 'We use it to work out the page addresses for your registration answers.'}</p></div>
      </div>
      <p class="small muted" style="margin:0">Your pages will be at: ${[['Home', u.home], ['Privacy', u.privacy], ['Terms', u.terms]].filter(([, v]) => v).map(([k, v]) => `${k} <code>${esc(v)}</code>`).join(' · ') || 'enter the address above.'}</p>
    </div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" id="tab-${k}" aria-controls="tabpanel" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" data-tab="${k}">${l}${n[k] ? ' <span class="chip need">Needed</span>' : S.check ? ' <span class="chip ok">Optional</span>' : ''}</button>`).join('')}</div>
    <div id="tabpanel" role="tabpanel" aria-labelledby="tab-${tab}"></div>
    <div class="panel-foot"><a class="btn" href="#/app/check">Back</a><a class="btn primary lg" href="#/app/answers">Continue to your answers</a></div>`;
  $('#zip').onclick = () => { download(`${slug(T.brand(S.business))}-a2p-pages.zip`, makeZip(allFiles())); toast('Downloaded your pages as a .zip'); };
  $('#site-url').addEventListener('change', (e) => { const v = e.target.value.trim(); S.build.siteUrl = v ? T.baseUrl(S.business, { siteUrl: v }) : ''; save(); redraw(panel, (p) => renderBuild(p, tab)); });
  const tl = $('.tabs', panel);
  tl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = '#/app/build/' + b.dataset.tab; });
  tl.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const bs = $$('[role=tab]', tl), i = bs.findIndex((x) => x.dataset.tab === tab), j = (i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length;
    location.hash = '#/app/build/' + bs[j].dataset.tab; setTimeout(() => $(`#tab-${bs[j].dataset.tab}`)?.focus(), 30);
  });
  drawTab(tab);
}

function drawTab(tab) {
  const old = $('#tabpanel'), box = old.cloneNode(false), b = S.business, page = pageFor(tab);
  old.replaceWith(box);
  const why = { site: 'A small 3-page website: a home page with your business name, what you do, your contact details and the opt-in form, plus your privacy policy and SMS terms. All three are in the download.',
    privacy: 'Carriers want a privacy policy that says mobile numbers and text opt-in data are never shared for marketing.',
    terms: 'Your SMS terms tell people what you text, how often, what it costs, and how to get help or stop.',
    optin: 'The form where customers agree to your texts. The text-message box starts unticked, is optional, and sits apart from everything else.' }[tab];
  let opts = '';
  if (tab === 'privacy') opts = `<fieldset><legend>What do you need?</legend>
      <label class="radio"><input type="radio" name="pk" value="full" ${S.build.privacyKind !== 'section' ? 'checked' : ''}><span>A full privacy policy<span class="sub">If you don’t have one, or yours fails the check.</span></span></label>
      <label class="radio"><input type="radio" name="pk" value="section" ${S.build.privacyKind === 'section' ? 'checked' : ''}><span>Just the text-message section<span class="sub">To add to the policy you already have.</span></span></label></fieldset>`;
  if (tab === 'optin' || tab === 'site') opts = `<fieldset><legend>Where should form entries go?</legend>
      <label class="radio"><input type="radio" name="mode" value="mailto" ${S.build.mode === 'mailto' ? 'checked' : ''}><span>To my email<span class="sub">Simplest. It opens the visitor’s email app, addressed to ${esc(b.email || 'your support email')}.</span></span></label>
      <label class="radio"><input type="radio" name="mode" value="action" ${S.build.mode === 'action' ? 'checked' : ''}><span>To my own form service<span class="sub">Paste the address your form service gives you.</span></span></label>
      ${tab === 'optin' ? `<label class="radio"><input type="radio" name="mode" value="highlevel" ${S.build.mode === 'highlevel' ? 'checked' : ''}><span>I use HighLevel forms<span class="sub">We’ll show you the steps instead.</span></span></label>` : ''}
      <div class="field ${S.build.mode === 'action' ? '' : 'hidden'}" id="action-f" style="margin:8px 0 0 28px"><label for="action-url">Form service address</label><input type="url" id="action-url" value="${esc(S.build.actionUrl)}" placeholder="https://" spellcheck="false"><p class="hint">It must start with https://.</p></div></fieldset>`;
  const hl = tab === 'optin' && S.build.mode === 'highlevel';
  box.innerHTML = `<div class="build-grid">
    <div class="card">
      <p class="muted" style="font-size:14px">${why}</p>
      ${opts}
      ${hl ? '' : `<div class="actions" style="margin-top:8px">
        <button class="btn primary" id="copy-html">Copy ${page.snippet ? 'the code' : 'the HTML'}</button>
        <button class="btn" id="dl-html">Download ${esc(page.name)}</button>
        ${tab === 'site' ? '<button class="btn" id="dl-zip2">Download all 3 pages (.zip)</button>' : ''}
      </div>`}
      <p class="hint" style="margin-top:12px">Made from a template, not legal advice. Read it through and make sure it matches what you really do.</p>
    </div>
    <div>${hl ? `<div class="card"><h2>Set up your HighLevel form</h2><ol class="steps">${T.highlevelSteps(b, urls()).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="actions">${T.consentTexts(b).map((c, i) => `<button class="btn sm" data-copy="${i}">Copy ${c.kind === 'marketing' ? 'marketing' : T.consentTexts(b).length > 1 ? 'informational' : 'checkbox'} wording</button>`).join('')}</div></div>` : ''}
      <div class="preview" ${hl ? 'style="margin-top:16px"' : ''}>
        <div class="preview-bar"><span>${hl ? 'What your form should look like' : 'Preview'}${tab === 'site' ? ' · links inside open the other pages' : ''}</span>
          <span class="actions"><button class="btn sm ghost" id="show-code" aria-pressed="false">Show code</button></span></div>
        <iframe id="pv" title="Preview of ${esc(page.name)}" sandbox="allow-same-origin"></iframe>
        <pre class="code hidden" id="pv-code" tabindex="0"></pre>
      </div></div></div>`;
  const doc = (html) => (page.snippet ? `<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.6 system-ui,sans-serif;color:#1d2330;padding:24px;margin:0}</style></head><body>${html}</body></html>` : html);
  const show = (name, html, snippet) => {
    // The preview is sandboxed without scripts, so drop them there; the downloaded page keeps its script.
    const f = $('#pv'); f.srcdoc = (snippet ? doc(html) : html).replace(/<script\b[\s\S]*?<\/script>/gi, '');
    $('#pv-code').textContent = html;
    f.onload = () => { try { f.contentDocument.addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return; e.preventDefault();
      const href = a.getAttribute('href') || '';
      const files = usingSite() ? T.sitePages(b, { mode: S.build.mode, actionUrl: S.build.actionUrl }) : {};
      const key = href.split('#')[0];
      if (files[key]) show(key, files[key], false); else if (href.startsWith('#')) f.contentDocument.getElementById(href.slice(1))?.scrollIntoView();
      else toast('Links are switched off in the preview.');
    }); f.contentDocument.addEventListener('submit', (e) => { e.preventDefault(); toast('The form is switched off in the preview.'); }); } catch {} };
  };
  show(page.name, page.html, page.snippet);
  $('#show-code').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.textContent = on ? 'Show preview' : 'Show code'; $('#pv').classList.toggle('hidden', on); $('#pv-code').classList.toggle('hidden', !on); };
  $('#copy-html')?.addEventListener('click', () => copy(page.html, 'Copied the code'));
  $('#dl-html')?.addEventListener('click', () => { download(page.name, page.html); toast('Downloaded ' + page.name); });
  $('#dl-zip2')?.addEventListener('click', () => $('#zip').click());
  $$('[data-copy]', box).forEach((btn) => btn.addEventListener('click', () => copy(T.consentTexts(b)[btn.dataset.copy].text, 'Copied the checkbox wording')));
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'pk') { S.build.privacyKind = t.value; save(); setTimeout(() => drawTab(tab)); }
    if (t.name === 'mode') { S.build.mode = t.value; save(); setTimeout(() => drawTab(tab)); }
    if (t.id === 'action-url') { const v = t.value.trim(); if (v && !/^https:\/\/[^\s]+\.[^\s]+/i.test(v)) { toast('The form service address must start with https://'); return; } S.build.actionUrl = v; save(); setTimeout(() => drawTab(tab)); }
  });
}

// ---------- registration answers ----------
const FIELDS = [
  ['description', 'Campaign description', 'HighLevel: Use Case Description · Twilio: description', LIMITS.description, 5],
  ['flow', 'How customers opt in (message flow)', 'HighLevel: Description of Opt-In Flow · Twilio: message_flow', LIMITS.flow, 7],
  ['optinMsg', 'Opt-in confirmation message', 'HighLevel: Opt-in Message · Twilio: opt_in_message', LIMITS.reply, 3],
  ['optoutMsg', 'Opt-out (STOP) reply', 'Twilio: opt_out_message', LIMITS.reply, 2],
  ['helpMsg', 'Help (HELP) reply', 'Twilio: help_message', LIMITS.reply, 2],
  ['keywords', 'Opt-in keywords', 'Twilio: opt_in_keywords', LIMITS.keywords, 1],
];
function currentAnswers() {
  const u = urls(), gen = T.answers(S.business, u), A = S.answers;
  const pick = (k) => (A[k] ?? gen[k]);
  const samples = A.samples ?? gen.samples;
  const hasLinks = A.hasLinks ?? samples.some((s) => /https?:\/\/|www\./i.test(s));
  const hasPhone = A.hasPhone ?? samples.some((s) => /\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/.test(s));
  return { gen, a: { description: pick('description'), flow: pick('flow'), samples, optinMsg: pick('optinMsg'), optoutMsg: pick('optoutMsg'), helpMsg: pick('helpMsg'),
    keywords: pick('keywords'), hasLinks, hasPhone, optinUrl: u.optin, privacyUrl: u.privacy, termsUrl: u.terms } };
}
const countHtml = (v, [lo, hi]) => { const n = String(v || '').length; return `<span class="count ${n > hi || (lo && n < lo) ? 'over' : ''}">${n.toLocaleString()} / ${hi.toLocaleString()}${lo && n < lo ? ` · at least ${lo}` : ''}</span>`; };

function renderAnswers(panel) {
  const b = S.business, u = urls(), uc = useCase(b);
  const { a, gen } = currentAnswers();
  const brandRows = [
    ['Legal business name', 'HighLevel: Legal Business Name · Twilio: business_name', b.legalName, 'Must match your IRS letter exactly.'],
    ['Brand name (DBA)', 'Twilio: brand_name', b.dba || b.legalName, b.entity === 'sole' ? 'Sole proprietors: don’t include LLC or Inc.' : ''],
    ['Business type', 'Twilio: business_type', b.entity === 'sole' ? 'Sole proprietor' : '', b.entity === 'sole' ? '' : 'You choose: the type shown on your IRS letter (for example LLC or corporation).'],
    ['EIN', 'Twilio: business_registration_number', b.entity === 'sole' ? 'Not needed for sole proprietors' : '', b.entity === 'sole' ? '' : 'You fill in: from your IRS CP 575 or 147C letter.'],
    ['Address', 'Twilio: street, city, region, postal_code, iso_country', T.addressLine(b) + (b.country ? `, ${b.country}` : ''), ''],
    ['Website', 'HighLevel: Website URL · Twilio: website_url', u.home || T.baseUrl(b), ''],
    ['Support email', 'Twilio: brand_contact_email', b.email, ''],
    ['Phone', 'Twilio: phone_number', b.phone, ''],
    ['Industry', 'Twilio: vertical', (INDUSTRIES.find(([k]) => k === b.industry) || [, ''])[1], 'Pick the closest match in their list.'],
    ['Authorised representative', 'Twilio: representative first_name, last_name, business_title, email, phone_number', '', 'You fill in: the person who can speak for the business.'],
  ];
  const urlRow = (k, label, where) => `<div class="field"><label for="u-${k}">${label} <span class="where" style="display:inline;font-weight:400;color:var(--text-3);font-size:12.5px">${where}</span></label>
    <div class="check-form"><input type="url" id="u-${k}" data-url="${k}" value="${esc(u[k])}" spellcheck="false" placeholder="https://"><button class="btn" data-copyurl="${k}">Copy</button></div></div>`;
  panel.innerHTML = `<div class="panel-head"><div><h1>Your registration answers</h1><p>Paste these into HighLevel’s Trust Center or the Twilio console. Edit anything you like; we check your edits as you type.</p></div>
      <button class="btn" id="reset-all">Reset to suggested</button></div>
    <div class="form-grid">
    <div>
      <div class="card"><h2>Your brand</h2>
        <table class="kv"><tbody>${brandRows.map(([l, w, v, h]) => `<tr><th>${esc(l)}<span class="where">${esc(w)}</span></th><td>${v ? `${esc(v)}<button class="btn sm" data-copyv="${esc(v)}">Copy</button>` : ''}${h ? `<div class="hint" style="margin:${v ? '4px' : '0'} 0 0">${esc(h)}</div>` : ''}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><h2>Your campaign</h2>
        <div class="field"><span class="label">Campaign use case <span class="where" style="display:inline;font-weight:400;color:var(--text-3);font-size:12.5px">HighLevel: Campaign Use Case · Twilio: us_app_to_person_usecase</span></span>
          <p style="margin:0"><b>${esc(uc.name)}</b></p><p class="hint">${esc(uc.why)} This is our suggestion, not a rule.</p></div>
        <div class="field"><span class="label">Opt-in method <span class="where" style="display:inline;font-weight:400;color:var(--text-3);font-size:12.5px">HighLevel: Opt-In Method</span></span><p class="hint" style="margin:0">Choose the website or online form option.</p></div>
        ${urlRow('optin', 'Opt-in form URL', 'HighLevel: Opt-in Form URL')}
        ${urlRow('privacy', 'Privacy policy URL', 'HighLevel: Privacy Policy URL')}
        ${urlRow('terms', 'SMS terms URL', 'HighLevel: Terms & Conditions URL')}
        ${FIELDS.slice(0, 2).map(fieldBox).join('')}
        <div class="answer" id="samples-box">${samplesHtml(a.samples)}</div>
        ${FIELDS.slice(2).map(fieldBox).join('')}
        <div class="answer"><span class="label">Do your messages contain links or phone numbers? <span class="where" style="display:inline;font-weight:400;color:var(--text-3);font-size:12.5px">HighLevel: Additional Message Details · Twilio: has_embedded_links, has_embedded_phone</span></span>
          <div class="row" style="margin-top:6px">
            <fieldset style="margin:0"><legend class="small">Links</legend><div class="yesno"><label class="radio"><input type="radio" name="hasLinks" value="no" ${!a.hasLinks ? 'checked' : ''}>No</label><label class="radio"><input type="radio" name="hasLinks" value="yes" ${a.hasLinks ? 'checked' : ''}>Yes</label></div></fieldset>
            <fieldset style="margin:0"><legend class="small">Phone numbers</legend><div class="yesno"><label class="radio"><input type="radio" name="hasPhone" value="no" ${!a.hasPhone ? 'checked' : ''}>No</label><label class="radio"><input type="radio" name="hasPhone" value="yes" ${a.hasPhone ? 'checked' : ''}>Yes</label></div></fieldset>
          </div><p class="hint">Must match your sample messages.</p></div>
      </div>
      <div class="panel-foot"><a class="btn" href="#/app/build">Back</a><a class="btn primary lg" href="#/app/pack">Make my submission pack</a></div>
    </div>
    <aside class="sticky"><div class="card"><h2>Checks on your answers</h2><ul class="answer-checks" id="ans-checks" aria-live="polite"></ul></div></aside>
    </div>`;

  function fieldBox([k, label, where, lim, rows]) {
    return `<div class="answer"><div class="answer-head"><label for="a-${k}">${label}<span class="where">${where}</span></label>
      <span class="answer-tools"><span id="c-${k}">${countHtml(a[k], lim)}</span>${S.answers[k] != null ? `<button class="btn sm ghost" data-reset="${k}">Reset</button>` : ''}<button class="btn sm" data-copya="${k}">Copy</button></span></div>
      <textarea id="a-${k}" data-a="${k}" rows="${rows}">${esc(a[k])}</textarea></div>`;
  }
  function samplesHtml(samples) {
    return `<div class="answer-head" style="margin-bottom:0"><span class="label" style="margin:0">Sample messages<span class="where" style="display:block;font-weight:400;font-size:12.5px;color:var(--text-3)">HighLevel: Sample Messages · Twilio: message_samples · 2 to 5, each with your business name and STOP</span></span>
      ${samples.length < 5 ? '<button class="btn sm" id="add-sample">Add a sample</button>' : ''}</div>
      ${samples.map((s, i) => `<div style="margin-top:10px"><div class="answer-head"><label for="s-${i}" style="font-weight:500">Sample ${i + 1}</label><span class="answer-tools"><span id="cs-${i}">${countHtml(s, LIMITS.sample)}</span>${samples.length > 2 ? `<button class="btn sm ghost" data-del="${i}" aria-label="Remove sample ${i + 1}">Remove</button>` : ''}<button class="btn sm" data-copys="${i}">Copy</button></span></div>
        <textarea id="s-${i}" data-s="${i}" rows="2">${esc(s)}</textarea></div>`).join('')}
      <p class="hint">Words in [brackets] are placeholders that change per customer. Keep them, as Twilio asks.</p>`;
  }
  const checks = () => {
    const cur = currentAnswers().a;
    $('#ans-checks').innerHTML = checkAnswers(cur, b).map((r) => `<li>${badge(r.status)}<span>${esc(r.title)}${r.detail ? `<span class="d">${esc(r.detail)}</span>` : ''}</span></li>`).join('');
  };
  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.a) { S.answers[t.dataset.a] = t.value; $(`#c-${t.dataset.a}`).innerHTML = countHtml(t.value, FIELDS.find((f) => f[0] === t.dataset.a)[3]); }
    else if (t.dataset.s != null) { const s = [...currentAnswers().a.samples]; s[+t.dataset.s] = t.value; S.answers.samples = s; $(`#cs-${t.dataset.s}`).innerHTML = countHtml(t.value, LIMITS.sample); }
    else if (t.name === 'hasLinks' || t.name === 'hasPhone') S.answers[t.name] = t.value === 'yes';
    else return;
    save(); checks();
  });
  panel.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset.url) return;
    const v = t.value.trim(); if (v && !/^https?:\/\//i.test(v)) { toast('Page addresses start with https://'); return; }
    const auto = urls().auto[t.dataset.url];
    if (!v || v === auto) delete S.urls[t.dataset.url]; else S.urls[t.dataset.url] = v;
    save(); redraw(panel, renderAnswers);
  });
  panel.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const cur = currentAnswers().a;
    if (t.dataset.copyv != null) copy(t.dataset.copyv);
    else if (t.dataset.copyurl) copy($(`#u-${t.dataset.copyurl}`).value);
    else if (t.dataset.copya) copy(cur[t.dataset.copya]);
    else if (t.dataset.copys != null) copy(cur.samples[+t.dataset.copys]);
    else if (t.dataset.reset) { delete S.answers[t.dataset.reset]; save(); redraw(panel, renderAnswers); }
    else if (t.dataset.del != null) { const s = [...cur.samples]; s.splice(+t.dataset.del, 1); S.answers.samples = s; save(); redraw(panel, renderAnswers); }
    else if (t.id === 'add-sample') { S.answers.samples = [...cur.samples, `${T.brand(b)}: `]; save(); redraw(panel, renderAnswers); setTimeout(() => $(`#s-${cur.samples.length}`)?.focus(), 30); }
    else if (t.id === 'reset-all') { S.answers = {}; S.urls = {}; save(); redraw(panel, renderAnswers); toast('Back to the suggested answers'); }
  });
  checks();
  void gen;
}

// ---------- submission pack ----------
function renderPack(panel) {
  const b = S.business, u = urls(), uc = useCase(b), { a } = currentAnswers();
  const rep = S.check?.report;
  const open = rep ? rep.results.filter((r) => ['fail', 'warn', 'manual'].includes(r.status)) : [];
  const n = needs();
  const built = usingSite() ? ['index.html (home page)', 'privacy.html', 'sms-terms.html'] : [n.privacy && 'privacy.html', n.terms && 'sms-terms.html', n.optin && 'opt-in-form.html'].filter(Boolean);
  const ansChecks = checkAnswers(a, b), ansFails = ansChecks.filter((r) => r.status === 'fail');
  const sec = (label, value) => `<tr><th>${esc(label)}</th><td><pre>${esc(value)}</pre></td></tr>`;
  const tick = (t, src = '') => `<li><span>${t}${src ? ` <span class="src">${src}</span>` : ''}</span></li>`;
  const remind = '<p class="remind"><b>Approval is up to the carriers; this gets you ready, it doesn’t guarantee it.</b></p>';
  panel.innerHTML = `<div class="panel-head no-print"><div><h1>Submission pack</h1><p>Everything on one page. Print it or save it as a PDF, then work through the checklist as you fill in the form.</p></div>
      <div class="actions"><button class="btn" id="save-proj2">Save project file</button><button class="btn primary" id="print">Print or save as PDF</button></div></div>
    <article class="pack" id="pack">
      <h1 style="font-size:26px;margin-bottom:4px">A2P registration pack: ${esc(T.brand(b))}</h1>
      <p class="muted small">Prepared ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} with A2P Ready.</p>
      ${remind}
      ${!businessReady() ? '<div class="note warn no-print"><p>Some business details are missing. <a href="#/app/business">Finish step 1</a> for a complete pack.</p></div>' : ''}
      ${ansFails.length ? `<div class="note fail"><p><b>${ansFails.length} answer check${ansFails.length === 1 ? '' : 's'} still failing</b>: ${ansFails.map((r) => esc(r.title)).join('; ')}. <a class="no-print" href="#/app/answers">Fix in step 4</a></p></div>` : ''}

      <h2>1. Your website</h2>
      ${b.noWebsite ? '<p>You had no website, so the kit built a small 3-page website (home page, privacy policy and SMS terms).</p>' : rep ? `<p>Checked <b>${esc(shortUrl(rep.finalUrl || S.check.url))}</b> on ${new Date(rep.checkedAt).toLocaleDateString()}: ${rep.counts.pass} passed, ${rep.counts.fail} to fix, ${rep.counts.warn + rep.counts.advice} to check, ${rep.counts.manual} to check by hand.</p>` : '<p>Not checked yet. <a class="no-print" href="#/app/check">Run the website check</a></p>'}
      ${open.length ? `<p><b>Fix these before you submit</b> (then check again):</p><ul class="tick">${open.map((r) => tick(`<b>${esc(r.title)}</b>: ${esc(r.status === 'manual' ? HAND[r.group] : r.fix)}`, r.codes.length ? 'Twilio ' + r.codes.join(', ') : '')).join('')}</ul>` : ''}
      ${built.length ? `<p style="margin-top:12px"><b>Pages the kit built for you:</b> ${built.map(esc).join(', ')}. Publish them at:</p><ul class="tick">${[['Privacy policy', u.privacy], ['SMS terms', u.terms], ['Opt-in form', u.optin]].map(([l, v]) => tick(`${l}: ${v ? esc(v) : '<i>add the address in step 4</i>'} loads in a private window, with no login`)).join('')}</ul>` : ''}

      <h2>2. Your brand</h2>
      <table class="kv"><tbody>
        ${sec('Legal business name', b.legalName)}${b.dba && b.dba !== b.legalName ? sec('Brand name (DBA)', b.dba) : ''}
        ${sec('Business type', b.entity === 'sole' ? 'Sole proprietor' : b.entity === 'registered' ? 'Registered business (choose the type on your IRS letter)' : '')}
        ${sec('EIN', b.entity === 'sole' ? 'Not needed' : 'You fill in, from your IRS CP 575 or 147C letter')}
        ${sec('Address', T.addressLine(b))}${sec('Phone', b.phone)}${sec('Support email', b.email)}${sec('Website', u.home || T.baseUrl(b))}
      </tbody></table>

      <h2>3. Your campaign answers</h2>
      <table class="kv"><tbody>
        ${sec('Campaign use case (suggested)', uc.name)}
        ${sec('Opt-in form URL', u.optin)}${sec('Privacy policy URL', u.privacy)}${sec('SMS terms URL', u.terms)}
        ${sec('Campaign description', a.description)}${sec('Message flow (how customers opt in)', a.flow)}
        ${a.samples.map((s, i) => sec(`Sample message ${i + 1}`, s)).join('')}
        ${sec('Opt-in message', a.optinMsg)}${sec('Opt-out (STOP) reply', a.optoutMsg)}${sec('Help (HELP) reply', a.helpMsg)}${sec('Opt-in keywords', a.keywords)}
        ${sec('Messages contain links', a.hasLinks ? 'Yes' : 'No')}${sec('Messages contain phone numbers', a.hasPhone ? 'Yes' : 'No')}
      </tbody></table>

      <h2>4. Checklist: HighLevel Trust Center</h2>
      <p class="small muted">In HighLevel go to Settings, then Phone System, then Trust Center, then Brand &amp; Campaigns.</p>
      <ul class="tick">
        ${tick('Brand: legal name letter for letter as on your IRS letter, with the right business type', 'Twilio 30918, 30894')}
        ${tick('Brand: a street address, not a P.O. box')}
        ${b.entity === 'sole' ? tick('Brand: a personal email (Gmail, Outlook) and a mobile number that can get the one-time code; no LLC or Inc. in the brand name') : tick('Brand: an email on your own domain, ideally matching your website', 'Twilio 30881')}
        ${tick(`Campaign Use Case: ${esc(uc.name)}`)}
        ${tick('Website URL, Use Case Description, Sample Messages')}
        ${tick('Additional Message Details: links and phone numbers match your samples', 'Twilio 30889')}
        ${tick('Opt-In Method, Opt-in Form URL, Description of Opt-In Flow, Opt-in Message')}
        ${tick('Privacy Policy URL and Terms &amp; Conditions URL open the right pages')}
        ${b.dba && b.legalName && b.dba !== b.legalName ? tick(`Your description says “We are doing business as ${esc(b.dba)}”, as HighLevel suggests`) : ''}
        ${tick('After a rejection, recheck the whole campaign, not only the field it names. Some fields can’t be changed when you resubmit.')}
      </ul>

      <h2>5. Checklist: Twilio console</h2>
      <ul class="tick">
        ${tick('Business profile: business_name, business_type, business_registration_number (EIN), website_url, address, brand_contact_email, vertical')}
        ${tick('Authorised representative: first_name, last_name, business_title, email, phone_number')}
        ${tick(`Campaign: us_app_to_person_usecase (${esc(uc.name)}), description, message_flow, message_samples`)}
        ${tick('Campaign: has_embedded_links and has_embedded_phone match your samples')}
        ${tick('Campaign: opt_in_message, opt_out_message, help_message, opt_in_keywords')}
        ${tick('Every URL in your answers starts with https:// and none use link shorteners', 'Twilio 30964, 30892')}
      </ul>

      <h2>6. After you submit</h2>
      <ul class="tick">
        ${tick('Keep a record of every opt-in: when, how, the wording shown, the phone number and who agreed', 'CTIA 5.1.2')}
        ${tick('Standard campaigns can take up to 5 business days to review', 'Twilio 30922')}
        ${tick('If it’s rejected, fix and resubmit the same campaign: the vetting fee is charged once per campaign', 'Twilio 30922; HighLevel fees')}
      </ul>
      ${remind}
    </article>`;
  $('#print').onclick = () => window.print();
  $('#save-proj2').onclick = saveProject;
}

// ---------- rejection helper ----------
function renderRejection() {
  const body = $('#rejection-body');
  if (body.dataset.ready) return;
  body.dataset.ready = '1';
  body.innerHTML = `<div class="panel-head"><div><h1>Got rejected? Let’s see why.</h1><p>Paste the rejection message from HighLevel or Twilio, or just the error code (it starts with 30). We’ll tell you what it means, the likely cause and which fix in the kit covers it.</p></div></div>
    <div class="card"><form id="rej-form" novalidate>
      <label for="rej-text">Rejection message or code</label>
      <textarea id="rej-text" rows="4" placeholder="For example: Campaign rejected (30909): CTA verification failed"></textarea>
      <div class="actions" style="margin-top:12px"><button class="btn primary" type="submit">Explain it</button></div></form></div>
    <div class="rej-result" id="rej-out" aria-live="polite"></div>`;
  $('#rej-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#rej-text').value, out = $('#rej-out');
    if (!text.trim()) { out.innerHTML = '<p class="err" role="alert">Paste the message or code first.</p>'; $('#rej-text').focus(); return; }
    const r = explain(text);
    const last = (id) => S.check?.report?.results.find((x) => x.id === id);
    const item = (x) => {
      const l = x.kind === 'site' ? last(x.id) : null;
      const go = { business: ['#/app/business', 'Review your business details'], check: ['#/app/check', 'Check your website'], build: [`#/app/build/${x.build || ''}`, 'Build the fix'], answers: ['#/app/answers', 'Fix your answers'] }[x.step] || ['#/app/business', 'Open the kit'];
      return `<li><b>${esc(x.title)}</b>${l ? ` ${badge(l.status)} <span class="small muted">in your last check</span>` : ''}
        ${x.fix ? `<p class="fix">${esc(x.fix)}</p>` : ''}${l && l.evidence?.[0]?.snippet && l.status !== 'pass' ? `<p class="ev">We found: ${quote(l.evidence[0].snippet)}</p>` : ''}
        <div class="result-foot"><a class="btn sm" href="${go[0]}">${go[1]}</a></div></li>`;
    };
    let html = '';
    for (const c of r.codes) {
      html += `<section class="code-card"><h3>Error ${esc(c.code)}</h3>
        ${c.source ? `<p class="meaning">Twilio says: <b>${esc(c.source.title)}</b></p><p class="small"><a href="${esc(c.source.url)}" target="_blank" rel="noopener">Read Twilio’s page for ${esc(c.code)}</a> <span class="muted">(updated ${esc(c.source.modified)})</span></p>`
          : `<p>We don’t have code ${esc(c.code)} on file. <a href="https://www.twilio.com/docs/api/errors/${esc(c.code)}" target="_blank" rel="noopener">Look it up on Twilio’s site</a>.</p>`}
        ${c.rules.some((x) => x.kind === 'forbidden') ? '<div class="note fail"><p>This is a content type carriers don’t allow on standard business texting. Resubmitting won’t change it.</p></div>' : ''}
        ${c.source?.related ? `<p class="small muted">Twilio says this rejection can come with a more specific code (${c.source.related.length} of them, from ${esc(c.source.related[0])}). If you got one, paste it too for a shorter list.</p>` : ''}
        ${c.rules.length ? (() => {
          const rs = c.rules.filter((x) => x.kind !== 'forbidden'), st = (x) => (x.kind === 'site' ? last(x.id)?.status : null);
          const rank = (x) => (st(x) ? ORDER[st(x)] : 2.5);
          const open = rs.filter((x) => !['pass', 'skip'].includes(st(x))).sort((a, b) => rank(a) - rank(b)), done = rs.filter((x) => ['pass', 'skip'].includes(st(x)));
          return `<p style="margin:12px 0 0"><b>What to look at in the kit</b></p><ul>${open.map(item).join('')}</ul>
            ${done.length ? `<details class="passed"><summary>${done.length} already passed in your last check</summary><ul class="passed-list">${done.map((x) => `<li>${badge(st(x))} ${esc(x.title)}</li>`).join('')}</ul></details>` : ''}`;
        })() : c.source ? '<p class="muted">The kit doesn’t check this one automatically. Twilio’s page explains what to change.</p>' : ''}
      </section>`;
    }
    if (!r.codes.length) html = r.phrases.length ? `<section class="code-card"><h3>No error code found, but the message mentions:</h3><p class="muted">Matched from the words in your message. If you have the code (it starts with 30), paste it for a more exact answer.</p><ul>${r.phrases.map(item).join('')}</ul></section>`
      : '<div class="note warn"><p>We couldn’t match that message. If it has an error code (a number starting with 30), paste it here. You can also run the <a href="#/app/check">website check</a>, which covers the most common reasons.</p></div>';
    out.innerHTML = html;
  });
}

// ---------- project file ----------
function saveProject() {
  download(`${slug(T.brand(S.business))}-a2p-project.json`, JSON.stringify({ app: 'a2p-ready', version: 1, savedAt: new Date().toISOString(), state: S }, null, 2), 'application/json');
  toast('Saved your project file');
}
async function openProject(file) {
  try {
    const j = JSON.parse(await file.text());
    if (j.app !== 'a2p-ready' || !j.state) throw new Error();
    S = merge(j.state); save(); toast('Opened your project'); location.hash = '#/app/business'; route();
  } catch { toast('That file isn’t an A2P Ready project.'); }
}

// ---------- routing ----------
const STEPS = [['business', 'Your business'], ['check', 'Website check'], ['build', 'Build pages'], ['answers', 'Answers'], ['pack', 'Submission pack']];
function renderStepper(cur) {
  const done = { business: businessReady(), check: !!S.check || S.business.noWebsite, build: S.build.visited, answers: false, pack: false };
  if (done.build) done.answers = checkAnswers(currentAnswers().a, S.business).every((r) => r.status === 'pass');
  $('#stepper').innerHTML = STEPS.map(([k, l], i) => `<a href="#/app/${k}" ${k === cur ? 'aria-current="step"' : ''} class="${done[k] && k !== cur ? 'done' : ''}"><span class="n">${done[k] && k !== cur ? '✓' : i + 1}</span><span class="t">${l}</span></a>`).join('');
  $('#stepper [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
let lastRoute = '';
function route() {
  const h = location.hash || '#/';
  const parts = h.slice(2).split('/');
  const view = parts[0] === 'app' ? 'app' : parts[0] === 'rejection' ? 'rejection' : 'home';
  for (const id of ['home', 'app', 'rejection']) $('#' + id).classList.toggle('hidden', id !== view);
  if (view === 'app') {
    let step = STEPS.some(([k]) => k === parts[1]) ? parts[1] : 'business';
    if (forbidden(S.business) && step !== 'business') { step = 'business'; history.replaceState(null, '', '#/app/business'); }
    renderStepper(step);
    const panel = $('#panel');
    const fresh = panel.cloneNode(false); panel.replaceWith(fresh); // drop old listeners
    ({ business: renderBusiness, check: renderCheck, build: (p) => renderBuild(p, parts[2]), answers: renderAnswers, pack: renderPack })[step](fresh);
    document.title = `${STEPS.find(([k]) => k === step)[1]} · A2P Ready`;
  } else if (view === 'rejection') { renderRejection(); document.title = 'Rejection helper · A2P Ready'; }
  else document.title = 'A2P Ready: get your business texting registration ready';
  const key = view + '/' + (parts[1] || '');
  if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; const h1 = $(`#${view === 'home' ? 'home' : view} h1`); if (h1 && view !== 'home') { h1.tabIndex = -1; h1.focus({ preventScroll: true }); } }
}
window.addEventListener('hashchange', route);

// ---------- header and landing ----------
$('#theme').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('a2p-theme', document.documentElement.dataset.theme); } catch {}
};
$('#save-project').onclick = saveProject;
$('#open-project').onclick = () => $('#project-file').click();
$('#project-file').onchange = (e) => { const f = e.target.files[0]; if (f) openProject(f); e.target.value = ''; };
$('#hook-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#hook-url').value, err = $('#hook-err');
  try { normaliseInput(v); } catch (x) { err.textContent = x.message; err.classList.remove('hidden'); $('#hook-url').focus(); return; }
  err.classList.add('hidden');
  S.business.website = v.trim(); S.business.noWebsite = false; S.pendingCheck = true; save();
  location.hash = '#/app/check';
});
$('#hook-nosite').onclick = () => { S.business.noWebsite = true; save(); location.hash = '#/app/business'; };
if (S.business.website) $('#hook-url').value = S.business.website;
route();
window.__a2p = { get state() { return S; }, route };
