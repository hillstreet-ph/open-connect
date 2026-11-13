# Tasks, schedules, and automations

Tasks are private work records. Choose a starter suggestion or a saved template, customize the title, details, priority and optional due date/project, then create. Templates never submit the form or execute a prompt. Save a named private template from the current form and reuse it later; template names are unique per account and kind, ignoring case and surrounding spaces. Deleting a template does not delete tasks created from it.

The task list filters by status and shows priority, due time and last update. Lists refresh while open (tasks/schedules/automations every 30 seconds, AI run history every 15 seconds). Labels accompany status colors so color is not the only signal. Counts describe the loaded list, capped at 100 records.

AI response automation templates contain prompt text only. They do not automatically read live tasks, projects or connected apps. A connected free provider must be available to run the prompt; provider rate limits still apply. Agent and pipeline actions create plans, not completed external actions. Unsupported executors and triggers are disabled and also rejected by the server.

Create an enabled AI response automation before creating its schedule. Select one-time or recurring timing, a recurrence preset or five-field cron, and an IANA timezone for recurring jobs. UTC is the explicit default; Use device timezone fills the device setting. One-time fields use device-local time and must be in the future. Recurring jobs use conventional cron OR semantics when both calendar-day fields are restricted. The background runner checks every five minutes; exact-minute execution is not guaranteed.

Pause stops future claims; a run already in progress may finish. Resume computes a new future occurrence and checks the linked automation is enabled. Completed one-time schedules cannot be reactivated; create a new schedule instead. A finishing runner does not overwrite a user pause. Run results remain private in automation history.

The task loading query deliberately selects task columns without an embedded project relation: the deployed tasks.project_id has no foreign key, so PostgREST cannot infer that relationship. Project labels come from the independently authorized project list.

Database migration: `20261025165039_private_work_templates.sql`. RLS restricts templates to their owner, anonymous access is revoked, and authenticated clients may select/insert/delete. The production rollback test verified owner isolation and unique-name rejection without retaining fixtures.

## Kanban and List views

Tasks opens in Board view, with To do, In progress, Blocked, Done and Cancelled columns. Each column loads up to 100 matching tasks through its own owner-filtered database query. A large completed column does not prevent older pending work from loading. Counts refer to loaded cards, not global totals. List view retains its server-side status filter.

Drag the card handle between columns with a mouse, or use the card's labeled status selector with touch or a keyboard. Both views update the same task ID. There is no second task store or external Kanban subscription. No duplicate status badge is displayed on each card. Polling can briefly return an old and a new copy of a moved card; the newest version is shown once.

Every card move includes its last-update timestamp. The server validates the status and filters by owner, ID and timestamp. A stale move fails with a refresh message rather than overwriting another tab's update. Failed moves refresh task queries; there is no optimistic success message before the server saves.

Validation suites: `task-board.test.ts`, `ops-data.server.test.ts`, `operations.test.ts`, `schedule-cron.test.ts`, `automation-model.server.test.ts` and `automation-readiness.test.ts`. The optional `supabase/tests/operations-ownership.sql` fixture checks task transitions, private templates, schedule pause/resume and owner isolation inside a transaction; callers must supply their own test-owner claims and always roll back. It does not execute an AI automation or send external messages.
