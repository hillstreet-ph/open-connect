/** Fixed DOM probes: never return page text, cookies, credentials or arbitrary script. */
const widgetProbe = `
const widgets = [...document.querySelectorAll('[data-sitekey]')];
let widget = widgets.find(el => /(?:g-recaptcha|cf-turnstile)/.test(el.className));
let type = widget && /cf-turnstile/.test(widget.className) ? 'turnstile' : 'recaptcha_v2';
let siteKey = widget?.getAttribute('data-sitekey');
if (!siteKey) {
  const iframe = [...document.querySelectorAll('iframe[src]')].find(el => /\\/(?:recaptcha)\\//.test(el.src));
  if (iframe) { try { siteKey = new URL(iframe.src).searchParams.get('k'); widget = iframe; } catch {} }
}
if (!siteKey || !widget || widget.getBoundingClientRect().width === 0 || widget.getBoundingClientRect().height === 0) return null;
const fieldName = type === 'turnstile' ? 'cf-turnstile-response' : 'g-recaptcha-response';
const fields = [...document.querySelectorAll('[name="'+fieldName+'"]')];
if (fields.some(el => el.value)) return null;
`;
export const verificationProbeScript = `(() => { ${widgetProbe} return { type, siteKey, origin: location.origin, pageUrl: location.href }; })()`;
export function verificationProofScript(
  expected: { origin: string; siteKey: string; type: string },
  proof: string,
) {
  return `(() => {
    const expected = ${JSON.stringify(expected)};
    if (location.origin !== expected.origin) return false;
    ${widgetProbe}
    if (siteKey !== expected.siteKey || type !== expected.type || !fields.length) return false;
    for (const field of fields) { field.value = ${JSON.stringify(proof)}; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); }
    return true;
  })()`;
}
export type BrowserVerificationWidget = {
  type: "recaptcha_v2" | "turnstile";
  siteKey: string;
  origin: string;
  pageUrl: string;
};

/** Stable across remounts: one paid submission per widget in a browser target. */
export async function browserVerificationRequestId(context: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(context)),
  ).slice(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
