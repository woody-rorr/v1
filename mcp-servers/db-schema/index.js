import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.RDS_URL });

// mcp_logs 테이블 초기화
await pool.query(`
  CREATE TABLE IF NOT EXISTS mcp_logs (
    id          SERIAL PRIMARY KEY,
    session_id  VARCHAR,
    user_id     VARCHAR,
    tool        VARCHAR NOT NULL,
    input       JSONB,
    result      TEXT,
    success     BOOLEAN,
    duration_ms INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )
`);

const app = express();
app.use(express.json());

async function saveLog({ sessionId, userId, tool, input, result, success, durationMs }) {
  await pool.query(
    `INSERT INTO mcp_logs (session_id, user_id, tool, input, result, success, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, userId, tool, JSON.stringify(input), result, success, durationMs]
  );
}

function createServer(userId, sessionId) {
  const server = new McpServer({ name: "db-schema", version: "1.0.0" });

  server.tool(
    "design_schema",
    "기능 요구사항을 받아 DB 테이블 구조를 설계합니다",
    { feature: z.string().describe("설계할 기능 설명") },
    async ({ feature }) => {
      const start = Date.now();
      try {
        const res = await pool.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name
        `);
        const tables = res.rows.map(r => r.table_name).join(", ") || "테이블 없음";
        const result = `기능: "${feature}"\n현재 테이블 목록: ${tables}`;
        await saveLog({ sessionId, userId, tool: "design_schema", input: { feature }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "design_schema", input: { feature }, result: e.message, success: false, durationMs: Date.now() - start });
        throw e;
      }
    }
  );

  server.tool(
    "generate_ddl",
    "테이블 설계를 기반으로 CREATE TABLE SQL을 생성합니다",
    { tables: z.string().describe("테이블명과 컬럼 정보") },
    async ({ tables }) => {
      const start = Date.now();
      const result = `DDL 생성 대상:\n${tables}`;
      await saveLog({ sessionId, userId, tool: "generate_ddl", input: { tables }, result, success: true, durationMs: Date.now() - start });
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "describe_table",
    "특정 테이블의 컬럼, 인덱스, 관계를 조회합니다",
    { table_name: z.string().describe("조회할 테이블명") },
    async ({ table_name }) => {
      const start = Date.now();
      try {
        const res = await pool.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table_name]);

        let result;
        if (res.rows.length === 0) {
          result = `테이블 "${table_name}" 을 찾을 수 없습니다.`;
        } else {
          const cols = res.rows.map(r =>
            `  ${r.column_name} ${r.data_type} ${r.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}${r.column_default ? ` DEFAULT ${r.column_default}` : ''}`
          ).join("\n");
          result = `테이블: ${table_name}\n${cols}`;
        }

        await saveLog({ sessionId, userId, tool: "describe_table", input: { table_name }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "describe_table", input: { table_name }, result: e.message, success: false, durationMs: Date.now() - start });
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

app.get("/health", (_, res) => res.json({ status: "ok", server: "db-schema" }));

app.post("/log", async (req, res) => {
  const userId = req.headers["x-user-id"] || "unknown";
  const { prompt_content, mcp_server = "claude-code", status_code = 200 } = req.body;
  try {
    process.stdout.write(JSON.stringify({ event: "prompt", user_id: userId, mcp_server, prompt_content }) + "\n");
    await pool.query(
      `INSERT INTO mcp_logs (user_id, tool, input, success)
       VALUES ($1, $2, $3, $4)`,
      [userId, mcp_server, JSON.stringify({ prompt_content }), status_code < 400]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(5001, () => process.stdout.write("db-schema MCP server running on :5001\n"));
