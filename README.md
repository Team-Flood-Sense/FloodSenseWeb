# FloodSense Command Center

Web dashboard for the FloodSense flood-monitoring system (Barangay Pamplona 3, Las Piñas City).
React + Vite frontend with a Supabase backend (Auth, Postgres, Realtime, Edge Functions).

## Running locally

1. `npm install`
2. Create `.env.local`:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
3. `npm run dev`

`npm run build` type-checks (`tsc`) and then builds to `dist/`.

## Supabase setup (project `bgnqqjaipcckqgzzdtxy`)

1. **Database**: open the [SQL Editor](https://supabase.com/dashboard/project/bgnqqjaipcckqgzzdtxy/sql/new),
   paste all of `supabase/setup-all.sql`, and run it.
2. **Edge Functions** (`admin-users`, `bootstrap-admin`, `send-sms`, `send-email`). Either:
   - CLI: `npx supabase login`, then `npx supabase link --project-ref bgnqqjaipcckqgzzdtxy`, then
     `npx supabase functions deploy <name>` for each; or
   - Dashboard: [Edge Functions](https://supabase.com/dashboard/project/bgnqqjaipcckqgzzdtxy/functions) →
     create each function, paste the code from `supabase/functions/<name>/index.ts`, and turn **off**
     "Verify JWT".
3. **Auth settings** ([Authentication](https://supabase.com/dashboard/project/bgnqqjaipcckqgzzdtxy/auth/providers)):
   - Turn off "Allow new users to sign up" (accounts are created by admins).
   - Make sure Multi-Factor → TOTP (authenticator app) is enabled.
   - URL Configuration: add your local and Vercel URLs (needed for password-reset links).
4. **SMS (Semaphore)**: in [Edge Functions → Secrets](https://supabase.com/dashboard/project/bgnqqjaipcckqgzzdtxy/functions/secrets)
   add `SEMAPHORE_API_KEY` (required) and optionally `SEMAPHORE_SENDER_NAME` (must be approved by
   Semaphore). The key is only ever read by the `send-sms` function, never by the website.
5. **Email**: in the same Secrets page, pick one provider:
   - **Gmail (no domain needed)**: set `GMAIL_USER` (your Gmail address) and `GMAIL_APP_PASSWORD`
     (Google Account -> Security -> 2-Step Verification -> App passwords). Limit about 500
     recipients/day; residents are sent a BCC copy so they can't see each other's addresses.
   - **Brevo**: create a free [Brevo](https://www.brevo.com) account, verify a sender or
     authenticate a domain, then set `BREVO_API_KEY` and `EMAIL_SENDER_EMAIL`.
   Gmail is used when both Gmail secrets exist; otherwise Brevo. `EMAIL_SENDER_NAME` is optional.
6. **First admin**: open the app at `/setup` (Sign In shows a link while no admin exists).
   Fill in name, email and password; the account is created in Supabase Auth and `profiles`,
   and you're taken to authenticator-app setup. `/setup` closes permanently once an admin exists.

A user who loses their authenticator can have their MFA factor removed in
Supabase → Authentication → Users, then set it up again on next sign-in.

## Sensors (ESP32 / ESP8266)

1. Run `supabase/migrations/20261024000000_sensors.sql` in the SQL Editor (already included in `setup-all.sql`).
2. Get the device key: `select ingest_key from public.sensor_settings;`
3. In `firmware/floodsense_sensor/`, copy `secrets.example.h` to `secrets.h` and fill in Wi-Fi, the Supabase
   URL and publishable key, and the device key. Set `MOUNT_HEIGHT_CM` in the `.ino`, then flash it with the Arduino IDE.
4. The sensor registers itself on its first reading and appears on **Sensor Status** and the Dashboard's
   Water Level card within seconds. It shows *Offline* after 2 minutes of silence and *Warning* at or above its
   `warn_level` (default 30 cm; edit in the `sensors` table).

### Analytics reports

The **Analytics** tab builds weekly, monthly and yearly flood reports (filter by area, sensor and level; export
CSV or print/save as PDF). Run `supabase/migrations/20261026000000_sensor_daily_stats.sql` first: raw readings are
kept for only 7 days, so every reading also updates a per-day summary (`sensor_daily_stats`) that the reports use.
A day counts as *Warning* / *Danger* when a sensor's peak reaches its `warn_level` / `danger_level` (defaults
30 / 60 cm). Reports only cover time since sensors started reporting. Admins can clear test data with
`delete from public.sensor_daily_stats;`.

Set `SIMULATE_READINGS` to `1` to send fake readings and test the website with no sensor attached.

## Roles

| Role     | Access                                                      |
|----------|-------------------------------------------------------------|
| admin    | Everything, including User Management                       |
| operator | Dashboard, sensors, alert logs, residents, evacuation alarm |
| viewer   | Dashboard and sensors (read only)                           |

## SMS and email alerts

Staff (admin/operator) manage recipients on the **Residents** page: each resident can have a mobile
number, an email, or both. When composing an alert, tick **SMS**, **Email**, **App** or any mix. The alert is
saved in the **Alert Logs** and then sent by the `send-sms` (Semaphore) and/or `send-email` (Brevo)
function to every *active, verified* resident in the chosen area who has that contact detail. The
evacuation alarm always uses all three channels.
The **App** channel adds the alert to the mobile app's alert list (its `alerts` table), and the app's own
trigger pushes it to every registered phone (not per area).

Each channel has its own status in the log: `Pending` -> `Sending` -> `Sent` (or `Failed`).
If a provider's key isn't set, that channel stays `Pending` and nothing is sent on it.
`Sent` means the provider accepted the messages; delivery receipts are not tracked yet.
Alerts can be deleted from the log (tick rows for bulk delete). Admins can delete any alert that isn't
mid-send; operators only alerts where nothing was delivered. Deletions are kept in the audit log.

## Website and mobile app share one project

- Residents who register in the app are saved in the same `residents` table. The database keeps the
  app's columns (`full_name`, `phone_number`) and the website's (`name`, `phone`) in step, and merges an
  app registration into a resident staff already added (same email or phone) instead of rejecting it.
- Only accounts created on the website (User Management or `/setup`) get a staff profile. Do not add
  staff through the Supabase dashboard's "Add user"; they would have no profile.

## Not connected yet

- **Sensor data**: dashboard metrics, the sensor table and map markers use placeholder data.
