require('dotenv').config({ path: './config/config.env' });
const pool = require('./config/db');

async function check() {
  try {
    const res = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'tasks'::regclass AND contype = 'u';
    `);
    console.log("Unique constraints on tasks table:");
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
check();
