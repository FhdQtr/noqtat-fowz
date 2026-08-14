import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, "functions"), { recursive: true });
await copyFile(resolve(root, "src/data/questions.json"), resolve(root, "functions/questions.json"));
console.log("تم تجهيز بنك الأسئلة الآمن لوظائف Firebase.");
