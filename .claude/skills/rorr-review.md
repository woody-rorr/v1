---
name: rorr-review
description: 변경된 코드를 리뷰하고 PR 설명을 작성한다. "리뷰해줘", "코드 확인해줘", "PR 만들어줘", "배포 전 확인해줘" 같은 요청 시 사용.
---

## 실행 순서

**Step 1 — 변경 파일 확인**
```bash
git diff --name-only HEAD
git diff HEAD
git log --oneline -5
```

**Step 2 — 코드 리뷰 (아래 기준으로 검토)**

### 필수 체크리스트
- [ ] `any` 타입 사용 여부 → `unknown` 또는 제네릭으로 교체 필요
- [ ] `console.log` 사용 여부 → `process.stdout.write` 또는 Logger로 교체 필요
- [ ] DTO에 `@ApiProperty` 누락 여부
- [ ] 에러 처리: `HttpException` 커스텀 예외 사용 여부
- [ ] 트랜잭션 경계 적절성 (DB 변경이 2개 이상이면 트랜잭션 필요)
- [ ] 환경변수 하드코딩 여부

### 코드 품질
- [ ] 함수/변수명이 의도를 명확히 표현하는가
- [ ] 불필요한 주석 없는가 (WHY가 아닌 WHAT 설명 주석)
- [ ] 중복 코드 없는가

### 보안
- [ ] SQL Injection 가능성 (TypeORM 파라미터 바인딩 사용 여부)
- [ ] JWT 시크릿 하드코딩 여부
- [ ] 민감 정보 로그 출력 여부

**Step 3 — PR 설명 초안 작성**

아래 형식으로 작성:
```
## 변경 내용
- 

## 테스트 방법
- curl 또는 Swagger로 확인:

## 체크리스트
- [ ] 로컬 빌드 확인 (npm run build)
- [ ] Swagger 엔드포인트 확인
- [ ] CloudWatch 로그 확인
```

## 출력
1. 리뷰 결과 (문제 발견 시 파일명:라인번호 포함)
2. PR 설명 초안
3. 머지 가능 여부 판단 (✅ 머지 가능 / ⚠️ 수정 필요)
