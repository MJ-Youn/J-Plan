-- Cloudflare D1 Schema for j-plan
-- 여행 데이터는 R2에 JSON으로 저장하므로, 여기서는 사용자 정보만 관리합니다.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
