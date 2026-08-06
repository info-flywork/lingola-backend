'use strict';

const mysql = require('mysql2/promise');
const { env } = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 15000,
});

async function ping() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1 AS ok');
    const [tables] = await connection.query('SHOW TABLES');
    return {
      ok: true,
      database: env.db.database,
      tableCount: tables.length,
      tables: tables.map((row) => Object.values(row)[0]),
    };
  } finally {
    connection.release();
  }
}

module.exports = { pool, ping };
