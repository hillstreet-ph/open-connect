-- Nullable topics preserve existing non-forum destinations.
alter table public.hillstreet_otp_runtime
  add column telegram_message_thread_id integer
  check (telegram_message_thread_id > 0);

alter table public.hillstreet_sms_forwarding
  add column telegram_message_thread_id integer
  check (telegram_message_thread_id > 0);

comment on column public.hillstreet_otp_runtime.telegram_message_thread_id is
  'Default Telegram forum topic for automatically enrolled forwarding numbers; NULL sends to the general chat.';
comment on column public.hillstreet_sms_forwarding.telegram_message_thread_id is
  'Telegram forum topic used by SMS, MMS and recorded voice OTP delivery; NULL sends to the general chat.';
