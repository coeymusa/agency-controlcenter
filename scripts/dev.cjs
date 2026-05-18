#!/usr/bin/env node
/**
 * Wrapper around `next dev` that:
 *   1. Kills any previous `next dev` child it owns (.dev.pid)
 *   2. Removes a stale PGlite lock file if present (otherwise PGlite WASM aborts)
 *   3. Records its new child PID for next time
 *
 * Why: on Windows, when the parent shell is killed, `next dev` keeps running
 * as an orphan. The data dir then stays locked, and subsequent PGlite inits
 * abort with "RuntimeError: Aborted()".
 */
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PID_FILE = path.resolve(__dirname, "..", ".dev.pid");
const DATA_DIR = path.resolve(__dirname, "..", "data", "pglite");
const STALE_LOCKS = ["postmaster.pid", ".s.PGSQL.5432.lock", ".s.PGSQL.5432.lock.out"];
const PORT = process.env.PORT || "3000";

function tryKillPid(pid) {
  try {
    process.kill(pid, "SIGKILL");
    console.log("[dev] killed previous next dev pid=" + pid);
  } catch (e) {
    if (e.code !== "ESRCH") console.warn("[dev] kill " + pid + " failed: " + e.message);
  }
}

// Step 1: kill the pid we recorded last time
if (fs.existsSync(PID_FILE)) {
  const oldPid = parseInt(fs.readFileSync(PID_FILE, "utf8"), 10);
  if (Number.isFinite(oldPid)) tryKillPid(oldPid);
  try { fs.unlinkSync(PID_FILE); } catch {/* ignore */}
}

// Step 2: kill anything still listening on our port (Windows often leaves orphans)
if (process.platform === "win32") {
  try {
    const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: "utf8" });
    const pids = new Set();
    out.split(/\r?\n/).forEach((line) => {
      const m = line.match(/\s+(\d+)\s*$/);
      if (m) pids.add(parseInt(m[1], 10));
    });
    pids.delete(process.pid);
    for (const pid of pids) {
      try {
        // Only kill if it's a node.exe — we don't want to nuke unrelated processes
        const img = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8" });
        if (/node\.exe/i.test(img)) tryKillPid(pid);
      } catch {/* ignore */}
    }
  } catch {/* netstat empty or failed */}
}

// Step 3: clear stale PGlite lock files
if (fs.existsSync(DATA_DIR)) {
  for (const f of STALE_LOCKS) {
    const p = path.join(DATA_DIR, f);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); console.log("[dev] removed stale " + f); } catch {/* ignore */}
    }
  }
}

// Step 4: spawn next dev
const args = ["dev", "-p", PORT].concat(process.argv.slice(2));
const nextBin = path.resolve(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
const next = spawn(
  nextBin,
  args,
  { stdio: "inherit", shell: process.platform === "win32", cwd: path.resolve(__dirname, "..") },
);
fs.writeFileSync(PID_FILE, String(next.pid));

function cleanup() {
  try { next.kill("SIGTERM"); } catch {/* ignore */}
  try { fs.unlinkSync(PID_FILE); } catch {/* ignore */}
}
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });
process.on("exit", cleanup);
next.on("exit", (code) => {
  try { fs.unlinkSync(PID_FILE); } catch {/* ignore */}
  process.exit(code ?? 0);
});
