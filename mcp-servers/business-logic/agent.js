import { spawn } from "child_process";

const SYSTEM_SUFFIX = `

작업 완료 후 출력 마지막 줄에 반드시 아래 형식으로 PR 제목을 작성해주세요:
PR_TITLE: <15자 이내 한국어 요약 (예: 로그인 서비스 추가, 트랜잭션 처리 개선)>`;

export async function runCodingAgent(prompt, workDir, onLog) {
  return new Promise((resolve, reject) => {
    const fullPrompt = prompt + SYSTEM_SUFFIX;
    const child = spawn(
      "claude",
      ["-p", fullPrompt, "--allowedTools", "Edit,Read,Write,Bash,Glob,Grep", "--output-format", "text"],
      { cwd: workDir, stdio: ["ignore", "pipe", "pipe"] }
    );

    let output = "";
    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      const line = text.trim();
      if (line) onLog?.(`🤖 ${line.slice(0, 200)}`);
    });
    child.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line) onLog?.(`  ${line.slice(0, 200)}`);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`claude exited with code ${code}\n${output}`));
    });
    child.on("error", reject);
  });
}

export function parseSummary(raw) {
  const lines = raw.trimEnd().split("\n");
  const titleLine = lines.findLast((l) => l.startsWith("PR_TITLE:"));
  const title = titleLine ? titleLine.replace("PR_TITLE:", "").trim() : null;
  const summary = lines.filter((l) => !l.startsWith("PR_TITLE:")).join("\n").trim();
  return { title, summary };
}
