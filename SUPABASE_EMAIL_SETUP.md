# Supabase Email Confirmation Setup

## The Problem
When users sign up, Supabase sends a confirmation email. The email contains a link that needs to redirect to your app, but by default it might point to localhost.

## Solution

### Step 1: Configure Redirect URLs in Supabase

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your **HelpMeBowl** project
3. Go to **Authentication** → **URL Configuration** (left sidebar)
4. In the **Redirect URLs** section, add these URLs:

   **For Production:**
   ```
   https://your-app-name.vercel.app/auth/callback
   ```

   **For Development (optional, if you want to test locally):**
   ```
   http://localhost:3000/auth/callback
   ```

5. Click **Save**

### Step 2: Update Environment Variables

Make sure your `.env.local` file (and Vercel environment variables) includes:

```env
NEXT_PUBLIC_APP_URL=https://your-app-name.vercel.app
```

**For local development:**
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**For production (in Vercel):**
- Go to your Vercel project settings
- Add/update `NEXT_PUBLIC_APP_URL` with your actual Vercel domain
- Redeploy after updating

### Step 3: Disable Email Confirmation (Optional - For Testing)

If you want to skip email confirmation during development:

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Find **Email** provider
3. Toggle **"Enable email confirmations"** to OFF
4. Click **Save**

**Note**: For production, you should keep email confirmations enabled for security.

### Step 4: Test Email Confirmations

1. Sign up with a new email
2. Check your email (and spam folder)
3. Click the confirmation link
4. You should be redirected to `/dashboard` after confirmation

## Troubleshooting

### Email not being sent
- Check Supabase dashboard → **Authentication** → **Email Templates**
- Make sure your email provider is configured
- For free tier, Supabase uses their own email service (may have rate limits)

### Redirect still going to localhost
- Double-check `NEXT_PUBLIC_APP_URL` in Vercel environment variables
- Make sure you've added the redirect URL in Supabase settings
- Redeploy your Vercel app after making changes

### Link expires
- Supabase confirmation links expire after a certain time (default is 1 hour)
- You can resend the confirmation email from the login page (if we add that feature)
- Or sign up again with the same email

## What We've Implemented

1. ✅ Added `/auth/callback` route handler to process email confirmations
2. ✅ Updated signup to use `NEXT_PUBLIC_APP_URL` for redirect URL
3. ✅ Callback handler redirects users to dashboard after confirmation

## Next Steps

After setting up the redirect URLs in Supabase, email confirmations should work properly!

