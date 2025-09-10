-- Create comments table and indexes
CREATE TYPE comment_entity AS ENUM ('candidate','task');
CREATE TYPE comment_visibility AS ENUM ('internal','external');

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type comment_entity NOT NULL,
  entity_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  visibility comment_visibility NOT NULL,
  parent_id uuid NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Composite index for performant queries
CREATE INDEX comments_entity_visibility_idx 
  ON comments(entity_type, entity_id, visibility, created_at DESC);

