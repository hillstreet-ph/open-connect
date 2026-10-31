import test from "node:test";
import assert from "node:assert/strict";
import {
  describeDevice,
  describeLocation,
  isPrivateIp,
  locationFallback,
  parseUserAgent,
} from "./login-activity.ts";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const QODER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) QoderApp/0.5.1 Chrome/150.0.7871.114 Electron/43.1.1 Safari/537.36";

test("recognizes desktop browsers with their operating system", () => {
  const parsed = parseUserAgent(CHROME_WINDOWS);
  assert.equal(parsed.os, "Windows");
  assert.equal(parsed.browser, "Chrome");
  assert.equal(parsed.kind, "desktop");
  assert.equal(parsed.device, "Windows PC");
  assert.equal(describeDevice(parsed), "Chrome on Windows");
});

test("recognizes macOS Safari and mobile devices", () => {
  assert.equal(parseUserAgent(SAFARI_MAC).device, "Mac");
  assert.equal(describeDevice(parseUserAgent(SAFARI_MAC)), "Safari on macOS");

  const phone = parseUserAgent(IPHONE);
  assert.equal(phone.kind, "mobile");
  assert.equal(phone.device, "iPhone");
  assert.equal(phone.os, "iOS");

  const tablet = parseUserAgent(ANDROID_TABLET);
  assert.equal(tablet.kind, "tablet");
  assert.equal(tablet.device, "Tablet");
});

test("names native desktop apps instead of the generic browser label", () => {
  const parsed = parseUserAgent(QODER);
  assert.equal(parsed.device, "Qoder");
  assert.equal(parsed.kind, "desktop");
  assert.equal(parsed.os, "macOS");
  assert.equal(describeDevice(parsed), "Chrome on macOS");
});

test("treats command-line and crawler agents as automated clients", () => {
  for (const ua of [
    "curl/8.4.0",
    "python-requests/2.32.0",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
  ]) {
    const parsed = parseUserAgent(ua);
    assert.equal(parsed.kind, "bot", ua);
    assert.equal(parsed.device, "Automated client", ua);
  }
});

test("falls back safely for missing or unrecognized agents", () => {
  assert.deepEqual(parseUserAgent(null), {
    device: "Unknown device",
    browser: "Unknown browser",
    os: "Unknown OS",
    kind: "unknown",
  });
  assert.deepEqual(parseUserAgent("   "), {
    device: "Unknown device",
    browser: "Unknown browser",
    os: "Unknown OS",
    kind: "unknown",
  });
  assert.equal(describeDevice(parseUserAgent("weird-agent")), "Unknown device");
});

test("flags loopback and private addresses", () => {
  for (const ip of ["127.0.0.1", "10.0.0.4", "192.168.1.20", "169.254.1.1", "::1", "fd00::1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["103.226.24.32", "8.8.8.8", "2606:4700::1111"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
  assert.equal(isPrivateIp(null), true);
});

test("renders readable places and honest fallbacks", () => {
  assert.equal(
    describeLocation({ city: "Tacloban", region: "Eastern Visayas", country: "Philippines" }),
    "Tacloban, Eastern Visayas, Philippines",
  );
  assert.equal(describeLocation({ city: "Manila" }), "Manila");
  assert.equal(describeLocation({}), null);
  assert.equal(describeLocation(null), null);
  assert.equal(describeLocation({ city: "  ", region: "", country: null }), null);

  assert.equal(locationFallback("127.0.0.1"), "Local network");
  assert.equal(locationFallback("103.226.24.32"), "Location unavailable");
});
