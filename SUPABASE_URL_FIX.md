# Fix for Email Confirmation Error

## The Problem
You're getting: `{"code":403,"error_code":"otp_expired","msg":"Email link is invalid or has expired"}`

This happened because your Supabase redirect URL had a double `https://`:
- ❌ Wrong: `https://https://helpmebowl.vercel.app/auth/callback`
- ✅ Correct: `https://helpmebowl.vercel.app/auth/callback`

## How to Fix

### Step 1: Fix Supabase Redirect URL

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your **HelpMeBowl** project
3. Go to **Authentication** → **URL Configuration**
4. In the **Redirect URLs** section, remove the incorrect URL with double `https://`
5. Add the correct URL:
   ```
   https://helpmebowl.vercel.app/auth/callback
   ```
6. Click **Save**

### Step 2: Update Vercel Environment Variable

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Make sure `NEXT_PUBLIC_APP_URL` is set to:
   ```
   https://helpmebowl.vercel.app
   ```
   (No trailing slash, no double https)
3. If you updated it, redeploy your app

### Step 3: Request a New Confirmation Email

Since the old email link is expired, you need a new one:

**Option A: Use the Resend Feature (on login page)**
1. Go to the login page
2. Enter your email address
3. If you get an error about email confirmation, click "Resend confirmation email"
4. Check your email for the new confirmation link

**Option B: Sign Up Again**
- The system will send a new confirmation email
- Or you can sign up with the same email again to get a fresh confirmation link

### Step 4: Test

1. After fixing the URL in Supabase, try signing up with a new email
2. Check your email for the confirmation link
3. Click the link - it should now redirect to your Vercel app

## Important Notes

- Email confirmation links expire after 1 hour (default Supabase setting)
- Always use the correct URL format: `https://helpmebowl.vercel.app/auth/callback` (single https://)
- Make sure both Supabase redirect URLs and Vercel environment variables match your actual domain

