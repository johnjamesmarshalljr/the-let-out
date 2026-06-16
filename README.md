# the Let Out

A simple, community-owned ballroom forum. Text posts, upvote / chop, comments, profiles. Built to move the conversation off Facebook.

Stack: **Next.js** (front end) + **Supabase** (database + login) + **Vercel** (hosting). All three have free tiers that comfortably cover a community this size. Total cost to run: **$0**.

---

## What you'll set up (about 30–40 minutes, once)

1. A free Supabase project — this is your database and login system.
2. This app deployed on Vercel — the website itself.
3. Login: **email sign-in links work immediately with zero extra setup.** Google takes ~10 extra minutes. Facebook is documented at the bottom for later — it needs a Meta developer app, so don't block your launch on it.

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
3. Click **Run**. You should see "Success." This creates your posts, comments, votes, and profiles tables, plus the security rules. You only do this once.

## Step 3 — Turn on email login

1. In Supabase go to **Authentication → Providers**.
2. **Email** is on by default — that's all you need to launch. (It sends a one-tap sign-in link, no passwords.)
3. Go to **Authentication → URL Configuration** and set:
   - **Site URL**: `http://localhost:3000` for now (you'll change this to your real Vercel URL after Step 6).
   - Under **Redirect URLs**, add `http://localhost:3000` and (later) your Vercel URL.

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

## Adding Facebook login (button is already in the app)

The "Continue with Facebook" button is already built into the sign-in screen. It stays inert until you enable the Facebook provider in Supabase, so there's no code change to make — just this configuration when you're ready:

Facebook login needs a Meta developer app with a privacy policy URL and app domain, and Meta will push you toward business verification along the way. It's the slowest of the three providers to set up, so launch on email + Google first.

When ready: create an app at https://developers.facebook.com, add the **Facebook Login** product, copy the **App ID** and **App Secret** into Supabase → **Authentication → Providers → Facebook**, and enable it. In your Meta app's Facebook Login settings, add the Supabase callback URL (shown on that same Supabase Facebook provider screen, like `https://abcd1234.supabase.co/auth/v1/callback`) under Valid OAuth Redirect URIs. Once the provider is enabled in Supabase, the button starts working — no code change needed.

---

## How to change things

- **Add a category**: edit the `ROOMS` list at the top of `components/Forum.jsx`. (No database change needed — categories are just text.)
- **Rename the site**: search `THE LET OUT` in `components/Forum.jsx` and `app/layout.js`.
- **Colors**: the `C` object at the top of `components/Forum.jsx`.

## What's deliberately not here yet (POC scope)

Photos/video, direct messages, moderation tools, notifications, search. All are reasonable next steps once the core proves out — each is a separate, bigger build.
