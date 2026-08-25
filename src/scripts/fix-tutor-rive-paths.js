'use strict';

/**
 * DB'deki yanlış local_rive_path değerlerini düzeltir.
 * Usage: node src/scripts/fix-tutor-rive-paths.js
 */
const { pool } = require('../config/db');

const FIXES = [
  ['ukrath', 'assets/riv/ukrath.riv'],
  ['elrion', 'assets/riv/elrion.riv'],
  ['katie', 'assets/riv/Female/kaite.riv'],
];

async function main() {
  for (const [slug, path] of FIXES) {
    const [result] = await pool.query(
      'UPDATE tutors SET local_rive_path = ? WHERE slug = ?',
      [path, slug],
    );
    console.log(`[fix] ${slug} → ${path} (affected=${result.affectedRows})`);
  }
  const [rows] = await pool.query(
    'SELECT slug, local_rive_path, rive_cdn_url FROM tutors ORDER BY slug',
  );
  console.table(rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
