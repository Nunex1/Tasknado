import type {
  Workspace,
  Activity,
  ActivityEvent,
  Note,
  Entry,
  Attachment,
  SearchResult,
  Status,
  EventType,
} from "./domain";
type Owned<T> = T & { owner_id: string };
type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: { [K in keyof Row]: Row[K] };
  Insert: Insert;
  Update: Update;
  Relationships: [];
};
type OptionalOwnership = { id?: string; owner_id?: string };
export type Database = {
  public: {
    Tables: {
      workspaces: Table<
        Owned<Workspace>,
        OptionalOwnership & {
          name: string;
          description?: string;
          icon?: string;
          archived?: boolean;
        }
      >;
      activities: Table<
        Owned<Activity>,
        OptionalOwnership & {
          workspace_id: string;
          title: string;
          description?: string;
          archived?: boolean;
        },
        { title?: string; description?: string; archived?: boolean }
      >;
      activity_events: Table<
        Owned<ActivityEvent> & { request_id: string },
        never,
        never
      >;
      notes: Table<
        Owned<Note>,
        OptionalOwnership & { workspace_id: string; title: string }
      >;
      note_entries: Table<
        Owned<Entry>,
        OptionalOwnership & { note_id: string; content?: string },
        never
      >;
      attachments: Table<
        Owned<Attachment>,
        OptionalOwnership & {
          activity_id?: string;
          note_id?: string;
          event_id?: string | null;
          name: string;
          path: string;
          mime: string;
          size: number;
        },
        never
      >;
      audit_logs: Table<
        {
          id: number;
          owner_id: string;
          entity: string;
          entity_id: string;
          action: string;
          created_at: string;
        },
        never,
        never
      >;
    };
    Views: Record<string, never>;
    Functions: {
      add_event: {
        Args: {
          p_activity: string;
          p_type: EventType;
          p_content: string;
          p_request: string;
        };
        Returns: Owned<ActivityEvent>;
      };
      save_entry: {
        Args: { p_id: string; p_content: string; p_revision: number };
        Returns: Owned<Entry>;
      };
      delete_workspace: { Args: { p_workspace: string }; Returns: undefined };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      search_all: {
        Args: {
          p_query: string;
          p_workspace?: string | null;
          p_kind?: string | null;
          p_status?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_mime?: string | null;
          p_offset?: number;
        };
        Returns: SearchResult[];
      };
    };
    Enums: { activity_status: Status; event_type: EventType };
    CompositeTypes: Record<string, never>;
  };
};
