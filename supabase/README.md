# Secret-code Supabase setup

The secret code is stored as a bcrypt hash in Postgres. The browser only sends
the four-digit code to the `unlock-story` Edge Function; the service-role key
stays in Supabase and is never added to `index.html`.
The anniversary experience is served as a standalone HTML asset from
`public/index.html`. The `unlock-story` Edge Function verifies the PIN and
returns a short-lived signed journal session. The `story-journal` Edge Function
uses that session to read and save map pins, match highlights, and cafe dates.
The signed session is held only in page memory, so refreshing the page requires
entering the secret code again.
Journal photos are uploaded individually to the `story-journal-photos` Storage
bucket; journal rows keep only their photo URLs instead of embedding image data.
The Edge Function accepts individual uploads up to 8 MB, subject to the
project's Supabase Storage quota.
The Next.js Supabase SSR helpers support Auth sessions for server-rendered
routes; they are separate from this PIN-based journal session.

For local Next.js development, copy `.env.example` to `.env.local`. Set the
same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
variables in Vercel before deploying. Publishable keys are intended for
browser use; never put the service-role key in the page or environment variables
prefixed with `NEXT_PUBLIC_`.

## Deploy

1. Create a Supabase project and install the Supabase CLI.
2. From the project folder, link the project and apply the database migrations:

   ```sh
   supabase login
   supabase link --project-ref zkdoqytwsanxrhhcnbfp
   supabase db push
   ```

3. Deploy both Edge Functions after applying the migrations:

   ```sh
   supabase functions deploy unlock-story
   supabase functions deploy story-journal
   ```

   `supabase/config.toml` disables Supabase JWT verification for these
   endpoints. `unlock-story` validates the code, uses the server-only
   service-role key, and limits each client to five failed attempts per
   15-minute window. `story-journal` accepts only short-lived tokens signed by
   `unlock-story` and uses the service-role key server-side for journal and
   photo access. The journal tables have RLS enabled and do not grant direct
   browser access.

4. `public/index.html` is configured to call the supplied project URL with its
   publishable key. Publishable keys are intended for browser use; never put
   the service-role key in the page.

The migration seeds the initial code `0922` as a bcrypt hash. To change it,
update the `code_hash` in `public.story_gate_config` using the Supabase SQL
Editor and generate the new hash with
`extensions.crypt('YOUR_NEW_FOUR_DIGIT_CODE', extensions.gen_salt('bf'))`.

The code is stored in the database, but a four-digit PIN is still a small
secret. Rate limiting reduces guessing; it is not a substitute for account
authentication for highly sensitive content.
