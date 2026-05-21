const mongoose = require("mongoose");
const dns = require("dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", true);
    // เปลี่ยนมาใช้ process.env.DB ตาม .env ใหม่ที่คุณให้มา
    const conn = await mongoose.connect(process.env.DB);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to database: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;