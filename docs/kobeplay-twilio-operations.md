# KobePlay Twilio and Telegram operations

## Verified deployment on 10 October 2026

- Twilio account: read the account SID from the authenticated connection, Full, active.
- Dedicated player Verify service: read the service SID from the private connection metadata, name `KobePlay`, six-digit codes, Twilio-generated codes, Lookup and landline skipping enabled, do-not-share warning enabled.
- Internal Telegram number: read the number and number SID from the authenticated inventory, name `HillStreet / OTP Telegram - Test 1`.
- SMS webhook: `https://huadtiuuoiriqrjpjxhr.supabase.co/functions/v1/hillstreet-otp-forwarder`.
- Voice webhook: the same base plus `/voice`. Twilio signs requests and the function validates the signature against the credential vault.
- Worker: `hillstreet-otp-worker`, authenticates its own vault-backed key. Recovery runs every minute. Forwarding payloads are encrypted in the queue and cleared after terminal delivery outcomes.
- Composio and the existing ChatGPT Open-Connect plugin successfully executed `twilio_account` through the same gateway. No new plugin installation is required for these existing account/number/message/call tools.
- Composio skill: `kobeplay-twilio-operations-c783a0c67d16`. Open-Connect toolkit: `KobePlay Twilio & Telegram Operations`. Instructions are private metadata; they do not grant additional executable tools.

The dedicated Verify service is stored in the owned Twilio connection's `metadata.kobeplay_verify`. Creating a service does not connect the KobePlay registration backend.

## Player registration backend integration still required

The accessible `hillstreet-ph/open-kobeplay` repository must be inspected before treating it as the production player backend. Do not assume the agency portal implements kobeplay.com player signup.

Configure the real registration server to resolve the existing Twilio API credential securely. Do not put its secret in frontend JavaScript, a URL, documentation, or a Telegram message.

1. Normalize the phone to E.164. Bind it to a server-owned registration attempt. Apply destination permissions, bot checks, resend cooldown, and per-phone/IP/device budgets before sending.
2. Send a code server-to-server with `POST https://verify.twilio.com/v2/Services/{ServiceSid}/Verifications`, form fields `To`, `Channel=sms`, `RiskCheck=enable`.
3. Check the submitted code using `POST https://verify.twilio.com/v2/Services/{ServiceSid}/VerificationCheck`, form fields `To` and `Code`. Only provider status `approved` passes.
4. Persist approval against that exact phone and registration attempt with expiry and one-time consumption. Creating the player and consuming approval must be atomic.
5. After the player creation transaction commits, emit an idempotent registration success event. Notify the chosen business group with the player ID, time and masked phone, never the verification code. Group selection for player success notifications remains unconfirmed.
6. Exercise correct, incorrect, expired, replayed and rate-limited cases on the actual application. Confirm real SMS delivery to a user-provided test phone before declaring signup operational.

No public SMS proxy was deployed. Fraud Guard's Console settings and destination permissions require an account administrator check; they are not inferred from the generic Service API response.

## Internal Telegram number workflow

Forum destinations use `telegram_message_thread_id` on both the account runtime and the per-number forwarding configuration. Reconciliation copies the runtime default to enrolled numbers. SMS JSON and audio/document multipart sends all include Telegram's `message_thread_id`. A configured invalid topic fails without sending sensitive content to the general chat. Verify the topic with a harmless message and provider response before updating live routing. Keep group and topic IDs in private operational configuration.

Existing forwarding is independent of player Verify. Incoming text/MMS is queued; voice records the inbound track and forwards protected audio after the recording completes. It is not a live Telegram voice bridge or transcription service.

For future numbers, purchase only after number suitability and cost are resolved. Set the friendly name prefix `HillStreet / OTP`; the existing worker automatically enrolls matching numbers and verifies webhook readback. It preserves explicitly disabled numbers and avoids numbers assigned to TwiML applications or trunks.

Telegram chooses login-code delivery. Twilio sees only actual SMS/calls sent to the number. A bot cannot read a user's private Telegram login messages or register a user account. In-app codes require an authorized user session, such as the existing Open-TGate account connection. No real Telegram signup acceptance or real inbound voice delivery has been verified.

## Admin invitation request

Requested Twilio organization: **KobePlay Organization**.

| Email                                                                     | Requested role | Current evidence                |
| ------------------------------------------------------------------------- | -------------- | ------------------------------- |
| First requested administrator (recorded in the private operations skill)  | Administrator  | Invitation not sent or verified |
| Second requested administrator (recorded in the private operations skill) | Administrator  | Invitation not sent or verified |

Inspect the actual Twilio organization and current membership through its authorized organization admin interface. The connected account API and documentation MCP do not expose an authenticated invitation action. Do not replace these invitations with unrelated Open-Connect memberships.

## Operations and validation

`provision_verify=true` on an authenticated worker request reconciles the dedicated service under the account lease, preserves legacy services, verifies provider readback and saves public metadata. Repeating it finds the existing KobePlay service. Multiple same-name services stop provisioning for review.

Use `hillstreet_otp_delivery_status` for redacted delivery state, `hillstreet_otp_number_inventory` for onboarding state, and `hillstreet_otp_runtime.last_reconcile_error` for worker health. Keep synthetic queue tests distinct from actual carrier delivery. Unknown Telegram transport outcomes are marked uncertain rather than blindly resent.

Run `bun run lint`, `bun run test`, `bun run typecheck`, `bun run build`, and `bun run test:ssr`. The OTP suite checks separate service creation, repeat setup, duplicate detection, untrusted pagination, readback, authentication, safe metadata persistence and future-number boundaries.
