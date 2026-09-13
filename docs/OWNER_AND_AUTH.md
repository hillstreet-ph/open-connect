# Owner & Auth — Open Connect

**Domain:** https://open-connect.site  
**Supabase:** gnqpwewbgldonarggzax  
**Intended owner email:** `tanauancharles1@gmail.com`

## Login routes (no duplicate pages)

| URL | Behavior |
|-----|----------|
| `/login` | Redirects to `/auth` (canonical) |
| `/auth` | Sign in / sign up / reset |

Email + password works when Supabase Auth email provider is enabled.

## GitHub sign-in (required for “Continue with GitHub”)

UI already calls `supabase.auth.signInWithOAuth({ provider: "github" })`.

**Until configured, GitHub button fails** — enable in Supabase:

1. [GitHub Developer Settings](https://github.com/settings/developers) → New OAuth App  
   - Homepage: `https://open-connect.site`  
   - Callback: `https://gnqpwewbgldonarggzax.supabase.co/auth/v1/callback`
2. Supabase Dashboard → Authentication → Providers → **GitHub** → enable  
   - Client ID + Client Secret from the OAuth App
3. Authentication → URL configuration  
   - Site URL: `https://open-connect.site`  
   - Redirect allow list: `https://open-connect.site/**`, `https://open-connect.site/auth`, localhost if needed

Same pattern for Google if desired.

## Make tanauancharles1@gmail.com platform Owner

After the user exists in `auth.users` (sign up once with email or GitHub):

```sql
-- Platform role (legacy user_roles used by useRoles / admin UI)
insert into public.user_roles (user_id, role)
select id, 'owner'::public.app_role
from auth.users
where email = 'tanauancharles1@gmail.com'
on conflict do nothing;

-- Ensure owner role present even if row exists as user
update public.user_roles ur
set role = 'owner'
from auth.users u
where ur.user_id = u.id and u.email = 'tanauancharles1@gmail.com';

-- Org membership: set HillStreet (or primary org) member role to owner
update public.organization_members om
set role = 'owner'
from auth.users u
where om.user_id = u.id and u.email = 'tanauancharles1@gmail.com';
```

If no org membership exists, create org + membership in the UI after login, then re-run the org update.

**Service role** may be required for `auth.users` reads in SQL editor.

## Free OpenRouter models (gateway)

| Client model id | Resolves to |
|-----------------|-------------|
| `open-connect/free` / `free` / `open-connect/auto-free` | `openrouter/free` (OpenRouter free auto-router) |
| `open-connect/free-rotate` / `free-rotate` | Round-robin across `:free` pool |
| Any `*:free` id | Passed through |

Free-tier limits (OpenRouter): ~20 RPM; 50 or 1000 RPD depending on ≥$10 lifetime credits.

## Common login bugs

| Symptom | Cause | Fix |
|---------|--------|-----|
| GitHub button error | Provider disabled | Enable GitHub OAuth in Supabase |
| Redirect loop | Wrong Site URL | Set Site URL to open-connect.site |
| Session but no owner UI | Missing `user_roles.owner` | Run SQL above |
| Duplicate /login vs /auth | Intentional redirect | Use `/auth` only in links |
