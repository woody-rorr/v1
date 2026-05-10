import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const HAIKU_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

async function callClaude(systemPrompt, userMessage, maxTokens = 8000) {
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  };
  const command = new InvokeModelCommand({
    modelId: HAIKU_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });
  const response = await bedrock.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content.filter(b => b.type === "text").map(b => b.text).join("\n");
}

const INFRA_SYSTEM_PROMPT = `당신은 AWS Terraform 인프라 전문 에이전트입니다.
HCL(HashiCorp Configuration Language)로 프로덕션 수준의 Terraform 코드를 작성합니다.

핵심 원칙:
- main.tf, variables.tf, outputs.tf 파일로 분리하여 코드 생성
- 보안 그룹(Security Group)은 최소 권한 원칙 적용
- IAM 역할/정책은 최소 권한으로 생성
- staging 환경 먼저 적용 후 production 적용 원칙 준수
- 리소스 태그: Environment, Project, ManagedBy = "terraform" 포함
- 변수는 variables.tf에 타입과 설명 명시
- 출력값은 outputs.tf에 필수값(ID, ARN, 엔드포인트) 포함
- 응답은 한국어 설명 + HCL 코드 형식으로 작성`;

const app = express();
app.use(express.json());

// 인메모리 컨텍스트 저장소
const infraContextStore = new Map();

function createServer() {
  const server = new McpServer({ name: "infra-mcp", version: "1.0.0" });

  // 툴 1: Terraform 코드 생성
  server.tool(
    "generate_terraform",
    "AWS 리소스에 대한 Terraform 코드(main.tf, variables.tf, outputs.tf)를 생성합니다",
    {
      request: z.string().describe("사용자 요청 (예: 'EC2 t3.medium 생성')"),
      environment: z.enum(["production", "staging", "development"]).describe("배포 환경"),
      resourceType: z.enum(["ec2", "ecs", "rds", "s3", "vpc", "기타"]).describe("AWS 리소스 유형"),
    },
    async ({ request, environment, resourceType }) => {
      const result = await callClaude(
        INFRA_SYSTEM_PROMPT,
        `요청: ${request}
환경: ${environment}
리소스 유형: ${resourceType}

위 요청에 맞는 Terraform 코드를 생성해주세요.
다음 형식으로 작성해주세요:

## main.tf
\`\`\`hcl
(main.tf 내용)
\`\`\`

## variables.tf
\`\`\`hcl
(variables.tf 내용)
\`\`\`

## outputs.tf
\`\`\`hcl
(outputs.tf 내용)
\`\`\`

## 적용 방법
(terraform init, plan, apply 명령어 및 주의사항)`,
        8000
      );
      return { content: [{ type: "text", text: result }] };
    }
  );

  // 툴 2: GitHub PR 생성
  server.tool(
    "create_infra_pr",
    "생성된 Terraform 코드를 GitHub infra 레포에 PR로 생성합니다",
    {
      terraformCode: z.string().describe("생성된 Terraform 코드 (main.tf, variables.tf, outputs.tf 포함)"),
      description: z.string().describe("PR 설명 (예: 'EC2 t3.medium 생성 - staging 환경')"),
      environment: z.enum(["production", "staging", "development"]).describe("배포 환경"),
    },
    async ({ terraformCode, description, environment }) => {
      const githubToken = process.env.GITHUB_TOKEN;
      const githubOwner = process.env.GITHUB_OWNER;
      const githubRepo = process.env.GITHUB_INFRA_REPO;

      if (!githubToken || !githubOwner || !githubRepo) {
        const missing = [];
        if (!githubToken) missing.push("GITHUB_TOKEN");
        if (!githubOwner) missing.push("GITHUB_OWNER");
        if (!githubRepo) missing.push("GITHUB_INFRA_REPO");
        return {
          content: [{
            type: "text",
            text: `GitHub PR 생성 실패: 다음 환경변수가 설정되지 않았습니다 — ${missing.join(", ")}\n\n환경변수를 설정한 후 다시 시도해주세요.`
          }]
        };
      }

      const timestamp = Date.now();
      const branchName = `infra/auto-${timestamp}`;
      const prTitle = `[인프라] ${description}`;
      const apiBase = `https://api.github.com/repos/${githubOwner}/${githubRepo}`;
      const headers = {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      try {
        // 기본 브랜치 SHA 조회
        const refRes = await fetch(`${apiBase}/git/ref/heads/main`, { headers });
        if (!refRes.ok) {
          const err = await refRes.json();
          throw new Error(`기본 브랜치 조회 실패: ${JSON.stringify(err)}`);
        }
        const refData = await refRes.json();
        const baseSha = refData.object.sha;

        // 새 브랜치 생성
        const branchRes = await fetch(`${apiBase}/git/refs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
        });
        if (!branchRes.ok) {
          const err = await branchRes.json();
          throw new Error(`브랜치 생성 실패: ${JSON.stringify(err)}`);
        }

        // terraform 파일 커밋 (단일 파일로 통합)
        const filePath = `${environment}/auto-${timestamp}/terraform.tf`;
        const fileContent = Buffer.from(terraformCode).toString("base64");
        const fileRes = await fetch(`${apiBase}/contents/${filePath}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: `feat(infra): ${description}`,
            content: fileContent,
            branch: branchName,
          }),
        });
        if (!fileRes.ok) {
          const err = await fileRes.json();
          throw new Error(`파일 커밋 실패: ${JSON.stringify(err)}`);
        }

        // PR body 작성
        const prBody = `## 인프라 변경 사항

**환경**: ${environment}
**설명**: ${description}
**브랜치**: \`${branchName}\`
**생성 시각**: ${new Date(timestamp).toISOString()}

## 생성된 리소스

${terraformCode.match(/^resource\s+"[^"]+"\s+"[^"]+"/gm)?.map(r => `- \`${r}\``).join("\n") || "- Terraform 코드 참고"}

## Terraform Plan 실행 방법

\`\`\`bash
# 1. 브랜치 체크아웃
git checkout ${branchName}

# 2. 환경 디렉토리 이동
cd ${environment}/auto-${timestamp}/

# 3. 초기화
terraform init

# 4. 플랜 확인 (반드시 staging 먼저)
terraform plan -var-file="${environment}.tfvars"

# 5. 적용
terraform apply -var-file="${environment}.tfvars"
\`\`\`

## 주의사항

- [ ] staging 환경에서 먼저 \`terraform plan\` 결과 확인
- [ ] 보안 그룹 인바운드 규칙 최소 권한 확인
- [ ] IAM 정책 최소 권한 원칙 확인
- [ ] production 적용 전 반드시 팀장 승인 필요
- [ ] \`terraform destroy\` 필요 시 별도 승인 프로세스 준수

---
*자동 생성된 PR — infra-mcp 에이전트*`;

        // PR 생성
        const prRes = await fetch(`${apiBase}/pulls`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: prTitle,
            body: prBody,
            head: branchName,
            base: "main",
          }),
        });
        if (!prRes.ok) {
          const err = await prRes.json();
          throw new Error(`PR 생성 실패: ${JSON.stringify(err)}`);
        }
        const prData = await prRes.json();

        return {
          content: [{
            type: "text",
            text: `PR 생성 완료!\n\n- PR URL: ${prData.html_url}\n- PR 번호: #${prData.number}\n- 브랜치: ${branchName}\n- 제목: ${prTitle}`
          }]
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `GitHub PR 생성 중 오류 발생:\n${err.message}`
          }]
        };
      }
    }
  );

  // 툴 3: 인프라 컨텍스트 저장
  server.tool(
    "save_infra_context",
    "인프라 결과(EC2 IP, SG ID 등)를 메모리에 저장합니다",
    {
      key: z.string().describe("저장할 키 (예: 'staging-ec2-ip', 'prod-sg-id')"),
      value: z.string().describe("저장할 값 (예: '10.0.1.100', 'sg-0abc123def456')"),
    },
    async ({ key, value }) => {
      infraContextStore.set(key, { value, savedAt: new Date().toISOString() });
      return {
        content: [{
          type: "text",
          text: `컨텍스트 저장 완료\n- 키: ${key}\n- 값: ${value}\n- 저장 시각: ${infraContextStore.get(key).savedAt}\n\n현재 저장된 키 목록: ${[...infraContextStore.keys()].join(", ") || "(없음)"}`
        }]
      };
    }
  );

  // 툴 4: 인프라 컨텍스트 조회
  server.tool(
    "get_infra_context",
    "저장된 인프라 컨텍스트를 조회합니다",
    {
      key: z.string().describe("조회할 키 (예: 'staging-ec2-ip'). '*' 입력 시 전체 목록 반환"),
    },
    async ({ key }) => {
      if (key === "*") {
        if (infraContextStore.size === 0) {
          return { content: [{ type: "text", text: "저장된 컨텍스트가 없습니다." }] };
        }
        const all = [...infraContextStore.entries()]
          .map(([k, v]) => `- ${k}: ${v.value} (저장: ${v.savedAt})`)
          .join("\n");
        return { content: [{ type: "text", text: `전체 인프라 컨텍스트 목록:\n${all}` }] };
      }

      const entry = infraContextStore.get(key);
      if (!entry) {
        return {
          content: [{
            type: "text",
            text: `컨텍스트 없음: '${key}' 키에 저장된 값이 없습니다.\n\n현재 저장된 키 목록: ${[...infraContextStore.keys()].join(", ") || "(없음)"}`
          }]
        };
      }
      return {
        content: [{
          type: "text",
          text: `컨텍스트 조회 결과\n- 키: ${key}\n- 값: ${entry.value}\n- 저장 시각: ${entry.savedAt}`
        }]
      };
    }
  );

  return server;
}

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  await server.close();
});

app.get("/health", (_, res) => res.json({ status: "ok", server: "infra-mcp" }));

app.listen(5004, () => process.stdout.write("infra-mcp MCP server running on :5004" + "\n");
