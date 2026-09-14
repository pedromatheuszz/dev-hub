export interface Migration {
  version: number
  up: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('official','news','blog','aggregator','research')),
  trust_weight REAL NOT NULL CHECK (trust_weight BETWEEN 0 AND 1),
  category_hint TEXT CHECK (category_hint IN ('technology','programming','innovation')),
  active INTEGER NOT NULL DEFAULT 1,
  last_fetched_at INTEGER,
  etag TEXT,
  last_modified TEXT
);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  canonical_summary TEXT,
  category TEXT NOT NULL CHECK (category IN ('technology','programming','innovation')),
  importance REAL NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
  is_breaking INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_updated_at INTEGER NOT NULL,
  article_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT,
  published_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  content_html TEXT,
  image_url TEXT,
  lang TEXT NOT NULL DEFAULT 'en',
  simhash TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  story_id TEXT REFERENCES stories(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL DEFAULT 'news'
    CHECK (content_type IN ('news','announcement','report','rumor','opinion','analysis')),
  ai_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_state IN ('pending','prefiltered_out','classified','summarized','failed'))
);

CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_story ON articles(story_id);
CREATE INDEX idx_articles_source ON articles(source_id);
CREATE INDEX idx_articles_ai_state ON articles(ai_state);
CREATE INDEX idx_stories_updated ON stories(last_updated_at DESC);

CREATE TABLE story_articles (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, article_id)
);

CREATE TABLE summaries (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('short','deep')),
  text TEXT NOT NULL,
  key_points TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  generated_at INTEGER NOT NULL,
  is_ai_generated INTEGER NOT NULL DEFAULT 1,
  UNIQUE (article_id, kind)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('language','framework','hardware','company','topic','product')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE article_tags (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  source TEXT NOT NULL DEFAULT 'rule' CHECK (source IN ('ai','rule','user')),
  PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX idx_article_tags_tag ON article_tags(tag_id);

CREATE TABLE follows (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('tag','category','source')),
  target_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1 CHECK (weight BETWEEN 0 AND 1),
  created_at INTEGER NOT NULL,
  UNIQUE (target_kind, target_id)
);

CREATE TABLE saved_articles (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  saved_at INTEGER NOT NULL,
  note TEXT
);

CREATE TABLE reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  opened_at INTEGER NOT NULL,
  dwell_seconds INTEGER NOT NULL DEFAULT 0,
  scroll_pct REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_history_article ON reading_history(article_id);

CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day, provider, model)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE articles_fts USING fts5(
  article_id UNINDEXED,
  title,
  excerpt,
  content_text,
  tags_flat
);
`,
  },
  {
    version: 2,
    // Idioma dominante da fonte, aprendido dos artigos dela.
    //
    // Metade dos artigos e so titulo, sem corpo: "GitLab 19.3 released" nao
    // tem uma palavra funcional sequer, entao a deteccao por texto nao tem
    // como funcionar neles. A fonte resolve: um blog publica num idioma so.
    up: `ALTER TABLE sources ADD COLUMN lang TEXT;`,
  },
  {
    version: 3,
    up: `
CREATE TABLE translations (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_text TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  translated_at INTEGER NOT NULL,
  PRIMARY KEY (article_id, target_lang)
);
CREATE INDEX idx_translations_lang ON translations(target_lang);
CREATE INDEX idx_articles_lang ON articles(lang);
`,
  },
]