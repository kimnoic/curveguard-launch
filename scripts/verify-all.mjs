import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
for (const name of ["verify-launch.mjs", "verify-transactions.mjs"]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
