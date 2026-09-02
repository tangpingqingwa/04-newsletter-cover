import { isIP } from "node:net";

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
const UNSAFE_URL_CHAR_RE = /[\u0000-\u001F\u007F-\u009F\\]/u;
const LOCAL_HOST_SUFFIXES: readonly string[] = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".lan",
  ".home.arpa",
  ".test",
  ".invalid",
  ".corp",
  ".home",
  ".private",
  ".intranet",
  ".onion",
];

function hostMatches(host: string, listed: string): boolean {
  return host === listed || host.endsWith(`.${listed}`);
}

function hostnameOf(parsed: URL): string {
  return parsed.hostname.toLowerCase().replace(/\.+$/, "");
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
  const lowered = host.toLowerCase().replace(/\.+$/, "");
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

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) {
    return null;
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets as [number, number, number, number];
}

/** RFC 6890/1918 IPv4 ranges that are not public sponsor destinations. */
function isReservedIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) {
    return true;
  }
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 31 && c === 196) ||
    (a === 192 && b === 52 && c === 193) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 175 && c === 48) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6Hextets(hostname: string): number[] | null {
  const sides = hostname.split("::");
  if (sides.length > 2) {
    return null;
  }
  const parseSide = (side: string): number[] | null => {
    if (!side) {
      return [];
    }
    const parts = side.split(":");
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/iu.test(part))) {
      return null;
    }
    return parts.map((part) => Number.parseInt(part, 16));
  };

  const left = parseSide(sides[0] ?? "");
  const right = parseSide(sides[1] ?? "");
  if (!left || !right) {
    return null;
  }
  if (sides.length === 1) {
    return left.length === 8 ? left : null;
  }
  const missing = 8 - left.length - right.length;
  if (missing < 1) {
    return null;
  }
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function ipv4FromHextets(hextets: number[]): string {
  const high = hextets[6] ?? 0;
  const low = hextets[7] ?? 0;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** RFC 4291/6890 local, reserved, and non-unicast IPv6 ranges. */
function isReservedIpv6(hostname: string): boolean {
  const hextets = parseIpv6Hextets(hostname);
  if (!hextets) {
    return true;
  }
  const first = hextets[0] ?? 0;
  const allZero = hextets.every((part) => part === 0);
  const loopback = hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1;
  if (allZero || loopback) {
    return true;
  }

  // IPv4-compatible addresses are deprecated and never a public sponsor
  // destination. IPv4-mapped addresses are allowed only when their embedded
  // IPv4 value is public; local/private values must not bypass this policy.
  const firstSixZero = hextets.slice(0, 6).every((part) => part === 0);
  if (firstSixZero) {
    return true;
  }
  const ipv4Mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
  if (ipv4Mapped && isReservedIpv4(ipv4FromHextets(hextets))) {
    return true;
  }

  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xffc0) === 0xfec0 || // fec0::/10 deprecated site-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    (first === 0x2001 && hextets[1] === 0x0db8) || // 2001:db8::/32 documentation
    (first === 0x2001 && hextets[1] === 0x0002 && hextets[2] === 0) || // 2001:2::/48 benchmark
    (first === 0x2001 && (hextets[1]! & 0xfff0) === 0x0010) // 2001:10::/28 ORCHID
  );
}

function unbracketHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isUnsafeSponsorHostname(hostname: string): boolean {
  const normalized = unbracketHostname(hostname).replace(/\.+$/, "");
  if (!normalized) {
    return true;
  }
  if (
    normalized === "localhost" ||
    LOCAL_HOST_SUFFIXES.some(
      (suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix),
    )
  ) {
    return true;
  }

  const version = isIP(normalized);
  if (version === 4) {
    return isReservedIpv4(normalized);
  }
  if (version === 6) {
    return isReservedIpv6(normalized);
  }

  // WHATWG accepts some numeric spellings as IPv4, while invalid numeric
  // spellings remain hostnames. Do not let those malformed forms become DNS.
  return /^\d+(?:\.\d+){0,3}$/u.test(normalized);
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

  const hostname = host.toLowerCase().replace(/\.+$/, "");
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
  if (UNSAFE_URL_CHAR_RE.test(text)) {
    return null;
  }

  if (text.startsWith("/")) {
    // Only the exact `//host` shorthand is supported. Path-only values and
    // extra leading slashes must not be repaired by WHATWG parsing.
    if (!text.startsWith("//") || text.startsWith("///")) {
      return null;
    }
    const authorityAndPath = text.slice(2);
    if (!looksLikeBareHost(authorityAndPath)) {
      return null;
    }
    try {
      return new URL(`https:${text}`);
    } catch {
      return null;
    }
  }

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
 * Require http(s), reject malformed/control/private destinations, drop
 * fragment, lowercase host, strip default ports and tracking query keys. Chat
 * and NSFW fail with `rejected_content`.
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
  if (UNSAFE_URL_CHAR_RE.test(raw)) {
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
  if (isUnsafeSponsorHostname(hostnameOf(parsed))) {
    return { ok: false, error: "rejected_content" };
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
