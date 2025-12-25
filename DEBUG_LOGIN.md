# Debugging Login Issue

## Steps to Debug

1. **Open Browser Console** (F12 → Console tab)
2. **Clear the console** (click the clear button or press Ctrl+L)
3. **Refresh the login page** - you should see "Login page mounted"
4. **Enter your email and password**
5. **Click "Sign in" button**
6. **Watch the console** - logs should appear with a 500ms delay before redirect

## What to Look For

In the console, you should see these messages in order:
1. `=== LOGIN START ===`
2. `handleLogin called` (with your email)
3. `Calling Supabase signInWithPassword...`
4. `Login response:` (this will show if login succeeded or failed)
5. Either:
   - Success: `Login successful, redirecting...` → `=== REDIRECTING TO DASHBOARD ===`
   - Error: `Login error:` (with error details)

## Network Tab

1. **Filter by "Fetch/XHR"** (not "All")
2. **Click "Sign in"**
3. **Look for a request to `supabase.co`** - usually something like:
   - `https://[your-project].supabase.co/auth/v1/token?grant_type=password`
4. **Click on that request** and check:
   - **Status**: Should be 200 if successful
   - **Response tab**: Should show user/session data if successful, or error message if failed

## Common Issues

### No Supabase request appears
- JavaScript error preventing the call
- Check console for red error messages

### Supabase request returns error
- Check the Response tab for the error message
- Common errors:
  - `Invalid login credentials` - wrong email/password
  - `Email not confirmed` - need to confirm email (but we disabled this)
  - `Too many requests` - rate limiting

### Request succeeds but no redirect
- Check console logs to see if it gets to "REDIRECTING" message
- May be a browser security issue blocking navigation

