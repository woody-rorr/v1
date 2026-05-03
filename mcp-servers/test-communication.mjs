import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function testServer(name, port) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🔌 연결 중: ${name} (localhost:${port})`);
  console.log("=".repeat(50));

  const transport = new SSEClientTransport(
    new URL(`http://localhost:${port}/sse`)
  );
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await client.connect(transport);
  console.log(`✅ 연결 성공`);

  // 툴 목록 조회
  const { tools } = await client.listTools();
  console.log(`\n📋 사용 가능한 툴 (${tools.length}개):`);
  tools.forEach((t) => console.log(`  - ${t.name}: ${t.description}`));

  await client.close();
  return tools;
}

async function runChain() {
  console.log("🚀 MCP 서버 체이닝 테스트 시작\n");

  // 1단계: db-schema 툴 목록 확인
  const dbTools = await testServer("db-schema", 5001);

  // 2단계: api-endpoints 툴 목록 확인
  const apiTools = await testServer("api-endpoints", 5003);

  // 3단계: business-logic 툴 목록 확인
  const bizTools = await testServer("business-logic", 5002);

  // 실제 툴 호출 테스트 (db-schema → design_schema)
  console.log(`\n${"=".repeat(50)}`);
  console.log("🔧 실제 툴 호출 테스트: db-schema.design_schema");
  console.log("=".repeat(50));

  const transport = new SSEClientTransport(
    new URL("http://localhost:5001/sse")
  );
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "design_schema",
    arguments: { feature: "유저 로그인" },
  });
  console.log("📤 요청: feature = '유저 로그인'");
  console.log("📥 응답:", result.content[0].text);

  await client.close();

  console.log(`\n${"=".repeat(50)}`);
  console.log("✅ 전체 통신 테스트 완료");
  console.log(`  db-schema    (5001): ${dbTools.length}개 툴`);
  console.log(`  api-endpoints(5003): ${apiTools.length}개 툴`);
  console.log(`  business-logic(5002): ${bizTools.length}개 툴`);
  console.log("=".repeat(50));
}

runChain().catch(console.error);
