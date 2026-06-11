import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "cmd.exe" : "npm";
const commandArgs = (script) =>
  process.platform === "win32" ? ["/d", "/s", "/c", `npm run ${script}`] : ["run", script];
const children = [
  spawn(npmCommand, commandArgs("dev:api"), { stdio: "inherit", shell: false }),
  spawn(npmCommand, commandArgs("dev:web"), { stdio: "inherit", shell: false })
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
