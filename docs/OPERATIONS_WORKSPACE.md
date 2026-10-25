# Tasks, schedules, and automations

Tasks are private work records. Choose a starter suggestion or a saved template, customize the title, details, priority and optional due date/project, then create. Templates never submit the form or execute a prompt. Save a named private template from the current form and reuse it later; template names are unique per account and kind, ignoring case and surrounding spaces. Deleting a template does not delete tasks created from it.

The task list filters by status and shows priority, due time and last update. Lists refresh while open (tasks/schedules/automations every 30 seconds, AI run history every 15 seconds). Labels accompany status colors so color is not the only signal. Counts describe the loaded list, capped at 100 records.

AI response automation templates contain prompt text only. They do not automatically read live tasks, projects or connected apps. A connected free provider must be available to run the prompt; provider rate limits still apply. Agent and pipeline actions create plans, not completed external actions. Unsupported executors and triggers are disabled and also rejected by the server.

Create an enabled AI response automation before creating its schedule. Select one-time or recurring timing, a recurrence preset or five-field cron, and an IANA timezone for recurring jobs. UTC is the explicit default; Use device timezone fills the device setting. One-time fields use device-local time and must be in the future. Recurring jobs use conventional cron OR semantics when both calendar-day fields are restricted. The background runner checks every five minutes; exact-minute execution is not guaranteed.

Pause stops future claims; a run already in progress may finish. Resume computes a new future occurrence and checks the linked automation is enabled. Completed one-time schedules cannot be reactivated; create a new schedule instead. A finishing runner does not overwrite a user pause. Run results remain private in automation history.

The task loading query deliberately selects task columns without an embedded project relation: the deployed tasks.project_id has no foreign key, so PostgREST cannot infer that relationship. Project labels come from the independently authorized project list.

Database migration: `20261025165039_private_work_templates.sql`. RLS restricts templates to their owner, anonymous access is revoked, and authenticated clients may select/insert/delete. The production rollback test verified owner isolation and unique-name rejection without retaining fixtures.
