const fs = require('fs').promises; 
const path = require('path');
const pool = require('../config/db');
const { extractDataWithGemini } = require('../services/ocrService'); 
const { parseFilenameInfo } = require('../utils/filenameParser');
const { calculateFiscalRoundAndYear } = require('../utils/fiscalYearHelper');

// 🧹 ฟังก์ชันอัตโนมัติสำหรับลบไฟล์สแกนชั่วคราวที่ตกค้างในโฟลเดอร์ uploads เกิน 15 นาที
async function cleanStaleUploads() {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const files = await fs.readdir(uploadsDir);
    const now = Date.now();
    const maxAgeMs = 15 * 60 * 1000; // 15 minutes

    for (const file of files) {
      if (file === '.gitkeep' || file === 'readme.txt') continue;
      const fullPath = path.join(uploadsDir, file);
      try {
        const stats = await fs.stat(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(fullPath);
          console.log(`[AutoClean] Deleted stale temp upload file: ${file}`);
        }
      } catch (e) {}
    }
  } catch (e) {
    // ignore if uploads dir doesn't exist
  }
}

// เรียกทำงานทำความสะอาดไฟล์ตกค้างทันทีเมื่อเริ่มเซิร์ฟเวอร์ และรันซ้ำทุกๆ 15 นาที
cleanStaleUploads();
setInterval(cleanStaleUploads, 15 * 60 * 1000);

exports.processDocuments = async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded.' });
  const results = [];
  
  const userId = req.user ? req.user.id : null;
  const userName = req.user ? req.user.name : "Unknown"; 

  for (const file of files) {
    let safePath;
    try {
      // 🔒 Snyk Fix (CWE-22): บังคับให้เป็นแค่ชื่อไฟล์ หั่น Path ../ ทิ้งทั้งหมด
      const safeFileName = path.basename(file.path);
      // รวมกับโฟลเดอร์ของไฟล์อัปโหลดจริง (ป้องกัน Path Traversal และรองรับ Fallback Directory ใน Serverless)
      safePath = path.join(path.dirname(file.path), safeFileName);

      const engine = req.body.engine || 'gemini'; // Default to gemini if not provided
      const fnInfo = parseFilenameInfo(file.originalname);

      // เช็คว่ามีเลขรับจากชื่อไฟล์ และตรงกับรอบตัดของวันที่อัพโหลดหรือไม่
      const uploadDate = new Date();
      const { round, fiscalYear } = calculateFiscalRoundAndYear(uploadDate);

      let existingTask = null;
      if (fnInfo.receive_no) {
        const receiveNoNum = parseInt(fnInfo.receive_no, 10);
        if (!isNaN(receiveNoNum)) {
          const taskRes = await pool.query(
            `SELECT id, receive_no, receive_year, round, memo_no, memo_date, sender, recipient_to, title, notes, created_at
             FROM tasks 
             WHERE receive_no = $1 AND receive_year = $2 AND COALESCE(round, 1) = $3
             LIMIT 1`,
            [receiveNoNum, fiscalYear, round]
          );
          if (taskRes.rows.length > 0) {
            existingTask = taskRes.rows[0];
          }
        }
      }

      let geminiResult;
      let isDuplicate = false;

      if (existingTask) {
        // ประหยัดการสแกนด้วย AI OCR เมื่อพบว่าเป็นไฟล์ที่มีเลขรับและรอบตัดซ้ำในระบบ
        isDuplicate = true;
        geminiResult = await extractDataWithGemini(safePath, file.mimetype, engine, { scanMode: 'partial' });
      } else {
        // รายการใหม่ สแกนเต็มรูปแบบ
        geminiResult = await extractDataWithGemini(safePath, file.mimetype, engine);
      }

      const { text, extractedData } = geminiResult;

      let memos = Array.isArray(extractedData) ? extractedData : [];
      if (memos.length === 0) {
        memos = [{}];
      }

      const processedMemos = memos.map(memo => {
        const receive_no = fnInfo.receive_no || memo.receive_no || (existingTask ? existingTask.receive_no : null);
        const sender = fnInfo.sender || memo.จาก || memo.sender || (existingTask ? existingTask.sender : null);
        
        let assignments = [];
        if (fnInfo.assignee) {
          assignments = [{ responsible_person: fnInfo.assignee, role_or_name: fnInfo.assignee }];
        } else if (Array.isArray(memo.assignments) && memo.assignments.length > 0) {
          assignments = memo.assignments;
        }

        if (isDuplicate) {
          return {
            ...memo,
            is_duplicate: true,
            existing_task_id: existingTask.id,
            receive_no: receive_no,
            receive_date: existingTask.created_at ? new Date(existingTask.created_at).toISOString().split('T')[0] : (memo.receive_date || null),
            จาก: sender,
            sender: sender,
            assignments: assignments
          };
        } else {
          return {
            ...memo,
            is_duplicate: false,
            receive_no: receive_no,
            จาก: sender,
            sender: sender,
            assignments: assignments
          };
        }
      });

      results.push({
        filename: file.originalname,
        status: 'success',
        extractedData: processedMemos,
        fileInfo: {
            path: safePath, 
            originalname: file.originalname,
            mimetype: file.mimetype,
            text: text
        }
      });

    } catch (err) {
      try { 
        if (safePath) await fs.unlink(safePath); 
      } catch (e) {}
      results.push({ filename: file.originalname, status: 'error', error: err.message });
    }
  }
  
  res.json({ total: files.length, results });
};

// 🗑️ API ลบไฟล์ชั่วคราวเมื่อผู้ใช้นำไฟล์ออก หรือกดยกเลิก/ย้ายหน้า
exports.deleteTempFiles = async (req, res) => {
  try {
    const { paths, path: singlePath } = req.body;
    const pathList = Array.isArray(paths) ? paths : singlePath ? [singlePath] : [];

    for (const filePath of pathList) {
      if (!filePath || typeof filePath !== 'string') continue;
      const filename = path.basename(filePath);
      const parentDir = path.dirname(filePath);
      const safePath = path.join(parentDir, filename);

      try {
        await fs.unlink(safePath);
        console.log(`[TempClean] Successfully deleted temp file: ${filename}`);
      } catch (e) {
        // ignore if already deleted
      }
    }

    res.json({ success: true, message: 'Temp files cleaned successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};