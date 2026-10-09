import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, "functions"), { recursive: true });
await copyFile(resolve(root, "src/data/questions.json"), resolve(root, "functions/questions.json"));
await copyFile(resolve(root, "src/data/pictureGuessItems.json"), resolve(root, "functions/pictureGuessItems.json"));
const bank = JSON.parse(await readFile(resolve(root, "src/data/questions.json"), "utf8"));
const sha256 = createHash("sha256").update(JSON.stringify(bank)).digest("hex");
await writeFile(resolve(root, "src/data/questionBankVersion.json"), `${JSON.stringify({ sha256 }, null, 2)}\n`);
console.log("تم تجهيز بنك الأسئلة الآمن لوظائف Firebase.");
