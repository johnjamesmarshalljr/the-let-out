# the Let Out

A simple, community-owned ballroom forum. Text posts, upvote / chop, comments, profiles. Built to move the conversation off Facebook.

Stack: **Next.js** (front end) + **Supabase** (database + login) + **Vercel** (hosting). All three have free tiers that comfortably cover a community this size. Total cost to run: **$0**.

---

## What you'll set up (about 30–40 minutes, once)

1. A free Supabase project — this is your database and login system.
2. This app deployed on Vercel — the website itself.
3. Login, three ways: **name-only profiles** (no email — one Supabase toggle, see Step 3), **email** sign-in links (on by default), and **Google** (~10 extra min). (Facebook was intentionally dropped — see the note near the bottom.)

You do not need to be a backend developer. Follow the steps in order.

---

## Step 1 — Create your Supabase project

1. Go to https://supabase.com and sign up (free).
2. Click **New project**. Give it a name (e.g. `the-let-out`), set a database password (save it somewhere), pick the region closest to your community, and create it. Wait ~2 minutes for it to finish.
3. In the left sidebar go to **Settings → API**. Copy these two values, you'll need them twice:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string)

## Step 2 — Create the database tables

1. In Supabase, open the **SQL Editor** (left sidebar).
2. Open the file `supabase/schema.sql` from this project, copy the whole thing, paste it into the editor.
3. Click **Run**. You should see "Success." This creates your posts, comments, votes, and profiles tables, the security rules, and a public `avatars` storage bucket for profile photos.

The schema is safe to **re-run** at any time — it only adds what's missing and recreates the parts it owns. If you're upgrading an existing project, just paste and run it again; it adds the new profile fields and the avatars bucket without touching your data.

> Note: after upgrading, everyone (including you) is asked to set up their profile — pick a username, optional house/scene/photo — the next time they sign in. That's expected; it's how the new identity system replaces the raw name from your login.

## Step 3 — Turn on login methods

1. In Supabase go to **Authentication → Providers** (or **Sign In / Providers**).
2. **Email** is on by default — that alone is enough to launch.
3. **Turn on Anonymous sign-ins.** This is what powers the "Create a profile" button (name-only accounts, no email). Find the **Anonymous** provider/toggle and enable it. Without this, that button errors.
4. Go to **Authentication → URL Configuration** and set:
   - **Site URL**: `http://localhost:3000` for now (change to your Vercel URL after Step 6).
   - Under **Redirect URLs**, add `http://localhost:3000` and (later) your Vercel URL.

> Heads up on name-only profiles: an anonymous account lives in that browser's storage. If someone clears their browser or switches devices, that profile is gone and can't be recovered — there's no email or Google attached to prove it's theirs. That's the tradeoff for zero-friction signup. People who want a durable account can sign in with Google or email instead.

## Step 4 — Run it on your own computer first

In a terminal, inside this project folder:

```bash
cp .env.example .env.local
```

Open `.env.local` and paste in the two values from Step 1:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcd1234.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-long-anon-key
```

Then:

```bash
npm install
npm run dev
```

Open http://localhost:3000. Sign in with your email, make a test post, upvote it. If that works, you're ready to deploy.

## Step 5 — Put the code on GitHub

1. Create a free account at https://github.com if you don't have one.
2. Make a new **empty** repository called `the-let-out` (no README, since this folder already has one).
3. In a terminal inside this folder:

```bash
git init
git add .
git commit -m "the Let Out — first version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/the-let-out.git
git push -u origin main
```

## Step 6 — Deploy on Vercel

1. Go to https://vercel.com and sign up with your GitHub account (free).
2. Click **Add New → Project**, pick your `the-let-out` repo, click **Import**.
3. Before deploying, expand **Environment Variables** and add the same two from Step 1:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. After a minute you'll get a live URL like `https://the-let-out.vercel.app`.

## Step 7 — Point Supabase at your live site

Back in Supabase → **Authentication → URL Configuration**:
- Set **Site URL** to your Vercel URL (e.g. `https://the-let-out.vercel.app`).
- Add that same URL under **Redirect URLs**.

That's it. Share the link with the community.

---

## Adding Google login (optional, ~10 min)

1. In **Google Cloud Console** (https://console.cloud.google.com), create an OAuth 2.0 Client ID (type: Web application).
2. Under **Authorized redirect URIs**, add the callback URL Supabase shows you in **Authentication → Providers → Google** (it looks like `https://abcd1234.supabase.co/auth/v1/callback`).
3. Copy the Google **Client ID** and **Client Secret** into that Supabase Google provider screen, and enable it.
4. The "Continue with Google" button in the app starts working immediately — no code change.

## Facebook login (intentionally removed)

The Facebook button was removed. Meta now gates public Facebook login behind business verification, which requires a legally registered business and a business-domain email — too much overhead for a community forum, and ironic for a project whose whole point is moving off Facebook. Google + email cover everyone without it.

If you ever incorporate the project and decide it's worth it, you'd: complete Meta business verification, enable the Facebook provider in Supabase (App ID / Secret + the Supabase callback URL), and re-add a "Continue with Facebook" button mirroring the Google one in `components/Forum.jsx` (the handler pattern is `signInWithOAuth({ provider: "facebook" })`).

---

## How to change things

- **Add a category**: edit the `ROOMS` list at the top of `components/Forum.jsx`. (No database change needed — categories are just text.)
- **Rename the site**: search `THE LET OUT` in `components/Forum.jsx` and `app/layout.js`.
- **Colors**: the `C` object at the top of `components/Forum.jsx`.

## What's built / what's next

Built in: a single forum feed with **Hot/New/Top sorting, tags, and a search bar**, profiles, threaded comments with voting and **meme/GIF images**, link embeds (YouTube/TikTok/Instagram), photo/video upload, the **House model** (free-text titles, leader permissions, leader-add by username, **invite links**, join approval, one active house per person, members-only board + calendar), the **ball organizer** (ordered category lineup + public page), and — the differentiator — a **results layer**: organizers record category winners, which accrue as permanent **trophies on profiles and houses** and feed **house + walker standings**. Re-run `supabase/schema.sql` after pulling this version.

Next up: deepening results (placements beyond the winner, ball registration/RSVP), then notifications. Still not here: direct messages.

## The radio

There's a persistent radio bar pinned to the bottom of every screen. It plays a SoundCloud station and **keeps playing as people move around the app** (since navigation here is just a view change, the player never unmounts). To set what it plays, open `components/Forum.jsx` and change one line near the top:

```
const RADIO_URL = "https://soundcloud.com/YOUR_HANDLE/sets/YOUR_PLAYLIST";
```

Paste any public SoundCloud URL — a set/playlist works best for a station, but a single track or your profile's station URL works too. Until you set it, the bar shows but won't have audio. Note: browsers block autoplay-with-sound until someone interacts with the page, so the bar tries to start on its own and otherwise says "Tap play to tune in" — one tap and it's live and persistent from there. The Radio icon on the right expands the station so people can scrub/pick tracks. (This is a frontend-only feature — no schema change needed for it.)

## House chat is live

The house chat updates in real time (Supabase Realtime). The schema turns this on by adding `house_messages` and `house_events` to the `supabase_realtime` publication. If messages don't appear live for other members, open Supabase → Database → Replication (or Realtime) and confirm those two tables are enabled — re-running `schema.sql` should handle it automatically.
