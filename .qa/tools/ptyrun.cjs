#!/usr/bin/env node
// Runs one server inside a real pseudo-terminal, the way a developer runs it in a terminal tab.
//
//   node .qa/tools/ptyrun.cjs <log> [--name <tab title>] -- <command> [args...]
//
// Writes two files next to each other:
//   <log>          plain text (escape codes stripped), exactly what `cmd > <log> 2>&1` gave before,
//                  so every tool that reads server logs keeps working
//   <log>.pty      the raw terminal stream (colours, cursor moves, \r progress lines): what the
//                  terminal tab really shows. The recorder replays the end of it live in the clip's
//                  terminal window (core/server-terminal.ts).
//   <log>.pty.json { name, command, cols, rows, pid, started }
//
// Exits with the server's exit code and forwards SIGINT/SIGTERM to it. Without node-pty (not
// installed, unsupported platform) it falls back to a plain pipe, so start-all.sh never breaks.
// Terminal size: QA_PTY_COLS x QA_PTY_ROWS (default 168 x 36), the size the clip's window uses.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1 || sep === argv.length - 1) {
  console.error("usage: ptyrun.cjs <log> [--name <title>] -- <command> [args...]");
  process.exit(2);
}
const opts = argv.slice(0, sep);
const cmd = argv.slice(sep + 1);
const command = cmd.join(" ");
const log = path.resolve(opts[0]);
const ni = opts.indexOf("--name");
const name = ni >= 0 && opts[ni + 1] ? opts[ni + 1] : path.basename(cmd[0]);
const cols = Number(process.env.QA_PTY_COLS) || 168;
const rows = Number(process.env.QA_PTY_ROWS) || 36;

fs.mkdirSync(path.dirname(log), { recursive: true });
const plain = fs.createWriteStream(log, { flags: "w" });
const raw = fs.createWriteStream(log + ".pty", { flags: "w" });

// CSI / OSC / other escapes out, \r-overwritten progress lines collapsed to their last state.
const ESC = /\x1b\[[0-?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
let carry = "";
function toPlain(chunk) {
  const s = (carry + chunk).replace(ESC, "");
  const nl = s.lastIndexOf("\n");
  carry = nl < 0 ? s : s.slice(nl + 1);
  if (nl < 0) return "";
  return s
    .slice(0, nl + 1)
    .split("\n")
    .map((l) => { const parts = l.replace(/\r$/, "").split("\r"); return parts[parts.length - 1]; })
    .join("\n");
}

function loadPty() {
  const roots = [path.resolve(__dirname, "..", "..", "autorecorder", "node_modules"), path.resolve(process.cwd(), "node_modules")];
  for (const r of roots) {
    try { return require(path.join(r, "node-pty")); } catch {}
  }
  try { return require("node-pty"); } catch { return null; }
}

function meta(pid, mode) {
  fs.writeFileSync(log + ".pty.json", JSON.stringify({ name, command, cols, rows, pid, mode, started: new Date().toISOString() }));
}

let finished = false;
function finish(code) {
  if (finished) return;
  finished = true;
  const rest = carry.replace(ESC, "");
  if (rest) plain.write(rest);
  plain.end(); raw.end(() => process.exit(code ?? 0));
}

const pty = process.env.QA_PTY === "0" ? null : loadPty();
if (pty) {
  let file = cmd[0];
  if (process.platform === "win32" && !/\.(exe|cmd|bat)$/i.test(file)) {
    // ConPTY needs a real executable: run through the shell that started us.
    file = process.env.COMSPEC || "cmd.exe";
    cmd.unshift("/d", "/s", "/c");
  } else cmd.shift();
  const child = pty.spawn(file, cmd, {
    name: "xterm-256color", cols, rows, cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
  });
  meta(child.pid, "pty");
  child.onData((d) => { raw.write(d); const p = toPlain(d); if (p) plain.write(p); });
  child.onExit(({ exitCode }) => finish(exitCode));
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { try { child.kill(sig); } catch {} });
} else {
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  meta(child.pid, "pipe");
  const on = (d) => { const s = d.toString("utf8"); raw.write(s.replace(/\n/g, "\r\n")); const p = toPlain(s); if (p) plain.write(p); };
  child.stdout.on("data", on); child.stderr.on("data", on);
  child.on("exit", (code) => finish(code));
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { try { child.kill(sig); } catch {} });
}
