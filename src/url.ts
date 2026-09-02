/** SPEC §6. Canonical sponsor URL before persist, compare, or redirect. */

export type SponsorUrlError = "invalid_url" | "rejected_content";

export type CanonicalSponsorUrl =
  | { ok: true; url: string }
  | { ok: false; error: SponsorUrlError };

/** Exact tracking / click-id keys. `utm_*` and `ref_` are prefix-matched. */
export const TRACKING_QUERY_KEYS: readonly string[] = [
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_eid",
  "mc_cid",
  "igshid",
  "ref",
  "ref_src",
  "yclid",
  "tbclid",
  "_ga",
  "_gl",
];

const TRACKING_KEY_SET = new Set(TRACKING_QUERY_KEYS);

/** Chat hosts. Subdomains match. `discord.com` only `/invite`. */
export const CHAT_HOSTS: readonly string[] = [
  "t.me",
  "telegram.me",
  "wa.me",
  "api.whatsapp.com",
  "chat.whatsapp.com",
  "discord.gg",
  "line.me",
  "m.me",
];

/** Known adult hosts. Subdomains match. */
export const NSFW_HOSTS: readonly string[] = [
  "onlyfans.com",
  "fansly.com",
  "pornhub.com",
  "pornhub.org",
  "pornhubpremium.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "chaturbate.com",
  "stripchat.com",
  "manyvids.com",
  "redtube.com",
  "youporn.com",
  "brazzers.com",
  "adultfriendfinder.com",
  "spankbang.com",
];

const NSFW_TERMS: readonly string[] = [
  "porn",
  "porno",
  "pornstar",
  "xxx",
  "nsfw",
  "onlyfans",
  "fansly",
  "hentai",
  "escort",
  "escorts",
  "camgirl",
  "camgirls",
  "livecam",
  "stripchat",
  "chaturbate",
  "nude",
  "nudes",
  "naked",
  "erotic",
  "blowjob",
  "handjob",
  "anal",
  "cumshot",
  "fetish",
  "sexual",
  "sex",
  "xxxvideo",
];

const NSFW_TERM_SET = new Set(NSFW_TERMS);
const NSFW_BLURB_RE = new RegExp(
  String.raw`\b(?:${NSFW_TERMS.join("|")}|cam girls?|live cam|adult video)\b`,
  "i",
);

function hostMatches(host: string, listed: string): boolean {
  return host === listed || host.endsWith(`.${listed}`);
}

function hostnameOf(parsed: URL): string {
  return parsed.hostname.toLowerCase().replace(/\.$/, "");
}

export function isTrackingQueryKey(key: string): boolean {
  const lowered = key.toLowerCase();
  if (lowered.startsWith("utm_")) {
    return true;
  }
  if (lowered.startsWith("ref_")) {
    return true;
  }
  return TRACKING_KEY_SET.has(lowered);
}

export function isChatUrl(parsed: URL): boolean {
  const host = hostnameOf(parsed);
  if (CHAT_HOSTS.some((listed) => hostMatches(host, listed))) {
    return true;
  }
  if (hostMatches(host, "discord.com")) {
    const path = parsed.pathname.toLowerCase();
    return path === "/invite" || path.startsWith("/invite/");
  }
  return false;
}

export function isNsfwHost(host: string): boolean {
  const lowered = host.toLowerCase().replace(/\.$/, "");
  if (NSFW_HOSTS.some((listed) => hostMatches(lowered, listed))) {
    return true;
  }
  return lowered.split(".").some((label) => NSFW_TERM_SET.has(label));
}

export function isNsfwPath(path: string): boolean {
  return path
    .toLowerCase()
    .split("/")
    .some((segment) => NSFW_TERM_SET.has(segment));
}

export function isNsfwBlurb(raw: string): boolean {
  return NSFW_BLURB_RE.test(raw);
}

function isNsfwUrl(parsed: URL): boolean {
  return isNsfwHost(hostnameOf(parsed)) || isNsfwPath(parsed.pathname);
}

/**
 * A missing scheme is only inferred for a plausible host-shaped value. In
 * particular, values such as `javascript:123` must not become an HTTPS URL
 * merely because the URL parser treats the suffix as a numeric port. The
 * shorthand grammar accepts dotted hostnames/IPs, localhost, and bracketed
 * IPv6 hosts, with a valid numeric port.
 */
function looksLikeBareHost(value: string): boolean {
  if (/^[a-z][a-z\d+.-]*\/\//i.test(value)) {
    return false;
  }
  const match = /^(\[[^\]]+\]|[^/?#\s:]+)(?::(\d+))?(?:[/?#].*)?$/u.exec(value);
  if (!match) {
    return false;
  }

  const host = match[1] ?? "";
  const port = match[2];
  if (port !== undefined) {
    const numericPort = Number(port);
    if (!Number.isSafeInteger(numericPort) || numericPort < 0 || numericPort > 65535) {
      return false;
    }
  }

  if (host.startsWith("[") && host.endsWith("]")) {
    // Let URL validate the actual IPv6 syntax after this host-shape check.
    return host.includes(":");
  }

  const hostname = host.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost") {
    return true;
  }

  const labels = hostname.split(".");
  if (labels.length < 2) {
    return false;
  }
  const validLabel = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;
  return labels.every((label) => validLabel.test(label));
}

function parseSponsorUrl(text: string): URL | null {
  let parsed: URL | null = null;
  try {
    parsed = new URL(text);
  } catch {
    // A host without a scheme is the supported shorthand. Parse it below as
    // HTTPS after the host-shaped guard has run.
  }

  if (parsed) {
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:") {
      return parsed;
    }
    // URL treats `example.com:8443` as a custom scheme. Re-parse that safe
    // host:port shorthand, while leaving real schemes rejected below.
    if (!looksLikeBareHost(text)) {
      return null;
    }
  } else if (text.startsWith("//")) {
    try {
      return new URL(`https:${text}`);
    } catch {
      return null;
    }
  } else if (!looksLikeBareHost(text)) {
    return null;
  }

  try {
    return new URL(`https://${text}`);
  } catch {
    return null;
  }
}

function toCanonical(parsed: URL): string {
  const protocol = parsed.protocol.toLowerCase();
  const host = hostnameOf(parsed);
  const defaultPort =
    (protocol === "http:" && parsed.port === "80") ||
    (protocol === "https:" && parsed.port === "443");
  const port = parsed.port && !defaultPort ? `:${parsed.port}` : "";
  const hostForUrl = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!isTrackingQueryKey(key)) {
      kept.append(key, value);
    }
  }
  const query = kept.toString();
  return `${protocol}//${hostForUrl}${port}${path}${query ? `?${query}` : ""}`;
}

/**
 * Require http(s), drop fragment, lowercase host, strip default ports and
 * tracking query keys. Chat and NSFW fail with `rejected_content`.
 * The returned URL is the identity key and the public redirect target.
 */
export function canonicalizeSponsorUrl(raw: unknown): CanonicalSponsorUrl {
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_url" };
  }
  const text = raw.trim();
  if (text.length < 1) {
    return { ok: false, error: "invalid_url" };
  }

  const parsed = parseSponsorUrl(text);
  if (!parsed) {
    return { ok: false, error: "invalid_url" };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return { ok: false, error: "invalid_url" };
  }
  if (!hostnameOf(parsed)) {
    return { ok: false, error: "invalid_url" };
  }
  if (isChatUrl(parsed) || isNsfwUrl(parsed)) {
    return { ok: false, error: "rejected_content" };
  }

  return { ok: true, url: toCanonical(parsed) };
}

/** Redirects always use the stored canonical URL, never the raw paste. */
export function redirectTarget(canonicalUrl: string): string {
  return canonicalUrl;
}
