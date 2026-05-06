---
name: aws-cloudwatch-rorr
description: rorr 프로젝트 CloudWatch 로그 조회 및 분석. "로그 보여줘", "에러 확인해줘", "최근 요청 로그 보여줘" 같은 요청 시 사용.
---

## 설정
- 로그 그룹: `/ecs/mcp-agents-staging`
- 리전: `us-east-1`
- 프로파일: `rorr-dev`
- 스트림 prefix: `ecs/api-server/`, `ecs/db-schema/`, `ecs/business-logic/`, `ecs/api-endpoints/`

## 실행 방식

### 실시간 로그 스트리밍
```bash
aws logs tail /ecs/mcp-agents-staging \
  --follow \
  --region us-east-1 \
  --profile rorr-dev
```

### 특정 서비스 최근 로그
```bash
# 최신 스트림 이름 조회
aws logs describe-log-streams \
  --log-group-name /ecs/mcp-agents-staging \
  --region us-east-1 \
  --profile rorr-dev \
  --query 'logStreams[?contains(logStreamName, `{서비스명}`)]|sort_by(@, &creationTime)[-1].logStreamName' \
  --output text

# 로그 조회
aws logs get-log-events \
  --log-group-name /ecs/mcp-agents-staging \
  --log-stream-name {스트림명} \
  --region us-east-1 \
  --profile rorr-dev \
  --limit 50 \
  --query 'events[*].message' \
  --output text
```

### 에러 로그만 필터링
```bash
aws logs filter-log-events \
  --log-group-name /ecs/mcp-agents-staging \
  --filter-pattern "ERROR" \
  --region us-east-1 \
  --profile rorr-dev \
  --start-time $(date -v-1H +%s000) \
  --query 'events[*].message' \
  --output text
```

### API 요청 로그 조회 (Logging Interceptor)
```bash
aws logs filter-log-events \
  --log-group-name /ecs/mcp-agents-staging \
  --filter-pattern '{ $.event = "request" }' \
  --region us-east-1 \
  --profile rorr-dev \
  --start-time $(date -v-1H +%s000) \
  --query 'events[*].message' \
  --output text
```

## 출력
- 로그 내용 파싱 후 읽기 쉽게 정리
- ERROR 발견 시 원인 분석
- API 요청 로그는 method/path/status/duration 테이블로 정리
