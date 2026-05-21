const { pool } = require("../config/db");
const bcrypt = require("bcryptjs");

class User {
  static async create({ name, email, phone, password, role }) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    // กำหนด Role ตามโครงสร้างของระบบ
    const userRole = role || 'Student'; 

    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, name, email, phone, role, created_at`,
      [name, email, phone, hashedPassword, userRole]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1`, 
      [id]
    );
    return result.rows[0];
  }

  static async matchPassword(enteredPassword, storedPassword) {
    return await bcrypt.compare(enteredPassword, storedPassword);
  }
}

module.exports = User;