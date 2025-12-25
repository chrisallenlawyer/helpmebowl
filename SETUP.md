# Setup Guide

## Quick Start

1. **Connect to your GitHub repository:**
   ```bash
   git remote set-url origin https://github.com/YOUR_USERNAME/helpmebowl.git
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env.local
   ```
   Then edit `.env.local` with your actual values:
   - Get Supabase credentials from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
   - Get Stripe keys from: https://dashboard.stripe.com/apikeys

3. **Set up Supabase database:**
   - Go to your Supabase project SQL Editor
   - Copy and paste the contents of `supabase/migrations/20240101000000_initial_schema.sql`
   - Run the migration to create all tables

4. **Install dependencies (if not already done):**
   ```bash
   npm install
   ```

5. **Run the development server:**
   ```bash
   npm run dev
   ```

6. **Open your browser:**
   Navigate to http://localhost:3000

## Next Steps

1. Create your Supabase project at https://supabase.com
2. Run the database migration
3. Set up Stripe account for payments
4. Configure environment variables
5. Push to GitHub: `git push -u origin main`
6. Connect to Vercel for deployment

## Database Setup Details

The migration file includes:
- All required tables (user_profiles, games, subscription_tiers, etc.)
- Row Level Security (RLS) policies
- Default subscription tiers
- Indexes for performance
- Triggers for automatic timestamp updates

## Environment Variables Explained

- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous/public key (safe for client-side)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (server-side only, keep secret!)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Stripe publishable key (client-side)
- `STRIPE_SECRET_KEY`: Stripe secret key (server-side only)
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook secret for verifying webhook signatures

