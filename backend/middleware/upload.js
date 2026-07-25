const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ฟังก์ชันสำหรับเลือกโฟลเดอร์อัปโหลดที่เขียนไฟล์ได้จริง (รองรับ Read-only filesystem / Serverless)
const getUploadDir = () => {
  const primaryDir = path.join(process.cwd(), 'uploads');
  try {
    if (!fs.existsSync(primaryDir)) {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    return primaryDir;
  } catch (err) {
    // หากเป็น read-only filesystem (เช่น AWS Lambda, Vercel) ให้ fallback ไปใช้ OS temp directory (/tmp)
    const fallbackDir = path.join(os.tmpdir(), 'uploads');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to create fallback upload directory:', e);
    }
    return fallbackDir;
  }
};

// ตั้งค่าโฟลเดอร์และชื่อไฟล์ตอนเซฟลงเครื่อง
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (req, file, cb) => {
    // 💡 เซฟลงเครื่องด้วยชื่อสุ่มตัวเลข เพื่อหลีกเลี่ยงปัญหาภาษาไทยและอักขระแปลกๆ
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ext);
  }
});

// ตรวจสอบประเภทไฟล์ และแปลงชื่อไฟล์ดั้งเดิม
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // 💡 แปลงชื่อไฟล์ภาษาไทยตรงนี้ แค่ "รอบเดียว"
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    
    const allowed = ['.png', '.jpg', '.jpeg', '.pdf', '.tiff'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('รองรับเฉพาะไฟล์ .png, .jpg, .jpeg, .pdf, .tiff เท่านั้น'), false);
    }
  }
});

module.exports = { upload, getUploadDir };