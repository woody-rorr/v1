import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

const app = express();
app.use(express.json());

function createServer() {
  const server = new McpServer({ name: "api-endpoints", version: "1.0.0" });

  server.tool(
    "design_endpoints",
    "DB 스키마 기반으로 RESTful 엔드포인트 목록을 설계합니다",
    {
      schema: z.string().describe("db-schema 에이전트 결과"),
      feature: z.string().describe("구현할 기능 설명"),
    },
    async ({ schema, feature }) => ({
      content: [{ type: "text", text: `[api-endpoints] "${feature}" 엔드포인트 설계\n스키마: ${schema}\n실제 서비스 연결 시 Method/Path/설명 테이블을 반환합니다.` }],
    })
  );

  server.tool(
    "generate_request_response",
    "특정 엔드포인트의 요청/응답 JSON 예시를 생성합니다",
    {
      method: z.string().describe("HTTP 메서드"),
      path: z.string().describe("엔드포인트 경로"),
    },
    async ({ method, path }) => ({
      content: [{ type: "text", text: `[api-endpoints] ${method} ${path}\n실제 서비스 연결 시 요청/응답 JSON 예시를 반환합니다.` }],
    })
  );

  server.tool(
    "check_auth",
    "엔드포인트별 인증/인가 필요 여부를 분석합니다",
    { endpoints: z.string().describe("엔드포인트 목록") },
    async ({ endpoints }) => ({
      content: [{ type: "text", text: `[api-endpoints] 인증 분석:\n${endpoints}\n실제 서비스 연결 시 인증 레벨과 권한 목록을 반환합니다.` }],
    })
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

app.get("/health", (_, res) => res.json({ status: "ok", server: "api-endpoints" }));

app.listen(5003, () => process.stdout.write("api-endpoints MCP server running on :5003\n"));
