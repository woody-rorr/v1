# v1 레포

## 이 레포의 역할
MCP Agents 백엔드 — NestJS API 서버 + MCP 툴 서버 + DB 마이그레이션

## 팀원 온보딩 순서
1. AWS SSO 로그인: `aws sso login --profile rorr-dev`
2. `.mcp.json` 확인 (MCP 서버 ALB URL 설정 완료 상태)
3. Claude Code 실행: `claude` (v1 폴더에서)

## 로컬 개발
```bash
# api-server 로컬 실행
cd backend/api-server
DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... npm run start:dev
```
- RDS 접속 정보: `CLAUDE.local.md` 참고 (git 미추적)
- **주의**: RDS는 프라이빗 서브넷 — 로컬 접속 시 SSM 포트포워딩 필요

## 배포
- `backend/**` push → GitHub Actions `deploy-backend.yml` → api-server ECS 자동 배포
- `mcp-servers/**` push → GitHub Actions `deploy-mcp.yml` → MCP 3개 ECS 병렬 배포
- **main 직접 push 금지** — PR 생성 후 리뷰 필수

## 스킬 목록 (Claude Code에서 `/명령어`로 사용)

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `/build-feature` | DB·API·비즈니스 로직 동시 설계 후 NestJS 파일 생성 | `/build-feature 결제 기능` |
| `/aws-ecs-rorr` | ECS 서비스 상태 확인 및 재시작 | `/aws-ecs-rorr 전체 상태 확인해줘` |
| `/aws-cloudwatch-rorr` | CloudWatch 로그 조회 및 에러 분석 | `/aws-cloudwatch-rorr 최근 에러 보여줘` |

## MCP 서버 (AI 툴)

| 서버 | 포트 | 역할 |
|------|------|------|
| `db-schema` | 5001 | DB 스키마 설계, RDS 테이블 조회, 프롬프트 로그 저장 |
| `business-logic` | 5002 | 서비스 레이어 설계, 검증 규칙, 트랜잭션 경계 |
| `api-endpoints` | 5003 | RESTful 엔드포인트 설계, 요청/응답 스펙 |

## API 서버
- URL: `http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com`
- Swagger: `http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com/api`
- Health: `http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com/health`

## MCP 서버 설정 보존 규칙
- `.mcp.json` 파일은 절대 삭제하거나 덮어쓰지 말 것
- MCP 서버 추가 시 기존 항목을 유지한 채 병합할 것
- `.mcp.json` 수정 전 반드시 기존 내용 확인 후 진행
- 팀 공유 MCP URL 변경 시 팀원에게 공지 필요
