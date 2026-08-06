'use strict';

const { ping } = require('../config/db');
const { env } = require('../config/env');

async function main() {
  console.log(
    `[db:ping] connecting to ${env.db.user}@${env.db.host}:${env.db.port}/${env.db.database} ...`,
  );

  try {
    const result = await ping();
    console.log('[db:ping] OK');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[db:ping] FAILED');
    console.error('message:', err.message);
    if (err.code) console.error('code:', err.code);
    if (err.errno) console.error('errno:', err.errno);
    process.exit(1);
  }
}

main();
