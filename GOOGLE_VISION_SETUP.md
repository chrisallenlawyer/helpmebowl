# Google Cloud Vision API Setup Guide

This guide will help you set up Google Cloud Vision API for better OCR accuracy in HelpMeBowl.

## Why Google Vision API?

- **Much higher accuracy** than Tesseract.js (especially for scoreboards and displays)
- **Better handling** of tilted images, different fonts, and lighting conditions
- **Structured text detection** with word bounding boxes for better parsing
- **Pay-as-you-go pricing** - typically costs $1.50 per 1,000 images

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it (e.g., "HelpMeBowl")
4. Click "Create"

### 2. Enable Vision API

1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Cloud Vision API"
3. Click on it and click "Enable"

### 3. Create API Key

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy the API key (you'll need this)

**Important**: Restrict the API key for security:
- Click on the API key you just created
- Under "API restrictions", select "Restrict key"
- Choose "Cloud Vision API"
- Save

### 4. Add API Key to Environment Variables

#### For Vercel:
1. Go to your Vercel project dashboard
2. Go to "Settings" → "Environment Variables"
3. Add a new variable:
   - **Key**: `GOOGLE_CLOUD_VISION_API_KEY`
   - **Value**: Your API key from step 3
   - **Environments**: Production, Preview, Development
4. Click "Save"
5. Redeploy your application

#### For Local Development:
1. Copy `.env.local.example` to `.env.local` (if it doesn't exist)
2. Add:
   ```
   GOOGLE_CLOUD_VISION_API_KEY=your_api_key_here
   ```
3. Restart your Next.js dev server

### 5. Test the Integration

1. Upload a bowling score photo in the app
2. Check the browser console - you should see "Google Vision OCR successful"
3. The OCR should be much more accurate than before

## Pricing

Google Vision API charges:
- **First 1,000 units/month**: FREE
- **Additional units**: $1.50 per 1,000 images

Each text detection request = 1 unit. So you can process 1,000 images per month for free, then pay $1.50 per 1,000 after that.

## Fallback Behavior

If the API key is not configured, the app will automatically fall back to Tesseract.js (client-side, free but less accurate). This ensures the app always works, even without Google Vision API setup.

## Security Notes

- The API key is stored server-side only (in environment variables)
- The key is restricted to only work with Vision API
- Never commit the API key to git
- Consider setting usage quotas in Google Cloud Console to prevent unexpected charges

## Troubleshooting

**Error: "OCR service not configured"**
- Make sure you've added the environment variable in Vercel
- Redeploy after adding the variable
- Check that the variable name is exactly `GOOGLE_CLOUD_VISION_API_KEY`

**Error: "API key invalid"**
- Verify the API key is correct
- Make sure Vision API is enabled in your Google Cloud project
- Check that the API key is not restricted to the wrong API

**Still using Tesseract.js?**
- Check browser console for error messages
- Verify the API key is set correctly
- Check Vercel logs for API errors

