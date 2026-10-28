# Micaramel

A mobile-first anniversary page with a live relationship counter and a
four-digit secret-code screen that opens a soundtrack page and a four-collection
time capsule with 40 open-when letters.
The soundtrack plays Deezer's 30-second song previews; full-song links open
Spotify.
Letters open through an animated collection grid, list drawer and reading sheet.
The memory map includes year filters, automatically positioned pins with
tap-to-place positioning, photo polaroids, and an add/edit/delete sheet.
Match highlights, cafe dates, and map memories are stored in Supabase after the
journal migration and Edge Functions are deployed. The illustrated Peninsular
Malaysia state boundaries are derived from geoBoundaries/OpenStreetMap ADM1 data
and are credited in the map; the source data is licensed under ODbL 1.0.
The matchday page includes an animated player profile, football diary cards,
and a form for adding, editing, and deleting match highlights. Match entries
and uploaded photos are stored in the shared Supabase journal after its
migrations and Edge Functions are deployed. The profile uses the provided
local portrait in `mica-football.jpg`.
The cafe diary includes six sample dates, photo galleries, and a form for
adding, editing, and deleting cafe memories; these are stored in the same
shared Supabase journal.
The periodic table page presents 16 relationship elements across four
categories, with staggered entrance animation and interactive memory-note cards.

## Run locally

Run the Next.js app:

```bash
npm install
npm run dev
```

The existing anniversary experience is preserved as a public HTML asset at
`public/index.html`; the Next.js home route opens it directly so its responsive
layout and existing interactions remain unchanged.
Protected section navigation prompts for the secret code before opening a page;
the code must be entered again after every page refresh.
This is a front-end navigation lock, not server-side content protection: the
legacy page is still a public asset, so its embedded content can be inspected.
Use server-side authorization before storing highly sensitive content there.

## Deploy to Vercel

Import this repository into Vercel and add
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the
project's environment-variable settings. `.env.local` is for local development
and is ignored by Git.

## Supabase secret-code setup

The browser verifies the PIN through the Supabase Edge Function. The Supabase
SSR helpers are available for authenticated Next.js routes; they do not replace
the PIN function. Apply the database migration and deploy the function using
the steps in [supabase/README.md](./supabase/README.md).

Do not add Supabase service-role keys or other private credentials to this
repository. The browser publishable key is intended for client-side use.
