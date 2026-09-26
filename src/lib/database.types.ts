
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "cities": {
                  Row: {
                    "country_code": string,"created_at": string,"ibge_code": number | null,"id": string,"lat": number,"lng": number,"name": string,"state_code": string | null
                  }
                  Insert: {
                    "country_code": string,"created_at"?: string,"ibge_code"?: number | null,"id"?: string,"lat": number,"lng": number,"name": string,"state_code"?: string | null
                  }
                  Update: {
                    "country_code"?: string,"created_at"?: string,"ibge_code"?: number | null,"id"?: string,"lat"?: number,"lng"?: number,"name"?: string,"state_code"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"couple_invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"code": string,"couple_id": string,"created_at": string,"created_by": string,"email": string,"expires_at": string,"id": string,"invitee_name": string | null,"last_sent_at": string | null,"revoked_at": string | null,"send_count": number
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"code": string,"couple_id": string,"created_at"?: string,"created_by": string,"email": string,"expires_at": string,"id"?: string,"invitee_name"?: string | null,"last_sent_at"?: string | null,"revoked_at"?: string | null,"send_count"?: number
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"code"?: string,"couple_id"?: string,"created_at"?: string,"created_by"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invitee_name"?: string | null,"last_sent_at"?: string | null,"revoked_at"?: string | null,"send_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "couple_invites_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "couple_invites_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "couple_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"couple_members": {
                  Row: {
                    "couple_id": string,"joined_at": string,"profile_id": string,"slot": number
                  }
                  Insert: {
                    "couple_id": string,"joined_at"?: string,"profile_id": string,"slot": number
                  }
                  Update: {
                    "couple_id"?: string,"joined_at"?: string,"profile_id"?: string,"slot"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "couple_members_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "couple_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"couples": {
                  Row: {
                    "created_at": string,"id": string,"name": string | null,"started_on": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"started_on": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"started_on"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"color": string,"created_at": string,"display_name": string,"full_name": string,"home_city_id": string,"id": string
                  }
                  Insert: {
                    "avatar_path"?: string | null,"color"?: string,"created_at"?: string,"display_name": string,"full_name": string,"home_city_id": string,"id": string
                  }
                  Update: {
                    "avatar_path"?: string | null,"color"?: string,"created_at"?: string,"display_name"?: string,"full_name"?: string,"home_city_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_home_city_id_fkey"
      columns: ["home_city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    }
                  ]
                },"stays": {
                  Row: {
                    "city_id": string,"couple_id": string,"created_at": string,"created_by": string | null,"ends_on": string | null,"id": string,"profile_id": string,"starts_on": string
                  }
                  Insert: {
                    "city_id": string,"couple_id": string,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"id"?: string,"profile_id": string,"starts_on": string
                  }
                  Update: {
                    "city_id"?: string,"couple_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"id"?: string,"profile_id"?: string,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stays_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stays_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stays_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stays_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_code": string }; Returns: Json
                           },
"begin_invite_send":
{ Args: { "p_invite_id": string }; Returns: Json
                           },
"create_couple":
{ Args: { "p_name"?: string,"p_started_on": string }; Returns: Json
                           },
"create_invite":
{ Args: { "p_email": string,"p_invitee_name"?: string }; Returns: Json
                           },
"lookup_invite":
{ Args: { "p_code": string }; Returns: Json
                           },
"mark_invite_sent":
{ Args: { "p_invite_id": string }; Returns: undefined
                           },
"renew_invite":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"search_cities":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "country_code": string,
"created_at": string,
"ibge_code": number | null,
"id": string,
"lat": number,
"lng": number,
"name": string,
"state_code": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "cities"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

