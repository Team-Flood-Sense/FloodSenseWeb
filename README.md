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
2. **Edge Functions** (`admin-users`, `bootstrap-admin`, `send-sms`). Either:
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
5. **First admin**: open the app at `/setup` (Sign In shows a link while no admin exists).
   Fill in name, email and password; the account is created in Supabase Auth and `profiles`,
   and you're taken to authenticator-app setup. `/setup` closes permanently once an admin exists.

A user who loses their authenticator can have their MFA factor removed in
Supabase → Authentication → Users, then set it up again on next sign-in.

## Roles

| Role     | Access                                                      |
|----------|-------------------------------------------------------------|
| admin    | Everything, including User Management                       |
| operator | Dashboard, sensors, SMS blast logs, evacuation alarm        |
| viewer   | Dashboard and sensors (read only)                           |

## SMS alerts

Staff (admin/operator) manage recipients on the **Residents** page. A blast or the evacuation alarm
is saved in the SMS Blast Logs and then sent by the `send-sms` function to every *active, verified*
resident in the chosen area. Status flow: `Pending` → `Sending` → `Sent` (or `Failed`).
If the Semaphore key isn't set, blasts stay `Pending` and nothing is sent.
`Sent` means Semaphore accepted the messages; delivery receipts are not tracked yet.

## Not connected yet

- **Sensor data**: dashboard metrics, the sensor table and map markers use placeholder data.
