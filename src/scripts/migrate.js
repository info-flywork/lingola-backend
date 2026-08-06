'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const {
    DB_HOST,
    DB_PORT = '3306',
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
  } = process.env;

  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('Missing DB_* env vars');
  }

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const [rows] = await connection.query(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [file],
    );
    if (rows.length) {
      console.log(`[migrate] skip ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] apply ${file}`);
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [
      file,
    ]);
  }

  await connection.end();
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  if (err.code) console.error('code:', err.code);
  process.exit(1);
});
