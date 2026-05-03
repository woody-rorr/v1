import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function connectClient(port) {
  const client = new Client({ name: "orchestrator", version: "1.0.0" });
  await client.connect(new SSEClientTransport(new URL(`http://localhost:${port}/sse`)));
  return client;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function run() {
  console.log("=".repeat(55));
  console.log("  오케스트레이션 체이닝 통합 테스트");
  console.log("=".repeat(55));

  // ── 1단계: db-schema ──────────────────────────────────
  console.log("\n[1단계] db-schema.design_schema 호출");
  const dbClient = await connectClient(5001);

  const dbResult = await dbClient.callTool({
    name: "design_schema",
    arguments: { feature: "유저 로그인" },
  });

  const schemaText = dbResult.content[0].text;
  console.log(`  응답: ${schemaText}`);

  assert(dbResult.content.length > 0, "db-schema 응답 존재");
  assert(schemaText.includes("db-schema"), "db-schema 서버가 응답");
  assert(typeof schemaText === "string", "응답이 문자열 타입");

  await dbClient.close();

  // ── 2단계: api-endpoints + business-logic 병렬 ────────
  console.log("\n[2단계] api-endpoints + business-logic 병렬 호출");
  console.log(`  주입 컨텍스트: db-schema 결과 → 두 서버에 전달`);

  const [apiClient, bizClient] = await Promise.all([
    connectClient(5003),
    connectClient(5002),
  ]);

  const [apiResult, bizResult] = await Promise.all([
    apiClient.callTool({
      name: "design_endpoints",
      arguments: { schema: schemaText, feature: "유저 로그인" },
    }),
    bizClient.callTool({
      name: "design_service_layer",
      arguments: { schema: schemaText, feature: "유저 로그인" },
    }),
  ]);

  const apiText = apiResult.content[0].text;
  const bizText = bizResult.content[0].text;

  console.log(`  [api-endpoints] 응답: ${apiText}`);
  console.log(`  [business-logic] 응답: ${bizText}`);

  await Promise.all([apiClient.close(), bizClient.close()]);

  // ── 3단계: 일관성 검증 ────────────────────────────────
  console.log("\n[3단계] 데이터 일관성 검증 (assert)");

  assert(apiResult.content.length > 0, "api-endpoints 응답 존재");
  assert(bizResult.content.length > 0, "business-logic 응답 존재");
  assert(apiText.includes("api-endpoints"), "api-endpoints 서버가 응답");
  assert(bizText.includes("business-logic"), "business-logic 서버가 응답");

  // db-schema 결과가 하위 서버로 전달됐는지 확인
  assert(apiText.includes(schemaText.slice(0, 20)), "api-endpoints가 db-schema 결과를 수신");
  assert(bizText.includes(schemaText.slice(0, 20)), "business-logic이 db-schema 결과를 수신");

  // ── 최종 요약 ─────────────────────────────────────────
  console.log("\n" + "=".repeat(55));
  if (process.exitCode === 1) {
    console.log("  결과: 일부 테스트 실패 ❌");
  } else {
    console.log("  결과: 전체 체이닝 통합 테스트 통과 ✅");
    console.log("  흐름: db-schema → (api-endpoints ∥ business-logic)");
    console.log("  검증: 응답 존재 + 서버 식별 + 컨텍스트 전달");
  }
  console.log("=".repeat(55));
}

run().catch(console.error);
