# Secret-code Supabase setup

The secret code is stored as a bcrypt hash in Postgres. The browser only sends
the four-digit code to the `unlock-story` Edge Function; the service-role key
stays in Supabase and is never added to `index.html`.
The existing page is static HTML, so it calls the Edge Function with `fetch`
and does not need the Next.js Supabase SSR packages.

## Deploy

1. Create a Supabase project and install the Supabase CLI.
2. From the project folder, link the project and apply the database migration:

   ```sh
   supabase login
   supabase link --project-ref zkdoqytwsanxrhhcnbfp
   supabase db push
   ```

3. Deploy the Edge Function:

   ```sh
   supabase functions deploy unlock-story
   ```

   `supabase/config.toml` disables JWT verification for this public PIN
   endpoint. The function itself validates the code, uses the server-only
   service-role key, and limits each client to five failed attempts per
   15-minute window.

4. `index.html` is configured to call the supplied project URL with its
   publishable key. Publishable keys are intended for browser use; never put
   the service-role key in the page.

The migration seeds the initial code `0922` as a bcrypt hash. To change it,
update the `code_hash` in `public.story_gate_config` using the Supabase SQL
Editor and generate the new hash with
`extensions.crypt('YOUR_NEW_FOUR_DIGIT_CODE', extensions.gen_salt('bf'))`.

The code is stored in the database, but a four-digit PIN is still a small
secret. Rate limiting reduces guessing; it is not a substitute for account
authentication for highly sensitive content.
