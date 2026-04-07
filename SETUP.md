# Iron Coach — Phase 0 Setup (Do this once)

## Step 1 — Install Node.js (if not installed)
Download from nodejs.org — install LTS version.
Verify: `node -v` should show v18+

## Step 2 — Copy project files
Place the iron-coach folder wherever you work on projects.
Open a terminal inside the iron-coach folder.

## Step 3 — Install dependencies
```
npm install
```

## Step 4 — Set up Supabase

1. Go to supabase.com → your project → SQL Editor
2. Paste the entire contents of `supabase/schema.sql`
3. Click Run — all 12 tables, indexes, and RLS policies will be created
4. Go to Settings → API
5. Copy: Project URL and anon (public) key

## Step 5 — Create .env.local
Copy .env.example to .env.local:
```
cp .env.example .env.local
```
Open .env.local and fill in:
- VITE_SUPABASE_URL = your project URL
- VITE_SUPABASE_ANON_KEY = your anon key

## Step 6 — Run locally
```
npm run dev
```
Open http://localhost:5173 — you should see the Iron Coach login screen.
Create an account to confirm Supabase is connected.

## Step 7 — Push to GitHub
```
git init
git add .
git commit -m "Phase 0: project scaffold"
git remote add origin https://github.com/YOUR_USERNAME/iron-coach.git
git push -u origin main
```

## Step 8 — Deploy to Vercel
1. Go to vercel.com → Add New Project → Import from GitHub
2. Select the iron-coach repo
3. Go to Settings → Environment Variables → Add:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4. Redeploy — your app is live.

## Step 9 — Add Supabase Edge Function secrets (for later phases)
In Supabase Dashboard → Settings → Edge Functions → Secrets, add:
- ANTHROPIC_API_KEY (from console.anthropic.com)
- GEMINI_API_KEY (from aistudio.google.com)
- TWILIO_ACCOUNT_SID (Phase 7)
- TWILIO_AUTH_TOKEN (Phase 7)
- TWILIO_WHATSAPP_FROM (Phase 7)

## Phase 0 is done when:
- [ ] `npm run dev` runs without errors
- [ ] Login screen appears at localhost:5173
- [ ] You can create an account (check Supabase → Authentication → Users)
- [ ] Profile row appears in Supabase → Table Editor → profiles
- [ ] App is deployed on Vercel

## Next: Phase 1 — Task Engine
