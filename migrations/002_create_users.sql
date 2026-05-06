-- users: 유저 로그인 테이블
-- 단순 username/password 인증 (JWT 없음)

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ NULL
);

-- 로그인 조회: username 단일 인덱스 (UNIQUE + 소프트삭제 부분 인덱스)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_username
  ON users (username)
  WHERE deleted_at IS NULL;

-- 활성 유저 조회: is_active + deleted_at 복합 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_users_is_active
  ON users (is_active)
  WHERE deleted_at IS NULL;
