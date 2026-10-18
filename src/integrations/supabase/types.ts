export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agent_connections: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          id: string;
          last_checked_at: string | null;
          mcp_url: string;
          name: string;
          state: string;
          toolkit_id: string | null;
          transport: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          id?: string;
          last_checked_at?: string | null;
          mcp_url: string;
          name: string;
          state?: string;
          toolkit_id?: string | null;
          transport?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          id?: string;
          last_checked_at?: string | null;
          mcp_url?: string;
          name?: string;
          state?: string;
          toolkit_id?: string | null;
          transport?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_connections_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_connections_toolkit_id_fkey";
            columns: ["toolkit_id"];
            isOneToOne: false;
            referencedRelation: "toolkits";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_definitions: {
        Row: {
          capabilities: string[];
          created_at: string;
          enabled: boolean;
          execution_policy: Json;
          id: string;
          role: string;
          supervisor_id: string | null;
          updated_at: string;
        };
        Insert: {
          capabilities?: string[];
          created_at?: string;
          enabled?: boolean;
          execution_policy?: Json;
          id: string;
          role: string;
          supervisor_id?: string | null;
          updated_at?: string;
        };
        Update: {
          capabilities?: string[];
          created_at?: string;
          enabled?: boolean;
          execution_policy?: Json;
          id?: string;
          role?: string;
          supervisor_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_definitions_supervisor_id_fkey";
            columns: ["supervisor_id"];
            isOneToOne: false;
            referencedRelation: "agent_definitions";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_delegations: {
        Row: {
          child_id: string;
          parent_id: string;
        };
        Insert: {
          child_id: string;
          parent_id: string;
        };
        Update: {
          child_id?: string;
          parent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_delegations_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "agent_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_delegations_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "agent_definitions";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          access_profile: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          name: string;
          organization_id: string | null;
          project_id: string | null;
          revoked_at: string | null;
          scopes: string[];
          user_id: string;
          workspace_id: string | null;
        };
        Insert: {
          access_profile?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          name: string;
          organization_id?: string | null;
          project_id?: string | null;
          revoked_at?: string | null;
          scopes?: string[];
          user_id: string;
          workspace_id?: string | null;
        };
        Update: {
          access_profile?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          name?: string;
          organization_id?: string | null;
          project_id?: string | null;
          revoked_at?: string | null;
          scopes?: string[];
          user_id?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_keys_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_keys_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      app_connections: {
        Row: {
          created_at: string;
          credential_reference: string | null;
          display_name: string;
          id: string;
          last_used_at: string | null;
          metadata: Json;
          provider: string;
          provider_account_id: string | null;
          scopes: string[];
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credential_reference?: string | null;
          display_name: string;
          id?: string;
          last_used_at?: string | null;
          metadata?: Json;
          provider: string;
          provider_account_id?: string | null;
          scopes?: string[];
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credential_reference?: string | null;
          display_name?: string;
          id?: string;
          last_used_at?: string | null;
          metadata?: Json;
          provider?: string;
          provider_account_id?: string | null;
          scopes?: string[];
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      automations: {
        Row: {
          action_type: string;
          config: Json;
          created_at: string;
          description: string | null;
          enabled: boolean;
          id: string;
          last_run_at: string | null;
          last_status: string | null;
          name: string;
          project_id: string | null;
          trigger_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_type?: string;
          config?: Json;
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          last_run_at?: string | null;
          last_status?: string | null;
          name: string;
          project_id?: string | null;
          trigger_type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_type?: string;
          config?: Json;
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          last_run_at?: string | null;
          last_status?: string | null;
          name?: string;
          project_id?: string | null;
          trigger_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      autonomous_run_events: {
        Row: {
          capability_slugs: string[];
          created_at: string;
          event_type: string;
          evidence: Json;
          id: string;
          run_id: string;
          summary: string;
          user_id: string;
        };
        Insert: {
          capability_slugs?: string[];
          created_at?: string;
          event_type: string;
          evidence?: Json;
          id?: string;
          run_id: string;
          summary: string;
          user_id: string;
        };
        Update: {
          capability_slugs?: string[];
          created_at?: string;
          event_type?: string;
          evidence?: Json;
          id?: string;
          run_id?: string;
          summary?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "autonomous_run_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "autonomous_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      autonomous_runs: {
        Row: {
          correlation_id: string;
          created_at: string;
          environment: string;
          evidence: Json;
          goal: string;
          id: string;
          plan: Json;
          rollback: Json;
          state: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          correlation_id: string;
          created_at?: string;
          environment: string;
          evidence?: Json;
          goal: string;
          id?: string;
          plan: Json;
          rollback?: Json;
          state: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          correlation_id?: string;
          created_at?: string;
          environment?: string;
          evidence?: Json;
          goal?: string;
          id?: string;
          plan?: Json;
          rollback?: Json;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      capability_installations: {
        Row: {
          configuration: Json;
          correlation_id: string;
          environment: string;
          id: string;
          installed_at: string;
          resource_id: string;
          state: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          configuration?: Json;
          correlation_id: string;
          environment: string;
          id?: string;
          installed_at?: string;
          resource_id: string;
          state?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          configuration?: Json;
          correlation_id?: string;
          environment?: string;
          id?: string;
          installed_at?: string;
          resource_id?: string;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capability_installations_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
        ];
      };
      capability_requests: {
        Row: {
          created_at: string;
          goal: string;
          id: string;
          requested_capability: string;
          source_run_id: string | null;
          specification: Json;
          state: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          goal: string;
          id?: string;
          requested_capability: string;
          source_run_id?: string | null;
          specification?: Json;
          state?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          goal?: string;
          id?: string;
          requested_capability?: string;
          source_run_id?: string | null;
          specification?: Json;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capability_requests_source_run_id_fkey";
            columns: ["source_run_id"];
            isOneToOne: false;
            referencedRelation: "autonomous_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      control_approvals: {
        Row: {
          action: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          environment: string;
          expires_at: string;
          id: string;
          parameters_digest: string;
          requested_by: string;
          risk: string;
          state: Database["public"]["Enums"]["control_approval_state"];
          target: string;
          tenant_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          environment: string;
          expires_at: string;
          id?: string;
          parameters_digest: string;
          requested_by: string;
          risk: string;
          state?: Database["public"]["Enums"]["control_approval_state"];
          target: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          environment?: string;
          expires_at?: string;
          id?: string;
          parameters_digest?: string;
          requested_by?: string;
          risk?: string;
          state?: Database["public"]["Enums"]["control_approval_state"];
          target?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };
      control_audit_events: {
        Row: {
          actor_id: string | null;
          agent_id: string;
          approval_id: string | null;
          capability: string;
          correlation_id: string;
          environment: string;
          evidence: Json;
          id: number;
          result: string;
          target: string;
          tenant_id: string;
          timestamp: string;
        };
        Insert: {
          actor_id?: string | null;
          agent_id: string;
          approval_id?: string | null;
          capability: string;
          correlation_id: string;
          environment: string;
          evidence?: Json;
          id?: never;
          result: string;
          target: string;
          tenant_id: string;
          timestamp?: string;
        };
        Update: {
          actor_id?: string | null;
          agent_id?: string;
          approval_id?: string | null;
          capability?: string;
          correlation_id?: string;
          environment?: string;
          evidence?: Json;
          id?: never;
          result?: string;
          target?: string;
          tenant_id?: string;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "control_audit_events_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: false;
            referencedRelation: "control_approvals";
            referencedColumns: ["id"];
          },
        ];
      };
      control_sessions: {
        Row: {
          agent_id: string;
          capability: string;
          correlation_id: string;
          created_at: string;
          environment: string;
          expires_at: string;
          id: string;
          provider: string;
          provider_handle_ciphertext: string | null;
          state: Database["public"]["Enums"]["control_session_state"];
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_id: string;
          capability: string;
          correlation_id: string;
          created_at?: string;
          environment: string;
          expires_at: string;
          id?: string;
          provider: string;
          provider_handle_ciphertext?: string | null;
          state?: Database["public"]["Enums"]["control_session_state"];
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_id?: string;
          capability?: string;
          correlation_id?: string;
          created_at?: string;
          environment?: string;
          expires_at?: string;
          id?: string;
          provider?: string;
          provider_handle_ciphertext?: string | null;
          state?: Database["public"]["Enums"]["control_session_state"];
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      credential_folder_items: {
        Row: {
          added_at: string;
          credential_id: string;
          folder_id: string;
        };
        Insert: {
          added_at?: string;
          credential_id: string;
          folder_id: string;
        };
        Update: {
          added_at?: string;
          credential_id?: string;
          folder_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credential_folder_items_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credential_folder_items_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credential_folder_items_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "credential_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      credential_folder_projects: {
        Row: {
          added_by: string;
          created_at: string;
          folder_id: string;
          project_id: string;
        };
        Insert: {
          added_by: string;
          created_at?: string;
          folder_id: string;
          project_id: string;
        };
        Update: {
          added_by?: string;
          created_at?: string;
          folder_id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credential_folder_projects_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "credential_folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credential_folder_projects_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      credential_folders: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      credential_secrets: {
        Row: {
          created_at: string;
          email_address: string | null;
          id: string;
          last_used_at: string | null;
          name: string;
          notes: string | null;
          scopes: string[];
          secret_type: string;
          secret_value: string | null;
          tags: string[];
          totp_vault_secret_id: string | null;
          updated_at: string;
          user_id: string;
          username: string | null;
          vault_secret_id: string | null;
          website: string | null;
        };
        Insert: {
          created_at?: string;
          email_address?: string | null;
          id?: string;
          last_used_at?: string | null;
          name: string;
          notes?: string | null;
          scopes?: string[];
          secret_type?: string;
          secret_value?: string | null;
          tags?: string[];
          totp_vault_secret_id?: string | null;
          updated_at?: string;
          user_id: string;
          username?: string | null;
          vault_secret_id?: string | null;
          website?: string | null;
        };
        Update: {
          created_at?: string;
          email_address?: string | null;
          id?: string;
          last_used_at?: string | null;
          name?: string;
          notes?: string | null;
          scopes?: string[];
          secret_type?: string;
          secret_value?: string | null;
          tags?: string[];
          totp_vault_secret_id?: string | null;
          updated_at?: string;
          user_id?: string;
          username?: string | null;
          vault_secret_id?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      environments: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          project_id: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
          project_id: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          project_id?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "environments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      gateway_requests: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          endpoint: string;
          id: string;
          model: string | null;
          status_code: number;
          total_tokens: number | null;
          upstream: string;
          user_id: string;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          endpoint: string;
          id?: string;
          model?: string | null;
          status_code: number;
          total_tokens?: number | null;
          upstream: string;
          user_id: string;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          endpoint?: string;
          id?: string;
          model?: string | null;
          status_code?: number;
          total_tokens?: number | null;
          upstream?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gateway_requests_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      hillstreet_otp_calls: {
        Row: {
          call_sid: string;
          created_at: string;
          from_number: string;
          phone_number_sid: string;
        };
        Insert: {
          call_sid: string;
          created_at?: string;
          from_number: string;
          phone_number_sid: string;
        };
        Update: {
          call_sid?: string;
          created_at?: string;
          from_number?: string;
          phone_number_sid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hillstreet_otp_calls_phone_number_sid_fkey";
            columns: ["phone_number_sid"];
            isOneToOne: false;
            referencedRelation: "hillstreet_sms_forwarding";
            referencedColumns: ["phone_number_sid"];
          },
        ];
      };
      hillstreet_otp_jobs: {
        Row: {
          attempts: number;
          available_at: string;
          claim_token: string | null;
          created_at: string;
          error_category: string | null;
          event_key: string;
          expires_at: string;
          id: string;
          kind: string;
          payload_ciphertext: string | null;
          phone_number_sid: string;
          status: string;
          telegram_message_id: number | null;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          available_at?: string;
          claim_token?: string | null;
          created_at?: string;
          error_category?: string | null;
          event_key: string;
          expires_at?: string;
          id?: string;
          kind: string;
          payload_ciphertext?: string | null;
          phone_number_sid: string;
          status?: string;
          telegram_message_id?: number | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          claim_token?: string | null;
          created_at?: string;
          error_category?: string | null;
          event_key?: string;
          expires_at?: string;
          id?: string;
          kind?: string;
          payload_ciphertext?: string | null;
          phone_number_sid?: string;
          status?: string;
          telegram_message_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hillstreet_otp_jobs_phone_number_sid_fkey";
            columns: ["phone_number_sid"];
            isOneToOne: false;
            referencedRelation: "hillstreet_sms_forwarding";
            referencedColumns: ["phone_number_sid"];
          },
        ];
      };
      hillstreet_otp_number_inventory: {
        Row: {
          account_sid: string;
          capabilities: Json;
          friendly_name: string;
          last_error: string | null;
          observed_at: string;
          onboarding_state: string;
          phone_number: string;
          phone_number_sid: string;
        };
        Insert: {
          account_sid: string;
          capabilities: Json;
          friendly_name: string;
          last_error?: string | null;
          observed_at?: string;
          onboarding_state: string;
          phone_number: string;
          phone_number_sid: string;
        };
        Update: {
          account_sid?: string;
          capabilities?: Json;
          friendly_name?: string;
          last_error?: string | null;
          observed_at?: string;
          onboarding_state?: string;
          phone_number?: string;
          phone_number_sid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hillstreet_otp_number_inventory_account_sid_fkey";
            columns: ["account_sid"];
            isOneToOne: false;
            referencedRelation: "hillstreet_otp_runtime";
            referencedColumns: ["account_sid"];
          },
        ];
      };
      hillstreet_otp_runtime: {
        Row: {
          account_sid: string;
          account_type: string;
          api_credential_id: string;
          auth_token_credential_id: string;
          auto_enroll_prefix: string;
          bot_credential_id: string;
          encryption_credential_id: string;
          function_base_url: string;
          last_reconcile_error: string | null;
          last_reconciled_at: string | null;
          lease_token: string | null;
          lease_until: string | null;
          next_send_at: string;
          telegram_chat_id: string;
          user_id: string;
          voice_requested: boolean;
          worker_credential_id: string;
          worker_key_hash: string;
          worker_url: string;
        };
        Insert: {
          account_sid: string;
          account_type?: string;
          api_credential_id: string;
          auth_token_credential_id: string;
          auto_enroll_prefix?: string;
          bot_credential_id: string;
          encryption_credential_id: string;
          function_base_url: string;
          last_reconcile_error?: string | null;
          last_reconciled_at?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          next_send_at?: string;
          telegram_chat_id: string;
          user_id: string;
          voice_requested?: boolean;
          worker_credential_id: string;
          worker_key_hash: string;
          worker_url: string;
        };
        Update: {
          account_sid?: string;
          account_type?: string;
          api_credential_id?: string;
          auth_token_credential_id?: string;
          auto_enroll_prefix?: string;
          bot_credential_id?: string;
          encryption_credential_id?: string;
          function_base_url?: string;
          last_reconcile_error?: string | null;
          last_reconciled_at?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          next_send_at?: string;
          telegram_chat_id?: string;
          user_id?: string;
          voice_requested?: boolean;
          worker_credential_id?: string;
          worker_key_hash?: string;
          worker_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hillstreet_otp_runtime_api_credential_id_fkey";
            columns: ["api_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_api_credential_id_fkey";
            columns: ["api_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_auth_token_credential_id_fkey";
            columns: ["auth_token_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_auth_token_credential_id_fkey";
            columns: ["auth_token_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_bot_credential_id_fkey";
            columns: ["bot_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_bot_credential_id_fkey";
            columns: ["bot_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_encryption_credential_id_fkey";
            columns: ["encryption_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_encryption_credential_id_fkey";
            columns: ["encryption_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_worker_credential_id_fkey";
            columns: ["worker_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_otp_runtime_worker_credential_id_fkey";
            columns: ["worker_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
        ];
      };
      hillstreet_sms_deliveries: {
        Row: {
          attempts: number;
          claim_token: string;
          created_at: string;
          error_category: string | null;
          message_sid: string;
          phone_number_sid: string;
          status: string;
          telegram_message_id: number | null;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          claim_token?: string;
          created_at?: string;
          error_category?: string | null;
          message_sid: string;
          phone_number_sid: string;
          status: string;
          telegram_message_id?: number | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          claim_token?: string;
          created_at?: string;
          error_category?: string | null;
          message_sid?: string;
          phone_number_sid?: string;
          status?: string;
          telegram_message_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hillstreet_sms_deliveries_phone_number_sid_fkey";
            columns: ["phone_number_sid"];
            isOneToOne: false;
            referencedRelation: "hillstreet_sms_forwarding";
            referencedColumns: ["phone_number_sid"];
          },
        ];
      };
      hillstreet_sms_forwarding: {
        Row: {
          account_sid: string;
          api_credential_id: string | null;
          auth_token_credential_id: string;
          bot_credential_id: string;
          canonical_url: string;
          enabled: boolean;
          phone_number_sid: string;
          telegram_chat_id: string;
          to_number: string;
          updated_at: string;
          user_id: string;
          voice_enabled: boolean;
        };
        Insert: {
          account_sid: string;
          api_credential_id?: string | null;
          auth_token_credential_id: string;
          bot_credential_id: string;
          canonical_url: string;
          enabled?: boolean;
          phone_number_sid: string;
          telegram_chat_id: string;
          to_number: string;
          updated_at?: string;
          user_id: string;
          voice_enabled?: boolean;
        };
        Update: {
          account_sid?: string;
          api_credential_id?: string | null;
          auth_token_credential_id?: string;
          bot_credential_id?: string;
          canonical_url?: string;
          enabled?: boolean;
          phone_number_sid?: string;
          telegram_chat_id?: string;
          to_number?: string;
          updated_at?: string;
          user_id?: string;
          voice_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "hillstreet_sms_forwarding_api_credential_id_fkey";
            columns: ["api_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_sms_forwarding_api_credential_id_fkey";
            columns: ["api_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_sms_forwarding_auth_token_credential_id_fkey";
            columns: ["auth_token_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_sms_forwarding_auth_token_credential_id_fkey";
            columns: ["auth_token_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_sms_forwarding_bot_credential_id_fkey";
            columns: ["bot_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hillstreet_sms_forwarding_bot_credential_id_fkey";
            columns: ["bot_credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
        ];
      };
      inbound_integrations: {
        Row: {
          created_at: string;
          credential_reference: string;
          display_name: string;
          id: string;
          metadata: Json;
          provider: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credential_reference: string;
          display_name: string;
          id?: string;
          metadata?: Json;
          provider: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credential_reference?: string;
          display_name?: string;
          id?: string;
          metadata?: Json;
          provider?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      knowledge_items: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          metadata: Json;
          mime_type: string | null;
          project_id: string | null;
          search_vector: unknown;
          source_type: string;
          source_url: string | null;
          status: string;
          tags: string[];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          mime_type?: string | null;
          project_id?: string | null;
          search_vector?: unknown;
          source_type?: string;
          source_url?: string | null;
          status?: string;
          tags?: string[];
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          mime_type?: string | null;
          project_id?: string | null;
          search_vector?: unknown;
          source_type?: string;
          source_url?: string | null;
          status?: string;
          tags?: string[];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      memory_records: {
        Row: {
          agent_id: string | null;
          content: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          importance: number;
          memory_type: string;
          metadata: Json;
          pinned: boolean;
          project_id: string | null;
          session_id: string | null;
          tags: string[];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_id?: string | null;
          content: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          importance?: number;
          memory_type?: string;
          metadata?: Json;
          pinned?: boolean;
          project_id?: string | null;
          session_id?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_id?: string | null;
          content?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          importance?: number;
          memory_type?: string;
          metadata?: Json;
          pinned?: boolean;
          project_id?: string | null;
          session_id?: string | null;
          tags?: string[];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      oauth_authorization_codes: {
        Row: {
          challenge: string;
          client_id: string;
          code_hash: string;
          expires_at: string;
          redirect_uri: string;
          scopes: string[];
          user_id: string;
        };
        Insert: {
          challenge: string;
          client_id: string;
          code_hash: string;
          expires_at: string;
          redirect_uri: string;
          scopes: string[];
          user_id: string;
        };
        Update: {
          challenge?: string;
          client_id?: string;
          code_hash?: string;
          expires_at?: string;
          redirect_uri?: string;
          scopes?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_authorization_codes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "oauth_clients";
            referencedColumns: ["client_id"];
          },
        ];
      };
      oauth_clients: {
        Row: {
          client_id: string;
          client_name: string;
          created_at: string;
          redirect_uris: string[];
        };
        Insert: {
          client_id: string;
          client_name: string;
          created_at?: string;
          redirect_uris: string[];
        };
        Update: {
          client_id?: string;
          client_name?: string;
          created_at?: string;
          redirect_uris?: string[];
        };
        Relationships: [];
      };
      open_system_agent_teams: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          lead_profile: string;
          member_profiles: Json;
          parallel_max: number;
          slug: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          lead_profile?: string;
          member_profiles?: Json;
          parallel_max?: number;
          slug: string;
          title: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          lead_profile?: string;
          member_profiles?: Json;
          parallel_max?: number;
          slug?: string;
          title?: string;
        };
        Relationships: [];
      };
      open_system_agents: {
        Row: {
          allowed_skills: Json;
          allowed_tools: Json;
          created_at: string;
          display_name: string | null;
          enabled: boolean;
          id: string;
          model_provider: string | null;
          permission_profile: string;
          profile: string;
          slug: string;
          system_prompt: string | null;
          updated_at: string;
        };
        Insert: {
          allowed_skills?: Json;
          allowed_tools?: Json;
          created_at?: string;
          display_name?: string | null;
          enabled?: boolean;
          id?: string;
          model_provider?: string | null;
          permission_profile?: string;
          profile?: string;
          slug: string;
          system_prompt?: string | null;
          updated_at?: string;
        };
        Update: {
          allowed_skills?: Json;
          allowed_tools?: Json;
          created_at?: string;
          display_name?: string | null;
          enabled?: boolean;
          id?: string;
          model_provider?: string | null;
          permission_profile?: string;
          profile?: string;
          slug?: string;
          system_prompt?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      open_system_audit_events: {
        Row: {
          action: string;
          actor: string | null;
          created_at: string;
          detail: Json;
          id: string;
          resource: string | null;
        };
        Insert: {
          action: string;
          actor?: string | null;
          created_at?: string;
          detail?: Json;
          id?: string;
          resource?: string | null;
        };
        Update: {
          action?: string;
          actor?: string | null;
          created_at?: string;
          detail?: Json;
          id?: string;
          resource?: string | null;
        };
        Relationships: [];
      };
      open_system_backup_catalog: {
        Row: {
          backup_id: string;
          created_at: string;
          explicit_kind: string | null;
          git_sha: string | null;
          id: string;
          image_digest: string | null;
          notes: string | null;
          source_snapshot_at: string | null;
          verification_status: string;
        };
        Insert: {
          backup_id: string;
          created_at?: string;
          explicit_kind?: string | null;
          git_sha?: string | null;
          id?: string;
          image_digest?: string | null;
          notes?: string | null;
          source_snapshot_at?: string | null;
          verification_status?: string;
        };
        Update: {
          backup_id?: string;
          created_at?: string;
          explicit_kind?: string | null;
          git_sha?: string | null;
          id?: string;
          image_digest?: string | null;
          notes?: string | null;
          source_snapshot_at?: string | null;
          verification_status?: string;
        };
        Relationships: [];
      };
      open_system_backup_lifecycle: {
        Row: {
          claim_objects: Json | null;
          lease_token: string | null;
          lease_until: string;
          prefix: string;
          state: string;
          updated_at: string;
        };
        Insert: {
          claim_objects?: Json | null;
          lease_token?: string | null;
          lease_until?: string;
          prefix: string;
          state?: string;
          updated_at?: string;
        };
        Update: {
          claim_objects?: Json | null;
          lease_token?: string | null;
          lease_until?: string;
          prefix?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      open_system_backup_verified_parts: {
        Row: {
          bytes: number;
          object_id: string;
          object_name: string;
          object_updated_at: string;
          sha256: string;
          verified_at: string;
        };
        Insert: {
          bytes: number;
          object_id: string;
          object_name: string;
          object_updated_at: string;
          sha256: string;
          verified_at?: string;
        };
        Update: {
          bytes?: number;
          object_id?: string;
          object_name?: string;
          object_updated_at?: string;
          sha256?: string;
          verified_at?: string;
        };
        Relationships: [];
      };
      open_system_deployments: {
        Row: {
          created_at: string;
          environment: string;
          git_sha: string | null;
          id: string;
          image_digest: string | null;
          image_ref: string | null;
          notes: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          environment?: string;
          git_sha?: string | null;
          id?: string;
          image_digest?: string | null;
          image_ref?: string | null;
          notes?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          environment?: string;
          git_sha?: string | null;
          id?: string;
          image_digest?: string | null;
          image_ref?: string | null;
          notes?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      open_system_knowledge_collections: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          metadata: Json;
          slug: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          metadata?: Json;
          slug: string;
          title: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          metadata?: Json;
          slug?: string;
          title?: string;
        };
        Relationships: [];
      };
      open_system_knowledge_documents: {
        Row: {
          collection_id: string | null;
          content: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          source_uri: string | null;
          title: string | null;
        };
        Insert: {
          collection_id?: string | null;
          content?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          source_uri?: string | null;
          title?: string | null;
        };
        Update: {
          collection_id?: string | null;
          content?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          source_uri?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "open_system_knowledge_documents_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "open_system_knowledge_collections";
            referencedColumns: ["id"];
          },
        ];
      };
      open_system_mcp_connections: {
        Row: {
          command_hint: string | null;
          created_at: string;
          enabled: boolean;
          env_secret_names: Json;
          id: string;
          notes: string | null;
          provider: string;
          slug: string;
          transport: string;
        };
        Insert: {
          command_hint?: string | null;
          created_at?: string;
          enabled?: boolean;
          env_secret_names?: Json;
          id?: string;
          notes?: string | null;
          provider: string;
          slug: string;
          transport?: string;
        };
        Update: {
          command_hint?: string | null;
          created_at?: string;
          enabled?: boolean;
          env_secret_names?: Json;
          id?: string;
          notes?: string | null;
          provider?: string;
          slug?: string;
          transport?: string;
        };
        Relationships: [];
      };
      open_system_sync_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          payload: Json;
          source: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          payload?: Json;
          source: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          source?: string;
        };
        Relationships: [];
      };
      open_system_system_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      open_system_telegram_routes: {
        Row: {
          agent_profile: string;
          chat_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
          thread_id: string | null;
        };
        Insert: {
          agent_profile?: string;
          chat_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          thread_id?: string | null;
        };
        Update: {
          agent_profile?: string;
          chat_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          thread_id?: string | null;
        };
        Relationships: [];
      };
      organization_group_members: {
        Row: {
          added_by: string;
          created_at: string;
          group_id: string;
          organization_id: string;
          user_id: string;
        };
        Insert: {
          added_by: string;
          created_at?: string;
          group_id: string;
          organization_id: string;
          user_id: string;
        };
        Update: {
          added_by?: string;
          created_at?: string;
          group_id?: string;
          organization_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "organization_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_group_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_groups: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_groups_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invitations: {
        Row: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          invited_user_id: string | null;
          organization_id: string;
          role: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          invited_user_id?: string | null;
          organization_id: string;
          role?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          invited_user_id?: string | null;
          organization_id?: string;
          role?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_connection_audit: {
        Row: {
          action_name: string;
          actor_user_id: string | null;
          completed_at: string | null;
          connection_id: string | null;
          created_at: string;
          error_kind: string | null;
          id: string;
          outcome: string;
          project_id: string;
        };
        Insert: {
          action_name: string;
          actor_user_id?: string | null;
          completed_at?: string | null;
          connection_id?: string | null;
          created_at?: string;
          error_kind?: string | null;
          id?: string;
          outcome?: string;
          project_id: string;
        };
        Update: {
          action_name?: string;
          actor_user_id?: string | null;
          completed_at?: string | null;
          connection_id?: string | null;
          created_at?: string;
          error_kind?: string | null;
          id?: string;
          outcome?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_connection_audit_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "app_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_connection_audit_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_connections: {
        Row: {
          added_by: string;
          connection_id: string;
          created_at: string;
          id: string;
          project_id: string;
        };
        Insert: {
          added_by: string;
          connection_id: string;
          created_at?: string;
          id?: string;
          project_id: string;
        };
        Update: {
          added_by?: string;
          connection_id?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_connections_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "app_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_connections_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_credentials: {
        Row: {
          added_by: string;
          created_at: string;
          credential_id: string;
          id: string;
          project_id: string;
        };
        Insert: {
          added_by: string;
          created_at?: string;
          credential_id: string;
          id?: string;
          project_id: string;
        };
        Update: {
          added_by?: string;
          created_at?: string;
          credential_id?: string;
          id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_credentials_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_credentials_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "credential_secrets_meta";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_credentials_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          created_at: string;
          id: string;
          project_id: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          project_id: string;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          project_id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_resources: {
        Row: {
          added_by: string;
          created_at: string;
          id: string;
          notes: string | null;
          project_id: string;
          resource_id: string;
          updated_at: string;
        };
        Insert: {
          added_by: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          project_id: string;
          resource_id: string;
          updated_at?: string;
        };
        Update: {
          added_by?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          project_id?: string;
          resource_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_resources_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_resources_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          updated_at: string;
          workspace_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          slug: string;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          slug?: string;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      registry_ingestion_runs: {
        Row: {
          changed_count: number;
          completed_at: string | null;
          discovered_count: number;
          error_summary: string | null;
          evidence: Json;
          id: string;
          source_id: string | null;
          started_at: string;
          status: string;
        };
        Insert: {
          changed_count?: number;
          completed_at?: string | null;
          discovered_count?: number;
          error_summary?: string | null;
          evidence?: Json;
          id?: string;
          source_id?: string | null;
          started_at?: string;
          status?: string;
        };
        Update: {
          changed_count?: number;
          completed_at?: string | null;
          discovered_count?: number;
          error_summary?: string | null;
          evidence?: Json;
          id?: string;
          source_id?: string | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registry_ingestion_runs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "registry_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      registry_sources: {
        Row: {
          adapter: string;
          base_url: string;
          config: Json;
          created_at: string;
          enabled: boolean;
          id: string;
          last_collected_at: string | null;
          last_status: string | null;
          name: string;
          slug: string;
          trust_level: string;
          updated_at: string;
        };
        Insert: {
          adapter: string;
          base_url: string;
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_collected_at?: string | null;
          last_status?: string | null;
          name: string;
          slug: string;
          trust_level?: string;
          updated_at?: string;
        };
        Update: {
          adapter?: string;
          base_url?: string;
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_collected_at?: string | null;
          last_status?: string | null;
          name?: string;
          slug?: string;
          trust_level?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      resource_source_records: {
        Row: {
          canonical_url: string;
          content_hash: string;
          description: string | null;
          external_id: string;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          license: string | null;
          metadata: Json;
          name: string;
          normalized_slug: string;
          review_state: string;
          source_id: string;
          source_updated_at: string | null;
          stale_at: string | null;
        };
        Insert: {
          canonical_url: string;
          content_hash: string;
          description?: string | null;
          external_id: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          license?: string | null;
          metadata?: Json;
          name: string;
          normalized_slug: string;
          review_state?: string;
          source_id: string;
          source_updated_at?: string | null;
          stale_at?: string | null;
        };
        Update: {
          canonical_url?: string;
          content_hash?: string;
          description?: string | null;
          external_id?: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          license?: string | null;
          metadata?: Json;
          name?: string;
          normalized_slug?: string;
          review_state?: string;
          source_id?: string;
          source_updated_at?: string | null;
          stale_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resource_source_records_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "registry_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      resources: {
        Row: {
          author: string | null;
          category_slug: string | null;
          created_at: string;
          description: string | null;
          featured: boolean;
          id: string;
          installation_config: Json;
          installation_type: string | null;
          license: string | null;
          name: string;
          owner_id: string | null;
          package_filename: string | null;
          package_mime: string | null;
          package_path: string | null;
          package_size: number | null;
          published: boolean;
          repository_url: string | null;
          resource_type: Database["public"]["Enums"]["resource_type"];
          slug: string;
          source: string | null;
          source_url: string | null;
          supported_clients: string[];
          updated_at: string;
          verified: boolean;
          version: string | null;
        };
        Insert: {
          author?: string | null;
          category_slug?: string | null;
          created_at?: string;
          description?: string | null;
          featured?: boolean;
          id?: string;
          installation_config?: Json;
          installation_type?: string | null;
          license?: string | null;
          name: string;
          owner_id?: string | null;
          package_filename?: string | null;
          package_mime?: string | null;
          package_path?: string | null;
          package_size?: number | null;
          published?: boolean;
          repository_url?: string | null;
          resource_type: Database["public"]["Enums"]["resource_type"];
          slug: string;
          source?: string | null;
          source_url?: string | null;
          supported_clients?: string[];
          updated_at?: string;
          verified?: boolean;
          version?: string | null;
        };
        Update: {
          author?: string | null;
          category_slug?: string | null;
          created_at?: string;
          description?: string | null;
          featured?: boolean;
          id?: string;
          installation_config?: Json;
          installation_type?: string | null;
          license?: string | null;
          name?: string;
          owner_id?: string | null;
          package_filename?: string | null;
          package_mime?: string | null;
          package_path?: string | null;
          package_size?: number | null;
          published?: boolean;
          repository_url?: string | null;
          resource_type?: Database["public"]["Enums"]["resource_type"];
          slug?: string;
          source?: string | null;
          source_url?: string | null;
          supported_clients?: string[];
          updated_at?: string;
          verified?: boolean;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resources_category_slug_fkey";
            columns: ["category_slug"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["slug"];
          },
        ];
      };
      schedules: {
        Row: {
          automation_id: string | null;
          created_at: string;
          cron_expr: string | null;
          description: string | null;
          id: string;
          last_run_at: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          name: string;
          next_run_at: string | null;
          project_id: string | null;
          run_at: string | null;
          status: string;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          automation_id?: string | null;
          created_at?: string;
          cron_expr?: string | null;
          description?: string | null;
          id?: string;
          last_run_at?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          name: string;
          next_run_at?: string | null;
          project_id?: string | null;
          run_at?: string | null;
          status?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          automation_id?: string | null;
          created_at?: string;
          cron_expr?: string | null;
          description?: string | null;
          id?: string;
          last_run_at?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          name?: string;
          next_run_at?: string | null;
          project_id?: string | null;
          run_at?: string | null;
          status?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedules_automation_fk";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
        ];
      };
      service_credentials: {
        Row: {
          name: string;
          updated_at: string;
          vault_secret_id: string;
        };
        Insert: {
          name: string;
          updated_at?: string;
          vault_secret_id: string;
        };
        Update: {
          name?: string;
          updated_at?: string;
          vault_secret_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          created_at: string;
          description: string | null;
          due_at: string | null;
          id: string;
          organization_id: string | null;
          priority: string;
          project_id: string | null;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          organization_id?: string | null;
          priority?: string;
          project_id?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          organization_id?: string | null;
          priority?: string;
          project_id?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      toolkit_items: {
        Row: {
          created_at: string;
          id: string;
          position: number;
          resource_id: string;
          toolkit_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position?: number;
          resource_id: string;
          toolkit_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position?: number;
          resource_id?: string;
          toolkit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "toolkit_items_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "toolkit_items_toolkit_id_fkey";
            columns: ["toolkit_id"];
            isOneToOne: false;
            referencedRelation: "toolkits";
            referencedColumns: ["id"];
          },
        ];
      };
      toolkits: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          published: boolean;
          slug: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          published?: boolean;
          slug: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          published?: boolean;
          slug?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      x_meta: {
        Row: {
          h_sub: boolean | null;
          header: string | null;
          header_sub: boolean | null;
          hide: string | null;
          id: number;
          p_sub: boolean | null;
          password: string | null;
          path: string | null;
          r_sub: boolean | null;
          read_users: string | null;
          read_users_sub: boolean | null;
          readme: string | null;
          w_sub: boolean | null;
          write: boolean | null;
          write_users: string | null;
          write_users_sub: boolean | null;
        };
        Insert: {
          h_sub?: boolean | null;
          header?: string | null;
          header_sub?: boolean | null;
          hide?: string | null;
          id?: number;
          p_sub?: boolean | null;
          password?: string | null;
          path?: string | null;
          r_sub?: boolean | null;
          read_users?: string | null;
          read_users_sub?: boolean | null;
          readme?: string | null;
          w_sub?: boolean | null;
          write?: boolean | null;
          write_users?: string | null;
          write_users_sub?: boolean | null;
        };
        Update: {
          h_sub?: boolean | null;
          header?: string | null;
          header_sub?: boolean | null;
          hide?: string | null;
          id?: number;
          p_sub?: boolean | null;
          password?: string | null;
          path?: string | null;
          r_sub?: boolean | null;
          read_users?: string | null;
          read_users_sub?: boolean | null;
          readme?: string | null;
          w_sub?: boolean | null;
          write?: boolean | null;
          write_users?: string | null;
          write_users_sub?: boolean | null;
        };
        Relationships: [];
      };
      x_search_nodes: {
        Row: {
          is_dir: boolean | null;
          name: string | null;
          parent: string | null;
          size: number | null;
        };
        Insert: {
          is_dir?: boolean | null;
          name?: string | null;
          parent?: string | null;
          size?: number | null;
        };
        Update: {
          is_dir?: boolean | null;
          name?: string | null;
          parent?: string | null;
          size?: number | null;
        };
        Relationships: [];
      };
      x_setting_items: {
        Row: {
          flag: number | null;
          group: number | null;
          help: string | null;
          index: number | null;
          key: string;
          options: string | null;
          type: string | null;
          value: string | null;
        };
        Insert: {
          flag?: number | null;
          group?: number | null;
          help?: string | null;
          index?: number | null;
          key: string;
          options?: string | null;
          type?: string | null;
          value?: string | null;
        };
        Update: {
          flag?: number | null;
          group?: number | null;
          help?: string | null;
          index?: number | null;
          key?: string;
          options?: string | null;
          type?: string | null;
          value?: string | null;
        };
        Relationships: [];
      };
      x_sharing_dbs: {
        Row: {
          accessed: number | null;
          creator_id: number | null;
          disabled: boolean | null;
          expires: string | null;
          extract_folder: string | null;
          files_raw: string | null;
          header: string | null;
          id: string;
          max_accessed: number | null;
          order_by: string | null;
          order_direction: string | null;
          pwd: string | null;
          readme: string | null;
          remark: string | null;
        };
        Insert: {
          accessed?: number | null;
          creator_id?: number | null;
          disabled?: boolean | null;
          expires?: string | null;
          extract_folder?: string | null;
          files_raw?: string | null;
          header?: string | null;
          id: string;
          max_accessed?: number | null;
          order_by?: string | null;
          order_direction?: string | null;
          pwd?: string | null;
          readme?: string | null;
          remark?: string | null;
        };
        Update: {
          accessed?: number | null;
          creator_id?: number | null;
          disabled?: boolean | null;
          expires?: string | null;
          extract_folder?: string | null;
          files_raw?: string | null;
          header?: string | null;
          id?: string;
          max_accessed?: number | null;
          order_by?: string | null;
          order_direction?: string | null;
          pwd?: string | null;
          readme?: string | null;
          remark?: string | null;
        };
        Relationships: [];
      };
      x_ssh_public_keys: {
        Row: {
          added_time: string | null;
          fingerprint: string | null;
          id: number;
          key_str: string | null;
          last_used_time: string | null;
          title: string | null;
          user_id: number | null;
        };
        Insert: {
          added_time?: string | null;
          fingerprint?: string | null;
          id?: number;
          key_str?: string | null;
          last_used_time?: string | null;
          title?: string | null;
          user_id?: number | null;
        };
        Update: {
          added_time?: string | null;
          fingerprint?: string | null;
          id?: number;
          key_str?: string | null;
          last_used_time?: string | null;
          title?: string | null;
          user_id?: number | null;
        };
        Relationships: [];
      };
      x_storages: {
        Row: {
          addition: string | null;
          cache_expiration: number | null;
          custom_cache_policies: string | null;
          disable_index: boolean | null;
          disable_proxy_sign: boolean | null;
          disabled: boolean | null;
          down_proxy_url: string | null;
          driver: string | null;
          enable_sign: boolean | null;
          extract_folder: string | null;
          id: number;
          modified: string | null;
          mount_path: string | null;
          order: number | null;
          order_by: string | null;
          order_direction: string | null;
          proxy_range: boolean | null;
          remark: string | null;
          status: string | null;
          web_proxy: boolean | null;
          webdav_policy: string | null;
        };
        Insert: {
          addition?: string | null;
          cache_expiration?: number | null;
          custom_cache_policies?: string | null;
          disable_index?: boolean | null;
          disable_proxy_sign?: boolean | null;
          disabled?: boolean | null;
          down_proxy_url?: string | null;
          driver?: string | null;
          enable_sign?: boolean | null;
          extract_folder?: string | null;
          id?: number;
          modified?: string | null;
          mount_path?: string | null;
          order?: number | null;
          order_by?: string | null;
          order_direction?: string | null;
          proxy_range?: boolean | null;
          remark?: string | null;
          status?: string | null;
          web_proxy?: boolean | null;
          webdav_policy?: string | null;
        };
        Update: {
          addition?: string | null;
          cache_expiration?: number | null;
          custom_cache_policies?: string | null;
          disable_index?: boolean | null;
          disable_proxy_sign?: boolean | null;
          disabled?: boolean | null;
          down_proxy_url?: string | null;
          driver?: string | null;
          enable_sign?: boolean | null;
          extract_folder?: string | null;
          id?: number;
          modified?: string | null;
          mount_path?: string | null;
          order?: number | null;
          order_by?: string | null;
          order_direction?: string | null;
          proxy_range?: boolean | null;
          remark?: string | null;
          status?: string | null;
          web_proxy?: boolean | null;
          webdav_policy?: string | null;
        };
        Relationships: [];
      };
      x_task_items: {
        Row: {
          key: string | null;
          persist_data: string | null;
        };
        Insert: {
          key?: string | null;
          persist_data?: string | null;
        };
        Update: {
          key?: string | null;
          persist_data?: string | null;
        };
        Relationships: [];
      };
      x_users: {
        Row: {
          allow_ldap: boolean | null;
          authn: string | null;
          base_path: string | null;
          disabled: boolean | null;
          id: number;
          otp_secret: string | null;
          password: string | null;
          permission: number | null;
          pwd_hash: string | null;
          pwd_ts: number | null;
          role: number | null;
          salt: string | null;
          sso_id: string | null;
          username: string | null;
        };
        Insert: {
          allow_ldap?: boolean | null;
          authn?: string | null;
          base_path?: string | null;
          disabled?: boolean | null;
          id?: number;
          otp_secret?: string | null;
          password?: string | null;
          permission?: number | null;
          pwd_hash?: string | null;
          pwd_ts?: number | null;
          role?: number | null;
          salt?: string | null;
          sso_id?: string | null;
          username?: string | null;
        };
        Update: {
          allow_ldap?: boolean | null;
          authn?: string | null;
          base_path?: string | null;
          disabled?: boolean | null;
          id?: number;
          otp_secret?: string | null;
          password?: string | null;
          permission?: number | null;
          pwd_hash?: string | null;
          pwd_ts?: number | null;
          role?: number | null;
          salt?: string | null;
          sso_id?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      credential_secrets_meta: {
        Row: {
          created_at: string | null;
          has_secret: boolean | null;
          id: string | null;
          last_used_at: string | null;
          name: string | null;
          scopes: string[] | null;
          secret_type: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          has_secret?: never;
          id?: string | null;
          last_used_at?: string | null;
          name?: string | null;
          scopes?: string[] | null;
          secret_type?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          has_secret?: never;
          id?: string | null;
          last_used_at?: string | null;
          name?: string | null;
          scopes?: string[] | null;
          secret_type?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      hillstreet_otp_delivery_status: {
        Row: {
          attempts: number | null;
          available_at: string | null;
          created_at: string | null;
          error_category: string | null;
          event_key: string | null;
          expires_at: string | null;
          id: string | null;
          kind: string | null;
          phone_number_sid: string | null;
          status: string | null;
          telegram_message_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          attempts?: number | null;
          available_at?: string | null;
          created_at?: string | null;
          error_category?: string | null;
          event_key?: string | null;
          expires_at?: string | null;
          id?: string | null;
          kind?: string | null;
          phone_number_sid?: string | null;
          status?: string | null;
          telegram_message_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          attempts?: number | null;
          available_at?: string | null;
          created_at?: string | null;
          error_category?: string | null;
          event_key?: string | null;
          expires_at?: string | null;
          id?: string | null;
          kind?: string | null;
          phone_number_sid?: string | null;
          status?: string | null;
          telegram_message_id?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hillstreet_otp_jobs_phone_number_sid_fkey";
            columns: ["phone_number_sid"];
            isOneToOne: false;
            referencedRelation: "hillstreet_sms_forwarding";
            referencedColumns: ["phone_number_sid"];
          },
        ];
      };
    };
    Functions: {
      oc_update_owned_key_access: {
        Args: { p_key_id: string; p_profile: string; p_custom_scopes?: string[] };
        Returns: Json;
      };
      add_project_connection: {
        Args: { p_connection_id: string; p_project_id: string };
        Returns: Json;
      };
      add_project_credential: {
        Args: { p_credential_id: string; p_project_id: string };
        Returns: Json;
      };
      assert_credential_value_unique: {
        Args: { p_secret_value: string };
        Returns: boolean;
      };
      base32_decode: { Args: { p_value: string }; Returns: string };
      can_access_project: {
        Args: { target_project_id: string };
        Returns: boolean;
      };
      can_access_project_resource: {
        Args: { target_resource_id: string };
        Returns: boolean;
      };
      can_manage_organization: {
        Args: { target_organization_id: string };
        Returns: boolean;
      };
      can_manage_project: {
        Args: { target_project_id: string };
        Returns: boolean;
      };
      create_credential_folder: { Args: { p_name: string }; Returns: Json };
      create_credential_item: {
        Args: {
          p_email_address: string;
          p_name: string;
          p_notes: string;
          p_scopes: string[];
          p_secret_type: string;
          p_secret_value: string;
          p_totp_secret: string;
          p_username: string;
          p_website: string;
        };
        Returns: Json;
      };
      create_credential_secret: {
        Args: {
          p_name: string;
          p_scopes: string[];
          p_secret_type: string;
          p_secret_value: string;
        };
        Returns: Json;
      };
      delete_credential_folder: {
        Args: { p_folder_id: string };
        Returns: boolean;
      };
      delete_credential_secret: { Args: { p_id: string }; Returns: boolean };
      get_credential_totp_code: { Args: { p_id: string }; Returns: Json };
      get_service_credential: { Args: { p_name: string }; Returns: string };
      hillstreet_acquire_otp_worker: {
        Args: { p_account_sid: string };
        Returns: string;
      };
      hillstreet_claim_otp_job: {
        Args: { p_account_sid: string };
        Returns: Json;
      };
      hillstreet_claim_sms_delivery: {
        Args: { p_message_sid: string; p_phone_number_sid: string };
        Returns: Json;
      };
      hillstreet_enqueue_otp: {
        Args: {
          p_event_key: string;
          p_kind: string;
          p_payload: Json;
          p_phone_number_sid: string;
        };
        Returns: Json;
      };
      hillstreet_wake_otp_workers: { Args: never; Returns: Json };
      is_organization_member: {
        Args: { target_organization_id: string };
        Returns: boolean;
      };
      is_project_member: {
        Args: { target_project_id: string };
        Returns: boolean;
      };
      list_credential_folders: { Args: never; Returns: Json };
      list_credential_secrets: { Args: never; Returns: Json };
      list_project_connections: {
        Args: { p_project_id: string };
        Returns: Json;
      };
      list_project_credentials: {
        Args: { p_project_id: string };
        Returns: Json;
      };
      oc_authorize_oauth_client: {
        Args: {
          p_challenge: string;
          p_client_id: string;
          p_redirect_uri: string;
          p_scopes: string[];
        };
        Returns: string;
      };
      oc_exchange_oauth_code: {
        Args: {
          p_client_id: string;
          p_code: string;
          p_redirect_uri: string;
          p_verifier: string;
        };
        Returns: Json;
      };
      oc_register_oauth_client: {
        Args: { p_name: string; p_redirect_uris: string[] };
        Returns: Json;
      };
      oc_verify_gateway_key: { Args: { p_key: string }; Returns: Json };
      organize_credential: {
        Args: {
          p_credential_id: string;
          p_project_ids: string[];
          p_tags: string[];
        };
        Returns: Json;
      };
      os_backup_latest: { Args: never; Returns: Json };
      os_backup_objects: { Args: { p_prefix: string }; Returns: Json };
      os_backup_record_part: {
        Args: { p_bytes: number; p_object: string; p_sha: string };
        Returns: boolean;
      };
      os_backup_register_manifest: {
        Args: { p_manifest: Json; p_object: string };
        Returns: boolean;
      };
      os_backup_retention_check: {
        Args: { p_prefix: string; p_token: string };
        Returns: Json;
      };
      os_backup_retention_claim: {
        Args: { p_prefix: string; p_protected: string[] };
        Returns: Json;
      };
      os_backup_retention_finish: {
        Args: { p_prefix: string; p_token: string };
        Returns: boolean;
      };
      os_backup_retention_inventory: { Args: never; Returns: Json };
      os_backup_touch: { Args: { p_prefix: string }; Returns: boolean };
      register_open_system_backup_key: {
        Args: { p_key: string; p_token: string };
        Returns: string;
      };
      remove_project_connection: {
        Args: { p_connection_id: string; p_project_id: string };
        Returns: boolean;
      };
      remove_project_credential: {
        Args: { p_credential_id: string; p_project_id: string };
        Returns: boolean;
      };
      resolve_connection_credential: {
        Args: { p_credential_id: string; p_user_id: string };
        Returns: string;
      };
      reveal_credential_secret: { Args: { p_id: string }; Returns: Json };
      set_service_credential: {
        Args: { p_name: string; p_secret_value: string };
        Returns: boolean;
      };
      update_credential_folder: {
        Args: {
          p_credential_ids: string[];
          p_folder_id: string;
          p_name: string;
          p_project_ids: string[];
        };
        Returns: Json;
      };
      update_credential_organization: {
        Args: {
          p_credential_id: string;
          p_notes: string;
          p_project_ids: string[];
          p_tags: string[];
        };
        Returns: Json;
      };
      update_credential_secret_value: {
        Args: { p_id: string; p_secret_value: string };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "user" | "developer" | "publisher" | "admin" | "owner";
      control_approval_state: "pending" | "approved" | "denied" | "expired" | "consumed";
      control_session_state:
        | "requested"
        | "provisioning"
        | "ready"
        | "paused"
        | "closing"
        | "closed"
        | "failed"
        | "expired";
      resource_type:
        | "skill"
        | "mcp"
        | "tool"
        | "plugin"
        | "agent"
        | "prompt"
        | "guide"
        | "app"
        | "model"
        | "toolkit"
        | "memory"
        | "knowledge";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "developer", "publisher", "admin", "owner"],
      control_approval_state: ["pending", "approved", "denied", "expired", "consumed"],
      control_session_state: [
        "requested",
        "provisioning",
        "ready",
        "paused",
        "closing",
        "closed",
        "failed",
        "expired",
      ],
      resource_type: [
        "skill",
        "mcp",
        "tool",
        "plugin",
        "agent",
        "prompt",
        "guide",
        "app",
        "model",
        "toolkit",
        "memory",
        "knowledge",
      ],
    },
  },
} as const;
