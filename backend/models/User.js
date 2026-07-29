const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

class User {
  // สร้างผู้ใช้งานใหม่
  static async create(userData) {
    const { name, password, color } = userData;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    // เพิ่มการบันทึกสี โดยกำหนดค่า Default ไว้ถ้าไม่ได้ส่งมา
    const userColor = color || '#000000'; 

    const query = `
      INSERT INTO users (name, password, color) 
      VALUES ($1, $2, $3) 
      RETURNING id, name, color, role
    `;
    const values = [name, hashedPassword, userColor];

    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  // หาข้อมูลผู้ใช้งานด้วย ID
  static async findById(id) {
    // 💡 FIX: เพิ่มการ SELECT color และ role คืนค่ากลับไป
    const { rows } = await pool.query(`SELECT id, name, color, role FROM users WHERE id = $1`, [id]);
    return rows[0];
  }

  // หาผู้ใช้งานสำหรับ Login (เช็ค name แทน email)
  static async findOne(criteria) {
    if (criteria.name) {
      const { rows } = await pool.query(`SELECT * FROM users WHERE name = $1`, [criteria.name]);
      return rows[0];
    }
    return null;
  }

  // ดึงผู้ใช้งานทั้งหมด
  static async find() {
    // 💡 FIX: เพิ่มการ SELECT color และ role
    const { rows } = await pool.query(`SELECT id, name, color, role FROM users`);
    return rows;
  }

  // อัปเดตผู้ใช้งานแบบยืดหยุ่น (Dynamic Update)
  static async findByIdAndUpdate(id, data) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id);

    const values = Object.values(data);
    const setString = keys.map((key, index) => {
      return `${key} = $${index + 2}`;
    }).join(", ");

    const query = `
      UPDATE users 
      SET ${setString} 
      WHERE id = $1 
      RETURNING id, name, color, role -- 💡 FIX: คืนค่า color และ role กลับไปด้วยหลังอัปเดตเสร็จ
    `;
    
    const { rows } = await pool.query(query, [id, ...values]);
    return rows[0];
  }

  // ลบผู้ใช้งาน
  static async findByIdAndDelete(id) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  }

  // อัปเดตรหัสผ่าน
  static async updatePassword(id, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashedPassword, id]);
  }

  // เทียบรหัสผ่าน
  static async matchPassword(enteredPassword, userPassword) {
    return await bcrypt.compare(enteredPassword, userPassword);
  }

  // สร้าง Token
  static getSignedJwtToken(userId, role) {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });
  }
}

module.exports = User;