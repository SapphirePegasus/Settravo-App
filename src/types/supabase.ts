/**
 * supabase.ts — Hand-maintained database types.
 *
 * Source of truth: supabase/01_schema.sql + 03_functions.sql (Phase 1 rewrite).
 * If you later adopt `supabase gen types typescript`, diff against this file —
 * the shapes below are what every service in src/services compiles against.
 *
 * Fixes vs the previous version:
 *  - cover_image_url is now OPTIONAL in Insert/Update (was wrongly required,
 *    which forced casts in tripService and broke direct inserts).
 *  - Added settravo_settle_pair RPC (Phase-2 settle contract): returns the
 *    exact split rows the server mutated, so the client can mirror them.
 *  - TravelAppRateLimits is intentionally absent: it is service-role-only
 *    infrastructure and must never be referenced from the app.
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            TravelAppUsers: {
                Row: {
                    id: string;
                    device_uuid: string;
                    display_name: string | null;
                    avatar_color: string | null;
                    created_at: string;
                    last_seen: string;
                };
                Insert: {
                    id?: string;
                    device_uuid: string;
                    display_name?: string | null;
                    avatar_color?: string | null;
                    created_at?: string;
                    last_seen?: string;
                };
                Update: {
                    id?: string;
                    device_uuid?: string;
                    display_name?: string | null;
                    avatar_color?: string | null;
                    created_at?: string;
                    last_seen?: string;
                };
                Relationships: [];
            };
            TravelAppTrips: {
                Row: {
                    id: string;
                    name: string;
                    join_code: string | null;
                    join_code_expires_at: string | null;
                    destination: string | null;
                    start_date: string | null;
                    end_date: string | null;
                    created_by_device: string;
                    created_at: string;
                    cover_image_url: string | null;
                };
                Insert: {
                    id?: string;
                    name: string;
                    join_code?: string | null;
                    join_code_expires_at?: string | null;
                    destination?: string | null;
                    start_date?: string | null;
                    end_date?: string | null;
                    created_by_device: string;
                    created_at?: string;
                    cover_image_url?: string | null;
                };
                Update: {
                    id?: string;
                    name?: string;
                    join_code?: string | null;
                    join_code_expires_at?: string | null;
                    destination?: string | null;
                    start_date?: string | null;
                    end_date?: string | null;
                    created_by_device?: string;
                    created_at?: string;
                    cover_image_url?: string | null;
                };
                Relationships: [];
            };
            TravelAppMembers: {
                Row: {
                    id: string;
                    trip_id: string;
                    device_id: string | null;
                    display_name: string;
                    joined_at: string;
                    guest_token: string | null;
                };
                Insert: {
                    id?: string;
                    trip_id: string;
                    device_id?: string | null;
                    display_name: string;
                    joined_at?: string;
                    guest_token?: string | null;
                };
                Update: {
                    id?: string;
                    trip_id?: string;
                    device_id?: string | null;
                    display_name?: string;
                    joined_at?: string;
                    guest_token?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "TravelAppMembers_trip_id_fkey";
                        columns: ["trip_id"];
                        isOneToOne: false;
                        referencedRelation: "TravelAppTrips";
                        referencedColumns: ["id"];
                    }
                ];
            };
            TravelAppExpenses: {
                Row: {
                    id: string;
                    trip_id: string;
                    paid_by_member: string;
                    title: string;
                    category: string | null;
                    amount_money: number;
                    created_at: string;
                    updated_at: string;
                    /** Set when this expense was materialized from a recurring template. */
                    template_id: string | null;
                    /** 'YYYY-MM' or ISO 'IYYY-Wnn'. Unique per template (idempotency key). */
                    period: string | null;
                };
                Insert: {
                    id?: string;
                    trip_id: string;
                    paid_by_member: string;
                    title: string;
                    category?: string | null;
                    amount_money: number;
                    created_at?: string;
                    updated_at?: string;
                    template_id?: string | null;
                    period?: string | null;
                };
                Update: {
                    id?: string;
                    trip_id?: string;
                    paid_by_member?: string;
                    title?: string;
                    category?: string | null;
                    amount_money?: number;
                    created_at?: string;
                    updated_at?: string;
                    template_id?: string | null;
                    period?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "TravelAppExpenses_paid_by_member_fkey";
                        columns: ["paid_by_member"];
                        isOneToOne: false;
                        referencedRelation: "TravelAppMembers";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "TravelAppExpenses_trip_id_fkey";
                        columns: ["trip_id"];
                        isOneToOne: false;
                        referencedRelation: "TravelAppTrips";
                        referencedColumns: ["id"];
                    }
                ];
            };
            TravelAppSplits: {
                Row: {
                    id: string;
                    expense_id: string;
                    member_id: string;
                    share_money: number;
                    is_settled: boolean;
                };
                Insert: {
                    id?: string;
                    expense_id: string;
                    member_id: string;
                    share_money: number;
                    is_settled?: boolean;
                };
                Update: {
                    id?: string;
                    expense_id?: string;
                    member_id?: string;
                    share_money?: number;
                    is_settled?: boolean;
                };
                Relationships: [
                    {
                        foreignKeyName: "TravelAppSplits_expense_id_fkey";
                        columns: ["expense_id"];
                        isOneToOne: false;
                        referencedRelation: "TravelAppExpenses";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "TravelAppSplits_member_id_fkey";
                        columns: ["member_id"];
                        isOneToOne: false;
                        referencedRelation: "TravelAppMembers";
                        referencedColumns: ["id"];
                    }
                ];
            };
            TravelAppExpenseTemplates: {
                Row: {
                    id: string;
                    trip_id: string;
                    created_by_device: string;
                    paid_by_member: string;
                    title: string;
                    category: string | null;
                    amount_money: number;
                    split_mode: string;
                    custom_splits: Json | null;
                    recurrence: string;
                    due_day: number;
                    start_date: string;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    trip_id: string;
                    created_by_device: string;
                    paid_by_member: string;
                    title: string;
                    category?: string | null;
                    amount_money: number;
                    split_mode?: string;
                    custom_splits?: Json | null;
                    recurrence: string;
                    due_day: number;
                    start_date?: string;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    trip_id?: string;
                    created_by_device?: string;
                    paid_by_member?: string;
                    title?: string;
                    category?: string | null;
                    amount_money?: number;
                    split_mode?: string;
                    custom_splits?: Json | null;
                    recurrence?: string;
                    due_day?: number;
                    start_date?: string;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "TravelAppExpenseTemplates_trip_id_fkey";
                        columns: ["trip_id"];
                        isOneToOne: false;
                        referencedRelation: "TravelAppTrips";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "TravelAppExpenseTemplates_paid_by_member_fkey";
                        columns: ["paid_by_member"];
                        isOneToOne: false;
                        referencedRelation: "TravelAppMembers";
                        referencedColumns: ["id"];
                    }
                ];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            /** Legacy settle (one direction). Kept for the shipped client. */
            mark_settled_between: {
                Args: {
                    p_trip_id: string;
                    p_debtor_id: string;
                    p_creditor_id: string;
                    p_settled: boolean;
                };
                Returns: number;
            };
            /**
             * Phase-2 settle contract. Flips BOTH directions of unsettled
             * debt between two members and returns every affected split row.
             * The client must replace its local split rows with this result.
             */
            settravo_settle_pair: {
                Args: {
                    p_trip_id: string;
                    p_member_a: string;
                    p_member_b: string;
                    p_settled: boolean;
                };
                Returns: Database["public"]["Tables"]["TravelAppSplits"]["Row"][];
            };
            /**
             * Phase-5 recurring bills. Lazily materializes any due, missing
             * expenses for the trip's active templates and returns the rows
             * it created (possibly empty). Idempotent: guarded by a UNIQUE
             * (template_id, period) index and a per-trip advisory lock.
             */
            settravo_materialize_recurring: {
                Args: {
                    p_trip_id: string;
                };
                Returns: Database["public"]["Tables"]["TravelAppExpenses"]["Row"][];
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
}