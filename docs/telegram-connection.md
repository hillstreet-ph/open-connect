# Telegram bot connections

The native Telegram adapter uses the existing Open-Connect MCP gateway. It
authenticates a bot using its owner's encrypted `credential://telegram/<uuid>`
reference, resolved only on the server. Bot authentication does not use OAuth.
Telegram user-account authentication is a separate flow and is not implemented by
this adapter.

Use `configure_connection` with provider `telegram`, the saved credential reference
and the existing connection scopes. Set `telegram_destination` to an object with
the numeric supergroup `chat_id` string and positive integer `message_thread_id`.
This merges the destination into the existing connection metadata without
replacing other metadata. Configuration requires admin and `control:write`.

`list_connection_tools` exposes `telegram_bot` and `telegram_destination` with
`inbound:telegram`, and `telegram_send_message` with `messages:send`. Invoke these
through `call_connection_tool`. Sending requires admin and a provider invoke
grant. Project membership and deliberate connection assignment still apply to
project keys.

Messages accept only a `text` argument, up to 4096 characters. The saved destination
is mandatory; callers cannot override the chat or topic. Messages use plain text,
protected content and disabled link previews. The fixed Bot API host rejects
redirects, and errors do not return raw provider descriptions or tokens. A failed
topic is never retried in the general chat. Check Telegram state before retrying a
message after an ambiguous transport failure.

`telegram_destination` reads the chat and reports the configured topic ID; it does
not prove the topic exists. A live send with Telegram's returned
`message_thread_id` is the delivery check. This adapter does not replace Twilio
webhooks or the separate OTP forwarding runtime. Update and verify both
configurations when changing the OTP destination.
