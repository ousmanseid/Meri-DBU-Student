import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const db = await getDb();
  let schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('[Migration] Applying database schema...');
  // Execute schema
  const statements = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.query(statement + ';');
  }

  console.log('[Migration] Database schema applied successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async () => {
      const db = await getDb();
      await db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] Migration failed:', err);
      process.exit(1);
    });
}
