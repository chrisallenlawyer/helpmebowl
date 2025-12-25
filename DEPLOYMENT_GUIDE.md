# Deployment Guide: GitHub, Supabase, and Vercel

## Step 1: Push to GitHub

### Update the Git Remote

First, update the remote URL with your GitHub username:

```bash
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/helpmebowl.git
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

### Push to GitHub

```bash
git push -u origin main
```

If prompted for authentication, you can:
- Use a Personal Access Token (recommended for HTTPS)
- Or set up SSH keys for easier authentication

**Note**: If the repository doesn't exist yet on GitHub, create it first:
1. Go to https://github.com/new
2. Repository name: `helpmebowl`
3. Make it private or public (your choice)
4. Don't initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"
6. Then run the push command above

---

## Step 2: Set Up Supabase

### 2.1 Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Click "New Project"
4. Fill in the details:
   - **Name**: HelpMeBowl (or your preferred name)
   - **Database Password**: Create a strong password (save it securely!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Start with Free tier
5. Click "Create new project"
6. Wait 2-3 minutes for the project to be provisioned

### 2.2 Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Settings** → **API** (left sidebar)
2. You'll need these values:
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys")
   - **service_role** key (under "Project API keys") - ⚠️ Keep this secret!

### 2.3 Run Database Migration

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click "New query"
3. Open the file: `supabase/migrations/20240101000000_initial_schema.sql`
4. Copy ALL the contents of that file
5. Paste into the SQL Editor
6. Click "Run" (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned"

This creates:
- All database tables
- Row Level Security policies
- Default subscription tiers
- Indexes and triggers
- Default OCR configuration

### 2.4 Enable Storage (for score photos)

1. Go to **Storage** in the left sidebar
2. Click "Create a new bucket"
3. Name: `score-photos`
4. Make it **Public**: Yes (or Private if you prefer, but you'll need to handle access differently)
5. Click "Create bucket"

### 2.5 Update Your Environment Variables

Create/update your `.env.local` file:

```bash
# Copy the example file
cp env.example .env.local
```

Then edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Important**: Never commit `.env.local` to git! It's already in `.gitignore`.

---

## Step 3: Set Up Vercel

### 3.1 Create Vercel Account and Connect GitHub

1. Go to https://vercel.com
2. Sign up or log in (use "Continue with GitHub" for easiest setup)
3. You'll be prompted to connect your GitHub account - authorize it

### 3.2 Import Your Project

1. Click "Add New..." → "Project"
2. Find your `helpmebowl` repository
3. Click "Import"

### 3.3 Configure Project Settings

Vercel should auto-detect Next.js. Verify these settings:

- **Framework Preset**: Next.js
- **Root Directory**: `./` (default)
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

### 3.4 Add Environment Variables

Before deploying, add your environment variables in Vercel:

1. In the project setup page, expand **Environment Variables**
2. Add each variable:

   ```
   NEXT_PUBLIC_SUPABASE_URL = https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
   SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
   NEXT_PUBLIC_APP_URL = https://your-app-name.vercel.app
   ```

   **Note**: You can update `NEXT_PUBLIC_APP_URL` after first deployment to get the actual URL.

3. For each variable, select which environments it applies to:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

### 3.5 Deploy

1. Click "Deploy"
2. Wait 2-3 minutes for the build to complete
3. Once deployed, you'll get a URL like: `https://helpmebowl-xxxxx.vercel.app`

### 3.6 Update Environment Variables (Round 2)

After deployment, update `NEXT_PUBLIC_APP_URL` with your actual Vercel URL:

1. Go to your project in Vercel dashboard
2. **Settings** → **Environment Variables**
3. Edit `NEXT_PUBLIC_APP_URL` to: `https://your-actual-url.vercel.app`
4. Redeploy (or it will update on next deployment)

---

## Step 4: Set Up Stripe (For Later)

When you're ready to add subscriptions:

1. Go to https://stripe.com and create an account
2. Get your API keys from: **Developers** → **API keys**
3. Add to Vercel environment variables:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET` (after setting up webhooks)

---

## Step 5: Verify Everything Works

1. Visit your Vercel deployment URL
2. You should see the "Welcome to HelpMeBowl" page
3. Try creating a user account (once auth is implemented)
4. Check Supabase dashboard to see if data is being created

---

## Troubleshooting

### GitHub Push Issues

**Authentication Error:**
- Use a Personal Access Token: https://github.com/settings/tokens
- Create token with `repo` scope
- Use token as password when pushing

### Supabase Connection Issues

**"Invalid API key" error:**
- Double-check you're using the correct keys
- Make sure `NEXT_PUBLIC_SUPABASE_URL` doesn't have a trailing slash
- Verify keys are in `.env.local` (not `.env`)

**Migration Errors:**
- Make sure you're running the entire SQL file
- Check if tables already exist (you may need to drop them first)
- Look at the error message for specific issues

### Vercel Build Failures

**Build fails:**
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Make sure `package.json` is correct
- Try building locally: `npm run build`

**Environment variables not working:**
- Variables starting with `NEXT_PUBLIC_` are exposed to the browser
- Restart the dev server after changing `.env.local`
- Redeploy on Vercel after adding new environment variables

---

## Next Steps After Setup

1. ✅ Database is ready
2. ✅ Project is on GitHub
3. ✅ Deployed to Vercel
4. 🔄 Implement authentication
5. 🔄 Build game tracking features
6. 🔄 Add OCR functionality
7. 🔄 Set up Stripe for subscriptions

