'use strict';

require('dotenv').config();

const { pool } = require('../config/db');
const { ensureCatalog } = require('../services/lesson.service');

async function main() {
  await ensureCatalog();
  const [rows] = await pool.query(
    `SELECT cefr_level, COUNT(*) AS n FROM lessons GROUP BY cefr_level
     ORDER BY FIELD(cefr_level, 'A1','A2','B1','B2','C1','C2')`,
  );
  console.log('[seed:lessons]', rows);
  await pool.end();
}

main().catch((err) => {
  console.error('[seed:lessons] failed:', err.message);
  process.exit(1);
});
