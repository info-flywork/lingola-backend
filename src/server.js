'use strict';

const app = require('./app');
const { env } = require('./config/env');
const { ping } = require('./config/db');

async function start() {
  try {
    const db = await ping();
    console.log(
      `[db] connected to ${db.database} (${db.tableCount} tables)`,
    );
  } catch (err) {
    console.error('[db] connection failed on boot:', err.message);
    if (err.code) console.error('[db] code:', err.code);
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] listening on http://0.0.0.0:${env.port}`);
  });
}

start();
