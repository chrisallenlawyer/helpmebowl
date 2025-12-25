export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          email: string | null
          subscription_tier_id: string | null
          subscription_status: string | null
          subscription_expires_at: string | null
          is_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          subscription_tier_id?: string | null
          subscription_status?: string | null
          subscription_expires_at?: string | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          subscription_tier_id?: string | null
          subscription_status?: string | null
          subscription_expires_at?: string | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      subscription_tiers: {
        Row: {
          id: string
          name: string
          display_name: string
          price_monthly: number | null
          price_yearly: number | null
          features: Json
          game_limit: number | null
          photo_storage_limit_mb: number | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          display_name: string
          price_monthly?: number | null
          price_yearly?: number | null
          features: Json
          game_limit?: number | null
          photo_storage_limit_mb?: number | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_name?: string
          price_monthly?: number | null
          price_yearly?: number | null
          features?: Json
          game_limit?: number | null
          photo_storage_limit_mb?: number | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      games: {
        Row: {
          id: string
          user_id: string
          score: number
          date: string
          location_name: string | null
          location_address: string | null
          notes: string | null
          score_photo_url: string | null
          score_source: 'manual' | 'ocr'
          ocr_confidence: number | null
          frame_scores: Json | null
          custom_fields: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          score: number
          date: string
          location_name?: string | null
          location_address?: string | null
          notes?: string | null
          score_photo_url?: string | null
          score_source?: 'manual' | 'ocr'
          ocr_confidence?: number | null
          frame_scores?: Json | null
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          score?: number
          date?: string
          location_name?: string | null
          location_address?: string | null
          notes?: string | null
          score_photo_url?: string | null
          score_source?: 'manual' | 'ocr'
          ocr_confidence?: number | null
          frame_scores?: Json | null
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
      }
      custom_field_definitions: {
        Row: {
          id: string
          field_key: string
          field_name: string
          field_type: 'text' | 'number' | 'select' | 'date' | 'file'
          field_options: Json | null
          required: boolean
          tier_restriction: string | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          field_key: string
          field_name: string
          field_type: 'text' | 'number' | 'select' | 'date' | 'file'
          field_options?: Json | null
          required?: boolean
          tier_restriction?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          field_key?: string
          field_name?: string
          field_type?: 'text' | 'number' | 'select' | 'date' | 'file'
          field_options?: Json | null
          required?: boolean
          tier_restriction?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

