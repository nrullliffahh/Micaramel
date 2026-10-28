# Micaramel

A mobile-first anniversary page with a live relationship counter and a
four-digit secret-code screen that opens a soundtrack page and a four-collection
time capsule with 40 open-when letters.
The soundtrack plays 30-second song previews in the page; full-song links open
Spotify.
Letters open through an animated collection grid, list drawer and reading sheet.
The memory map includes year filters, positioned pins, photo polaroids, and an
add/edit/delete sheet. Memory changes and uploaded photos are kept in page state
for the current visit. The illustrated Peninsular Malaysia state boundaries are
derived from geoBoundaries/OpenStreetMap ADM1 data and are credited in the map;
the source data is licensed under ODbL 1.0.
The matchday page includes an animated player profile, football diary cards,
and a form for adding, editing, and deleting match highlights. Match entries
and uploaded photos are kept in page state for the current visit. It follows
this project's existing standalone HTML/CSS/JavaScript setup; the sample
football match cards can be replaced with personal match photos. The profile
uses the provided local portrait in `mica-football.jpg`.
The cafe diary includes six sample dates, photo galleries, and a form for
adding, editing, and deleting cafe memories. Cafe entries and uploaded photos
are kept in page state for the current visit.
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
