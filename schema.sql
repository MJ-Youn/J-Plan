-- Cloudflare D1 Schema for j-plan
-- 여행 상세 JSON 데이터는 R2에 저장하고, 사용자·공유·협업 메타데이터는 D1에서 관리합니다.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 여행 공유 링크 테이블 (읽기 전용 / 공동 편집)
CREATE TABLE IF NOT EXISTS travel_shares (
  id TEXT PRIMARY KEY,
  travel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'view', -- 'view' | 'edit'
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, travel_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_travel_shares_travel ON travel_shares(owner_id, travel_id);

-- 로그인 기반 공동 작업자 테이블
CREATE TABLE IF NOT EXISTS travel_collaborators (
  id TEXT PRIMARY KEY,
  travel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_name TEXT,
  user_avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, travel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_travel_collab_user ON travel_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_collab_travel ON travel_collaborators(owner_id, travel_id);

-- 여행 필수 서류(바우처, e-티켓, Google Drive 링크 등) 메타데이터 테이블
CREATE TABLE IF NOT EXISTS travel_files (
  id TEXT PRIMARY KEY,
  travel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '기타',
  title TEXT NOT NULL,
  reservation_number TEXT,
  provider TEXT,
  storage_type TEXT NOT NULL DEFAULT 'r2', -- 'r2' | 'link'
  r2_key TEXT,
  external_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  iv TEXT,                                -- AES-256-GCM 암호화 IV (Base64)
  visibility TEXT NOT NULL DEFAULT 'collaborators', -- 'owner_only' | 'collaborators' | 'all_shared'
  day_index INTEGER,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_travel_files_travel ON travel_files(owner_id, travel_id);
