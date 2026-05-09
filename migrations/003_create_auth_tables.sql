-- 003_create_auth_tables.sql
-- users 테이블에 email 컬럼 추가 + refresh_tokens 테이블 생성
-- JWT 기반 인증(Access Token 15분 / Refresh Token 7일) 지원

-- users: email 컬럼 추가 (이미 존재하면 skip)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- 기존 rows가 있을 경우 NOT NULL 제약 전에 임시값 채움
UPDATE users
  SET email = username || '@placeholder.local'
  WHERE email IS NULL;

ALTER TABLE users
  ALTER COLUMN email SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email
  ON users (email)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

-- refresh_tokens: allowlist 방식으로 Refresh Token 관리
-- revoked_at 설정으로 무효화, rotation 시 이전 토큰 폐기
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(512) NOT NULL,
  device_info TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_refresh_tokens_token
  ON refresh_tokens (token);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
  ON refresh_tokens (expires_at);
