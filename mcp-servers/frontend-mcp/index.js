import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const HAIKU_MODEL = "anthropic.claude-haiku-4-5-20251001-v1:0";

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

const FRONTEND_SYSTEM_PROMPT = `당신은 React + TypeScript 프론트엔드 전문 설계 에이전트입니다.
API 엔드포인트 스펙을 받아 React 컴포넌트 구조, 상태 관리, API 연동 코드를 설계합니다.
- TypeScript strict mode 준수
- React Query(TanStack Query)로 서버 상태 관리
- Axios 인터셉터로 JWT 토큰 자동 첨부
- 컴포넌트는 기능 단위로 분리 (pages / components / hooks / api)
- 응답은 한국어로 작성`;

const app = express();
app.use(express.json());

function createServer() {
  const server = new McpServer({ name: "frontend-mcp", version: "1.0.0" });

  server.tool(
    "design_components",
    "API 스펙 기반으로 React 컴포넌트 구조와 페이지 레이아웃을 설계합니다",
    {
      endpoints: z.string().describe("api-endpoints 에이전트 결과"),
      feature: z.string().describe("구현할 기능 설명"),
    },
    async ({ endpoints, feature }) => {
      const result = await callClaude(
        FRONTEND_SYSTEM_PROMPT,
        `기능: ${feature}\n\nAPI 엔드포인트:\n${endpoints}\n\nReact 컴포넌트 구조(pages/components/hooks/api 폴더 기준), 각 컴포넌트 역할, 상태 관리 방식을 설계해주세요.`,
        8000
      );
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "generate_api_client",
    "API 엔드포인트에 맞는 React Query hooks와 Axios API 클라이언트 코드를 생성합니다",
    {
      endpoints: z.string().describe("엔드포인트 목록"),
      feature: z.string().describe("기능 설명"),
    },
    async ({ endpoints, feature }) => {
      const result = await callClaude(
        FRONTEND_SYSTEM_PROMPT,
        `기능: ${feature}\n\nAPI 엔드포인트:\n${endpoints}\n\nAxios API 함수(api/ 폴더)와 React Query hooks(hooks/ 폴더) 코드를 TypeScript로 작성해주세요. JWT 인터셉터 포함.`,
        8000
      );
      return { content: [{ type: "text", text: result }] };
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

app.get("/health", (_, res) => res.json({ status: "ok", server: "frontend-mcp" }));

app.listen(5005, () => process.stdout.write("frontend-mcp MCP server running on :5005" + "\n");
