---
name: aws-ecs-rorr
description: rorr 프로젝트 ECS 클러스터 상태 확인 및 관리. "ECS 상태 확인해줘", "태스크 몇 개야", "재시작해줘" 같은 요청 시 사용.
---

## 설정
- 클러스터: `mcp-agents-staging-cluster`
- 리전: `us-east-1`
- 프로파일: `rorr-dev`
- 서비스 목록: `api-server`, `db-schema`, `business-logic`, `api-endpoints`

## 실행 방식

사용자 요청에 따라 아래 Bash 명령어를 실행한다.

### 전체 서비스 상태 확인
```bash
aws ecs describe-services \
  --cluster mcp-agents-staging-cluster \
  --services mcp-agents-staging-api-server mcp-agents-staging-db-schema mcp-agents-staging-business-logic mcp-agents-staging-api-endpoints \
  --region us-east-1 \
  --profile rorr-dev \
  --query 'services[*].{name:serviceName, running:runningCount, desired:desiredCount, status:status}'
```

### 특정 서비스 상태
```bash
aws ecs describe-services \
  --cluster mcp-agents-staging-cluster \
  --services mcp-agents-staging-{서비스명} \
  --region us-east-1 \
  --profile rorr-dev \
  --query 'services[0].{running:runningCount, desired:desiredCount, events:events[:3]}'
```

### 서비스 재시작
```bash
aws ecs update-service \
  --cluster mcp-agents-staging-cluster \
  --service mcp-agents-staging-{서비스명} \
  --force-new-deployment \
  --region us-east-1 \
  --profile rorr-dev
```

### 실행 중인 태스크 목록
```bash
aws ecs list-tasks \
  --cluster mcp-agents-staging-cluster \
  --service-name mcp-agents-staging-{서비스명} \
  --region us-east-1 \
  --profile rorr-dev
```

## 출력
- 서비스별 running/desired 카운트
- 최근 이벤트 (배포 상태, 헬스체크 등)
- 이상 감지 시 원인 분석 및 조치 방법 안내
