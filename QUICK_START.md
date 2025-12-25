# Quick Start: Push to GitHub, Setup Supabase & Vercel

## 🚀 Part 1: Push to GitHub

### Option A: Using the Script

1. Run the setup script with your GitHub username:
   ```bash
   ./setup-github.sh YOUR_GITHUB_USERNAME
   ```

2. Push to GitHub:
   ```bash
   git push -u origin main
   ```

### Option B: Manual Setup

1. Update the remote URL:
   ```bash
   git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/helpmebowl.git
   ```
   (Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username)

2. Push to GitHub:
   ```bash
   git push -u origin main
   ```

### If You Get Authentication Errors:

GitHub no longer accepts passwords. You need a Personal Access Token:

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name: "HelpMeBowl"
4. Select scopes: Check `repo` (gives full control of private repositories)
5. Click "Generate token"
6. Copy the token (you won't see it again!)
7. When pushing, use the token as your password

---

## 🗄️ Part 2: Set Up Supabase

### Step 1: Create Account and Project

1. Go to https://supabase.com
2. Click "Start your project" or "Sign in"
3. Sign in with GitHub (easiest) or email

### Step 2: Create New Project

1. Click "New Project" button (top right or in dashboard)
2. Fill in the form:
   - **Name**: `HelpMeBowl` (or whatever you prefer)
   - **Database Password**: Create a strong password
     - ⚠️ **Save this password!** You'll need it later if you want to connect directly to the database
   - **Region**: Choose closest to you/your users
   - **Pricing Plan**: Select "Free" to start
3. Click "Create new project"
4. Wait 2-3 minutes for provisioning

### Step 3: Get Your API Keys

1. In your Supabase dashboard, click **Settings** (gear icon in left sidebar)
2. Click **API** (under Project Settings)
3. You'll see these important values:

   **Project URL:**
   ```
   https://xxxxxxxxxxxxx.supabase.co
   ```
   Copy this entire URL.

   **Project API keys:**
   - **anon public**: This is safe for client-side code
   - **service_role**: ⚠️ **KEEP THIS SECRET!** Never expose in client-side code

### Step 4: Run Database Migration

1. In Supabase dashboard, click **SQL Editor** (left sidebar)
2. Click "New query" button
3. Open the file in your project: `supabase/migrations/20240101000000_initial_schema.sql`
4. Copy ALL the contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)
5. Paste into the SQL Editor (Cmd/Ctrl + V)
6. Click "Run" button (or press Cmd/Ctrl + Enter)
7. You should see: "Success. No rows returned"

✅ Your database tables are now created!

### Step 5: Create Storage Bucket for Photos

1. Click **Storage** in left sidebar
2. Click "Create a new bucket"
3. Name: `score-photos`
4. Public bucket: **Yes** (or No if you want private, but requires auth setup)
5. Click "Create bucket"

### Step 6: Update Environment Variables Locally

1. Create `.env.local` file:
   ```bash
   cp env.example .env.local
   ```

2. Open `.env.local` in your editor

3. Add your Supabase values:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

4. Save the file

### Step 7: Test Connection (Optional)

Run the dev server to test:
```bash
npm run dev
```

Visit http://localhost:3000 - it should load without errors.

---

## 🌐 Part 3: Set Up Vercel

### Step 1: Create Vercel Account

1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub" (easiest - connects to your GitHub account)
4. Authorize Vercel to access your GitHub account

### Step 2: Import Your Project

1. After signing in, you'll see the Vercel dashboard
2. Click "Add New..." → "Project"
3. You should see your GitHub repositories
4. Find `helpmebowl` and click "Import"

### Step 3: Configure Project

Vercel auto-detects Next.js, so these should be correct:
- **Framework Preset**: Next.js ✅
- **Root Directory**: `./` ✅
- **Build Command**: `npm run build` ✅
- **Output Directory**: `.next` ✅

### Step 4: Add Environment Variables

**IMPORTANT**: Add these before deploying!

1. In the project setup page, find **Environment Variables** section
2. Click to expand it
3. Add each variable one by one:

   **Variable 1:**
   - Key: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: `https://your-project-id.supabase.co` (from Supabase)
   - Environments: ✅ Production, ✅ Preview, ✅ Development

   **Variable 2:**
   - Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Value: Your anon key from Supabase
   - Environments: ✅ Production, ✅ Preview, ✅ Development

   **Variable 3:**
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Your service_role key from Supabase
   - Environments: ✅ Production, ✅ Preview, ✅ Development

   **Variable 4:**
   - Key: `NEXT_PUBLIC_APP_URL`
   - Value: `http://localhost:3000` (we'll update this after deployment)
   - Environments: ✅ Production, ✅ Preview, ✅ Development

4. Click "Add" after each variable

### Step 5: Deploy

1. Scroll down and click "Deploy" button
2. Wait 2-3 minutes for the build to complete
3. Watch the build logs - it should show "Build Successful"
4. You'll get a deployment URL like: `https://helpmebowl-xxxxx.vercel.app`

### Step 6: Update App URL (After First Deployment)

1. Copy your actual Vercel URL (e.g., `https://helpmebowl-xxxxx.vercel.app`)
2. In Vercel dashboard, go to your project
3. Click **Settings** → **Environment Variables**
4. Find `NEXT_PUBLIC_APP_URL`
5. Click the three dots → "Edit"
6. Update value to your actual Vercel URL
7. Save (this will trigger a redeploy)

### Step 7: Verify Deployment

1. Visit your Vercel URL
2. You should see "Welcome to HelpMeBowl"
3. Check the browser console for any errors (F12 → Console)

---

## ✅ Verification Checklist

- [ ] Code pushed to GitHub
- [ ] Supabase project created
- [ ] Database migration run successfully
- [ ] Storage bucket created
- [ ] Environment variables set in `.env.local`
- [ ] Vercel account created
- [ ] Project imported to Vercel
- [ ] Environment variables added in Vercel
- [ ] First deployment successful
- [ ] App URL updated in Vercel
- [ ] Site loads correctly at Vercel URL

---

## 🔧 Troubleshooting

### GitHub: "Repository not found"
- Make sure the repository exists on GitHub
- Check that your GitHub username is correct
- Verify you have access to the repository

### Supabase: Migration errors
- Make sure you copied the ENTIRE SQL file
- Check for error messages in the SQL Editor
- Try running sections one at a time if needed

### Vercel: Build fails
- Check the build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify `package.json` is committed to git
- Try building locally: `npm run build`

### Vercel: Environment variables not working
- Make sure variables start with `NEXT_PUBLIC_` if they're used in browser code
- Redeploy after adding new environment variables
- Check that variables are set for the correct environments (Production/Preview/Development)

---

## 🎉 Next Steps

Once everything is set up:
1. Start building features (authentication, game tracking, etc.)
2. Test locally with `npm run dev`
3. Push changes to GitHub
4. Vercel will automatically redeploy on every push to `main`

