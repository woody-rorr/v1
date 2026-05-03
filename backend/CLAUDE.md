# 백엔드 서비스

## 서비스 목록
- `api-gateway/` : 진입점. 인증 검사 + 서비스 라우팅
- `user-service/` : 유저 CRUD, 인증/인가
- `payment-service/` : 결제 처리, user-service 의존

## 공통 규칙
- 공통 타입은 `../shared/types/` 에서 import
- 서비스 간 직접 DB 접근 금지 — 반드시 API 호출
- 환경변수는 `.env.example` 항상 최신 유지

## 서비스 간 통신
- 동기: REST (api-gateway → 각 서비스)
- 비동기: 필요 시 메시지 큐 도입 예정

## 로컬 실행
각 서비스 폴더에서 개별 실행하거나, docker-compose로 전체 기동
