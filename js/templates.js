// Every page and answer the kit writes comes from these templates. No AI writes your copy: the same details always
// give the same text, and every required phrase is traceable to RULES.md.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NOT_ADVICE = 'Made with the A2P kit from a template. It is not legal advice: read it, make sure it matches what you really do, and ask a lawyer if you are unsure.';

export function brand(b) { return (b.dba || b.legalName || 'Your Business').trim(); }
export function legal(b) { return (b.legalName || b.dba || 'Your Business').trim(); }
const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

// What the business texts, in words.
const KINDS = { reminders: 'appointment reminders', updates: 'job and arrival updates', quotes: 'quote follow-ups', replies: 'replies to your questions', marketing: 'offers and promotions' };
export function infoKinds(b) { const s = b.sends || {}; return ['reminders', 'updates', 'quotes', 'replies'].filter((k) => s[k]).map((k) => KINDS[k]); }
export const hasInfo = (b) => infoKinds(b).length > 0;
export const hasMarketing = (b) => !!(b.sends || {}).marketing;
export const mktFreq = (b) => `Up to ${Number(b.marketingPerMonth) || 4} marketing messages a month`;
export function addressLine(b) { return [b.street, b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '); }
export function baseUrl(b, o = {}) {
  const raw = (o.siteUrl || (!b.noWebsite && b.website) || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, 'https:') : 'https://' + raw;
}
// Where each page will live. Owners with a site keep their own URLs if the check found them.
export function pageUrls(b, o = {}, found = {}) {
  const base = baseUrl(b, o);
  const at = (f) => (base ? `${base}/${f}` : '');
  const built = b.noWebsite || o.useBuiltSite;
  return {
    home: base ? base + '/' : '',
    privacy: (!built && found.privacy) || at('privacy.html'),
    terms: (!built && found.terms) || at('sms-terms.html'),
    optin: (!built && found.optin) || (built ? (base ? base + '/' : '') : ''),
  };
}

// ---------- consent wording (one per checkbox) ----------
export function consentTexts(b) {
  const out = [];
  if (hasInfo(b)) out.push({ id: 'sms_info', kind: 'info', text: `I agree to receive ${list(infoKinds(b))} by text message (SMS) from ${brand(b)} at the number provided. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out. Consent is not a condition of purchase.` });
  if (hasMarketing(b)) out.push({ id: 'sms_marketing', kind: 'marketing', text: `I agree to receive marketing text messages (SMS) with offers and promotions from ${brand(b)} at the number provided. ${mktFreq(b)}. Message and data rates may apply. Reply HELP for help or STOP to opt out. Consent is not a condition of purchase.` });
  return out;
}

// ---------- privacy ----------
export const NO_SHARE = 'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties.';
export function privacySmsSection(b) {
  const kinds = [...infoKinds(b), ...(hasMarketing(b) ? ['offers and promotions (only if you agree to those separately)'] : [])];
  return `<h2>Text messages (SMS)</h2>
<p>If you give us your mobile number and tick the box to receive text messages, ${esc(brand(b))} will send you ${esc(list(kinds))}. Message frequency varies${hasMarketing(b) ? `; marketing messages are limited to ${esc(mktFreq(b).replace(/^Up to/, 'up to'))}` : ''}. Message and data rates may apply. Reply STOP to any message to opt out, or HELP for help.</p>
<p>${NO_SHARE}</p>`;
}
const css = `body{margin:0;font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1d2330;background:#fff}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}header{border-bottom:1px solid #e3e6eb}header .wrap{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:space-between;padding:14px 20px}
.name{font-weight:700;font-size:19px;color:#1d2330;text-decoration:none}nav a{margin-left:16px;color:#2b59c3;text-decoration:none}nav a:first-child{margin-left:0}
main{padding:28px 0 40px}h1{font-size:32px;line-height:1.2;margin:0 0 12px}h2{font-size:21px;margin:28px 0 8px}a{color:#2b59c3}
footer{border-top:1px solid #e3e6eb;padding:20px 0 32px;font-size:14px;color:#5b6270}footer a{color:#5b6270}
.lead{font-size:19px;color:#3a4150}.cta{display:inline-block;background:#2b59c3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600}`;
function shell(b, title, body, o = {}) {
  const nav = o.site ? `<nav aria-label="Main"><a href="index.html">Home</a><a href="index.html#contact">Contact</a><a href="privacy.html">Privacy Policy</a><a href="sms-terms.html">SMS Terms</a></nav>` : '';
  const links = o.site ? `<a href="privacy.html">Privacy Policy</a> · <a href="sms-terms.html">SMS Terms</a>` : '';
  return `<!doctype html>
<!-- ${NOT_ADVICE} -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ${esc(brand(b))}</title>
<style>${css}${o.extraCss || ''}</style></head>
<body><header><div class="wrap"><a class="name" href="${o.site ? 'index.html' : '#'}">${esc(brand(b))}</a>${nav}</div></header>
<main><div class="wrap">
${body}
</div></main>
<footer><div class="wrap">© ${new Date().getFullYear()} ${esc(legal(b))}${addressLine(b) ? ` · ${esc(addressLine(b))}` : ''}${b.phone ? ` · ${esc(b.phone)}` : ''}${b.email ? ` · <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}${links ? `<br>${links}` : ''}</div></footer>
</body></html>
`;
}
export function privacyPage(b, o = {}) {
  return shell(b, 'Privacy Policy', `<h1>Privacy Policy</h1>
<p>Last updated: ${today()}</p>
<p>This policy explains what ${esc(legal(b))}${b.dba && b.dba !== b.legalName ? ` (doing business as ${esc(b.dba)})` : ''} (“we”, “us”) collects, how we use it and the choices you have.</p>
<h2>What we collect</h2>
<p>When you contact us, ask for a quote or book with us, we collect the details you give us: usually your name, phone number, email address, service address and notes about the job.</p>
<h2>How we use it</h2>
<p>We use your details to answer you, give you quotes, schedule and carry out work, take payment and keep our records. We don’t sell your personal information.</p>
${privacySmsSection(b)}
<h2>Who we share it with</h2>
<p>We only share your details with service providers who help us run our business (for example, our scheduling, payment and messaging providers), and only so they can do that work for us, or when the law requires it. This never includes your mobile number or text messaging opt-in data for anyone’s marketing.</p>
<h2>How long we keep it</h2>
<p>We keep your details while you are a customer and for as long as we need them for our records or the law requires.</p>
<h2>Your choices</h2>
<p>You can ask us to see, correct or delete your details, or stop contacting you, at any time${b.email ? ` by emailing <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}${b.phone ? ` or calling ${esc(b.phone)}` : ''}. To stop text messages, reply STOP.</p>
<h2>Contact us</h2>
<p>${esc(legal(b))}${addressLine(b) ? `<br>${esc(addressLine(b))}` : ''}${b.phone ? `<br>${esc(b.phone)}` : ''}${b.email ? `<br><a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}</p>`, o);
}

// ---------- SMS terms ----------
export function termsPage(b, o = {}) {
  const kinds = [...infoKinds(b), ...(hasMarketing(b) ? ['offers and promotions'] : [])];
  return shell(b, 'SMS Terms and Conditions', `<h1>SMS Terms and Conditions</h1>
<p>Last updated: ${today()}</p>
<h2>Program</h2>
<p>${esc(brand(b))} text messages. ${esc(legal(b))} sends ${esc(list(kinds))} by text message to customers who opt in${hasMarketing(b) && hasInfo(b) ? '. Marketing messages are only sent to people who tick the separate marketing box' : ''}.</p>
<h2>How you opt in</h2>
<p>You opt in by ticking the text message box on our ${o.site ? '<a href="index.html#contact">contact form</a>' : 'contact form'} and submitting your mobile number. Ticking the box is optional; you can still use our services without it.</p>
<h2>Message frequency</h2>
<p>Message frequency varies${hasMarketing(b) ? `. ${esc(mktFreq(b))}` : ''}.</p>
<h2>Cost</h2>
<p>Message and data rates may apply. Ask your mobile carrier about your plan.</p>
<h2>Help</h2>
<p>Reply HELP to any message for help${b.email || b.phone ? `, or contact us at ${[b.email && `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`, b.phone && esc(b.phone)].filter(Boolean).join(' or ')}` : ''}.</p>
<h2>Opting out</h2>
<p>You can cancel at any time. Reply STOP to any message. We will send one final message to confirm, and then you won’t get any more texts from us unless you opt in again.</p>
<h2>Carriers</h2>
<p>Carriers are not liable for delayed or undelivered messages.</p>
<h2>Privacy</h2>
<p>See our ${o.site ? '<a href="privacy.html">Privacy Policy</a>' : o.privacyUrl ? `<a href="${esc(o.privacyUrl)}">Privacy Policy</a>` : 'Privacy Policy'}. ${NO_SHARE}</p>`, o);
}

// ---------- opt-in form ----------
// mode: 'mailto' (opens the visitor's email app, no service needed), 'action' (posts to the owner's own form handler).
export function optinForm(b, o = {}) {
  const mode = o.mode === 'action' && o.actionUrl ? 'action' : 'mailto';
  const action = mode === 'action' ? esc(o.actionUrl) : `mailto:${esc(b.email || '')}?subject=${encodeURIComponent('Website enquiry')}`;
  const extra = mode === 'mailto' ? ' enctype="text/plain"' : '';
  const priv = o.site ? 'privacy.html' : esc(o.privacyUrl || 'privacy.html');
  const terms = o.site ? 'sms-terms.html' : esc(o.termsUrl || 'sms-terms.html');
  const boxes = consentTexts(b).map((c) => `  <p class="a2p-consent"><input type="checkbox" id="${c.id}" name="${c.id}" value="yes">
    <label for="${c.id}">${esc(c.text)}</label>
    <input type="hidden" name="${c.id}_wording" value="${esc(c.text)}"></p>`).join('\n');
  return `<!-- Opt-in form for ${esc(brand(b))}. The text boxes start unticked and are optional, as carriers require. -->
<style>.a2p-optin{max-width:520px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}.a2p-optin label{display:block;font-weight:600;margin:12px 0 4px}
.a2p-optin input[type=text],.a2p-optin input[type=tel],.a2p-optin input[type=email],.a2p-optin textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b9c0cc;border-radius:6px;font:inherit}
.a2p-optin .a2p-consent{display:flex;gap:10px;align-items:flex-start;margin:14px 0}.a2p-optin .a2p-consent input{margin-top:5px;width:18px;height:18px;flex:none}
.a2p-optin .a2p-consent label{font-weight:400;margin:0;font-size:14px;color:#3a4150}.a2p-optin .a2p-links{font-size:14px}
.a2p-optin button{margin-top:8px;background:#2b59c3;color:#fff;border:0;border-radius:6px;padding:12px 20px;font:600 16px system-ui,sans-serif;cursor:pointer}</style>
<form class="a2p-optin" action="${action}" method="post"${extra}>
  <label for="a2p-name">Name</label>
  <input type="text" id="a2p-name" name="name" autocomplete="name" required>
  <label for="a2p-phone">Mobile number</label>
  <input type="tel" id="a2p-phone" name="phone" autocomplete="tel" required>
  <label for="a2p-email">Email (optional)</label>
  <input type="email" id="a2p-email" name="email" autocomplete="email">
  <label for="a2p-msg">How can we help?</label>
  <textarea id="a2p-msg" name="message" rows="4"></textarea>
${boxes}
  <p class="a2p-links"><a href="${priv}">Privacy Policy</a> | <a href="${terms}">SMS Terms</a></p>
  <input type="hidden" name="submitted_at" value="">
  <button type="submit">Send</button>
</form>
<script>document.querySelectorAll('form.a2p-optin').forEach(function(f){f.addEventListener('submit',function(){var t=f.querySelector('[name=submitted_at]');if(t)t.value=new Date().toISOString();});});</script>
`;
}

export function highlevelSteps(b, urls = {}) {
  const steps = [
    'Open the form you use for leads in HighLevel’s form builder (or create a new one).',
    'Add your Name field and a Phone field. The phone field can be required; the text message box below must not be.',
  ];
  for (const c of consentTexts(b)) steps.push(`Add a Checkbox field with one option and paste this as its text:\n“${c.text}”\nLeave it unticked by default and leave “Required” off.`);
  if (consentTexts(b).length > 1) steps.push('Keep the two boxes separate. Marketing consent must be its own box (Twilio 30913).');
  steps.push(`Right under the checkbox, add a text element with two visible links: Privacy Policy${urls.privacy ? ` (${urls.privacy})` : ''} and SMS Terms${urls.terms ? ` (${urls.terms})` : ''}.`);
  steps.push('Put the form on a public page of your website or funnel (no login), and use that page’s address as your “Opt-in Form URL”.');
  steps.push('Alternative: HighLevel’s own Chat Widget Setup builds a consent widget and fills in the campaign answers for you. If you use it, it must be the only SMS opt-in form on that page.');
  return steps;
}

// ---------- a small 3-page site for owners without one ----------
// Home, privacy and terms as 3 pages: HighLevel (30919) rejects one-page sites, and carriers want privacy and terms
// each at its own public URL. Host them anywhere or paste them into a HighLevel funnel.
export function sitePages(b, o = {}) {
  const so = { ...o, site: true };
  const svc = String(b.services || '').trim();
  const area = String(b.area || '').trim();
  const tel = String(b.phone || '').replace(/[^\d+]/g, '');
  const kinds = [...infoKinds(b), ...(hasMarketing(b) ? ['occasional offers (only if you ask for them)'] : [])];
  const index = shell(b, 'Home', `<h1>${esc(brand(b))}</h1>
<p class="lead">${esc(svc || `${brand(b)} is a local ${industryWord(b)} business.`)}</p>
${area ? `<p>We work in ${esc(area)}.</p>` : ''}
<h2>About us</h2>
<p>${esc(legal(b))} is a ${industryWord(b)} business${b.city ? ` based in ${esc(b.city)}${b.state ? `, ${esc(b.state)}` : ''}` : ''}. You can reach us by phone${b.email ? ' or email' : ''} and we reply as soon as we can.</p>
<h2>Text messages</h2>
<p>If you like, we can send you ${esc(list(kinds))} by text message. It’s optional: tick the box on the form below, and reply STOP at any time to stop. Read our <a href="sms-terms.html">SMS Terms</a> and <a href="privacy.html">Privacy Policy</a>.</p>
<h2 id="contact">Contact us</h2>
<p>${b.phone ? `Phone: <a href="tel:${esc(tel)}">${esc(b.phone)}</a><br>` : ''}${b.email ? `Email: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a><br>` : ''}${addressLine(b) ? `Address: ${esc(addressLine(b))}` : ''}</p>
<h3>Send us a message</h3>
${optinForm(b, so)}`, so);
  return { 'index.html': index, 'privacy.html': privacyPage(b, so), 'sms-terms.html': termsPage(b, so) };
}
const INDUSTRY_WORDS = { plumbing: 'plumbing', hvac: 'heating and air conditioning', electrical: 'electrical', roofing: 'roofing', cleaning: 'cleaning', landscaping: 'lawn and landscaping', pest: 'pest control', pool: 'pool service', painting: 'painting', handyman: 'handyman', moving: 'moving', auto: 'auto repair', salon: 'salon and beauty', health: 'health care', fitness: 'fitness', realestate: 'real estate', restaurant: 'restaurant', retail: 'retail', professional: 'professional services' };
export const industryWord = (b) => INDUSTRY_WORDS[b.industry] || 'local service';

// ---------- registration answers ----------
export function answers(b, urls = {}) {
  const B = brand(b);
  const kinds = infoKinds(b), mkt = hasMarketing(b);
  const what = list([...kinds, ...(mkt ? ['offers and promotions'] : [])]);
  const dba = b.dba && b.legalName && norm2(b.dba) !== norm2(b.legalName) ? ` We are doing business as ${b.dba}.` : '';
  const description = `${legal(b)} is a ${industryWord(b)} business${b.city ? ` in ${b.city}${b.state ? `, ${b.state}` : ''}` : ''}.${dba} We send ${what} by text message to customers and people who asked us for a quote and opted in on our website contact form${urls.optin ? ` (${urls.optin})` : ''}. Customers receive messages about their own appointments, jobs and quotes${mkt ? ', and marketing messages only if they ticked the separate marketing box' : ''}. Message frequency varies. Customers can reply STOP to opt out or HELP for help at any time.`;
  const boxes = consentTexts(b);
  const flow = `Customers opt in on our website contact form at ${urls.optin || '[your form URL]'}. They enter their name and mobile number and can tick ${boxes.length > 1 ? 'two separate, optional checkboxes' : 'an optional checkbox'} that ${boxes.length > 1 ? 'are' : 'is'} unticked by default. ${boxes.map((c) => `The ${c.kind === 'marketing' ? 'marketing' : 'informational'} box says: "${c.text}"`).join(' ')} Ticking a box is not required to submit the form or to use our services. Links to our Privacy Policy (${urls.privacy || '[privacy URL]'}) and SMS Terms (${urls.terms || '[terms URL]'}) are shown right under the checkboxes. We keep a record of each opt-in with the time and wording shown.`;
  const samples = [];
  if ((b.sends || {}).reminders) samples.push(`${B}: Hi [first name], this is a reminder of your appointment on [date] at [time]. Reply C to confirm or call us to change it. Reply STOP to opt out.`);
  if ((b.sends || {}).updates) samples.push(`${B}: Hi [first name], your technician [tech name] is on the way and should arrive at about [time]. Reply STOP to opt out.`);
  if ((b.sends || {}).quotes) samples.push(`${B}: Hi [first name], just checking you received your quote for [job]. Reply with any questions and we'll get back to you. Reply STOP to opt out.`);
  if ((b.sends || {}).replies) samples.push(`${B}: Hi [first name], thanks for your message. We can fit you in on [date]. Would morning or afternoon suit you better? Reply STOP to opt out.`);
  if (mkt) samples.push(`${B}: Hi [first name], this month only, get [offer] on [service]. Reply to book a time. Reply STOP to opt out.`);
  while (samples.length < 2) samples.push(`${B}: Hi [first name], thanks for choosing us. Reply with any questions about your [service]. Reply STOP to opt out.`);
  const optinMsg = `${B}: Thanks for subscribing to ${mkt && !kinds.length ? 'offers' : 'text updates'}. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.`;
  const optoutMsg = `${B}: You have been unsubscribed and will not receive any more messages from us. Reply START to subscribe again.`;
  const helpMsg = `${B}: For help, contact us at ${[b.phone, b.email].filter(Boolean).join(' or ') || '[phone or email]'}. Reply STOP to opt out.`;
  return { description, flow, samples: samples.slice(0, 5), optinMsg, optoutMsg, helpMsg, keywords: 'START, YES', hasLinks: false, hasPhone: false };
}
const norm2 = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
