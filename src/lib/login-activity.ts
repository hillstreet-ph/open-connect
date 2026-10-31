/**
 * Login activity presentation helpers.
 *
 * Session facts come from Supabase Auth (auth.sessions): user agent, IP, and
 * timestamps. This module turns a raw user agent into a device label and a
 * coarse IP geolocation into a readable place, without any DOM or network access.
 */

export type DeviceKind = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export type ParsedUserAgent = {
  /** Friendly device or app name, e.g. "Qoder", "iPhone", "Windows PC". */
  device: string;
  browser: string;
  os: string;
  kind: DeviceKind;
};

export type GeoLocation = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
};

export type SessionActivity = {
  id: string;
  created_at: string;
  last_active_at: string;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
  location: string | null;
};

const BOT =
  /bot|crawler|crawl|spider|slurp|bingpreview|facebookexternalhit|curl|wget|python-requests|okhttp|headless/i;
const ELECTRON_APP = /\b([A-Za-z][A-Za-z0-9]*?)App\/(\d+(?:\.\d+)*)/;

function detectOs(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/macintosh|mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown OS";
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/firefox\/|fxios/i.test(ua)) return "Firefox";
  if (/chrome\/|crios/i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return "Unknown browser";
}

function detectKind(ua: string, os: string): DeviceKind {
  if (BOT.test(ua)) return "bot";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return "tablet";
  if (/iphone|ipod|android|mobile|windows phone/i.test(ua)) return "mobile";
  if (os === "Unknown OS") return "unknown";
  return "desktop";
}

/** Desktop-style device name for a plain browser user agent. */
function desktopName(os: string): string {
  if (os === "Windows") return "Windows PC";
  if (os === "macOS") return "Mac";
  if (os === "ChromeOS") return "Chromebook";
  if (os === "Linux") return "Linux PC";
  if (os === "iOS") return "iPhone";
  if (os === "Android") return "Android device";
  return "Unknown device";
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = (userAgent ?? "").trim();
  if (!ua)
    return {
      device: "Unknown device",
      browser: "Unknown browser",
      os: "Unknown OS",
      kind: "unknown",
    };

  const os = detectOs(ua);
  const browser = detectBrowser(ua);
  const kind = detectKind(ua, os);

  // Native/desktop clients (for example Qoder) identify as "<Name>App/x.y".
  const app = ELECTRON_APP.exec(ua);
  if (app && kind !== "bot") {
    return { device: app[1]!, browser, os, kind: "desktop" };
  }

  if (kind === "bot") return { device: "Automated client", browser, os, kind };
  if (kind === "tablet") return { device: os === "iOS" ? "iPad" : "Tablet", browser, os, kind };
  if (kind === "mobile")
    return { device: os === "iOS" ? "iPhone" : "Android phone", browser, os, kind };
  return { device: desktopName(os), browser, os, kind };
}

/** One-line device summary, e.g. "Chrome on Windows" or "Qoder · macOS". */
export function describeDevice(parsed: ParsedUserAgent): string {
  const osKnown = parsed.os !== "Unknown OS";
  const browserKnown = parsed.browser !== "Unknown browser";
  if (parsed.kind === "bot")
    return parsed.browser === "Unknown browser" ? "Automated client" : parsed.browser;
  if (!browserKnown && !osKnown) return parsed.device;
  if (!browserKnown) return osKnown ? parsed.os : parsed.device;
  return osKnown ? `${parsed.browser} on ${parsed.os}` : parsed.browser;
}

const PRIVATE_IP = /^(10\.|127\.|192\.168\.|169\.254\.|::1$|fc|fd|fe80)/i;

/** True when an address is loopback, link-local, or RFC1918 private. */
export function isPrivateIp(ip: string | null | undefined): boolean {
  if (!ip) return true;
  return PRIVATE_IP.test(ip.trim());
}

/** Readable "City, Region, Country" for a coarse geolocation. */
export function describeLocation(geo: GeoLocation | null | undefined): string | null {
  if (!geo) return null;
  const parts = [geo.city, geo.region, geo.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
  return parts.length ? parts.join(", ") : null;
}

/** Fallback label when no geolocation is available for an address. */
export function locationFallback(ip: string | null | undefined): string {
  return isPrivateIp(ip) ? "Local network" : "Location unavailable";
}
