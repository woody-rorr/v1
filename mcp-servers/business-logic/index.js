import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import pg from "pg";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { runCodingAgent, parseSummary } from "./agent.js";

const execAsync = promisify(exec);

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.RDS_URL });
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

const SYSTEM_PROMPT = `당신은 NestJS 백엔드 비즈니스 로직 전문 설계 에이전트입니다.
DB 스키마를 받아 NestJS 서비스 레이어, class-validator 검증 규칙, 트랜잭션 경계, 에러 케이스를 설계합니다.
- TypeScript strict mode 준수
- class-validator 데코레이터 활용
- HttpException 기반 커스텀 예외 사용
- 서비스 인터페이스 기반 설계 (테스트 용이성)
- 트랜잭션 경계 명확히 정의
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

function parseRepoUrl(url) {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) throw new Error(`Cannot parse GitHub repo URL: ${url}`);
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

function slugify(text) {
  const slug = text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return slug || Math.random().toString(36).slice(2, 8);
}

function extractTitle(summary) {
  for (const line of summary.split("\n").map(l => l.trim()).filter(Boolean)) {
    const clean = line.replace(/^[#*\->]+\s*/, "").replace(/\*\*/g, "").replace(/`/g, "");
    if (clean.length > 5) return clean.slice(0, 72);
  }
  return summary.slice(0, 72);
}

async function hasChanges(workDir) {
  const { stdout } = await execAsync("git status --porcelain", { cwd: workDir });
  return stdout.trim().length > 0;
}

function createServer(userId, sessionId) {
  const server = new McpServer({ name: "business-logic", version: "1.0.0" });

  server.tool(
    "implement_and_pr",
    "프롬프트를 받아 GitHub 저장소 코드를 자동으로 수정하고 PR을 생성합니다",
    { prompt: z.string().describe("구현할 기능 또는 수정 사항 설명") },
    async ({ prompt }, extra) => {
      const sendLog = async (msg) => {
        process.stderr.write(`[business-logic] ${msg}\n`);
        try { await extra.sendNotification({ method: "notifications/message", params: { level: "info", logger: "business-logic", data: msg } }); } catch {}
      };

      const repo_url = process.env.GITHUB_REPO_URL;
      const base_branch = process.env.BASE_BRANCH || "main";
      const token = process.env.GITHUB_TOKEN;
      if (!token) return { content: [{ type: "text", text: "Error: GITHUB_TOKEN이 설정되지 않았습니다." }] };
      if (!repo_url) return { content: [{ type: "text", text: "Error: GITHUB_REPO_URL이 설정되지 않았습니다." }] };

      const { owner, repo } = parseRepoUrl(repo_url);
      const authedUrl = `https://${token}@github.com/${owner}/${repo}.git`;
      const datePart = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "").slice(0, 12);
      const branchName = `agent/bl/${datePart}-${slugify(prompt)}`;
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "business-logic-agent-"));
      const start = Date.now();

      try {
        await sendLog(`📦 저장소 클론 중... (${owner}/${repo}@${base_branch})`);
        await execAsync(`git clone --depth=1 --branch ${base_branch} ${authedUrl} .`, { cwd: tmpDir });
        await execAsync('git config user.email "agent@rorr.club"', { cwd: tmpDir });
        await execAsync('git config user.name "business-logic-agent"', { cwd: tmpDir });
        await execAsync(`git checkout -b ${branchName}`, { cwd: tmpDir });

        await sendLog(`🤖 Claude 에이전트 실행 중...`);
        const raw = await runCodingAgent(prompt, tmpDir, sendLog);
        const { title: agentTitle, summary } = parseSummary(raw);

        if (!(await hasChanges(tmpDir))) {
          await saveLog({ sessionId, userId, tool: "implement_and_pr", input: { prompt }, result: summary, success: true, durationMs: Date.now() - start });
          return { content: [{ type: "text", text: `변경된 파일이 없습니다.\n\n${summary}` }] };
        }

        await execAsync("git add -A", { cwd: tmpDir });
        await execAsync(`git commit -m "feat: ${prompt.slice(0, 60).replace(/"/g, "'")}\n\nGenerated by business-logic-agent"`, { cwd: tmpDir });
        await execAsync(`git push origin ${branchName}`, { cwd: tmpDir });

        const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" },
          body: JSON.stringify({ title: agentTitle || extractTitle(summary), body: `## Summary\n\n${summary}\n\n---\n*🤖 Generated by business-logic-agent*`, head: branchName, base: base_branch }),
        });
        const pr = await prRes.json();
        if (!prRes.ok) throw new Error(`GitHub API error: ${JSON.stringify(pr)}`);

        await sendLog(`🎉 PR 생성 완료! ${pr.html_url}`);
        await saveLog({ sessionId, userId, tool: "implement_and_pr", input: { prompt }, result: pr.html_url, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: `✅ PR 생성 완료!\n\nURL: ${pr.html_url}\n브랜치: ${branchName}\n\n## 변경 내용\n${summary}` }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "implement_and_pr", input: { prompt }, result: e.message, success: false, durationMs: Date.now() - start });
        throw e;
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    }
  );

  server.tool(
    "design_service_layer",
    "DB 스키마 기반으로 NestJS 서비스 레이어를 설계합니다",
    {
      schema: z.string().describe("db-schema 에이전트 결과"),
      feature: z.string().describe("구현할 기능 설명"),
    },
    async ({ schema, feature }) => {
      const start = Date.now();
      try {
        const result = await callClaude(
          SYSTEM_PROMPT,
          `기능: ${feature}\n\nDB 스키마:\n${schema}\n\nNestJS 서비스 함수 목록, 인터페이스, 주요 비즈니스 규칙, 에러 케이스를 설계해주세요.`,
          8000
        );
        await saveLog({ sessionId, userId, tool: "design_service_layer", input: { feature }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "design_service_layer", input: { feature }, result: e.message, success: false, durationMs: Date.now() - start });
        throw e;
      }
    }
  );

  server.tool(
    "validate_rules",
    "비즈니스 규칙과 class-validator 검증 로직을 정의합니다",
    {
      service: z.string().describe("검증 대상 서비스/함수명"),
      rules: z.string().describe("적용할 비즈니스 규칙 설명"),
    },
    async ({ service, rules }) => {
      const start = Date.now();
      try {
        const result = await callClaude(
          SYSTEM_PROMPT,
          `서비스: ${service}\n\n비즈니스 규칙:\n${rules}\n\nclass-validator DTO, 커스텀 검증 데코레이터, 에러 응답 케이스를 작성해주세요.`,
          6000
        );
        await saveLog({ sessionId, userId, tool: "validate_rules", input: { service }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "validate_rules", input: { service }, result: e.message, success: false, durationMs: Date.now() - start });
        throw e;
      }
    }
  );

  server.tool(
    "check_transaction",
    "트랜잭션 처리가 필요한 구간을 분석하고 경계를 정의합니다",
    { flow: z.string().describe("처리 흐름 설명") },
    async ({ flow }) => {
      const start = Date.now();
      try {
        const result = await callClaude(
          SYSTEM_PROMPT,
          `처리 흐름:\n${flow}\n\nTypeORM 트랜잭션 경계(@Transaction, QueryRunner), 롤백 조건, 보상 트랜잭션이 필요한 케이스를 분석해주세요.`,
          6000
        );
        await saveLog({ sessionId, userId, tool: "check_transaction", input: { flow }, result, success: true, durationMs: Date.now() - start });
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        await saveLog({ sessionId, userId, tool: "check_transaction", input: { flow }, result: e.message, success: false, durationMs: Date.now() - start });
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

app.get("/health", (_, res) => res.json({ status: "ok", server: "business-logic" }));

app.listen(5002, () => process.stdout.write("business-logic MCP server running on :5002\n"));
