---
name: build-feature
description: 기능명을 받아 DB·서비스·API를 분석하고 각 MCP 서버에서 claude CLI로 실제 코드를 구현한 뒤 PR을 생성한다. "build-feature 유저 로그인", "로그인 기능 만들어줘", "기능 구현해줘" 같은 요청 시 사용.
---

사용자가 기능명을 주면 질문 없이 아래 순서로 실행한다.

## 레포 구조
```
v1/
├── backend/api-server/src/
│   ├── auth/                  ← 인증 관련 (AuthModule, AuthService, AuthController)
│   ├── users/                 ← 유저 관련 (UsersModule, UsersService, UsersController)
│   └── app.module.ts          ← 신규 Module 등록 필요
├── migrations/                ← DB 마이그레이션 SQL 파일
```

## 실행 순서

**Step 1 — 요구사항 분석 (내부 판단, 사용자에게 묻지 않음)**

기능명을 보고 스스로 판단:
- 어떤 테이블/마이그레이션이 필요한가
- 어떤 서비스 메서드가 필요한가
- 어떤 API 엔드포인트가 필요한가

**Step 2 — 3개 MCP 툴 동시 호출**

각 툴의 `prompt`에 **파일 경로까지 명시**해서 전달한다.

- `mcp__db-schema__implement_and_pr`
  - prompt 예시: "migrations/ 폴더에 003_create_auth_tables.sql 생성. users 테이블(id UUID PK, email VARCHAR UNIQUE, password_hash VARCHAR, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ). refresh_tokens 테이블(id UUID PK, user_id UUID FK→users.id, token_hash VARCHAR, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ). backend/api-server/src/auth/entities/ 에 TypeORM 엔티티 파일 생성."

- `mcp__business-logic__implement_and_pr`
  - prompt 예시: "backend/api-server/src/auth/ 에 AuthService 구현. register(email, password), login(email, password, ip), logout(userId, refreshToken), refresh(refreshToken) 메서드. bcrypt 해싱, JWT 발급(AccessToken 15분, RefreshToken 7일), refresh_tokens DB 저장. auth.service.ts, auth.service.interface.ts 생성."

- `mcp__api-endpoints__implement_and_pr`
  - prompt 예시: "backend/api-server/src/auth/ 에 AuthController 구현. POST /auth/register(201), POST /auth/login(200), POST /auth/logout(200), POST /auth/refresh(200), GET /auth/me(200, JwtAuthGuard). 각 엔드포인트에 @ApiTags('auth'), @ApiOperation, @ApiResponse Swagger 데코레이터 포함. auth.controller.ts, auth.module.ts 생성. app.module.ts에 AuthModule imports 추가."

**Step 3 — 결과 취합 및 보고**

```
✅ 구현 완료

| 영역 | PR |
|------|----|
| DB 마이그레이션 + 엔티티 | <url> |
| 서비스 로직 | <url> |
| API 컨트롤러 + Swagger | <url> |

머지 순서: DB → 서비스 → API
머지 후 Swagger: http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com/api
```

## 주의사항
- 절대 사용자에게 추가 질문하지 않는다
- 기존 코드 패턴(tsconfig.json, 기존 엔티티 구조) 반드시 확인 후 생성
- app.module.ts에 신규 Module 반드시 등록
- 각 MCP 툴은 독립적으로 레포를 clone하므로 동시 호출해도 충돌하지 않는다
