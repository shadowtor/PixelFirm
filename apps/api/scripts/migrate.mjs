import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(__dirname, "..", "drizzle");
const files = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

for (const file of files) {
  const sql = readFileSync(join(drizzleDir, file), "utf8");
  try {
    await client.query(sql);
    console.log(`applied: ${file}`);
  } catch (err) {
    if (err.code === "42P07" || err.code === "42710") {
      // relation/trigger already exists — migration already applied, skip.
      console.log(`skipped (already applied): ${file}`);
      continue;
    }
    console.error(`failed: ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("done");
