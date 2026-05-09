# MCP 서버

## 역할
Claude Code가 사용하는 AI 툴 서버 — DB 설계, 비즈니스 로직, API 엔드포인트 설계 도구 제공

## 서버 목록

### `db-schema` (포트 5001)
DB 스키마 설계 및 실제 RDS 조회
| 툴 | 설명 |
|----|------|
| `design_schema` | 기능 요구사항 → 테이블 구조 설계 |
| `generate_ddl` | 테이블 설계 → `CREATE TABLE` SQL 생성 |
| `describe_table` | 실제 RDS에서 테이블 컬럼/타입 조회 |
| `POST /log` | Claude Code 프롬프트 → `mcp_logs` DB + CloudWatch 저장 |

### `business-logic` (포트 5002)
서비스 레이어 설계 및 비즈니스 규칙 정의
| 툴 | 설명 |
|----|------|
| `design_service_layer` | DB 스키마 기반 서비스 함수 목록 설계 |
| `validate_rules` | 비즈니스 규칙 및 입력값 검증 로직 정의 |
| `check_transaction` | 트랜잭션 경계 및 롤백 조건 검증 |

### `api-endpoints` (포트 5003)
RESTful API 설계 및 요청/응답 스키마 생성
| 툴 | 설명 |
|----|------|
| `design_endpoints` | DB 스키마 기반 RESTful 엔드포인트 목록 설계 |
| `generate_request_response` | 특정 엔드포인트의 요청/응답 JSON 예시 생성 |
| `check_auth` | 인증/인가 방식 및 미들웨어 설계 |

## 기술 스택
- Node.js 20 + Express (현재)
- `@modelcontextprotocol/sdk` — MCP 서버 구현
- PostgreSQL — `mcp_logs` 테이블 (프롬프트 로그 저장)

## 배포
```bash
# db-schema만 배포
AWS_PROFILE=rorr-dev bash -c 'source deploy-fargate.sh; build_and_push db-schema'

# 전체 배포
AWS_PROFILE=rorr-dev bash deploy-fargate.sh
```

## 로컬 실행
```bash
RDS_URL=postgresql://... node db-schema/index.js
```

## 주의
- `deploy-fargate.sh` 실행 전 Docker 데스크탑 실행 확인
- ECS 재배포 후 약 1-2분 대기
- CloudWatch 로그: `/ecs/mcp-agents-staging`
# 2026-05-09T06:26:17Z
