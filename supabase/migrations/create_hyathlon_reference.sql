CREATE TABLE IF NOT EXISTS hyathlon_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text UNIQUE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
