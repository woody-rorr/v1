#!/bin/bash
set -e

AWS_PROFILE="${AWS_PROFILE:-rorr-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT="${PROJECT:-mcp-agents-staging}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
ECR_BASE="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "=== ECR 로그인 (계정: $ACCOUNT_ID) ==="
aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" | \
  docker login --username AWS --password-stdin "$ECR_BASE"

build_and_push() {
  local name=$1
  local dir="$SCRIPT_DIR/$name"
  local repo="$ECR_BASE/$PROJECT-$name"

  echo "=== [$name] 빌드 & ECR 푸시 ==="
  docker build --platform linux/amd64 -t "$repo:latest" "$dir"
  docker push "$repo:latest"

  echo "=== [$name] ECS 강제 재배포 ==="
  aws ecs update-service \
    --cluster "$PROJECT-cluster" \
    --service "$PROJECT-$name" \
    --force-new-deployment \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --output text --query 'service.serviceName'
}

build_and_push "db-schema"
build_and_push "business-logic"
build_and_push "api-endpoints"
build_and_push "infra-mcp"
build_and_push "frontend-mcp"

echo ""
echo "=== 배포 완료 ==="
echo ""
echo "cloudflared 터널 URL 확인:"
echo "  aws logs tail /ecs/$PROJECT --profile $AWS_PROFILE --follow | grep trycloudflare.com"
echo ""
echo "확인된 URL을 v1/.mcp.json 에 입력하세요."
