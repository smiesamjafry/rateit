CREATE TABLE IF NOT EXISTS events (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  admin_token   VARCHAR(64) NOT NULL UNIQUE,
  public_slug   VARCHAR(16) NOT NULL UNIQUE,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  text          VARCHAR(500) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS responses (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  feedback      TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
  id            SERIAL PRIMARY KEY,
  response_id   INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  value         INTEGER NOT NULL CHECK (value >= 1 AND value <= 5),
  UNIQUE(response_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_questions_event_id ON questions(event_id);
CREATE INDEX IF NOT EXISTS idx_responses_event_id ON responses(event_id);
CREATE INDEX IF NOT EXISTS idx_ratings_response_id ON ratings(response_id);
CREATE INDEX IF NOT EXISTS idx_ratings_question_id ON ratings(question_id);
