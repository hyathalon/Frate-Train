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
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          key: string
          value: number
        }
        Insert: {
          description?: string | null
          key: string
          value: number
        }
        Update: {
          description?: string | null
          key?: string
          value?: number
        }
        Relationships: []
      }
      athletes: {
        Row: {
          athlete_type: string | null
          created_at: string | null
          equipment: string[] | null
          goal_date: string | null
          goal_race: string | null
          id: string
          level: string | null
          name: string | null
          training_days_per_week: number | null
        }
        Insert: {
          athlete_type?: string | null
          created_at?: string | null
          equipment?: string[] | null
          goal_date?: string | null
          goal_race?: string | null
          id?: string
          level?: string | null
          name?: string | null
          training_days_per_week?: number | null
        }
        Update: {
          athlete_type?: string | null
          created_at?: string | null
          equipment?: string[] | null
          goal_date?: string | null
          goal_race?: string | null
          id?: string
          level?: string | null
          name?: string | null
          training_days_per_week?: number | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          block_order: number | null
          focus: string | null
          id: string
          name: string
          program_id: string | null
        }
        Insert: {
          block_order?: number | null
          focus?: string | null
          id?: string
          name: string
          program_id?: string | null
        }
        Update: {
          block_order?: number | null
          focus?: string | null
          id?: string
          name?: string
          program_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          created_at: string
          display_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      custom_exercises: {
        Row: {
          created_at: string
          created_by: string
          equipment: string | null
          id: string
          merged_into: string | null
          movement_pattern: string | null
          name: string
          name_normalized: string | null
          notes: string | null
          promoted_exercise_id: string | null
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          equipment?: string | null
          id?: string
          merged_into?: string | null
          movement_pattern?: string | null
          name: string
          name_normalized?: string | null
          notes?: string | null
          promoted_exercise_id?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          equipment?: string | null
          id?: string
          merged_into?: string | null
          movement_pattern?: string | null
          name?: string
          name_normalized?: string | null
          notes?: string | null
          promoted_exercise_id?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_exercises_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_exercises_promoted_exercise_id_fkey"
            columns: ["promoted_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_aliases: {
        Row: {
          alias: string
          alias_normalized: string | null
          created_at: string
          exercise_id: string
          id: number
        }
        Insert: {
          alias: string
          alias_normalized?: string | null
          created_at?: string
          exercise_id: string
          id?: never
        }
        Update: {
          alias?: string
          alias_normalized?: string | null
          created_at?: string
          exercise_id?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "exercise_aliases_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_usage: {
        Row: {
          athlete_id: string
          custom_exercise_id: string | null
          exercise_id: string | null
          id: number
          used_at: string
          workout_ref: string | null
        }
        Insert: {
          athlete_id?: string
          custom_exercise_id?: string | null
          exercise_id?: string | null
          id?: never
          used_at?: string
          workout_ref?: string | null
        }
        Update: {
          athlete_id?: string
          custom_exercise_id?: string | null
          exercise_id?: string | null
          id?: never
          used_at?: string
          workout_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_usage_custom_exercise_id_fkey"
            columns: ["custom_exercise_id"]
            isOneToOne: false
            referencedRelation: "custom_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_usage_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          best_with: string
          created_at: string
          equipment: string
          equipment_options: Json
          id: string
          is_active: boolean
          media_url: string | null
          movement_pattern: string
          name: string
          name_normalized: string | null
          primary_pillar: string
          promoted_from: string | null
          secondary_pillar: string | null
          source: string
          updated_at: string
          where_setting: string
        }
        Insert: {
          best_with: string
          created_at?: string
          equipment: string
          equipment_options?: Json
          id: string
          is_active?: boolean
          media_url?: string | null
          movement_pattern: string
          name: string
          name_normalized?: string | null
          primary_pillar: string
          promoted_from?: string | null
          secondary_pillar?: string | null
          source?: string
          updated_at?: string
          where_setting: string
        }
        Update: {
          best_with?: string
          created_at?: string
          equipment?: string
          equipment_options?: Json
          id?: string
          is_active?: boolean
          media_url?: string | null
          movement_pattern?: string
          name?: string
          name_normalized?: string | null
          primary_pillar?: string
          promoted_from?: string | null
          secondary_pillar?: string | null
          source?: string
          updated_at?: string
          where_setting?: string
        }
        Relationships: []
      }
      hyathlon_reference: {
        Row: {
          content: string
          created_at: string | null
          filename: string
          id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          filename: string
          id?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          filename?: string
          id?: string
        }
        Relationships: []
      }
      program_exercises: {
        Row: {
          block_id: string | null
          difficulty: string | null
          equipment_type: string | null
          gif_url: string | null
          id: string
          instructions: string | null
          muscle_group: string | null
          name: string
          notes: string | null
          reps: string | null
          rest: string | null
          sets: string | null
        }
        Insert: {
          block_id?: string | null
          difficulty?: string | null
          equipment_type?: string | null
          gif_url?: string | null
          id?: string
          instructions?: string | null
          muscle_group?: string | null
          name: string
          notes?: string | null
          reps?: string | null
          rest?: string | null
          sets?: string | null
        }
        Update: {
          block_id?: string | null
          difficulty?: string | null
          equipment_type?: string | null
          gif_url?: string | null
          id?: string
          instructions?: string | null
          muscle_group?: string | null
          name?: string
          notes?: string | null
          reps?: string | null
          rest?: string | null
          sets?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          athlete_name: string | null
          avg_time: string | null
          category: string | null
          code: string
          created_at: string | null
          equipment: string | null
          frequency: string | null
          goal: string | null
          id: string
          injuries: string | null
          level: string | null
          method: string | null
          name: string
          program_json: Json | null
          sessions_per_week: number | null
          setting: string | null
          source: string
        }
        Insert: {
          athlete_name?: string | null
          avg_time?: string | null
          category?: string | null
          code: string
          created_at?: string | null
          equipment?: string | null
          frequency?: string | null
          goal?: string | null
          id?: string
          injuries?: string | null
          level?: string | null
          method?: string | null
          name: string
          program_json?: Json | null
          sessions_per_week?: number | null
          setting?: string | null
          source?: string
        }
        Update: {
          athlete_name?: string | null
          avg_time?: string | null
          category?: string | null
          code?: string
          created_at?: string | null
          equipment?: string | null
          frequency?: string | null
          goal?: string | null
          id?: string
          injuries?: string | null
          level?: string | null
          method?: string | null
          name?: string
          program_json?: Json | null
          sessions_per_week?: number | null
          setting?: string | null
          source?: string
        }
        Relationships: []
      }
      race_formats: {
        Row: {
          format: string
          id: number
          race_code: string
          segment: string
          sort_order: number
        }
        Insert: {
          format: string
          id?: never
          race_code: string
          segment: string
          sort_order: number
        }
        Update: {
          format?: string
          id?: never
          race_code?: string
          segment?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "race_formats_race_code_fkey"
            columns: ["race_code"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["code"]
          },
        ]
      }
      race_sessions: {
        Row: {
          best_with: string
          courage: string | null
          dose: string | null
          id: string
          load: string
          name: string
          primary_pillar: string
          secondary_pillar: string | null
          session_type: string
          sort_order: number
          station_id: string
          where_setting: string
        }
        Insert: {
          best_with: string
          courage?: string | null
          dose?: string | null
          id: string
          load: string
          name: string
          primary_pillar: string
          secondary_pillar?: string | null
          session_type: string
          sort_order: number
          station_id: string
          where_setting: string
        }
        Update: {
          best_with?: string
          courage?: string | null
          dose?: string | null
          id?: string
          load?: string
          name?: string
          primary_pillar?: string
          secondary_pillar?: string | null
          session_type?: string
          sort_order?: number
          station_id?: string
          where_setting?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      races: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      reference_documents: {
        Row: {
          char_count: number
          content: string
          filename: string
          id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          char_count: number
          content: string
          filename: string
          id?: string
          source_type: string
          updated_at?: string
        }
        Update: {
          char_count?: number
          content?: string
          filename?: string
          id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      station_prescriptions: {
        Row: {
          best_with: string
          dose: string | null
          exercise_id: string
          id: number
          level: string
          list: string
          load: string
          primary_pillar: string
          secondary_pillar: string | null
          sort_order: number
          station_id: string
          where_setting: string
        }
        Insert: {
          best_with: string
          dose?: string | null
          exercise_id: string
          id?: never
          level: string
          list?: string
          load: string
          primary_pillar: string
          secondary_pillar?: string | null
          sort_order: number
          station_id: string
          where_setting: string
        }
        Update: {
          best_with?: string
          dose?: string | null
          exercise_id?: string
          id?: never
          level?: string
          list?: string
          load?: string
          primary_pillar?: string
          secondary_pillar?: string | null
          sort_order?: number
          station_id?: string
          where_setting?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_prescriptions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_prescriptions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_races: {
        Row: {
          race_code: string
          standard: string
          station_id: string
        }
        Insert: {
          race_code: string
          standard: string
          station_id: string
        }
        Update: {
          race_code?: string
          standard?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_races_race_code_fkey"
            columns: ["race_code"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "station_races_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          group_name: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          group_name: string
          id: string
          name: string
          sort_order: number
        }
        Update: {
          group_name?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_promotion_candidates: {
        Row: {
          athletes: number | null
          closest_library_id: string | null
          closest_library_name: string | null
          custom_exercise_ids: string[] | null
          example_name: string | null
          last_used: string | null
          name_normalized: string | null
          uses: number | null
        }
        Relationships: []
      }
      v_station_library: {
        Row: {
          best_with: string | null
          courage: string | null
          dose: string | null
          equipment: string | null
          group_name: string | null
          item_id: string | null
          level: string | null
          load: string | null
          media_url: string | null
          movement_pattern: string | null
          name: string | null
          primary_pillar: string | null
          row_type: string | null
          secondary_pillar: string | null
          session_type: string | null
          sort_order: number | null
          station: string | null
          station_id: string | null
          where_setting: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_coach: { Args: never; Returns: boolean }
      is_valid_pillar: { Args: { p: string }; Returns: boolean }
      merge_custom_exercise: {
        Args: { p_custom_id: string; p_exercise_id: string; p_note?: string }
        Returns: number
      }
      promote_custom_exercise: {
        Args: {
          p_best_with?: string
          p_custom_id: string
          p_equipment: string
          p_equipment_options?: Json
          p_movement_pattern: string
          p_name: string
          p_note?: string
          p_primary_pillar: string
          p_secondary_pillar?: string
          p_where_setting?: string
        }
        Returns: string
      }
      reject_custom_exercise: {
        Args: { p_custom_id: string; p_note?: string }
        Returns: number
      }
      search_exercises: {
        Args: { max_results?: number; q: string }
        Returns: {
          exercise_id: string
          matched_on: string
          name: string
          score: number
        }[]
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
  public: {
    Enums: {},
  },
} as const
