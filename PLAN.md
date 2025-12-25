# HelpMeBowl - Project Plan

## Project Overview
A subscription-based web application for bowling score tracking with OCR capabilities, analytics, and multi-user support.

## Tech Stack
- **Frontend**: Next.js 14+ (App Router) with TypeScript
- **Backend**: Next.js API Routes + Supabase
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (for score photos)
- **OCR/Image Recognition**: Tesseract.js (client-side, free) - Configurable/swappable architecture for future upgrades (Google Vision API, AWS Textract)
- **Deployment**: Vercel
- **Version Control**: GitHub
- **Subscription Management**: Stripe (recommended) or Supabase Billing

## Core Features

### 1. Score Photo Recognition (OCR)
- Upload/take photo of bowling score display
- Extract current frame scores and overall score
- Support multiple score display formats:
  - Digital bowling alley displays
  - Paper score sheets
  - Phone screenshots
- Store original photo for reference

### 2. Maximum Score Calculator
- Calculate maximum possible score from current state
- Algorithm: Assume all remaining frames are strikes
- Display in real-time as game progresses

### 3. Average Tracking
- Calculate average from all completed games
- Support both photo-extracted and manually entered scores
- Show averages over different time periods (all-time, monthly, weekly)

### 4. Game Management
- Create game records with:
  - Date and time
  - Location (name/address)
  - Final score (from photo or manual)
  - Custom notes
  - Score photo (if applicable)
- Edit/delete game records
- Game history with filtering and sorting

### 5. User Authentication
- Email/password authentication via Supabase Auth
- User profiles
- Individual game tracking per user
- Privacy controls

### 6. Subscription Tiers
- **Admin-manageable**: Tiers, pricing, and features can be updated from admin panel without code changes
- **Default Tiers** (configurable):

#### Tier 1: Free
- Manual score entry only (no OCR)
- Track up to 10 games
- Basic average calculation
- No photo storage

#### Tier 2: Basic ($4.99/month)
- OCR score recognition
- Unlimited games
- Full average tracking
- Score photos (limited storage)
- Basic analytics (average, high score, low score)

#### Tier 3: Pro ($9.99/month)
- Everything in Basic
- Advanced analytics:
  - Strike percentage
  - Spare conversion rate
  - Game trends over time
  - Score distribution charts
- Export data (CSV/JSON)
- Multiple locations tracking
- Priority OCR processing

#### Tier 4: Premium ($19.99/month)
- Everything in Pro
- Unlimited photo storage
- Team/league features
- Social sharing
- API access
- Custom reporting

### 7. Admin Panel
- Manage subscription tiers (create, edit, delete)
- Update tier pricing and features
- Manage OCR provider settings
- View system-wide analytics
- User management
- Custom field definitions management

### 8. Extensible Custom Fields
- System for adding custom tracking variables without schema changes
- Examples: Oil pattern, ball(s) used, lane number, weather conditions, etc.
- Admin can define new custom fields
- Fields can be:
  - Text inputs
  - Dropdowns (with custom options)
  - Number inputs
  - Date inputs
  - File uploads
- Each field can be tier-restricted (e.g., only available for Pro+ users)

## Database Schema (Supabase)

### Users Table (extends Supabase auth.users)
```sql
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT,
  subscription_tier_id UUID REFERENCES subscription_tiers(id),
  subscription_status TEXT,
  subscription_expires_at TIMESTAMP,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Subscription Tiers Table (Admin-manageable)
```sql
CREATE TABLE subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE, -- 'free', 'basic', 'pro', 'premium'
  display_name TEXT NOT NULL, -- 'Free', 'Basic', 'Pro', 'Premium'
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2),
  features JSONB NOT NULL, -- Array of feature keys/descriptions
  game_limit INTEGER, -- NULL = unlimited
  photo_storage_limit_mb INTEGER, -- NULL = unlimited
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Default tiers can be inserted via migration or admin panel
```

### Subscriptions Table
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES subscription_tiers(id),
  status TEXT NOT NULL,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Games Table
```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  date TIMESTAMP NOT NULL,
  location_name TEXT,
  location_address TEXT,
  notes TEXT,
  score_photo_url TEXT,
  score_source TEXT CHECK (score_source IN ('manual', 'ocr')),
  ocr_confidence DECIMAL,
  frame_scores JSONB, -- Store individual frame scores if available
  custom_fields JSONB DEFAULT '{}', -- Store custom field values dynamically
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Custom Field Definitions Table (Admin-manageable)
```sql
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_key TEXT NOT NULL UNIQUE, -- e.g., 'oil_pattern', 'ball_used'
  field_name TEXT NOT NULL, -- Display name: 'Oil Pattern', 'Ball Used'
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'date', 'file')),
  field_options JSONB, -- For select type: ['House', 'Sport', 'THS'], etc.
  required BOOLEAN DEFAULT FALSE,
  tier_restriction UUID REFERENCES subscription_tiers(id), -- NULL = available to all
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Example custom fields:
-- Oil Pattern (select): House, Sport, THS, Challenge
-- Ball Used (text): Allow multiple balls
-- Lane Number (number)
-- Weather Conditions (text)
```

### OCR Configuration Table (Admin-manageable)
```sql
CREATE TABLE ocr_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL CHECK (provider IN ('tesseract', 'google_vision', 'aws_textract')),
  is_active BOOLEAN DEFAULT TRUE,
  api_key_encrypted TEXT, -- Encrypted API key if needed
  config JSONB, -- Provider-specific configuration
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Only one active OCR provider at a time
CREATE UNIQUE INDEX ocr_config_active ON ocr_config(provider) WHERE is_active = TRUE;
```

## Application Architecture

### Frontend Structure (Next.js App Router)
```
app/
  ├── (auth)/
  │   ├── login/
  │   ├── signup/
  │   └── reset-password/
  ├── (dashboard)/
  │   ├── dashboard/
  │   ├── games/
  │   │   ├── new/
  │   │   └── [id]/
  │   ├── analytics/
  │   └── settings/
  ├── (admin)/
  │   ├── admin/
  │   │   ├── tiers/          # Manage subscription tiers
  │   │   ├── custom-fields/  # Manage custom field definitions
  │   │   ├── ocr-config/     # Manage OCR provider settings
  │   │   └── users/          # User management
  ├── pricing/
  ├── api/
  │   ├── auth/
  │   ├── games/
  │   ├── ocr/
  │   ├── admin/
  │   │   ├── tiers/
  │   │   ├── custom-fields/
  │   │   └── ocr-config/
  │   └── webhooks/
  ├── layout.tsx
  └── page.tsx
```

### Key Components
- `ScoreUploader`: Handles photo upload and OCR processing
- `OCRProcessor`: Abstracted OCR service (swappable providers)
- `MaxScoreCalculator`: Calculates and displays maximum possible score
- `GameForm`: Form for manual entry or editing games (dynamically includes custom fields)
- `GameList`: Displays user's game history
- `AnalyticsDashboard`: Shows statistics and charts
- `SubscriptionManager`: Handles subscription upgrades/downgrades
- `AdminTierManager`: Manage subscription tiers (CRUD)
- `AdminCustomFieldsManager`: Manage custom field definitions
- `AdminOCRConfig`: Manage OCR provider configuration
- `CustomFieldRenderer`: Dynamically renders custom fields based on definitions

## OCR Implementation Strategy

### Architecture: Configurable OCR Provider System
- Abstract OCR interface that can swap between providers
- Admin panel to switch OCR providers without code changes
- Start with Tesseract.js (free, client-side)
- Easy upgrade path to cloud-based solutions

### OCR Provider Options

#### Option 1: Tesseract.js (Client-side) - **Default/Starting Point**
- **Pros**: Free, no API costs, works offline, no server processing
- **Cons**: Less accurate, slower processing, larger bundle size
- **Implementation**: Client-side processing via Web Workers

#### Option 2: Google Vision API
- **Pros**: Highly accurate, handles various image formats, fast
- **Cons**: API costs, requires server-side processing, API key management
- **Implementation**: Server-side API route that calls Google Vision

#### Option 3: AWS Textract
- **Pros**: Good accuracy, reasonable pricing, integrates with AWS ecosystem
- **Cons**: AWS account required, server-side processing
- **Implementation**: Server-side API route that calls AWS Textract

### OCR Service Abstraction Layer
```typescript
interface OCRProvider {
  processImage(image: File | Blob): Promise<OCRResult>;
  getConfidence(): number;
}

interface OCRResult {
  score: number;
  frameScores?: number[];
  confidence: number;
  rawText?: string;
}
```

**Implementation**: Create a factory pattern that returns the active OCR provider based on database configuration.

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Next.js project with TypeScript
- [ ] Configure Supabase project
- [ ] Set up authentication (login/signup)
- [ ] Create database schema
- [ ] Basic user dashboard layout

### Phase 2: Core Features (Week 3-4)
- [ ] Manual score entry
- [ ] Game list with CRUD operations
- [ ] Basic average calculation
- [ ] Date and location tracking
- [ ] Notes functionality

### Phase 3: OCR Integration (Week 5-6)
- [ ] Photo upload component
- [ ] OCR integration (Tesseract.js or API)
- [ ] Score extraction from images
- [ ] Maximum score calculator
- [ ] Photo storage in Supabase

### Phase 4: Analytics (Week 7)
- [ ] Advanced statistics calculation
- [ ] Charts and visualizations
- [ ] Export functionality
- [ ] Filtering and sorting

### Phase 5: Subscriptions (Week 8-9)
- [ ] Stripe integration
- [ ] Dynamic subscription tier system (database-driven)
- [ ] Admin panel for tier management
- [ ] Feature gating based on tier
- [ ] Webhook handlers for subscription events

### Phase 6: Custom Fields System (Week 9-10)
- [ ] Custom field definitions table and API
- [ ] Admin panel for managing custom fields
- [ ] Dynamic form generation for custom fields
- [ ] Custom field storage in games table (JSONB)
- [ ] Custom field filtering and analytics

### Phase 7: Admin Panel (Week 10-11)
- [ ] Admin authentication and authorization
- [ ] Subscription tier CRUD interface
- [ ] Custom field definitions management
- [ ] OCR configuration management
- [ ] User management interface

### Phase 8: Polish & Deploy (Week 11-12)
- [ ] UI/UX improvements
- [ ] Error handling
- [ ] Testing
- [ ] Deploy to Vercel
- [ ] Documentation

## Environment Variables Needed

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
# OCR API keys if using external service
GOOGLE_VISION_API_KEY=your_google_api_key (optional)
```

## Key Design Decisions

### Extensibility Principles
1. **Dynamic Subscription Tiers**: All tier definitions stored in database, admin can modify without code changes
2. **Custom Fields System**: Use JSONB for flexible field storage, definitions stored separately for validation
3. **Swappable OCR**: Abstract OCR interface allows switching providers via admin panel
4. **Feature Flags**: Tier-based feature gating uses database tier definitions, not hardcoded checks

### Data Model Considerations
- **Games.custom_fields (JSONB)**: Allows storing any custom field values without schema changes
  - Structure: `{ "oil_pattern": "House", "ball_used": "Pro Motion", "lane_number": 12 }`
- **Custom Field Definitions**: Separated for validation, UI generation, and analytics
- **Tier Features (JSONB)**: Flexible feature list per tier: `["ocr", "unlimited_games", "advanced_analytics"]`

## Next Steps

1. ✅ Confirmed: Subscription tier management via admin panel
2. ✅ Confirmed: Start with Tesseract.js (free OCR), configurable for future upgrades
3. ✅ Confirmed: Extensible custom fields system for oil patterns, balls, etc.
4. Set up Supabase project
5. Initialize Next.js project with TypeScript
6. Create database migrations
7. Begin Phase 1 implementation

