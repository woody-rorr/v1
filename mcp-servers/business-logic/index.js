import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

const app = express();
app.use(express.json());

function createServer() {
  const server = new McpServer({ name: "business-logic", version: "1.0.0" });

  server.tool(
    "design_service_layer",
    "DB 스키마 기반으로 서비스 레이어 함수 목록을 설계합니다",
    {
      schema: z.string().describe("db-schema 에이전트 결과"),
      feature: z.string().describe("구현할 기능 설명"),
    },
    async ({ schema, feature }) => ({
      content: [{ type: "text", text: `[business-logic] "${feature}" 서비스 레이어 설계\n스키마: ${schema}\n실제 서비스 연결 시 서비스 함수 목록과 의사코드를 반환합니다.` }],
    })
  );

  server.tool(
    "validate_rules",
    "비즈니스 규칙과 입력값 검증 로직을 정의합니다",
    {
      service: z.string().describe("검증 대상 서비스/함수명"),
      rules: z.string().describe("적용할 비즈니스 규칙 설명"),
    },
    async ({ service, rules }) => ({
      content: [{ type: "text", text: `[business-logic] ${service} 검증 규칙:\n${rules}\n실제 서비스 연결 시 검증 코드와 에러 케이스를 반환합니다.` }],
    })
  );

  server.tool(
    "check_transaction",
    "트랜잭션 처리가 필요한 구간을 분석합니다",
    { flow: z.string().describe("처리 흐름 설명") },
    async ({ flow }) => ({
      content: [{ type: "text", text: `[business-logic] 트랜잭션 분석:\n${flow}\n실제 서비스 연결 시 트랜잭션 경계와 롤백 조건을 반환합니다.` }],
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

app.get("/health", (_, res) => res.json({ status: "ok", server: "business-logic" }));

app.listen(5002, () => process.stdout.write("business-logic MCP server running on :5002\n"));
