export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      calendar_events: {
        Row: {
          all_day: boolean
          city_id: string | null
          couple_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          ends_on: string | null
          id: string
          kind: string
          list_item_id: string | null
          note: string | null
          place: string | null
          repeats_yearly: boolean
          starts_at: string | null
          starts_on: string
          title: string
          traveler_id: string | null
          travelers: string | null
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          city_id?: string | null
          couple_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          ends_on?: string | null
          id?: string
          kind: string
          list_item_id?: string | null
          note?: string | null
          place?: string | null
          repeats_yearly?: boolean
          starts_at?: string | null
          starts_on: string
          title: string
          traveler_id?: string | null
          travelers?: string | null
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          city_id?: string | null
          couple_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          ends_on?: string | null
          id?: string
          kind?: string
          list_item_id?: string | null
          note?: string | null
          place?: string | null
          repeats_yearly?: boolean
          starts_at?: string | null
          starts_on?: string
          title?: string
          traveler_id?: string | null
          travelers?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_list_item"
            columns: ["list_item_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "list_items"
            referencedColumns: ["id", "couple_id"]
          },
          {
            foreignKeyName: "calendar_events_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          country_code: string
          couple_id: string | null
          created_at: string
          ibge_code: number | null
          id: string
          lat: number
          lng: number
          name: string
          osm_ref: string | null
          region: string | null
          state_code: string | null
        }
        Insert: {
          country_code: string
          couple_id?: string | null
          created_at?: string
          ibge_code?: number | null
          id?: string
          lat: number
          lng: number
          name: string
          osm_ref?: string | null
          region?: string | null
          state_code?: string | null
        }
        Update: {
          country_code?: string
          couple_id?: string | null
          created_at?: string
          ibge_code?: number | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          osm_ref?: string | null
          region?: string | null
          state_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cities_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          couple_id: string
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          invitee_name: string | null
          last_sent_at: string | null
          revoked_at: string | null
          send_count: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code: string
          couple_id: string
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          invitee_name?: string | null
          last_sent_at?: string | null
          revoked_at?: string | null
          send_count?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          couple_id?: string
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          invitee_name?: string | null
          last_sent_at?: string | null
          revoked_at?: string | null
          send_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "couple_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_invites_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_members: {
        Row: {
          couple_id: string
          joined_at: string
          profile_id: string
          slot: number
        }
        Insert: {
          couple_id: string
          joined_at?: string
          profile_id: string
          slot: number
        }
        Update: {
          couple_id?: string
          joined_at?: string
          profile_id?: string
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "couple_members_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_saved_cities: {
        Row: {
          added_by: string | null
          city_id: string
          couple_id: string
          created_at: string
        }
        Insert: {
          added_by?: string | null
          city_id: string
          couple_id: string
          created_at?: string
        }
        Update: {
          added_by?: string | null
          city_id?: string
          couple_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "couple_saved_cities_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_saved_cities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_saved_cities_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_settings: {
        Row: {
          calendar_default_view: string
          color_apart: string
          color_together_away: string
          color_together_home_1: string
          color_together_home_2: string
          couple_id: string
          hidden_categories: string[]
          list_default_sort: string
          remind_anniversary: boolean
          show_adjacent_days: boolean
          show_category_progress: boolean
          show_daily_suggestion: boolean
          show_day_markers: boolean
          show_home_counter: boolean
          updated_at: string
          use_couple_cover: boolean
          week_starts_on: string
        }
        Insert: {
          calendar_default_view?: string
          color_apart?: string
          color_together_away?: string
          color_together_home_1?: string
          color_together_home_2?: string
          couple_id: string
          hidden_categories?: string[]
          list_default_sort?: string
          remind_anniversary?: boolean
          show_adjacent_days?: boolean
          show_category_progress?: boolean
          show_daily_suggestion?: boolean
          show_day_markers?: boolean
          show_home_counter?: boolean
          updated_at?: string
          use_couple_cover?: boolean
          week_starts_on?: string
        }
        Update: {
          calendar_default_view?: string
          color_apart?: string
          color_together_away?: string
          color_together_home_1?: string
          color_together_home_2?: string
          couple_id?: string
          hidden_categories?: string[]
          list_default_sort?: string
          remind_anniversary?: boolean
          show_adjacent_days?: boolean
          show_category_progress?: boolean
          show_daily_suggestion?: boolean
          show_day_markers?: boolean
          show_home_counter?: boolean
          updated_at?: string
          use_couple_cover?: boolean
          week_starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "couple_settings_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: true
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          cover_path: string | null
          created_at: string
          id: string
          name: string | null
          started_on: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          id?: string
          name?: string | null
          started_on: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          id?: string
          name?: string | null
          started_on?: string
        }
        Relationships: []
      }
      day_kisses: {
        Row: {
          added_by: string | null
          couple_id: string
          created_at: string
          day: string
          id: string
        }
        Insert: {
          added_by?: string | null
          couple_id: string
          created_at?: string
          day: string
          id?: string
        }
        Update: {
          added_by?: string | null
          couple_id?: string
          created_at?: string
          day?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_kisses_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_kisses_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          added_by: string | null
          address: string | null
          category: string
          city: string | null
          country: string | null
          country_code: string | null
          couple_id: string
          created_at: string
          done_on: string | null
          done_solo_by: string | null
          done_with: string | null
          featured: boolean
          highlights: string[]
          id: string
          lat: number | null
          link: string | null
          lng: number | null
          name: string
          note: string | null
          photo_path: string | null
          platform: string | null
          rating: number | null
          region: string | null
          seasons: number | null
          state: string | null
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          added_by?: string | null
          address?: string | null
          category: string
          city?: string | null
          country?: string | null
          country_code?: string | null
          couple_id: string
          created_at?: string
          done_on?: string | null
          done_solo_by?: string | null
          done_with?: string | null
          featured?: boolean
          highlights?: string[]
          id?: string
          lat?: number | null
          link?: string | null
          lng?: number | null
          name: string
          note?: string | null
          photo_path?: string | null
          platform?: string | null
          rating?: number | null
          region?: string | null
          seasons?: number | null
          state?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          added_by?: string | null
          address?: string | null
          category?: string
          city?: string | null
          country?: string | null
          country_code?: string | null
          couple_id?: string
          created_at?: string
          done_on?: string | null
          done_solo_by?: string | null
          done_with?: string | null
          featured?: boolean
          highlights?: string[]
          id?: string
          lat?: number | null
          link?: string | null
          lng?: number | null
          name?: string
          note?: string | null
          photo_path?: string | null
          platform?: string | null
          rating?: number | null
          region?: string | null
          seasons?: number | null
          state?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "list_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_done_solo_by_fkey"
            columns: ["done_solo_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      list_memories: {
        Row: {
          body: string
          couple_id: string
          created_at: string
          item_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          body: string
          couple_id: string
          created_at?: string
          item_id: string
          profile_id?: string
          updated_at?: string
        }
        Update: {
          body?: string
          couple_id?: string
          created_at?: string
          item_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_memories_item"
            columns: ["item_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "list_items"
            referencedColumns: ["id", "couple_id"]
          },
          {
            foreignKeyName: "list_memories_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      list_photos: {
        Row: {
          added_by: string | null
          couple_id: string
          created_at: string
          id: string
          item_id: string
          path: string
        }
        Insert: {
          added_by?: string | null
          couple_id: string
          created_at?: string
          id?: string
          item_id: string
          path: string
        }
        Update: {
          added_by?: string | null
          couple_id?: string
          created_at?: string
          id?: string
          item_id?: string
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_photos_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_photos_item"
            columns: ["item_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "list_items"
            referencedColumns: ["id", "couple_id"]
          },
        ]
      }
      profile_settings: {
        Row: {
          notify_anniversary_app: boolean
          notify_anniversary_email: boolean
          notify_anniversary_push: boolean
          notify_own_reminders_app: boolean
          notify_own_reminders_email: boolean
          notify_own_reminders_push: boolean
          notify_partner_by_default: boolean
          notify_partner_done_app: boolean
          notify_partner_done_email: boolean
          notify_partner_done_push: boolean
          notify_partner_event_app: boolean
          notify_partner_event_email: boolean
          notify_partner_event_push: boolean
          notify_partner_list_item_app: boolean
          notify_partner_list_item_email: boolean
          notify_partner_list_item_push: boolean
          notify_trip_eve_app: boolean
          notify_trip_eve_email: boolean
          notify_trip_eve_push: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          notify_anniversary_app?: boolean
          notify_anniversary_email?: boolean
          notify_anniversary_push?: boolean
          notify_own_reminders_app?: boolean
          notify_own_reminders_email?: boolean
          notify_own_reminders_push?: boolean
          notify_partner_by_default?: boolean
          notify_partner_done_app?: boolean
          notify_partner_done_email?: boolean
          notify_partner_done_push?: boolean
          notify_partner_event_app?: boolean
          notify_partner_event_email?: boolean
          notify_partner_event_push?: boolean
          notify_partner_list_item_app?: boolean
          notify_partner_list_item_email?: boolean
          notify_partner_list_item_push?: boolean
          notify_trip_eve_app?: boolean
          notify_trip_eve_email?: boolean
          notify_trip_eve_push?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          notify_anniversary_app?: boolean
          notify_anniversary_email?: boolean
          notify_anniversary_push?: boolean
          notify_own_reminders_app?: boolean
          notify_own_reminders_email?: boolean
          notify_own_reminders_push?: boolean
          notify_partner_by_default?: boolean
          notify_partner_done_app?: boolean
          notify_partner_done_email?: boolean
          notify_partner_done_push?: boolean
          notify_partner_event_app?: boolean
          notify_partner_event_email?: boolean
          notify_partner_event_push?: boolean
          notify_partner_list_item_app?: boolean
          notify_partner_list_item_email?: boolean
          notify_partner_list_item_push?: boolean
          notify_trip_eve_app?: boolean
          notify_trip_eve_email?: boolean
          notify_trip_eve_push?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          color: string
          created_at: string
          display_name: string
          full_name: string
          home_city_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          display_name: string
          full_name: string
          home_city_id: string
          id: string
          user_id?: string | null
        }
        Update: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          display_name?: string
          full_name?: string
          home_city_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_city_id_fkey"
            columns: ["home_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      stays: {
        Row: {
          city_id: string
          couple_id: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          profile_id: string
          starts_on: string
        }
        Insert: {
          city_id: string
          couple_id: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          profile_id: string
          starts_on: string
        }
        Update: {
          city_id?: string
          couple_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          profile_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "stays_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_budget_lines: {
        Row: {
          couple_id: string
          id: string
          label: string
          planned_cents: number
          position: number
          spent_cents: number
          trip_id: string
        }
        Insert: {
          couple_id: string
          id?: string
          label: string
          planned_cents: number
          position?: number
          spent_cents?: number
          trip_id: string
        }
        Update: {
          couple_id?: string
          id?: string
          label?: string
          planned_cents?: number
          position?: number
          spent_cents?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_budget_trip"
            columns: ["trip_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["event_id", "couple_id"]
          },
        ]
      }
      trip_days: {
        Row: {
          couple_id: string
          day: string
          title: string
          trip_id: string
        }
        Insert: {
          couple_id: string
          day: string
          title: string
          trip_id: string
        }
        Update: {
          couple_id?: string
          day?: string
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_days_trip"
            columns: ["trip_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["event_id", "couple_id"]
          },
        ]
      }
      trip_departures: {
        Row: {
          couple_id: string
          note: string | null
          origin_code: string | null
          profile_id: string
          trip_id: string
        }
        Insert: {
          couple_id: string
          note?: string | null
          origin_code?: string | null
          profile_id: string
          trip_id: string
        }
        Update: {
          couple_id?: string
          note?: string | null
          origin_code?: string | null
          profile_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_departures_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_departures_trip"
            columns: ["trip_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["event_id", "couple_id"]
          },
        ]
      }
      trip_itinerary_items: {
        Row: {
          at: string | null
          couple_id: string
          created_at: string
          created_by: string | null
          day: string
          id: string
          kind: string
          list_item_id: string | null
          note: string | null
          position: number
          title: string
          trip_id: string
        }
        Insert: {
          at?: string | null
          couple_id: string
          created_at?: string
          created_by?: string | null
          day: string
          id?: string
          kind: string
          list_item_id?: string | null
          note?: string | null
          position?: number
          title: string
          trip_id: string
        }
        Update: {
          at?: string | null
          couple_id?: string
          created_at?: string
          created_by?: string | null
          day?: string
          id?: string
          kind?: string
          list_item_id?: string | null
          note?: string | null
          position?: number
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_itinerary_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_itinerary_list_item"
            columns: ["list_item_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "list_items"
            referencedColumns: ["id", "couple_id"]
          },
          {
            foreignKeyName: "trip_itinerary_trip"
            columns: ["trip_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["event_id", "couple_id"]
          },
        ]
      }
      trip_memories: {
        Row: {
          body: string
          couple_id: string
          profile_id: string
          rating: number
          trip_id: string
          updated_at: string
          written_on: string
        }
        Insert: {
          body: string
          couple_id: string
          profile_id?: string
          rating: number
          trip_id: string
          updated_at?: string
          written_on?: string
        }
        Update: {
          body?: string
          couple_id?: string
          profile_id?: string
          rating?: number
          trip_id?: string
          updated_at?: string
          written_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_memories_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_memories_trip"
            columns: ["trip_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["event_id", "couple_id"]
          },
        ]
      }
      trip_photos: {
        Row: {
          added_by: string | null
          caption: string | null
          couple_id: string
          created_at: string
          favorite: boolean
          id: string
          path: string
          taken_on: string | null
          trip_id: string
        }
        Insert: {
          added_by?: string | null
          caption?: string | null
          couple_id: string
          created_at?: string
          favorite?: boolean
          id?: string
          path: string
          taken_on?: string | null
          trip_id: string
        }
        Update: {
          added_by?: string | null
          caption?: string | null
          couple_id?: string
          created_at?: string
          favorite?: boolean
          id?: string
          path?: string
          taken_on?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_photos_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_photos_trip"
            columns: ["trip_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["event_id", "couple_id"]
          },
        ]
      }
      trip_prep_items: {
        Row: {
          couple_id: string
          detail: string | null
          done: boolean
          id: string
          kind: string
          label: string
          position: number
          trip_id: string
        }
        Insert: {
          couple_id: string
          detail?: string | null
          done?: boolean
          id?: string
          kind: string
          label: string
          position?: number
          trip_id: string
        }
        Update: {
          couple_id?: string
          detail?: string | null
          done?: boolean
          id?: string
          kind?: string
          label?: string
          position?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_prep_trip"
            columns: ["trip_id", "couple_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["event_id", "couple_id"]
          },
        ]
      }
      trips: {
        Row: {
          couple_id: string
          cover_photo_id: string | null
          created_at: string
          event_id: string
          lodging_address: string | null
          lodging_cents: number | null
          lodging_check_in: string | null
          lodging_check_out: string | null
          lodging_code: string | null
          lodging_name: string | null
          lodging_paid: boolean
          lodging_url: string | null
          updated_at: string
        }
        Insert: {
          couple_id: string
          cover_photo_id?: string | null
          created_at?: string
          event_id: string
          lodging_address?: string | null
          lodging_cents?: number | null
          lodging_check_in?: string | null
          lodging_check_out?: string | null
          lodging_code?: string | null
          lodging_name?: string | null
          lodging_paid?: boolean
          lodging_url?: string | null
          updated_at?: string
        }
        Update: {
          couple_id?: string
          cover_photo_id?: string | null
          created_at?: string
          event_id?: string
          lodging_address?: string | null
          lodging_cents?: number | null
          lodging_check_in?: string | null
          lodging_check_out?: string | null
          lodging_code?: string | null
          lodging_name?: string | null
          lodging_paid?: boolean
          lodging_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_cover_same_trip"
            columns: ["cover_photo_id", "event_id"]
            isOneToOne: false
            referencedRelation: "trip_photos"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "trips_event"
            columns: ["event_id", "couple_id"]
            isOneToOne: true
            referencedRelation: "calendar_events"
            referencedColumns: ["id", "couple_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: Json }
      begin_invite_send: { Args: { p_invite_id: string }; Returns: Json }
      cancel_invite: { Args: never; Returns: Json }
      create_couple: {
        Args: { p_name?: string; p_started_on: string }
        Returns: Json
      }
      create_event: { Args: { p_event: Json; p_paint: boolean }; Returns: Json }
      create_invite: {
        Args: { p_email: string; p_invitee_name?: string }
        Returns: Json
      }
      create_trip: { Args: { p_trip: Json }; Returns: Json }
      delete_couple: { Args: never; Returns: Json }
      end_my_session: { Args: { p_session_id: string }; Returns: Json }
      leave_couple: { Args: never; Returns: Json }
      list_my_sessions: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_current: boolean
          last_active_at: string
          user_agent: string
        }[]
      }
      lookup_invite: { Args: { p_code: string }; Returns: Json }
      mark_invite_sent: { Args: { p_invite_id: string }; Returns: undefined }
      mark_item_done: {
        Args: {
          p_done_on: string
          p_done_with: string
          p_item: string
          p_memory: string
          p_photo_paths: string[]
          p_rating: number
          p_solo_by: string
        }
        Returns: Json
      }
      paint_stays: { Args: { p_entries: Json }; Returns: Json }
      renew_invite: { Args: never; Returns: Json }
      save_pending_partner: {
        Args: {
          p_color: string
          p_display_name: string
          p_home_city_id: string
        }
        Returns: Json
      }
      search_cities: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          country_code: string
          couple_id: string | null
          created_at: string
          ibge_code: number | null
          id: string
          lat: number
          lng: number
          name: string
          osm_ref: string | null
          region: string | null
          state_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
