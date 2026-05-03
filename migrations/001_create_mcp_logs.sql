-- mcp_logs: MCP 요청 로그 테이블
-- x-user-id 헤더 기반 작성자 추적

CREATE TABLE IF NOT EXISTS mcp_logs (
  id              SERIAL PRIMARY KEY,
  user_id         VARCHAR(255) NOT NULL,  -- x-user-id 헤더값 (예: woody@rorr.club)
  prompt_content  TEXT,                   -- 프롬프트 내용
  mcp_server      VARCHAR(100),           -- MCP 서버명
  response_result TEXT,                   -- 응답 결과
  status_code     INTEGER,                -- 상태코드
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_logs_user_id    ON mcp_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_created_at ON mcp_logs (created_at DESC);
