import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.RDS_URL });
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

const SYSTEM_PROMPT = `당신은 NestJS RESTful API 설계 전문 에이전트입니다.
DB 스키마와 비즈니스 로직을 받아 RESTful 엔드포인트, 요청/응답 스펙, NestJS Controller 구조를 설계합니다.
- RESTful 컨벤션 준수 (HTTP 메서드, 상태 코드)
- Swagger/OpenAPI 데코레이터 포함
- JWT 인증 Guard 적용 여부 명시
- DTO 클래스 구조 포함
- 응답은 한국어로 작성`;

const app = express();
app.use(express.json());

async function saveLog({ sessionId, userId, tool, input, result, success, durationMs }) {
  try {
    await pool.query(
      `INSERT INTO mcp_logs (session_id, user_id, tool, input, result, success, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, userId, tool, JSON.stringify(input), result, success, durationMs]
    );
  } catch (_) {}
}

function createServer(userId, sessionId) {
  const server = new McpServer({ name: "api-endpoints", version: "1.0.0" });

  server.tool(
    "design_endpoints",
    "DB 스키마 기반으로 RESTful 엔드포인트 목록을 설계합니다",
    {
      schema: z.string().describe("db-schema 에이전트 결과"),
      feature: z.string().describe("구현할 기능 설명"),
    },
    async ({ schema, feature }) => {
      const start = Date.now();
      try {
        const result = await callClaude(
          SYSTEM_PROMPT,
          `기능: ${feature}\n\nDB 스키마:\n${schema}\n\nRESTful 엔드포인트 목록(Method, Path, 설명, 인증 여부, 요청/응답 스펙)과 NestJS Controller 구조를 설계해주세요.`,
          8000
        );
        await saveLog({ sessionId, userId, tool: "design_endpoints", input: { feature }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "design_endpoints", input: { feature }, result: e.message, success: false, durationMs: Date.now() - start });
        throw e;
      }
    }
  );

  server.tool(
    "generate_request_response",
    "특정 엔드포인트의 요청/응답 JSON 예시와 DTO 클래스를 생성합니다",
    {
      method: z.string().describe("HTTP 메서드"),
      path: z.string().describe("엔드포인트 경로"),
    },
    async ({ method, path }) => {
      const start = Date.now();
      try {
        const result = await callClaude(
          SYSTEM_PROMPT,
          `엔드포인트: ${method} ${path}\n\n요청 DTO, 응답 DTO, JSON 예시, Swagger 데코레이터, 에러 응답 케이스를 작성해주세요.`,
          6000
        );
        await saveLog({ sessionId, userId, tool: "generate_request_response", input: { method, path }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "generate_request_response", input: { method, path }, result: e.message, success: false, durationMs: Date.now() - start });
        throw e;
      }
    }
  );

  server.tool(
    "check_auth",
    "엔드포인트별 JWT 인증/인가 필요 여부를 분석하고 Guard 코드를 생성합니다",
    { endpoints: z.string().describe("엔드포인트 목록") },
    async ({ endpoints }) => {
      const start = Date.now();
      try {
        const result = await callClaude(
          SYSTEM_PROMPT,
          `엔드포인트 목록:\n${endpoints}\n\n각 엔드포인트의 JWT 인증 필요 여부, 역할(Role) 기반 인가 레벨, NestJS Guard 적용 코드(@UseGuards, @Roles)를 분석해주세요.`,
          6000
        );
        await saveLog({ sessionId, userId, tool: "check_auth", input: { endpoints }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "check_auth", input: { endpoints }, result: e.message, success: false, durationMs: Date.now() - start });
        throw e;
      }
    }
  );

  return server;
}

app.post("/mcp", async (req, res) => {
  const userId = req.headers['x-user-id'] || 'unknown';
  const sessionId = req.headers['x-session-id'] || crypto.randomUUID();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer(userId, sessionId);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  await server.close();
});

app.get("/health", (_, res) => res.json({ status: "ok", server: "api-endpoints" }));

app.listen(5003, () => process.stdout.write("api-endpoints MCP server running on :5003\n"));
