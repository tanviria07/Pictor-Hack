import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const tempDir = path.join(frontendRoot, ".codex-temp");

fs.mkdirSync(tempDir, { recursive: true });

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node ./scripts/run-with-local-temp.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(command, args, {
  cwd: frontendRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    TEMP: tempDir,
    TMP: tempDir,
    TMPDIR: tempDir,
  },
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
