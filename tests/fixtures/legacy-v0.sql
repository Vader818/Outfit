-- Frozen, fully synthetic schema from immediately before versioned migrations.
-- This fixture intentionally contains neither schema_migrations nor
-- recommendation_candidates.
PRAGMA foreign_keys = ON;

CREATE TABLE source_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  page_type TEXT,
  item_id TEXT,
  order_id TEXT,
  order_time TEXT,
  title TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  payment REAL,
  status TEXT,
  refund_text TEXT,
  item_url TEXT,
  image_url TEXT,
  raw_text TEXT,
  detail_url TEXT,
  detail_title TEXT,
  detail_props TEXT,
  detail_description TEXT,
  detail_images TEXT,
  detail_raw_text TEXT,
  is_refunded INTEGER NOT NULL DEFAULT 0,
  is_apparel INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE garments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_order_item_id INTEGER UNIQUE,
  brand TEXT,
  name TEXT NOT NULL,
  raw_name TEXT,
  category TEXT NOT NULL,
  color TEXT NOT NULL,
  warmth TEXT NOT NULL,
  seasons TEXT NOT NULL,
  styles TEXT NOT NULL,
  formality TEXT NOT NULL,
  size TEXT,
  materials TEXT NOT NULL DEFAULT '[]',
  patterns TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  cutout_image_url TEXT,
  vision_tags TEXT,
  vision_updated_at TEXT,
  image_url TEXT,
  owned INTEGER NOT NULL DEFAULT 1,
  confirmed INTEGER NOT NULL DEFAULT 0,
  excluded INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_order_item_id) REFERENCES source_order_items(id)
);

CREATE TABLE weather_cache (
  cache_key TEXT PRIMARY KEY,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wear_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_ids TEXT NOT NULL,
  context TEXT,
  worn_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recommendation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_source_order_items_item_id ON source_order_items(item_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

BEGIN IMMEDIATE;

INSERT INTO source_order_items (
  id, external_key, source, page_type, item_id, order_id, order_time, title,
  sku, quantity, payment, status, refund_text, item_url, image_url, raw_text,
  detail_url, detail_title, detail_props, detail_description, detail_images,
  detail_raw_text, is_refunded, is_apparel, imported_at
) VALUES (
  1,
  'fixture-order-1',
  'synthetic-legacy-fixture',
  'item-detail',
  '10001',
  'FIXTURE-ORDER-0001',
  '2025-12-01T08:00:00.000Z',
  'Fixture synthetic cotton shirt',
  'color: blue; size: M',
  1,
  199.50,
  'completed',
  '',
  'https://item.taobao.com/item.htm?id=10001',
  'https://img.alicdn.com/fixture-shirt.jpg',
  'synthetic legacy order row',
  'https://item.taobao.com/item.htm?id=10001',
  'Fixture synthetic cotton shirt',
  '[{"name":"brand","value":"Fixture"}]',
  'Synthetic detail description with no real user data.',
  '["https://img.alicdn.com/fixture-shirt.jpg"]',
  'synthetic legacy detail row',
  0,
  1,
  '2025-12-01T08:05:00.000Z'
);

INSERT INTO garments (
  id, source_order_item_id, brand, name, raw_name, category, color, warmth,
  seasons, styles, formality, size, materials, patterns, tags,
  cutout_image_url, vision_tags, vision_updated_at, image_url, owned,
  confirmed, excluded, confidence, notes, created_at, updated_at
) VALUES (
  1,
  1,
  'Fixture',
  'My confirmed fixture shirt',
  'Fixture synthetic cotton shirt',
  'top',
  'blue',
  'light',
  '["spring","summer"]',
  '["casual","smart-casual"]',
  'smart-casual',
  'M',
  '["cotton"]',
  '["solid"]',
  '["fixture"]',
  NULL,
  '{"category":"top","styles":["casual"],"patterns":["solid"],"tags":["fixture"],"scores":[{"label":"top","score":0.99}]}',
  '2025-12-02T09:00:00.000Z',
  '/api/garment-thumbnails/fixture-shirt.webp',
  1,
  1,
  0,
  0.91,
  'Synthetic migration rehearsal garment.',
  '2025-12-01T08:10:00.000Z',
  '2025-12-02T09:00:00.000Z'
);

INSERT INTO weather_cache (
  cache_key, latitude, longitude, payload, fetched_at
) VALUES (
  'weather:0.0000:0.0000',
  0,
  0,
  '{"date":"2025-12-03","temperature":18,"apparentTemperature":18,"precipitationProbability":10,"windSpeed":8,"weatherCode":1,"summary":"synthetic-clear"}',
  '2025-12-03T00:00:00.000Z'
);

INSERT INTO wear_logs (id, garment_ids, context, worn_at) VALUES (
  1,
  '[1]',
  '{"outfitId":"outfit-1","occasion":"casual","fixture":true}',
  '2025-12-04T08:00:00.000Z'
);

INSERT INTO recommendation_runs (id, input_json, result_json, created_at) VALUES (
  1,
  '{"occasion":"casual","fixture":true}',
  '{"occasion":"casual","outfits":[{"id":"outfit-1","score":88,"itemIds":[1]}]}',
  '2025-12-04T07:55:00.000Z'
);

INSERT INTO app_settings (key, value, updated_at) VALUES (
  'personalProfile',
  '{"heightCm":170,"weightKg":60,"bodyType":"average","skinTone":"medium-yellow","colorDisposition":"neutral","temperatureSensitivity":"neutral","preferredColors":["blue"],"avoidedColors":[],"preferredStyles":["casual"]}',
  '2025-12-01T07:00:00.000Z'
);

INSERT INTO users (
  id, username, username_normalized, password_hash, password_salt,
  created_at, updated_at
) VALUES (
  1,
  'fixture_owner',
  'fixture_owner',
  'fixture-password-hash',
  'fixture-password-salt',
  '2025-12-01T06:00:00.000Z',
  '2025-12-01T06:00:00.000Z'
);

INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (
  'fixture-session-token-hash',
  1,
  '2099-01-01T00:00:00.000Z',
  '2025-12-01T06:05:00.000Z'
);

COMMIT;
