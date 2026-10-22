# The delivery schedule (Vercel free plan)

Price alerts, liquidation warnings and the other notifications are checked
every five minutes. Vercel's Hobby plan only allows a cron that runs once a
day, so the five-minute tick comes from the database instead.
`0013_delivery_schedule.sql` sets this up: pg_cron runs every five minutes and
pg_net calls the API's delivery route with `CRON_SECRET`.

`vercel.json` keeps one daily run (09:00 UTC) as a fallback. Calling the route
twice is safe, because every notification is claimed once before it is sent.

## One-time setup

1. **Generate a secret** in a terminal:

   ```bash
   openssl rand -hex 32
   ```

2. **Set it in Vercel** as `CRON_SECRET`: Project → Settings → Environment
   Variables → Production, then redeploy.

3. **Apply the migration.** Paste `0013_delivery_schedule.sql` into the
   Supabase SQL editor and run it. It is safe to run again.

4. **Store the URL and the same secret in Vault**, in the SQL editor:

   ```sql
   select vault.create_secret('https://api.getelyra.xyz', 'elyra_api_url');
   select vault.create_secret('PASTE-THE-SECRET-HERE', 'elyra_cron_secret');
   ```

   To change one later, use `vault.update_secret` with its id from
   `vault.secrets`.

Until both secrets exist, the tick does nothing.

## Checking it works

```sql
-- The job is scheduled:
select jobname, schedule, active from cron.job where jobname = 'elyra-delivery';

-- Its recent runs:
select status, start_time, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'elyra-delivery')
order by start_time desc limit 5;

-- The HTTP responses from the API (200 = ran, 401 = secret mismatch):
select status_code, content::text, created
from net._http_response order by created desc limit 5;
```

## Turning it off

```sql
select cron.unschedule('elyra-delivery');
```
