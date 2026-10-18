const xmlEscape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
export const twiml = (body) =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response>' + body + "</Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
const reject = (status) =>
  new Response("Request could not be processed.", {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export const sid = (value, prefix) =>
  typeof value === "string" && new RegExp("^" + prefix + "[0-9a-f]{32}$").test(value);
export function telegramDestination(config) {
  const destination = { chat_id: config.telegram_chat_id };
  const topic = config.telegram_message_thread_id;
  if (topic != null) {
    if (!Number.isSafeInteger(topic) || topic <= 0) throw new Error("telegram_topic_invalid");
    destination.message_thread_id = topic;
  }
  return destination;
}
export async function boundedBytes(response, max = 5_000_000) {
  if (!response.body) throw new Error("empty_media");
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new Error("media_too_large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function parseWebhook(req) {
  if (req.method !== "POST") return { error: 405 };
  if (!req.headers.get("x-twilio-signature")) return { error: 403 };
  if (
    !req.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")
  )
    return { error: 415 };
  try {
    const fields = Object.create(null);
    const body = new TextDecoder("utf-8", { fatal: true }).decode(await boundedBytes(req, 65536));
    for (const [key, value] of new URLSearchParams(body)) {
      if (Object.hasOwn(fields, key)) return { error: 400 };
      fields[key] = value;
    }
    return { fields };
  } catch {
    return { error: 400 };
  }
}
export function mediaSid(url, accountSid, messageSid) {
  try {
    const u = new URL(url);
    if (u.origin !== "https://api.twilio.com" || u.search || u.hash || u.username || u.password)
      return null;
    const prefix = "/2010-04-01/Accounts/" + accountSid + "/Messages/" + messageSid + "/Media/";
    if (!u.pathname.startsWith(prefix)) return null;
    const candidate = u.pathname.slice(prefix.length);
    return sid(candidate, "ME") ? candidate : null;
  } catch {
    return null;
  }
}
export function recordingTwiml(config) {
  const base = config.canonical_url;
  // Record the incoming track immediately so an automated caller's first digits
  // are captured while the recording notice plays. Hold for at most ~90 seconds.
  return (
    '<Start><Recording track="inbound" channels="mono" trim="do-not-trim" recordingStatusCallback="' +
    xmlEscape(base + "/recording#rc=2&rp=5xx,ct,rt") +
    '" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/></Start><Say>This call is recorded.</Say><Pause length="30"/><Pause length="30"/><Pause length="30"/><Hangup/>'
  );
}
export function createIngress(deps) {
  return async (req) => {
    const parsed = await parseWebhook(req);
    if (parsed.error) return reject(parsed.error);
    const p = parsed.fields;
    const u = new URL(req.url),
      path = u.pathname.replace(/^\/functions\/v1(?=\/)/, "");
    const base = "/hillstreet-otp-forwarder";
    const suffix = path.startsWith(base) ? path.slice(base.length) : "invalid";
    if (u.search || !["", "/voice", "/recording", "/complete"].includes(suffix)) return reject(403);
    if (!sid(p.AccountSid, "AC")) return reject(400);
    try {
      let call = null,
        config;
      if (suffix === "/recording" || suffix === "/complete") {
        if (!sid(p.CallSid, "CA")) return reject(400);
        call = await deps.findCall(p.CallSid);
        if (!call) return reject(403);
        config = await deps.configByPhone(call.phone_number_sid);
      } else config = await deps.configByNumber(p.AccountSid, p.To);
      if (!config?.enabled || config.account_sid !== p.AccountSid) return reject(403);
      const token = await deps.secret(config.user_id, config.auth_token_credential_id);
      if (
        !deps.validate(
          token,
          req.headers.get("x-twilio-signature"),
          config.canonical_url + suffix,
          p,
        )
      )
        return reject(403);
      if (suffix === "/complete") return twiml("<Hangup/>");
      if (suffix === "/voice") {
        if (!sid(p.CallSid, "CA") || typeof p.From !== "string") return reject(400);
        const account = await deps.account(config);
        if (!config.voice_enabled || account.type !== "Full" || account.status !== "active")
          return twiml("<Say>Voice recording is unavailable for this account.</Say><Hangup/>");
        await deps.saveCall({
          call_sid: p.CallSid,
          phone_number_sid: config.phone_number_sid,
          from_number: p.From,
        });
        return twiml(recordingTwiml(config));
      }
      if (suffix === "/recording") {
        if (!config.voice_enabled || !sid(p.RecordingSid, "RE")) return reject(403);
        if (p.RecordingStatus !== "completed") return twiml("");
        await deps.enqueue(config.phone_number_sid, p.RecordingSid, "audio", {
          callSid: p.CallSid,
          recordingSid: p.RecordingSid,
          from: call.from_number,
          to: config.to_number,
          receivedAt: deps.now(),
        });
      } else {
        if (!sid(p.MessageSid, "SM") || typeof p.From !== "string" || typeof p.Body !== "string")
          return reject(400);
        const count = Number(p.NumMedia ?? 0);
        if (!Number.isSafeInteger(count) || count < 0 || count > 10) return reject(400);
        const media = [];
        for (let i = 0; i < count; i++) {
          const id = mediaSid(p["MediaUrl" + i], p.AccountSid, p.MessageSid);
          if (!id) return reject(400);
          media.push(id);
        }
        if (await deps.legacyDelivered(config.phone_number_sid, p.MessageSid)) return twiml("");
        const common = { from: p.From, to: config.to_number, receivedAt: deps.now() };
        await deps.enqueue(config.phone_number_sid, p.MessageSid + ":sms", "sms", {
          ...common,
          body: p.Body,
          messageSid: p.MessageSid,
          mediaCount: count,
        });
        for (const id of media)
          await deps.enqueue(config.phone_number_sid, p.MessageSid + ":" + id, "media", {
            ...common,
            messageSid: p.MessageSid,
            mediaSid: id,
          });
      }
      // A wake-up failure cannot lose an accepted event: the scheduled worker retries it.
      deps.wake(config.account_sid);
      return twiml("");
    } catch {
      return reject(503);
    }
  };
}

export function classifyTelegram(result) {
  if (result?.ok === true && Number.isSafeInteger(result.result?.message_id))
    return { status: "delivered", messageId: result.result.message_id };
  if (result?.ok === false && result.error_code === 429) {
    const seconds = result.parameters?.retry_after;
    return {
      status: "queued",
      delay: Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 60,
      error: "telegram_rate_limited",
    };
  }
  if (result?.ok === false && [400, 401, 403, 404, 409].includes(result.error_code))
    return { status: "exhausted", error: "telegram_rejected_" + result.error_code };
  return { status: "uncertain", error: "telegram_outcome_unknown" };
}
export function eligibleNumber(number, existing, runtime) {
  return Boolean(
    existing ||
    number.friendly_name === runtime.auto_enroll_prefix ||
    number.friendly_name?.startsWith(runtime.auto_enroll_prefix + " "),
  );
}
export function desiredNumberConfig(number, runtime, account) {
  const active = account.type === "Full" && account.status === "active";
  const sms = number.capabilities?.sms === true || number.capabilities?.mms === true;
  const voice = active && runtime.voice_requested && number.capabilities?.voice === true;
  const body = {};
  const retries = "#rc=2&rp=5xx,ct,rt";
  if (sms)
    Object.assign(body, {
      SmsUrl: runtime.function_base_url + retries,
      SmsMethod: "POST",
      SmsFallbackUrl: runtime.function_base_url + retries,
      SmsFallbackMethod: "POST",
    });
  if (voice)
    Object.assign(body, {
      VoiceUrl: runtime.function_base_url + "/voice" + retries,
      VoiceMethod: "POST",
      VoiceFallbackUrl: runtime.function_base_url + "/voice" + retries,
      VoiceFallbackMethod: "POST",
    });
  return { body, sms, voice };
}
export async function deliverJob(job, config, deps) {
  const payload = job.payload;
  let prepared;
  try {
    prepared = await deps.prepare(job, config);
  } catch (e) {
    const permanent = [
      "media_too_large",
      "media_origin_invalid",
      "recording_mismatch",
      "telegram_topic_invalid",
    ].includes(e?.message);
    await deps.finish(job, {
      status: permanent || job.attempts >= 5 ? "exhausted" : "queued",
      delay: Math.min(120, 5 * 2 ** job.attempts),
      error: permanent ? e.message : "provider_fetch_failed",
    });
    return;
  }
  if (!(await deps.markSending(job))) return;
  let result;
  try {
    result = await deps.telegram(config, prepared);
  } catch {
    await deps.finish(job, { status: "uncertain", error: "telegram_transport_unknown" });
    return;
  }
  const outcome = classifyTelegram(result);
  if (outcome.status === "queued" && job.attempts >= 5) outcome.status = "exhausted";
  await deps.finish(job, outcome);
}
