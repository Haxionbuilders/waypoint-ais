/*
# Create conversation history tables for the Waypoint AI agent

## Overview
The app is being restructured from a dashboard website into an agent-first
product where the AI chat is the primary interface. These tables persist
conversation history and individual messages (including rich tool-result cards)
so users can revisit past conversations.

## 1. New Tables

### conversations
Top-level conversation threads shown in the sidebar history.
- `id` (uuid, primary key)
- `title` (text, default 'New conversation') — auto-set from the first user message
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### conversation_messages
Individual messages within a conversation. Stores both user messages and
assistant responses, including structured card data for rich rendering.
- `id` (uuid, primary key)
- `conversation_id` (uuid, foreign key to conversations, cascade delete)
- `role` (text, not null) — 'user' or 'assistant'
- `content` (text, not null) — text content of the message
- `card_type` (text, nullable) — 'weather' | 'geocode' | 'reports' | 'inbox' | null
- `card_data` (jsonb, nullable) — structured data for rich card rendering
- `created_at` (timestamptz, default now())

## 2. Indexes
- `conversation_messages_conversation_idx` on conversation_messages(conversation_id, created_at)
- `conversations_updated_idx` on conversations(updated_at desc)

## 3. Security (RLS)
No-auth app with shared data: all policies use `TO anon, authenticated` with
`USING (true)` / `WITH CHECK (true)` — conversations are public by design.
*/

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  card_type text,
  card_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx ON conversation_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations (updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- conversations: full CRUD for anon + authenticated
DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
CREATE POLICY "anon_select_conversations" ON conversations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
CREATE POLICY "anon_insert_conversations" ON conversations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
CREATE POLICY "anon_update_conversations" ON conversations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;
CREATE POLICY "anon_delete_conversations" ON conversations FOR DELETE
  TO anon, authenticated USING (true);

-- conversation_messages: full CRUD for anon + authenticated
DROP POLICY IF EXISTS "anon_select_conversation_messages" ON conversation_messages;
CREATE POLICY "anon_select_conversation_messages" ON conversation_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_conversation_messages" ON conversation_messages;
CREATE POLICY "anon_insert_conversation_messages" ON conversation_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversation_messages" ON conversation_messages;
CREATE POLICY "anon_update_conversation_messages" ON conversation_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_conversation_messages" ON conversation_messages;
CREATE POLICY "anon_delete_conversation_messages" ON conversation_messages FOR DELETE
  TO anon, authenticated USING (true);
