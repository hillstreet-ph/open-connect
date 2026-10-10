export async function ensureKobePlayVerify(request) {
  const matches = [];
  let path = "/Services?PageSize=100";
  for (let page = 0; path && page < 20; page++) {
    const data = await request(path);
    for (const service of data.services ?? []) {
      if (service.friendly_name === "KobePlay") matches.push(service);
    }
    const next = data.meta?.next_page_url;
    if (next) {
      const url = new URL(next);
      if (
        url.origin !== "https://verify.twilio.com" ||
        url.pathname !== "/v2/Services" ||
        url.username ||
        url.password
      )
        throw new Error("verify_pagination_invalid");
      path = url.pathname.slice(3) + url.search;
    } else path = null;
  }
  if (path) throw new Error("verify_inventory_incomplete");
  if (matches.length > 1) throw new Error("verify_duplicate_services");
  const settings = {
    FriendlyName: "KobePlay",
    CodeLength: "6",
    CustomCodeEnabled: "false",
    LookupEnabled: "true",
    SkipSmsToLandlines: "true",
    DoNotShareWarningEnabled: "true",
  };
  const current = matches[0];
  if (current && !/^VA[0-9a-f]{32}$/i.test(current.sid ?? "")) {
    throw new Error("verify_service_invalid");
  }
  const fields = {
    FriendlyName: "friendly_name",
    CodeLength: "code_length",
    CustomCodeEnabled: "custom_code_enabled",
    LookupEnabled: "lookup_enabled",
    SkipSmsToLandlines: "skip_sms_to_landlines",
    DoNotShareWarningEnabled: "do_not_share_warning_enabled",
  };
  let saved = current;
  if (
    !current ||
    Object.entries(settings).some(([key, value]) => String(current[fields[key]]) !== value)
  ) {
    saved = await request(current ? "/Services/" + current.sid : "/Services", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(settings),
    });
  }
  if (!/^VA[0-9a-f]{32}$/i.test(saved?.sid ?? "")) throw new Error("verify_service_invalid");
  const readback = await request("/Services/" + saved.sid);
  if (Object.entries(settings).some(([key, value]) => String(readback[fields[key]]) !== value))
    throw new Error("verify_readback_failed");
  return {
    sid: readback.sid,
    friendly_name: readback.friendly_name,
    code_length: readback.code_length,
    lookup_enabled: readback.lookup_enabled,
    skip_sms_to_landlines: readback.skip_sms_to_landlines,
    do_not_share_warning_enabled: readback.do_not_share_warning_enabled,
  };
}
