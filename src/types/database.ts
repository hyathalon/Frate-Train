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
      ai_call_models: {
        Row: {
          call_type: string
          effort_member: string | null
          effort_other: string | null
          model: string
          updated_at: string
        }
        Insert: {
          call_type: string
          effort_member?: string | null
          effort_other?: string | null
          model: string
          updated_at?: string
        }
        Update: {
          call_type?: string
          effort_member?: string | null
          effort_other?: string | null
          model?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_models_model_fkey"
            columns: ["model"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["model"]
          },
        ]
      }
      ai_models: {
        Row: {
          cache_read_per_mtok_usd: number
          cache_write_per_mtok_usd: number
          input_per_mtok_usd: number
          model: string
          output_per_mtok_usd: number
          updated_at: string
        }
        Insert: {
          cache_read_per_mtok_usd: number
          cache_write_per_mtok_usd: number
          input_per_mtok_usd: number
          model: string
          output_per_mtok_usd: number
          updated_at?: string
        }
        Update: {
          cache_read_per_mtok_usd?: number
          cache_write_per_mtok_usd?: number
          input_per_mtok_usd?: number
          model?: string
          output_per_mtok_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
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
      athlete_coach_profiles: {
        Row: {
          athlete_id: string
          coach_notes: string | null
          limiters: string | null
          priority_pillars: string[]
          share_notes: boolean
          strengths: string[]
          updated_at: string
          updated_by: string | null
          weaknesses: string[]
        }
        Insert: {
          athlete_id: string
          coach_notes?: string | null
          limiters?: string | null
          priority_pillars?: string[]
          share_notes?: boolean
          strengths?: string[]
          updated_at?: string
          updated_by?: string | null
          weaknesses?: string[]
        }
        Update: {
          athlete_id?: string
          coach_notes?: string | null
          limiters?: string | null
          priority_pillars?: string[]
          share_notes?: boolean
          strengths?: string[]
          updated_at?: string
          updated_by?: string | null
          weaknesses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "athlete_coach_profiles_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_credit_ledger: {
        Row: {
          amount: number | null
          athlete_id: string
          created_at: string
          currency: string | null
          delta: number
          id: number
          kind: string
          program_id: string | null
          provider: string | null
          provider_ref: string | null
          reason: string
        }
        Insert: {
          amount?: number | null
          athlete_id: string
          created_at?: string
          currency?: string | null
          delta: number
          id?: never
          kind: string
          program_id?: string | null
          provider?: string | null
          provider_ref?: string | null
          reason: string
        }
        Update: {
          amount?: number | null
          athlete_id?: string
          created_at?: string
          currency?: string | null
          delta?: number
          id?: never
          kind?: string
          program_id?: string | null
          provider?: string | null
          provider_ref?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_credit_ledger_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          athlete_type: string | null
          billing_customer_ref: string | null
          billing_provider: string | null
          billing_status: string
          coach_user_id: string | null
          created_at: string | null
          equipment: string[] | null
          goal_date: string | null
          goal_race: string | null
          id: string
          level: string | null
          name: string | null
          tier: string
          timezone: string
          training_days_per_week: number | null
          training_locations: string[]
          user_id: string | null
        }
        Insert: {
          athlete_type?: string | null
          billing_customer_ref?: string | null
          billing_provider?: string | null
          billing_status?: string
          coach_user_id?: string | null
          created_at?: string | null
          equipment?: string[] | null
          goal_date?: string | null
          goal_race?: string | null
          id?: string
          level?: string | null
          name?: string | null
          tier?: string
          timezone?: string
          training_days_per_week?: number | null
          training_locations?: string[]
          user_id?: string | null
        }
        Update: {
          athlete_type?: string | null
          billing_customer_ref?: string | null
          billing_provider?: string | null
          billing_status?: string
          coach_user_id?: string | null
          created_at?: string | null
          equipment?: string[] | null
          goal_date?: string | null
          goal_race?: string | null
          id?: string
          level?: string | null
          name?: string | null
          tier?: string
          timezone?: string
          training_days_per_week?: number | null
          training_locations?: string[]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_coach_user_id_fkey"
            columns: ["coach_user_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
        ]
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
      coach_alerts: {
        Row: {
          alert_date: string
          athlete_id: string | null
          created_at: string
          details: Json | null
          id: number
          kind: string
          message: string
          program_id: string | null
          read_at: string | null
          read_by: string | null
        }
        Insert: {
          alert_date: string
          athlete_id?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          kind: string
          message: string
          program_id?: string | null
          read_at?: string | null
          read_by?: string | null
        }
        Update: {
          alert_date?: string
          athlete_id?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          kind?: string
          message?: string
          program_id?: string | null
          read_at?: string | null
          read_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_alerts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_alerts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
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
          acute_risk: string
          best_with: string
          body_region: string
          created_at: string
          difficulty: string
          equipment: string
          equipment_options: Json
          id: string
          is_active: boolean
          media_url: string | null
          methods: string[]
          movement_pattern: string
          name: string
          name_normalized: string | null
          primary_pillar: string
          promoted_from: string | null
          secondary_pillar: string | null
          source: string
          tabata_suitable: boolean
          updated_at: string
          where_setting: string
        }
        Insert: {
          acute_risk?: string
          best_with: string
          body_region: string
          created_at?: string
          difficulty: string
          equipment: string
          equipment_options?: Json
          id: string
          is_active?: boolean
          media_url?: string | null
          methods?: string[]
          movement_pattern: string
          name: string
          name_normalized?: string | null
          primary_pillar: string
          promoted_from?: string | null
          secondary_pillar?: string | null
          source?: string
          tabata_suitable?: boolean
          updated_at?: string
          where_setting: string
        }
        Update: {
          acute_risk?: string
          best_with?: string
          body_region?: string
          created_at?: string
          difficulty?: string
          equipment?: string
          equipment_options?: Json
          id?: string
          is_active?: boolean
          media_url?: string | null
          methods?: string[]
          movement_pattern?: string
          name?: string
          name_normalized?: string | null
          primary_pillar?: string
          promoted_from?: string | null
          secondary_pillar?: string | null
          source?: string
          tabata_suitable?: boolean
          updated_at?: string
          where_setting?: string
        }
        Relationships: []
      }
      generation_events: {
        Row: {
          athlete_id: string | null
          block_no: number | null
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          call_type: string
          cost_usd: number
          counts_as: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: number
          input_tokens: number
          is_repair: boolean
          model: string
          output_tokens: number
          paid_with: string | null
          program_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          block_no?: number | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          call_type: string
          cost_usd?: number
          counts_as?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: never
          input_tokens?: number
          is_repair?: boolean
          model: string
          output_tokens?: number
          paid_with?: string | null
          program_id?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          block_no?: number | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          call_type?: string
          cost_usd?: number
          counts_as?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: never
          input_tokens?: number
          is_repair?: boolean
          model?: string
          output_tokens?: number
          paid_with?: string | null
          program_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_events_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
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
      program_blocks: {
        Row: {
          attempts: number
          block_no: number
          created_at: string
          end_week: number
          generated_at: string | null
          id: string
          kind: string
          last_error: string | null
          program_id: string
          sessions: Json | null
          start_week: number
          started_at: string | null
          status: string
          targets: Json | null
        }
        Insert: {
          attempts?: number
          block_no: number
          created_at?: string
          end_week: number
          generated_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          program_id: string
          sessions?: Json | null
          start_week: number
          started_at?: string | null
          status?: string
          targets?: Json | null
        }
        Update: {
          attempts?: number
          block_no?: number
          created_at?: string
          end_week?: number
          generated_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          program_id?: string
          sessions?: Json | null
          start_week?: number
          started_at?: string | null
          status?: string
          targets?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "program_blocks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_checkins: {
        Row: {
          block_no: number
          core_done_per_week: number[]
          created_at: string
          days_available: number
          difficulty: number
          health: Json | null
          health_consent_at: string | null
          id: string
          optional_completions: Json
          program_id: string
          submitted_by: string
        }
        Insert: {
          block_no: number
          core_done_per_week: number[]
          created_at?: string
          days_available: number
          difficulty: number
          health?: Json | null
          health_consent_at?: string | null
          id?: string
          optional_completions?: Json
          program_id: string
          submitted_by: string
        }
        Update: {
          block_no?: number
          core_done_per_week?: number[]
          created_at?: string
          days_available?: number
          difficulty?: number
          health?: Json | null
          health_consent_at?: string | null
          id?: string
          optional_completions?: Json
          program_id?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_checkins_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
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
      program_outline_versions: {
        Row: {
          created_at: string
          outline: Json
          program_id: string
          reason: string
          version: number
        }
        Insert: {
          created_at?: string
          outline: Json
          program_id: string
          reason: string
          version: number
        }
        Update: {
          created_at?: string
          outline?: Json
          program_id?: string
          reason?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_outline_versions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
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
      race_format_options: {
        Row: {
          format: string
          id: string
          is_default: boolean
          label: string
          race_code: string
          run_distance_m: number | null
          sort_order: number
        }
        Insert: {
          format: string
          id: string
          is_default?: boolean
          label: string
          race_code: string
          run_distance_m?: number | null
          sort_order: number
        }
        Update: {
          format?: string
          id?: string
          is_default?: boolean
          label?: string
          race_code?: string
          run_distance_m?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "race_format_options_race_code_fkey"
            columns: ["race_code"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["code"]
          },
        ]
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
      rehab_global_guidance: {
        Row: {
          items: string[]
          key: string
          sort_order: number | null
          title: string
        }
        Insert: {
          items: string[]
          key: string
          sort_order?: number | null
          title: string
        }
        Update: {
          items?: string[]
          key?: string
          sort_order?: number | null
          title?: string
        }
        Relationships: []
      }
      rehab_phase_exercises: {
        Row: {
          dose: string
          exercise_id: string
          notes: string | null
          phase_no: number
          program_id: string
          sort_order: number
          tempo: string | null
        }
        Insert: {
          dose: string
          exercise_id: string
          notes?: string | null
          phase_no: number
          program_id: string
          sort_order: number
          tempo?: string | null
        }
        Update: {
          dose?: string
          exercise_id?: string
          notes?: string | null
          phase_no?: number
          program_id?: string
          sort_order?: number
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rehab_phase_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehab_phase_exercises_program_id_phase_no_fkey"
            columns: ["program_id", "phase_no"]
            isOneToOne: false
            referencedRelation: "rehab_phases"
            referencedColumns: ["program_id", "phase_no"]
          },
        ]
      }
      rehab_phases: {
        Row: {
          entry_criteria: string
          exit_criteria: string
          frequency: string | null
          goal: string
          healing_stage: string | null
          name: string
          phase_no: number
          program_id: string
          running_guidance: string | null
          training_focus: string | null
          typical_duration: string | null
        }
        Insert: {
          entry_criteria: string
          exit_criteria: string
          frequency?: string | null
          goal: string
          healing_stage?: string | null
          name: string
          phase_no: number
          program_id: string
          running_guidance?: string | null
          training_focus?: string | null
          typical_duration?: string | null
        }
        Update: {
          entry_criteria?: string
          exit_criteria?: string
          frequency?: string | null
          goal?: string
          healing_stage?: string | null
          name?: string
          phase_no?: number
          program_id?: string
          running_guidance?: string | null
          training_focus?: string | null
          typical_duration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rehab_phases_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "rehab_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_programs: {
        Row: {
          also_known_as: string | null
          body_area: string | null
          clinician_notes: string[]
          clinician_required: boolean
          discharge_criteria: string[]
          disclaimer: string
          id: string
          injury_type: string | null
          name: string
          overview: string
          pain_rule: string
          physio_review_points: string[]
          red_flags: string[]
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          seek_assessment: string | null
          typical_duration: string | null
        }
        Insert: {
          also_known_as?: string | null
          body_area?: string | null
          clinician_notes?: string[]
          clinician_required?: boolean
          discharge_criteria?: string[]
          disclaimer?: string
          id: string
          injury_type?: string | null
          name: string
          overview: string
          pain_rule: string
          physio_review_points?: string[]
          red_flags: string[]
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seek_assessment?: string | null
          typical_duration?: string | null
        }
        Update: {
          also_known_as?: string | null
          body_area?: string | null
          clinician_notes?: string[]
          clinician_required?: boolean
          discharge_criteria?: string[]
          disclaimer?: string
          id?: string
          injury_type?: string | null
          name?: string
          overview?: string
          pain_rule?: string
          physio_review_points?: string[]
          red_flags?: string[]
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seek_assessment?: string | null
          typical_duration?: string | null
        }
        Relationships: []
      }
      return_to_run_plans: {
        Row: {
          id: string
          name: string
          prerequisites: string
          progression_rule: string
        }
        Insert: {
          id: string
          name: string
          prerequisites: string
          progression_rule: string
        }
        Update: {
          id?: string
          name?: string
          prerequisites?: string
          progression_rule?: string
        }
        Relationships: []
      }
      return_to_run_steps: {
        Row: {
          plan_id: string
          repeats: string | null
          run_walk: string
          step: number
          total_min: number
        }
        Insert: {
          plan_id: string
          repeats?: string | null
          run_walk: string
          step: number
          total_min: number
        }
        Update: {
          plan_id?: string
          repeats?: string | null
          run_walk?: string
          step?: number
          total_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "return_to_run_steps_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "return_to_run_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      session_exercise_edits: {
        Row: {
          action: string
          block_no: number
          created_at: string
          created_by: string
          dose: string | null
          id: number
          original: Json | null
          position: number | null
          program_id: string
          replacement_custom_exercise_id: string | null
          replacement_exercise_id: string | null
          reverted_at: string | null
          session_key: string
          week: number
        }
        Insert: {
          action: string
          block_no: number
          created_at?: string
          created_by?: string
          dose?: string | null
          id?: never
          original?: Json | null
          position?: number | null
          program_id: string
          replacement_custom_exercise_id?: string | null
          replacement_exercise_id?: string | null
          reverted_at?: string | null
          session_key: string
          week: number
        }
        Update: {
          action?: string
          block_no?: number
          created_at?: string
          created_by?: string
          dose?: string | null
          id?: never
          original?: Json | null
          position?: number | null
          program_id?: string
          replacement_custom_exercise_id?: string | null
          replacement_exercise_id?: string | null
          reverted_at?: string | null
          session_key?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_exercise_edits_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_exercise_edits_replacement_custom_exercise_id_fkey"
            columns: ["replacement_custom_exercise_id"]
            isOneToOne: false
            referencedRelation: "custom_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_exercise_edits_replacement_exercise_id_fkey"
            columns: ["replacement_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      session_formats: {
        Row: {
          description: string
          dose_kind: string
          format: string
          label: string
          needs_template: boolean
          rules: Json
          running: string
          score: string
          updated_at: string
        }
        Insert: {
          description: string
          dose_kind: string
          format: string
          label: string
          needs_template?: boolean
          rules: Json
          running?: string
          score?: string
          updated_at?: string
        }
        Update: {
          description?: string
          dose_kind?: string
          format?: string
          label?: string
          needs_template?: boolean
          rules?: Json
          running?: string
          score?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_template_slots: {
        Row: {
          body_region: string | null
          hint: string | null
          label: string
          movement_patterns: string[]
          slot_order: number
          template_id: string
        }
        Insert: {
          body_region?: string | null
          hint?: string | null
          label: string
          movement_patterns: string[]
          slot_order: number
          template_id: string
        }
        Update: {
          body_region?: string | null
          hint?: string | null
          label?: string
          movement_patterns?: string[]
          slot_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_template_slots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "session_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      session_templates: {
        Row: {
          change_seconds: number | null
          cooldown_min: number
          dose: string | null
          duration_min: number
          estimated_min: number
          exercise_count: number
          focus: string
          id: string
          level: string
          method: string
          name: string
          rest_seconds: number | null
          rounds: number | null
          sets: number | null
          structure: string
          warmup_min: number
          work_seconds: number | null
        }
        Insert: {
          change_seconds?: number | null
          cooldown_min: number
          dose?: string | null
          duration_min: number
          estimated_min: number
          exercise_count: number
          focus: string
          id: string
          level: string
          method: string
          name: string
          rest_seconds?: number | null
          rounds?: number | null
          sets?: number | null
          structure: string
          warmup_min: number
          work_seconds?: number | null
        }
        Update: {
          change_seconds?: number | null
          cooldown_min?: number
          dose?: string | null
          duration_min?: number
          estimated_min?: number
          exercise_count?: number
          focus?: string
          id?: string
          level?: string
          method?: string
          name?: string
          rest_seconds?: number | null
          rounds?: number | null
          sets?: number | null
          structure?: string
          warmup_min?: number
          work_seconds?: number | null
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
      training_programs: {
        Row: {
          archived_at: string | null
          athlete_id: string
          confirmed_at: string | null
          created_at: string
          created_by: string
          id: string
          inputs: Json
          outline: Json | null
          outline_version: number
          race_date: string
          race_name: string | null
          start_date: string
          status: string
          total_weeks: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          athlete_id: string
          confirmed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          inputs?: Json
          outline?: Json | null
          outline_version?: number
          race_date: string
          race_name?: string | null
          start_date: string
          status?: string
          total_weeks: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          athlete_id?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          inputs?: Json
          outline?: Json | null
          outline_version?: number
          race_date?: string
          race_name?: string | null
          start_date?: string
          status?: string
          total_weeks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_programs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_checkins: {
        Row: {
          availability: Json | null
          created_at: string
          energy: string
          health: Json | null
          health_consent_at: string | null
          id: string
          last_error: string | null
          previous_week: Json | null
          program_id: string
          reasons: string[]
          sleep: string
          status: string
          submitted_by: string
          updated_at: string
          week: number
        }
        Insert: {
          availability?: Json | null
          created_at?: string
          energy: string
          health?: Json | null
          health_consent_at?: string | null
          id?: string
          last_error?: string | null
          previous_week?: Json | null
          program_id: string
          reasons?: string[]
          sleep: string
          status?: string
          submitted_by: string
          updated_at?: string
          week: number
        }
        Update: {
          availability?: Json | null
          created_at?: string
          energy?: string
          health?: Json | null
          health_consent_at?: string | null
          id?: string
          last_error?: string | null
          previous_week?: Json | null
          program_id?: string
          reasons?: string[]
          sleep?: string
          status?: string
          submitted_by?: string
          updated_at?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_checkins_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
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
      my_shared_coach_notes: { Args: never; Returns: string }
      owns_program: { Args: { p_program_id: string }; Returns: boolean }
      plan_format: {
        Args: { p_format: string; p_level?: string; p_minutes: number }
        Returns: Json
      }
      plan_session: {
        Args: { p_level?: string; p_method: string; p_minutes: number }
        Returns: {
          change_seconds: number
          cooldown_min: number
          estimated_min: number
          exercise_count: number
          rest_seconds: number
          rounds: number
          sets: number
          structure: string
          warmup_min: number
          work_seconds: number
        }[]
      }
      plan_session_frame: {
        Args: { p_minutes: number }
        Returns: {
          cooldown_min: number
          warmup_min: number
        }[]
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
