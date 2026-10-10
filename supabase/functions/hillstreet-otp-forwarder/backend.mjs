import { ensureKobePlayVerify } from "./verify-admin.mjs";
import {
  boundedBytes,
  sid,
  desiredNumberConfig,
  eligibleNumber,
  deliverJob,
  telegramDestination,
} from "./platform.mjs";
export function createBackend({
  root,
  serviceKey,
  validate,
  background,
  now = () => new Date().toISOString(),
}) {
  async function db(path, options = {}) {
    const r = await fetch(root + "/rest/v1/" + path, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    if (!r.ok) {
      let code = "UNKNOWN";
      try {
        const body = await r.json();
        if (/^[A-Z0-9]{5,20}$/.test(body.code ?? "")) code = body.code;
      } catch {}
      throw new Error("backend_" + r.status + "_" + code);
    }
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  const query = (args) => new URLSearchParams(args).toString();
  const one = async (table, filters) =>
    (await db(table + "?" + query({ select: "*", ...filters, limit: "1" })))?.[0] ?? null;
  const runtime = (accountSid) =>
    one("hillstreet_otp_runtime", { account_sid: "eq." + accountSid });
  const configByPhone = (phoneSid) =>
    one("hillstreet_sms_forwarding", { phone_number_sid: "eq." + phoneSid });
  async function secret(userId, id) {
    const raw = await db("rpc/resolve_connection_credential", {
      method: "POST",
      body: JSON.stringify({ p_user_id: userId, p_credential_id: id }),
    });
    if (typeof raw !== "string" || !raw) throw new Error("credential_unavailable");
    return raw;
  }
  async function api(config) {
    const value = JSON.parse(await secret(config.user_id, config.api_credential_id));
    if (
      value.account_sid !== config.account_sid ||
      !sid(value.api_key_sid, "SK") ||
      typeof value.api_key_secret !== "string"
    )
      throw new Error("credential_mismatch");
    const base = "https://api.twilio.com/2010-04-01/Accounts/" + config.account_sid;
    return async (path, options = {}) => {
      if (!path.startsWith("/") || path.includes("..") || path.includes("#"))
        throw new Error("media_origin_invalid");
      const { mediaRedirect = false, ...fetchOptions } = options;
      let r = await fetch(base + path, {
        ...fetchOptions,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: "Basic " + btoa(value.api_key_sid + ":" + value.api_key_secret),
          ...(fetchOptions.headers ?? {}),
        },
      });
      if (mediaRedirect && [301, 302, 303, 307, 308].includes(r.status)) {
        const next = new URL(r.headers.get("location") ?? "", base + path);
        if (
          next.protocol !== "https:" ||
          next.hostname !== "mms.twiliocdn.com" ||
          next.username ||
          next.password ||
          next.port ||
          next.hash
        )
          throw new Error("media_origin_invalid");
        // The authenticated Twilio API supplied this signed CDN URL. Never forward API credentials.
        r = await fetch(next, { redirect: "manual", signal: AbortSignal.timeout(8000) });
      }
      if (!r.ok) throw new Error("provider_fetch_failed");
      return r;
    };
  }
  // Account resource is the account base plus .json, unlike account-relative resources.
  async function getAccount(config) {
    const value = JSON.parse(await secret(config.user_id, config.api_credential_id));
    if (value.account_sid !== config.account_sid || !sid(value.api_key_sid, "SK"))
      throw new Error("credential_mismatch");
    const r = await fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" + config.account_sid + ".json",
      {
        headers: { Authorization: "Basic " + btoa(value.api_key_sid + ":" + value.api_key_secret) },
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!r.ok) throw new Error("provider_fetch_failed");
    return r.json();
  }
  const patch = async (table, filters, data) =>
    db(table + "?" + query({ ...filters, select: "*" }), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
  async function wake(accountSid) {
    const run = async () => {
      try {
        const r = await runtime(accountSid);
        if (!r) return;
        const token = await secret(r.user_id, r.worker_credential_id);
        await fetch(r.worker_url, {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ account_sid: accountSid }),
          redirect: "manual",
          signal: AbortSignal.timeout(60000),
        });
      } catch {
        /* Scheduled recovery remains active. */
      }
    };
    background(run());
  }
  const ingress = {
    validate,
    now,
    secret,
    account: getAccount,
    configByPhone,
    configByNumber: (accountSid, to) =>
      one("hillstreet_sms_forwarding", {
        account_sid: "eq." + accountSid,
        to_number: "eq." + to,
        enabled: "eq.true",
      }),
    findCall: (callSid) => one("hillstreet_otp_calls", { call_sid: "eq." + callSid }),
    saveCall: (record) =>
      db("hillstreet_otp_calls", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify(record),
      }),
    enqueue: (phoneSid, key, kind, payload) =>
      db("rpc/hillstreet_enqueue_otp", {
        method: "POST",
        body: JSON.stringify({
          p_phone_number_sid: phoneSid,
          p_event_key: key,
          p_kind: kind,
          p_payload: payload,
        }),
      }),
    legacyDelivered: async (phoneSid, messageSid) =>
      Boolean(
        await one("hillstreet_sms_deliveries", {
          phone_number_sid: "eq." + phoneSid,
          message_sid: "eq." + messageSid,
          status: "eq.delivered",
        }),
      ),
    wake: (accountSid) => {
      void wake(accountSid);
    },
  };
  async function reconcile(r, lease) {
    let stage = "credentials";
    try {
      const request = await api(r);
      stage = "account";
      const acc = await getAccount(r),
        numbers = [];
      stage = "number_list";
      let path = "/IncomingPhoneNumbers.json?PageSize=100";
      for (let page = 0; path && page < 20; page++) {
        const data = await (await request(path)).json();
        numbers.push(...(data.incoming_phone_numbers ?? []));
        if (data.next_page_uri) {
          const prefix = "/2010-04-01/Accounts/" + r.account_sid;
          if (!data.next_page_uri.startsWith(prefix + "/IncomingPhoneNumbers.json?"))
            throw new Error("pagination_invalid");
          path = data.next_page_uri.slice(prefix.length);
        } else path = null;
      }
      if (path) throw new Error("inventory_incomplete");
      for (const number of numbers) {
        stage = "lease";
        const held = await patch(
          "hillstreet_otp_runtime",
          { account_sid: "eq." + r.account_sid, lease_token: "eq." + lease },
          { lease_until: new Date(Date.now() + 75000).toISOString() },
        );
        if (held.length !== 1) throw new Error("worker_lease_lost");
        if (!sid(number.sid, "PN") || number.account_sid !== r.account_sid)
          throw new Error("number_account_mismatch");
        stage = "existing_config";
        const existing = await configByPhone(number.sid);
        const adopt = eligibleNumber(number, existing, r);
        if (existing && (existing.user_id !== r.user_id || existing.account_sid !== r.account_sid))
          throw new Error("number_owner_mismatch");
        let state = "review_required",
          error = null;
        if (
          adopt &&
          (number.sms_application_sid || number.voice_application_sid || number.trunk_sid)
        ) {
          state = "review_required_application_binding";
        } else if (adopt) {
          const desired = desiredNumberConfig(number, r, acc);
          const record = {
            phone_number_sid: number.sid,
            user_id: r.user_id,
            account_sid: r.account_sid,
            to_number: number.phone_number,
            auth_token_credential_id: r.auth_token_credential_id,
            bot_credential_id: r.bot_credential_id,
            api_credential_id: r.api_credential_id,
            telegram_chat_id: r.telegram_chat_id,
            telegram_message_thread_id: r.telegram_message_thread_id ?? null,
            canonical_url: r.function_base_url,
            enabled: desired.sms || desired.voice,
            voice_enabled: desired.voice,
            updated_at: now(),
          };
          // Existing explicit disable is an operator decision; never silently reactivate it.
          if (!desired.sms && !desired.voice) {
            state =
              acc.type === "Trial" && number.capabilities?.voice
                ? "voice_pending_paid_account"
                : "unsupported_capabilities";
          } else if (existing && !existing.enabled) {
            state = "disabled_by_operator";
          } else {
            stage = "config_save";
            await db("hillstreet_sms_forwarding", {
              method: "POST",
              headers: { Prefer: "resolution=merge-duplicates" },
              body: JSON.stringify(record),
            });
            const fields = {
              SmsUrl: "sms_url",
              SmsMethod: "sms_method",
              SmsFallbackUrl: "sms_fallback_url",
              SmsFallbackMethod: "sms_fallback_method",
              VoiceUrl: "voice_url",
              VoiceMethod: "voice_method",
              VoiceFallbackUrl: "voice_fallback_url",
              VoiceFallbackMethod: "voice_fallback_method",
            };
            const changed = Object.entries(desired.body).some(([k, v]) => number[fields[k]] !== v);
            if (changed) {
              stage = "provider_update";
              await request("/IncomingPhoneNumbers/" + number.sid + ".json", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams(desired.body),
              });
              stage = "provider_readback";
              const saved = await (
                await request("/IncomingPhoneNumbers/" + number.sid + ".json")
              ).json();
              if (Object.entries(desired.body).some(([k, v]) => saved[fields[k]] !== v))
                throw new Error("number_readback_failed");
            }
            state = desired.voice
              ? desired.sms
                ? "sms_and_voice_configured"
                : "voice_configured"
              : acc.type === "Trial" && r.voice_requested && number.capabilities?.voice
                ? "sms_configured_voice_trial_gate"
                : "sms_configured";
          }
        }
        stage = "inventory_save";
        await db("hillstreet_otp_number_inventory", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            phone_number_sid: number.sid,
            account_sid: r.account_sid,
            phone_number: number.phone_number,
            friendly_name: number.friendly_name ?? "",
            capabilities: number.capabilities ?? {},
            onboarding_state: state,
            last_error: error,
            observed_at: now(),
          }),
        });
      }
      stage = "complete";
      await patch(
        "hillstreet_otp_runtime",
        { account_sid: "eq." + r.account_sid },
        { account_type: acc.type, last_reconciled_at: now(), last_reconcile_error: null },
      );
      return numbers.length;
    } catch (e) {
      const safe = /^backend_[0-9]{3}_[A-Z0-9]{5,20}$/.test(e?.message ?? "")
        ? e.message
        : (e?.name ?? "Error");
      throw new Error("reconcile_" + stage + "_" + safe);
    }
  }
  async function prepare(job, config) {
    const p = job.payload;
    const destination = telegramDestination(config);
    const botRaw = await secret(config.user_id, config.bot_credential_id);
    const botToken = botRaw.trim().startsWith("{") ? JSON.parse(botRaw).credential : botRaw;
    if (typeof botToken !== "string" || !botToken) throw new Error("credential_format");
    const label = `HillStreet incoming ${job.kind === "audio" ? "voice OTP" : "SMS"}\nNumber: ${p.to}\nFrom: ${String(p.from).slice(0, 100)}\nReceived: ${p.receivedAt}`;
    if (job.kind === "sms")
      return {
        botToken,
        method: "sendMessage",
        data: {
          ...destination,
          text:
            label +
            "\n\n" +
            [...p.body].slice(0, 3500).join("") +
            (p.body.length > 3500 ? "\n[Text shortened]" : ""),
          protect_content: true,
          disable_web_page_preview: true,
        },
      };
    const request = await api(config);
    let response;
    if (job.kind === "audio") {
      if (!sid(p.recordingSid, "RE") || !sid(p.callSid, "CA"))
        throw new Error("recording_mismatch");
      const info = await (await request("/Recordings/" + p.recordingSid + ".json")).json();
      if (
        info.account_sid !== config.account_sid ||
        info.call_sid !== p.callSid ||
        info.status !== "completed"
      )
        throw new Error("recording_mismatch");
      response = await request("/Recordings/" + p.recordingSid + ".mp3");
    } else {
      if (!sid(p.messageSid, "SM") || !sid(p.mediaSid, "ME"))
        throw new Error("media_origin_invalid");
      response = await request("/Messages/" + p.messageSid + "/Media/" + p.mediaSid, {
        mediaRedirect: true,
      });
    }
    const bytes = await boundedBytes(response);
    const type =
      job.kind === "audio"
        ? "audio/mpeg"
        : (response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream");
    const form = new FormData();
    for (const [name, value] of Object.entries(destination)) form.set(name, String(value));
    form.set("protect_content", "true");
    form.set("caption", label);
    form.set(
      job.kind === "audio" ? "audio" : "document",
      new Blob([bytes], { type }),
      job.kind === "audio" ? "voice-otp.mp3" : "sms-attachment",
    );
    return { botToken, method: job.kind === "audio" ? "sendAudio" : "sendDocument", data: form };
  }
  async function telegram(config, prepared) {
    const token = prepared.botToken;
    if (typeof token !== "string") throw new Error("credential_format");
    const multipart = prepared.data instanceof FormData;
    const r = await fetch("https://api.telegram.org/bot" + token + "/" + prepared.method, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: multipart ? {} : { "Content-Type": "application/json" },
      body: multipart ? prepared.data : JSON.stringify(prepared.data),
    });
    return r.json();
  }
  async function finish(job, result) {
    const done = result.status !== "queued";
    const rows = await patch(
      "hillstreet_otp_jobs",
      {
        id: "eq." + job.id,
        claim_token: "eq." + job.claim_token,
        status: "in.(preparing,sending)",
      },
      {
        status: result.status,
        available_at: new Date(Date.now() + 1000 * (result.delay ?? 0)).toISOString(),
        ...(done ? { payload_ciphertext: null } : {}),
        telegram_message_id: result.messageId ?? null,
        error_category: result.error ?? null,
        updated_at: now(),
      },
    );
    if (rows.length !== 1) throw new Error("delivery_state_conflict");
    if (result.error === "telegram_rate_limited" && result.delay > 0) {
      const config = await configByPhone(job.phone_number_sid);
      await patch(
        "hillstreet_otp_runtime",
        { account_sid: "eq." + config.account_sid },
        { next_send_at: new Date(Date.now() + 1000 * result.delay).toISOString() },
      );
    }
  }
  async function worker(req) {
    if (req.method !== "POST") return new Response("Unauthorized", { status: 405 });
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!/^[0-9a-f]{64}$/.test(token ?? "")) return new Response("Unauthorized", { status: 401 });
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(await boundedBytes(req, 2048)));
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (!sid(body.account_sid, "AC")) return new Response("Bad request", { status: 400 });
    let r;
    try {
      r = await runtime(body.account_sid);
    } catch {
      return new Response("Unavailable", { status: 503 });
    }
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    let diff = 0;
    for (let i = 0; i < 64; i++)
      diff |= digest.charCodeAt(i) ^ (r?.worker_key_hash ?? "").charCodeAt(i);
    if (!r || diff || r.worker_key_hash.length !== 64)
      return new Response("Unauthorized", { status: 401 });
    let lease;
    try {
      lease = await db("rpc/hillstreet_acquire_otp_worker", {
        method: "POST",
        body: JSON.stringify({ p_account_sid: r.account_sid }),
      });
    } catch {
      return new Response("Unavailable", { status: 503 });
    }
    if (!lease) return Response.json({ status: "worker_busy" });
    if (body.provision_verify === true) {
      try {
        const bundle = JSON.parse(await secret(r.user_id, r.api_credential_id));
        if (bundle.account_sid !== r.account_sid || !sid(bundle.api_key_sid, "SK"))
          throw new Error("credential_mismatch");
        const service = await ensureKobePlayVerify(async (path, options = {}) => {
          if (!/^\/Services(?:\?PageSize=100|\/[V]A[0-9a-f]{32})?$/.test(path)) {
            const url = new URL("https://verify.twilio.com/v2" + path);
            if (url.pathname !== "/v2/Services" || !url.searchParams.has("PageToken"))
              throw new Error("verify_path_invalid");
          }
          const response = await fetch("https://verify.twilio.com/v2" + path, {
            ...options,
            headers: {
              Authorization: "Basic " + btoa(bundle.api_key_sid + ":" + bundle.api_key_secret),
              ...(options.headers ?? {}),
            },
            redirect: "manual",
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error("verify_http_" + response.status);
          return response.json();
        });
        const connection = await one("app_connections", {
          user_id: "eq." + r.user_id,
          provider: "eq.twilio",
        });
        if (!connection) throw new Error("verify_connection_missing");
        await patch(
          "app_connections",
          { id: "eq." + connection.id, user_id: "eq." + r.user_id },
          {
            metadata: {
              ...(connection.metadata ?? {}),
              kobeplay_verify: {
                ...service,
                purpose: "player_registration",
                integration_status: "backend_wiring_required",
                configured_at: now(),
                separate_from_telegram_forwarding: true,
              },
            },
          },
        );
        return Response.json({
          status: "configured",
          verify: service,
          backend_wiring_required: true,
        });
      } catch (e) {
        return Response.json(
          {
            status: "failed",
            error: /^verify_[a-z_]+(?:_[0-9]{3})?$/.test(e?.message ?? "")
              ? e.message
              : "verify_configuration_failed",
          },
          { status: 503 },
        );
      } finally {
        await patch(
          "hillstreet_otp_runtime",
          { account_sid: "eq." + r.account_sid, lease_token: "eq." + lease },
          { lease_token: null, lease_until: null },
        );
      }
    }
    let processed = 0,
      reconciled = null;
    const started = Date.now();
    try {
      while (processed < 5 && Date.now() - started < 40000) {
        // One worker lease per account; at least 3.1 seconds between group sends.
        const current = await runtime(r.account_sid);
        const pause = Math.max(0, Date.parse(current.next_send_at) - Date.now());
        if (pause > 45000 - (Date.now() - started)) break;
        if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
        const job = await db("rpc/hillstreet_claim_otp_job", {
          method: "POST",
          body: JSON.stringify({ p_account_sid: r.account_sid }),
        });
        if (!job) break;
        const held = await patch(
          "hillstreet_otp_runtime",
          { account_sid: "eq." + r.account_sid, lease_token: "eq." + lease },
          { lease_until: new Date(Date.now() + 75000).toISOString() },
        );
        if (held.length !== 1) throw new Error("worker_lease_lost");
        const config = await configByPhone(job.phone_number_sid);
        if (!config?.enabled) {
          await finish(job, { status: "exhausted", error: "forwarding_disabled" });
          continue;
        }
        await deliverJob(job, config, {
          prepare,
          telegram,
          finish,
          markSending: async (j) => {
            const rows = await patch(
              "hillstreet_otp_jobs",
              {
                id: "eq." + j.id,
                claim_token: "eq." + j.claim_token,
                status: "eq.preparing",
                expires_at: "gt." + now(),
              },
              { status: "sending", updated_at: now() },
            );
            if (rows.length !== 1) return false;
            await patch(
              "hillstreet_otp_runtime",
              { account_sid: "eq." + r.account_sid, lease_token: "eq." + lease },
              {
                next_send_at: new Date(Date.now() + 3100).toISOString(),
                lease_until: new Date(Date.now() + 75000).toISOString(),
              },
            );
            return true;
          },
        });
        processed++;
      }
      if (
        Date.now() - started < 20000 &&
        (body.reconcile === true ||
          !r.last_reconciled_at ||
          Date.now() - Date.parse(r.last_reconciled_at) > 300000)
      ) {
        try {
          reconciled = await reconcile(r, lease);
        } catch (e) {
          const allowed = [
            "backend_unavailable",
            "provider_fetch_failed",
            "credential_mismatch",
            "pagination_invalid",
            "inventory_incomplete",
            "number_owner_mismatch",
            "number_readback_failed",
            "worker_lease_lost",
            "number_account_mismatch",
          ];
          await patch(
            "hillstreet_otp_runtime",
            { account_sid: "eq." + r.account_sid },
            {
              last_reconcile_error:
                allowed.includes(e?.message) ||
                /^reconcile_[a-z_]+_(?:Error|TypeError|SyntaxError|ReferenceError|backend_[0-9]{3}_[A-Z0-9]{5,20})$/.test(
                  e?.message ?? "",
                )
                  ? e.message
                  : "provider_reconciliation_failed",
            },
          );
        }
      }
      return Response.json({ status: "ok", processed, reconciled_numbers: reconciled });
    } catch {
      return new Response("Worker unavailable", { status: 503 });
    } finally {
      try {
        await patch(
          "hillstreet_otp_runtime",
          { account_sid: "eq." + r.account_sid, lease_token: "eq." + lease },
          { lease_token: null, lease_until: null },
        );
      } catch {}
    }
  }
  return { ingress, worker };
}
