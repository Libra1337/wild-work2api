// embed.mjs — 将 vite 构建产物拷贝到 go:embed 目录 cmd/wild-work/web，
// 使单二进制自带 Web 控制台。package.json: "build:embed" 调用。
import { cp, rm, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(root, "../dist");
const target = path.resolve(root, "../../cmd/wild-work/web");

const entries = await readdir(dist);
if (entries.length === 0) {
  throw new Error("dist 目录为空，请先 vite build");
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(dist, target, { recursive: true });

console.log(`[embed] ${entries.length} entries -> ${path.relative(process.cwd(), target)}`);
