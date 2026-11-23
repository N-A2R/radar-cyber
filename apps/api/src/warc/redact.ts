/**
 * Archive-proof guards: no e-mail address, phone number or national
 * identifier may enter a WARC file. Grey sources stay accepted; only
 * personal data is removed from the captured body.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+33[\s.-]?\(?0\)?|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}\b/g;
const NIR = /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?\d{2,3}\s?\d{3}\s?\d{3}\s?\d{2}\b/g;
const PRIVATE_HOST = /^(?:localhost|.*\.local|.*\.internal|.*\.onion)$/i;

export type Redaction = { text: string; redacted: boolean };

export function redactText(input: string): Redaction {
	let text = input.replace(EMAIL, "[email-redacted]").replace(PHONE, "[phone-redacted]").replace(NIR, "[id-redacted]");
	const redacted = text !== input;
	if (redacted) text = text.replace(/\s+/g, " ").trim();
	return { text, redacted };
}

/** Independent check: the archived body holds no personal identifiers. */
export function containsPersonalData(text: string): boolean {
	return [EMAIL, PHONE, NIR].some((pattern) => new RegExp(pattern.source, "i").test(text));
}

/** Accept only public HTTP(S) URLs, without credentials or local targets. */
export function isPublicHttpUrl(raw: string): boolean {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	if (!/^https?:$/.test(url.protocol) || url.username || url.password) return false;
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (PRIVATE_HOST.test(host) || host === "::1") return false;
	if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
	const private172 = /^172\.(\d+)\./.exec(host);
	if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
	if (/^169\.254\./.test(host) || /^0\./.test(host)) return false;
	return true;
}

/** HTTP headers that must never be archived as received. */
export function safeHeaders(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, name) => {
		if (/^(authorization|cookie|set-cookie|proxy-authorization)$/i.test(name)) return;
		out[name] = value;
	});
	return out;
}
