-- users 테이블에 이메일 인증 및 로그인 추적 컬럼 추가
-- auth 도메인이 email 기반 인증으로 전환됨에 따라 필요한 컬럼 추가

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email         VARCHAR(255)  NULL,
  ADD COLUMN IF NOT EXISTS nickname      VARCHAR(100)  NULL,
  ADD COLUMN IF NOT EXISTS is_verified   BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ   NULL;

-- email 유니크 인덱스 (소프트 삭제 고려)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email
  ON users (email)
  WHERE deleted_at IS NULL;

-- 기존 레코드에 email NULL이 있으므로 email 컬럼을 NOT NULL로 강제하려면
-- 데이터 마이그레이션 이후 아래 명령 실행:
-- ALTER TABLE users ALTER COLUMN email SET NOT NULL;
