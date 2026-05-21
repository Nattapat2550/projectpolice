const { Pool } = require("pg");

// เชื่อมต่อ PostgreSQL โดยใช้ connection string จาก .env
// ใส่ ssl: { rejectUnauthorized: false } เพื่อให้รองรับ Render / Cloud DB
const pool = new Pool({
  connectionString: process.env.DB,
  ssl: { rejectUnauthorized: false }
});

const connectDB = async () => {
  try {
    await pool.connect();
    console.log("PostgreSQL Connected!");

    // สร้างตาราง users อัตโนมัติหากยังไม่มี
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(20) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'Student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (error) {
    console.error(`Error connecting to PostgreSQL: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };