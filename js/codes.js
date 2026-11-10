// Rejection helper: turns a pasted rejection message into Twilio's own meaning (codes-data.js, copied from Twilio's
// error pages) plus the kit's rules that cover it. Nothing here adds a fact: meanings are Twilio's titles, causes and
// fixes are the rules in rules.js (RULES.md).
import { TWILIO_CODES } from './codes-data.js';
import { RULES, ANSWER_RULES, FORBIDDEN } from './rules.js';

const BYCODE = new Map(TWILIO_CODES.map((c) => [c.code, c]));
// Business-detail rules (RULES.md section F). Their wording lives in rules.js checkBusiness(); this is the code index.
const BUSINESS = {
  B1: { title: 'Sole proprietor vs registered business', codes: ['30903', '30915'], step: 'business' },
  B2: { title: 'Legal name exactly as on your IRS letter', codes: ['30918', '30894'], step: 'business' },
  B3: { title: 'Support email on your own domain', codes: ['30881'], step: 'business' },
};
const STEP_OF = { site: 'check', privacy: 'build', terms: 'build', optin: 'build' };

// Umbrella codes (Twilio's 30909 page) list more specific codes; their rules apply too, deduplicated.
export function rulesForCode(code, seen = new Set()) {
  if (seen.has(code)) return [];
  seen.add(code);
  const out = [];
  for (const r of Object.values(RULES)) if (r.codes.includes(code)) out.push({ kind: 'site', id: r.id, title: r.title, fix: r.fix, build: r.build, step: r.build ? 'build' : STEP_OF[r.group] });
  for (const [id, r] of Object.entries(ANSWER_RULES)) if (r.codes.includes(code)) out.push({ kind: 'answer', id, title: r.title, step: 'answers' });
  for (const [id, r] of Object.entries(BUSINESS)) if (r.codes.includes(code)) out.push({ kind: 'business', id, title: r.title, step: 'business' });
  for (const [key, [label, c]] of Object.entries(FORBIDDEN)) if (c === code) out.push({ kind: 'forbidden', id: 'B6', key, title: `${label} can’t be registered for business texting`, step: 'business' });
  for (const sub of BYCODE.get(code)?.related || []) for (const r of rulesForCode(sub, seen)) if (!out.some((x) => x.id === r.id)) out.push(r);
  return out;
}

// When there is no code, match the words HighLevel and Twilio use in rejection notes. Each phrase points at rule ids.
const PHRASES = [
  [/privacy policy|privacy/i, ['P1', 'P2', 'P3', 'P4', 'P5']],
  [/shar(e|ing)|third[- ]part/i, ['P2', 'P3']],
  [/terms( and| &) conditions|terms of service|\bterms\b|t&c/i, ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']],
  [/pre-?(checked|selected|ticked)|checked by default/i, ['F3']],
  [/required|mandatory|condition of purchase/i, ['F4', 'C9']],
  [/opt[- ]?in|consent|checkbox|call to action|cta/i, ['F1', 'F2', 'F3', 'F4', 'F5', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'R2']],
  [/marketing consent|promotional/i, ['F6']],
  [/website|url|domain|site/i, ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W8', 'W9', 'W10']],
  [/under construction|coming soon|placeholder|lorem/i, ['W5']],
  [/https|ssl|secure/i, ['W2', 'R5']],
  [/login|password|sign[- ]?in/i, ['W3']],
  [/sample|example message/i, ['R3']],
  [/message flow|opt-?in (flow|description)/i, ['R2']],
  [/description/i, ['R1']],
  [/opt-?out|\bstop\b/i, ['C6', 'R7']],
  [/\bhelp\b/i, ['C7', 'R8']],
  [/shorten|bit\.ly|tinyurl/i, ['R4']],
  [/embedded (link|phone)/i, ['R11']],
  [/duplicate|same as|identical/i, ['R10']],
  [/\bein\b|tax id|legal (business )?name|irs/i, ['B2']],
  [/sole prop/i, ['B1']],
  [/email/i, ['B3']],
];

export function explain(text) {
  const raw = String(text || '');
  const codes = [...new Set(raw.match(/\b3\d{4}\b/g) || [])];
  const byCode = codes.map((code) => ({ code, source: BYCODE.get(code) || null, rules: rulesForCode(code) }));
  let phrases = [];
  if (!codes.length && raw.trim()) {
    const ids = new Set();
    for (const [re, list] of PHRASES) if (re.test(raw)) list.forEach((i) => ids.add(i));
    phrases = [...ids].map((id) => {
      if (RULES[id]) { const r = RULES[id]; return { kind: 'site', id, title: r.title, fix: r.fix, build: r.build, step: r.build ? 'build' : 'check' }; }
      if (ANSWER_RULES[id]) return { kind: 'answer', id, title: ANSWER_RULES[id].title, step: 'answers' };
      return { kind: 'business', id, title: BUSINESS[id].title, step: 'business' };
    });
  }
  return { codes: byCode, phrases };
}
