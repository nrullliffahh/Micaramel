# Micaramel

A mobile-first anniversary page with a live relationship counter and a
four-digit secret-code screen.

## Run locally

Serve this folder over HTTP instead of opening `index.html` directly:

```sh
npx serve .
```

## Supabase secret-code setup

The browser verifies the PIN through a Supabase Edge Function. Apply the
database migration and deploy the function using the steps in
[supabase/README.md](./supabase/README.md).

Do not add Supabase service-role keys or other private credentials to this
repository. The browser publishable key is intended for client-side use.
