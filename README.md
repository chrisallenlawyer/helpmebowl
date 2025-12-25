# HelpMeBowl

A subscription-based web application for bowling score tracking with OCR capabilities, analytics, and multi-user support.

## Features

- 📸 **OCR Score Recognition**: Take photos of bowling scores and automatically extract them
- 🎯 **Maximum Score Calculator**: Calculate your maximum possible score from any point in a game
- 📊 **Average Tracking**: Track your bowling average with detailed analytics
- 📝 **Game Management**: Record games with dates, locations, and custom notes
- 🔐 **User Authentication**: Secure multi-user support with individual tracking
- 💳 **Subscription Tiers**: Flexible subscription system with admin-manageable tiers
- 🔧 **Extensible Custom Fields**: Track additional variables like oil patterns, balls used, etc.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router) with TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes + Supabase
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **OCR**: Tesseract.js (client-side, configurable for future upgrades)
- **Payments**: Stripe
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Supabase account and project
- A Stripe account (for subscriptions)
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/helpmebowl.git
cd helpmebowl
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env.local
```

Fill in your environment variables in `.env.local`:
- Supabase URL and keys (from your Supabase project settings)
- Stripe keys (from your Stripe dashboard)

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Database Setup

See `PLAN.md` for the complete database schema. You'll need to run SQL migrations in your Supabase project to create the necessary tables:

1. `user_profiles`
2. `subscription_tiers`
3. `subscriptions`
4. `games`
5. `custom_field_definitions`
6. `ocr_config`

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── (auth)/      # Authentication pages
│   ├── (dashboard)/ # User dashboard pages
│   └── (admin)/     # Admin panel pages
├── components/       # React components
├── lib/             # Utility functions and client setup
│   └── supabase/    # Supabase client configuration
├── types/           # TypeScript type definitions
└── hooks/           # Custom React hooks
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## License

[Add your license here]

## Contributing

[Add contributing guidelines if needed]

