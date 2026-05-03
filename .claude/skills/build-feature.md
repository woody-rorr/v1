---
name: build-feature
description: 기능명을 받아 db-schema / business-logic / api-endpoints 에이전트를 동시에 실행하고 결과를 nestjs-generator에게 전달해 실제 NestJS 파일을 생성한다. "build-feature 유저 로그인", "기능 만들어줘" 같은 요청 시 사용.
---

사용자가 기능명을 주면 아래 순서로 실행한다..

## 실행 순서

**Step 1 — 병렬 설계 (3개 에이전트 동시)**
- `db-schema` 에이전트: 필요한 테이블 설계 + DDL + TypeORM 엔티티
- `business-logic` 에이전트: 서비스 함수 목록 + 검증 규칙 + 트랜잭션
- `api-endpoints` 에이전트: 엔드포인트 목록 + 요청/응답 스펙 + 인증 여부

**Step 2 — 코드 생성**
- `nestjs-generator` 에이전트: Step 1 결과 전체를 입력으로 실제 파일 생성

**Step 3 — 마이그레이션 파일**
- `v1/migrations/` 에 SQL 마이그레이션 파일 생성 (순번 자동 증가)

## 출력
- 생성된 파일 목록
- 마이그레이션 SQL
- 다음 작업 안내 (Module 등록 등)
