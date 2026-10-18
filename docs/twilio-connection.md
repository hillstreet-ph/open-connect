# Twilio connections

Twilio connections execute through the existing Open-Connect MCP gateway. Use
`inspect_connections` with provider `twilio`, then `list_connection_tools` with
the returned connection ID. Invoke the discovered names through
`call_connection_tool`. Composio can use the same gateway tools; no credentials
belong in tool arguments or the client.

## Credential and scopes

Store a JSON bundle in the authenticated owner's encrypted Credentials vault:

- `account_sid`: provider-issued account SID
- `api_key_sid`: provider-issued API key SID
- `api_key_secret`: corresponding API key secret

Bind its `credential://twilio/<credential-item-uuid>` reference through
`configure_connection`. The executor resolves this reference for the connection
owner, then fixes every destination to the connected account under
`https://api.twilio.com/2010-04-01/Accounts/`. An account Auth Token is not needed
for these API-key calls. Keep webhook Auth Tokens separately in secure storage.

Grant only the required connection scopes: `account:read`, `phone-numbers:read`,
`phone-numbers:write`, `messages:read`, `messages:write`, `calls:read`, or
`calls:write`. Discovery filters tools by these grants; requests enforce the
specific resource's scope again before resolving a credential.

## Operations

Read tools: `twilio_account`, `twilio_phone_numbers`, `twilio_messages`, and
`twilio_calls`. List tools accept a string-valued `query` object with documented
Twilio filters and pagination parameters. Default page size is 50, maximum 1000.
Use `next_page_uri` query parameters to retrieve subsequent pages; never forward
credentials to a URI returned by a provider.

`twilio_request` accepts POST or DELETE, an account-relative `path`, and optional
string-valued form `body`. Supported collections are IncomingPhoneNumbers,
Messages and Calls, including their matching individual resource SIDs. It cannot
access credential-management endpoints, switch accounts or change the API host.
Account mutation is excluded. Purchase and DELETE requests require
`arguments.confirm=true`. To update a number without sending a message, POST
its IncomingPhoneNumbers/PN resource with only the desired configuration fields.

Native Twilio writes require both admin role (including the canonical Owner
hierarchy) and control/invoke scope. Custom MCP writes retain their existing
project-scoped authorization requirement. Existing project membership and sharing
checks apply to Twilio project connections as well.

The server removes reusable authentication fields from provider responses and
redacts the resolved key secret if reflected in a string. HTTP errors expose
status and numeric Twilio error code, not raw provider messages. Writes are not
automatically retried after a timeout: check provider state first.

## Validation

Run the repository lint, test, build and SSR checks. Live acceptance requires a
successful account call through `call_connection_tool`, number listing, an
authorized reversible configuration update and readback. Verify delivery
separately if required: successful REST access does not prove SMS delivery or
Telegram acceptance. Trial restrictions and provider charges remain in force.
