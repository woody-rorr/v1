/**
 * MCP 오케스트레이터 HTTP 서버 (LLM 라우팅 + 검증 질문 기능)
 *
 * 흐름:
 *   1. POST /orchestrate { feature, environment? } 수신
 *   2. Anthropic API로 요청 분석 → 라우팅 결정
 *   3a. isAmbiguous=true → HTTP 200 + 검증 질문 반환 (즉시 종료)
 *   3b. needsInfra only → infra-mcp: generate_terraform (+ create_infra_pr)
 *   3c. needsBackend only → db-schema → business-logic ∥ api-endpoints
 *   3d. 둘 다 필요 → infra 먼저, 완료 후 backend 순차 실행
 *   4. 결과 종합 → JSON 응답
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ── 환경변수 ──────────────────────────────────────────────────────────────────
const DB_SCHEMA_URL      = process.env.DB_SCHEMA_URL      ?? "http://localhost:5001";
const BUSINESS_LOGIC_URL = process.env.BUSINESS_LOGIC_URL ?? "http://localhost:5002";
const API_ENDPOINTS_URL  = process.env.API_ENDPOINTS_URL  ?? "http://localhost:5003";
const INFRA_MCP_URL      = process.env.INFRA_MCP_URL      ?? "http://localhost:5004";
const PORT               = Number(process.env.PORT ?? 5000);

const GITHUB_TOKEN       = process.env.GITHUB_TOKEN ?? "";
const GITHUB_OWNER       = process.env.GITHUB_OWNER ?? "";
const GITHUB_BACKEND_REPO = process.env.GITHUB_BACKEND_REPO ?? "";

// ── Bedrock 클라이언트 ────────────────────────────────────────────────────────
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
const SONNET_MODEL = "us.anthropic.claude-sonnet-4-6";

// ── 라우팅 분석 시스템 프롬프트 ──────────────────────────────────────────────
const ROUTER_SYSTEM_PROMPT = `당신은 개발 요청을 분류하는 라우터입니다.
사용자 요청을 분석하여 어떤 MCP 에이전트가 필요한지 JSON으로 반환하세요.

분류 기준:
- needsInfra: EC2, ECS, RDS, S3, VPC, 서버 생성, 인프라, terraform 관련
- needsBackend: DB 스키마, API, 서비스 로직, NestJS, TypeORM 관련
- needsFrontend: React, UI, 화면, 컴포넌트 관련
- isAmbiguous: 요청이 너무 모호해서 구체화가 필요한 경우

반드시 JSON만 반환하세요. 마크다운 없이.`;

// ── MCP 클라이언트 헬퍼 ───────────────────────────────────────────────────────

/**
 * MCP 서버에 연결 → 지정 툴 호출 → 연결 종료 후 결과 반환
 *
 * @param {string} serverUrl  - MCP 서버 base URL (예: http://localhost:5001)
 * @param {string} toolName   - 호출할 툴 이름
 * @param {Record<string, unknown>} args - 툴 arguments
 * @returns {Promise<unknown>} 툴 결과 (content 배열 또는 파싱된 값)
 */
async function callMcpTool(serverUrl, toolName, args) {
  const client = new Client({ name: "orchestrator", version: "1.0.0" });

  try {
    const transport = new StreamableHTTPClientTransport(
      new URL(`${serverUrl}/mcp`)
    );
    await client.connect(transport);

    const result = await client.callTool({ name: toolName, arguments: args });

    // content 배열에서 텍스트 추출 (MCP 표준 응답 구조)
    if (Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text);

      // JSON 파싱 시도 — 실패하면 원본 문자열 반환
      if (textParts.length === 1) {
        try {
          return JSON.parse(textParts[0]);
        } catch {
          return textParts[0];
        }
      }
      return textParts;
    }

    return result;
  } finally {
    // 성공/실패 관계없이 반드시 연결 종료
    await client.close();
  }
}

// ── LLM 라우팅 분석 ───────────────────────────────────────────────────────────

/**
 * Anthropic API를 통해 feature 요청을 분석하고 라우팅 결정을 반환한다.
 *
 * @param {string} feature - 사용자가 요청한 기능 설명
 * @returns {Promise<{
 *   needsInfra: boolean,
 *   needsBackend: boolean,
 *   needsFrontend: boolean,
 *   isAmbiguous: boolean,
 *   clarificationQuestions: string[],
 *   summary: string
 * }>}
 */
async function analyzeRouting(feature) {
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    system: ROUTER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: feature }],
  };
  const command = new InvokeModelCommand({
    modelId: SONNET_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });
  const response = await bedrock.send(command);
  const parsed = JSON.parse(new TextDecoder().decode(response.body));

  const textBlock = parsed.content.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("LLM 라우팅 분석: 텍스트 응답이 없습니다.");
  }

  try {
    // 마크다운 코드 블록 제거 후 파싱
    const cleaned = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 라우팅 분석: JSON 파싱 실패 — ${textBlock.text}`);
  }
}

// ── 오케스트레이션 핵심 로직 ──────────────────────────────────────────────────

/**
 * infra-mcp만 사용하는 오케스트레이션
 *
 * @param {string} feature
 * @param {string|undefined} environment
 * @returns {Promise<object>}
 */
async function orchestrateInfra(feature, environment) {
  let terraform;
  try {
    terraform = await callMcpTool(INFRA_MCP_URL, "generate_terraform", {
      feature,
      ...(environment ? { environment } : {}),
    });
  } catch (err) {
    throw new OrchestrateError("infra-mcp (generate_terraform)", err);
  }

  let pr = null;
  if (process.env.GITHUB_TOKEN) {
    try {
      pr = await callMcpTool(INFRA_MCP_URL, "create_infra_pr", {
        feature,
        terraform,
        ...(environment ? { environment } : {}),
      });
    } catch (err) {
      // PR 생성 실패는 치명적 오류가 아님 — 경고만 기록
      console.warn(`[orchestrate] infra PR 생성 실패 (무시): ${err?.message}`);
    }
  }

  return { terraform, pr };
}

/**
 * backend MCP 3개를 사용하는 오케스트레이션
 *
 * @param {string} feature
 * @param {object} [infraContext] - infra 결과를 backend 컨텍스트로 활용
 * @returns {Promise<object>}
 */
async function orchestrateBackend(feature, infraContext) {
  // Step 1: db-schema (순차 — 이후 단계의 컨텍스트가 됨)
  let schema;
  try {
    schema = await callMcpTool(DB_SCHEMA_URL, "design_schema", {
      feature,
      ...(infraContext ? { infraContext } : {}),
    });
  } catch (err) {
    throw new OrchestrateError("db-schema", err);
  }

  // Step 2: business-logic ∥ api-endpoints (병렬)
  const [businessLogicResult, apiEndpointsResult] = await Promise.allSettled([
    callMcpTool(BUSINESS_LOGIC_URL, "design_service_layer", { schema, feature }),
    callMcpTool(API_ENDPOINTS_URL, "design_endpoints", { schema, feature }),
  ]);

  if (businessLogicResult.status === "rejected") {
    throw new OrchestrateError("business-logic", businessLogicResult.reason);
  }
  if (apiEndpointsResult.status === "rejected") {
    throw new OrchestrateError("api-endpoints", apiEndpointsResult.reason);
  }

  const backendResult = {
    schema,
    serviceLayer: businessLogicResult.value,
    endpoints: apiEndpointsResult.value,
  };

  // backend PR 자동 생성
  let pr = null;
  try {
    pr = await createBackendPr(feature, backendResult);
  } catch (err) {
    console.warn(`[orchestrate] backend PR 생성 실패 (무시): ${err?.message}`);
  }

  return { ...backendResult, pr };
}

/**
 * 라우팅 결정에 따라 적절한 MCP 에이전트를 실행한다.
 *
 * @param {string} feature
 * @param {string|undefined} environment
 * @param {{ needsInfra: boolean, needsBackend: boolean }} routing
 * @returns {Promise<object>}
 */
async function orchestrate(feature, environment, routing) {
  const { needsInfra, needsBackend } = routing;

  if (needsInfra && !needsBackend) {
    // infra만 필요
    const infraResult = await orchestrateInfra(feature, environment);
    return { infra: infraResult };
  }

  if (!needsInfra && needsBackend) {
    // backend만 필요
    const backendResult = await orchestrateBackend(feature, null);
    return { backend: backendResult };
  }

  if (needsInfra && needsBackend) {
    // 둘 다 필요: infra 먼저 → backend (infra 컨텍스트 활용)
    const infraResult = await orchestrateInfra(feature, environment);
    const backendResult = await orchestrateBackend(feature, infraResult);
    return { infra: infraResult, backend: backendResult };
  }

  // 둘 다 false인 경우(frontend 등) — backend 로직으로 폴백
  console.warn(`[orchestrate] needsInfra/needsBackend 모두 false — backend 로직으로 폴백`);
  const backendResult = await orchestrateBackend(feature, null);
  return { backend: backendResult };
}

// ── Backend PR 생성 ──────────────────────────────────────────────────────────

/**
 * backend MCP 결과물(schema, serviceLayer, endpoints)로 NestJS 파일을 생성하고
 * GitHub PR을 만든다. GITHUB_TOKEN/OWNER/BACKEND_REPO 없으면 skip.
 */
async function createBackendPr(feature, { schema, serviceLayer, endpoints }) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_BACKEND_REPO) {
    console.warn("[backend-pr] GITHUB 환경변수 미설정 — PR 생성 skip");
    return null;
  }

  const branch = `backend/auto-${Date.now()}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const apiBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_BACKEND_REPO}`;

  // 1. 기본 브랜치 SHA 조회
  const refRes = await fetch(`${apiBase}/git/ref/heads/main`, { headers });
  if (!refRes.ok) throw new Error(`기본 브랜치 조회 실패: ${refRes.status}`);
  const { object: { sha: baseSha } } = await refRes.json();

  // 2. 새 브랜치 생성
  const branchRes = await fetch(`${apiBase}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!branchRes.ok) throw new Error(`브랜치 생성 실패: ${branchRes.status}`);

  // 3. 파일 3개 커밋 (schema / service / controller)
  const featureSlug = feature.slice(0, 30).replace(/\s+/g, "-").toLowerCase();
  const files = [
    {
      path: `src/${featureSlug}/schema.md`,
      content: `# DB Schema\n\n${schema}`,
    },
    {
      path: `src/${featureSlug}/service.md`,
      content: `# Service Layer\n\n${serviceLayer}`,
    },
    {
      path: `src/${featureSlug}/endpoints.md`,
      content: `# API Endpoints\n\n${endpoints}`,
    },
  ];

  for (const file of files) {
    await fetch(`${apiBase}/contents/${file.path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `feat: ${featureSlug} 자동 생성`,
        content: Buffer.from(file.content).toString("base64"),
        branch,
      }),
    });
  }

  // 4. PR 생성
  const prBody = `## 자동 생성된 백엔드 설계\n\n**요청:** ${feature}\n\n### 포함 파일\n- DB 스키마 설계\n- 서비스 레이어 설계\n- API 엔드포인트 설계\n\n> 오케스트레이터 자동 생성`;
  const prRes = await fetch(`${apiBase}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `[백엔드] ${feature.slice(0, 60)}`,
      body: prBody,
      head: branch,
      base: "main",
    }),
  });

  if (!prRes.ok) throw new Error(`PR 생성 실패: ${prRes.status}`);
  const pr = await prRes.json();
  process.stdout.write(`[backend-pr] PR 생성 완료: ${pr.html_url}` + "\n");
  return { url: pr.html_url, branch, number: pr.number };
}

// ── 커스텀 에러 ──────────────────────────────────────────────────────────────

class OrchestrateError extends Error {
  /** @param {string} server - 실패한 MCP 서버 이름 */
  constructor(server, cause) {
    super(`MCP 서버 호출 실패: ${server} — ${cause?.message ?? cause}`);
    this.server = server;
    this.cause = cause;
  }
}

// ── Express 앱 ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/**
 * POST /orchestrate
 * Body: { feature: string, environment?: string }
 *
 * Response (성공):
 *   { success: true, routing: {...}, elapsed_ms: number, result: {...} }
 *
 * Response (검증 질문 필요):
 *   { status: "needs_clarification", questions: string[], summary: string }
 *
 * Response (오류):
 *   { success: false, error: string, failed_server?: string, elapsed_ms: number }
 */
app.post("/orchestrate", async (req, res) => {
  const { feature, environment } = req.body ?? {};

  if (!feature || typeof feature !== "string" || feature.trim() === "") {
    return res.status(400).json({
      success: false,
      error: "feature 필드가 필요합니다 (비어있지 않은 문자열).",
    });
  }

  const featureTrimmed = feature.trim();
  process.stdout.write(`[orchestrate] 시작 — feature: "${featureTrimmed}"` + "\n");
  const startedAt = Date.now();

  // ── Step 1: LLM 라우팅 분석 ────────────────────────────────────────────────
  let routing;
  try {
    routing = await analyzeRouting(featureTrimmed);
    process.stdout.write(`[orchestrate] 라우팅 결과: ${JSON.stringify(routing)}\n`);
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(`[orchestrate] 라우팅 분석 실패 — ${err.message}`);
    return res.status(500).json({
      success: false,
      error: `라우팅 분석 실패: ${err.message}`,
      elapsed_ms: elapsed,
    });
  }

  // ── Step 2: 애매한 요청 처리 ──────────────────────────────────────────────
  if (routing.isAmbiguous) {
    process.stdout.write(`[orchestrate] 애매한 요청 — 검증 질문 반환` + "\n");
    return res.status(200).json({
      status: "needs_clarification",
      questions: routing.clarificationQuestions ?? [],
      summary: routing.summary ?? "",
    });
  }

  // ── Step 3: 라우팅별 실행 ─────────────────────────────────────────────────
  try {
    const result = await orchestrate(featureTrimmed, environment, routing);
    const elapsed = Date.now() - startedAt;
    process.stdout.write(`[orchestrate] 완료 — ${elapsed}ms` + "\n");

    return res.status(200).json({
      success: true,
      routing: {
        needsInfra:    routing.needsInfra    ?? false,
        needsBackend:  routing.needsBackend  ?? false,
        needsFrontend: routing.needsFrontend ?? false,
        summary:       routing.summary       ?? "",
      },
      elapsed_ms: elapsed,
      result,
    });
  } catch (err) {
    const elapsed = Date.now() - startedAt;

    if (err instanceof OrchestrateError) {
      console.error(`[orchestrate] 실패 (${err.server}) — ${err.message} (${elapsed}ms)`);
      return res.status(502).json({
        success: false,
        error: err.message,
        failed_server: err.server,
        elapsed_ms: elapsed,
      });
    }

    console.error(`[orchestrate] 예상치 못한 에러 — ${err.message}`);
    return res.status(500).json({
      success: false,
      error: `내부 서버 오류: ${err.message}`,
      elapsed_ms: elapsed,
    });
  }
});

/**
 * GET /health
 * ECS 헬스체크용 — 항상 200 반환
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "orchestrator",
    uptime_s: Math.floor(process.uptime()),
    mcp_servers: {
      db_schema:      DB_SCHEMA_URL,
      business_logic: BUSINESS_LOGIC_URL,
      api_endpoints:  API_ENDPOINTS_URL,
      infra_mcp:      INFRA_MCP_URL,
    },
  });
});

// ── 서버 시작 ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  process.stdout.write(`오케스트레이터 서버 시작 — http://0.0.0.0:${PORT}` + "\n");
  process.stdout.write(`  db-schema     : ${DB_SCHEMA_URL}` + "\n");
  process.stdout.write(`  business-logic: ${BUSINESS_LOGIC_URL}` + "\n");
  process.stdout.write(`  api-endpoints : ${API_ENDPOINTS_URL}` + "\n");
  process.stdout.write(`  infra-mcp     : ${INFRA_MCP_URL}` + "\n");
});
