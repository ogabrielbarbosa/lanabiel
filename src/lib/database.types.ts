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
      cities: {
        Row: {
          country_code: string
          created_at: string
          ibge_code: number | null
          id: string
          lat: number
          lng: number
          name: string
          state_code: string | null
        }
        Insert: {
          country_code: string
          created_at?: string
          ibge_code?: number | null
          id?: string
          lat: number
          lng: number
          name: string
          state_code?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          ibge_code?: number | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          state_code?: string | null
        }
        Relationships: []
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
        }
        Insert: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          display_name: string
          full_name: string
          home_city_id: string
          id: string
        }
        Update: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          display_name?: string
          full_name?: string
          home_city_id?: string
          id?: string
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
      create_invite: {
        Args: { p_email: string; p_invitee_name?: string }
        Returns: Json
      }
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
      renew_invite: { Args: never; Returns: Json }
      search_cities: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          country_code: string
          created_at: string
          ibge_code: number | null
          id: string
          lat: number
          lng: number
          name: string
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
