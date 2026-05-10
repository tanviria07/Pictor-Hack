import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const backendRoot = path.join(repoRoot, "backend-go");
const tempDir = path.join(frontendRoot, ".codex-temp");
const backendBin = path.join(backendRoot, "bin", process.platform === "win32" ? "kitcode-server.exe" : "kitcode-server");

fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(path.dirname(backendBin), { recursive: true });

const env = {
  ...process.env,
  TEMP: tempDir,
  TMP: tempDir,
  TMPDIR: tempDir,
  GOCACHE: path.join(backendRoot, ".gocache"),
  API_BASE: "http://127.0.0.1:8080",
};

function command(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function waitForHealth(timeoutMs = 20000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get("http://127.0.0.1:8080/health", (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("Go backend did not become ready on http://127.0.0.1:8080"));
        return;
      }
      setTimeout(probe, 500);
    };
    probe();
  });
}

if (!fs.existsSync(backendBin)) {
  console.log("[dev] building Go backend");
  const build = spawnSync("go", ["build", "-o", backendBin, "./cmd/server"], {
    cwd: backendRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
} else {
  console.log(`[dev] using existing backend binary ${backendBin}`);
}

console.log("[dev] starting Go backend on http://127.0.0.1:8080");
const backend = spawn(backendBin, [], {
  cwd: backendRoot,
  stdio: "inherit",
  env,
});

backend.on("exit", (code) => {
  if (code !== null && code !== 0) {
    console.error(`[dev] backend exited with code ${code}`);
  }
});

try {
  await waitForHealth();
}
catch (error) {
  console.error(`[dev] ${error.message}`);
  backend.kill();
  process.exit(1);
}

console.log("[dev] backend ready");
console.log("[dev] starting frontend on http://127.0.0.1:3000");
const frontend = spawn(command("npx"), ["parcel", "index.html", "--port", "3000", "--host", "127.0.0.1"], {
  cwd: frontendRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

function shutdown() {
  if (!backend.killed) backend.kill();
  if (!frontend.killed) frontend.kill();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

frontend.on("exit", (code, signal) => {
  shutdown();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
