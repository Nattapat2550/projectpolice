const fs = require('fs').promises; 
const path = require('path');
const pool = require('../config/db');
const { extractDataWithGemini } = require('../services/ocrService'); 
const { parseFilenameInfo } = require('../utils/filenameParser');
const { calculateFiscalRoundAndYear } = require('../utils/fiscalYearHelper');

const { getUploadDir } = require('../middleware/upload');

// 🧹 ฟังก์ชันอัตโนมัติสำหรับลบไฟล์สแกนชั่วคราวที่ตกค้างในโฟลเดอร์ uploads เกิน 15 นาที
async function cleanStaleUploads() {
  try {
    const uploadsDir = getUploadDir();
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
if (!process.env.VERCEL) {
  setInterval(cleanStaleUploads, 15 * 60 * 1000);
}

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
      const cleanOriginalName = (() => {
        try {
          return decodeURIComponent(file.originalname || '');
        } catch (e) {
          return file.originalname || '';
        }
      })();
      const fnInfo = parseFilenameInfo(cleanOriginalName);

      // ดึงวันที่สร้าง/แก้ไขไฟล์ หรือวันที่สแกนเพื่อใช้เป็นวันที่รับ (receive_date)
      let computedReceiveDate = new Date().toISOString().split('T')[0];
      try {
        const stats = await fs.stat(safePath);
        if (stats && stats.mtime) {
          computedReceiveDate = new Date(stats.mtime).toISOString().split('T')[0];
        }
      } catch (e) {}

      const targetDate = fnInfo.date || computedReceiveDate;
      const { round, fiscalYear, fiscalYearBE } = calculateFiscalRoundAndYear(targetDate);

      let existingTask = null;
      if (fnInfo.receive_no) {
        const receiveNoClean = String(fnInfo.receive_no).replace(/[๐-๙]/g, d => '0123456789'['๐๑๒๓๔๕๖๗๘๙'.indexOf(d)]);
        const receiveNoNum = parseInt(receiveNoClean, 10);
        if (!isNaN(receiveNoNum)) {
          const taskRes = await pool.query(
            `SELECT id, receive_no, receive_year, round, memo_no, memo_date, sender, recipient_to, title, notes, created_at, sign_date
             FROM tasks 
             WHERE receive_no = $1 
               AND (receive_year = $2 OR receive_year = $3 OR receive_year = $2 - 543 OR receive_year = $2 + 543)
             ORDER BY 
               CASE WHEN COALESCE(round, 1) = $4 THEN 0 ELSE 1 END,
               created_at DESC
             LIMIT 1`,
            [receiveNoNum, fiscalYear, fiscalYearBE, round]
          );
          if (taskRes.rows.length > 0) {
            existingTask = taskRes.rows[0];
          }
        }
      }

      const geminiResult = await extractDataWithGemini(safePath, file.mimetype, engine);
      const { text, extractedData } = geminiResult;

      let memos = Array.isArray(extractedData) ? extractedData : [];
      if (memos.length === 0) {
        memos = [{}];
      }

      const processedMemos = await Promise.all(memos.map(async (memo) => {
        let memoExistingTask = existingTask;
        if (!memoExistingTask) {
          const rawRecNo = memo.receive_no || memo.เลขรับ || memo.เลขทะเบียน;
          if (rawRecNo) {
            const recNoClean = String(rawRecNo).replace(/[๐-๙]/g, d => '0123456789'['๐๑๒๓๔๕๖๗๘๙'.indexOf(d)]);
            const parsedRecNo = parseInt(recNoClean, 10);
            if (!isNaN(parsedRecNo)) {
              const memoDateTarget = memo.วันที่ || memo.memo_date || memo.date || targetDate;
              const memoCal = calculateFiscalRoundAndYear(memoDateTarget);
              const taskRes = await pool.query(
                `SELECT id, receive_no, receive_year, round, memo_no, memo_date, sender, recipient_to, title, notes, created_at, sign_date
                 FROM tasks 
                 WHERE receive_no = $1 
                   AND (receive_year = $2 OR receive_year = $3 OR receive_year = $2 - 543 OR receive_year = $2 + 543)
                 ORDER BY 
                   CASE WHEN COALESCE(round, 1) = $4 THEN 0 ELSE 1 END,
                   created_at DESC
                 LIMIT 1`,
                [parsedRecNo, memoCal.fiscalYear, memoCal.fiscalYearBE, memoCal.round]
              );
              if (taskRes.rows.length > 0) {
                memoExistingTask = taskRes.rows[0];
              }
            }
          }
        }

        const isDup = !!memoExistingTask;
        const finalReceiveNo = fnInfo.receive_no || memo.receive_no || (memoExistingTask ? memoExistingTask.receive_no : null);
        const finalSender = fnInfo.sender || memo.จาก || memo.sender || (memoExistingTask ? memoExistingTask.sender : null);
        const recDate = isDup && memoExistingTask.created_at
          ? new Date(memoExistingTask.created_at).toISOString().split('T')[0]
          : computedReceiveDate;

        let assignments = [];
        if (fnInfo.assignee) {
          assignments = [{ responsible_person: fnInfo.assignee, role_or_name: fnInfo.assignee }];
        } else if (Array.isArray(memo.assignments) && memo.assignments.length > 0) {
          assignments = memo.assignments;
        }

        if (isDup) {
          return {
            ...memo,
            is_duplicate: true,
            existing_task_id: memoExistingTask.id,
            receive_no: finalReceiveNo,
            receive_date: recDate,
            จาก: finalSender,
            sender: finalSender,
            ที่: memo.ที่ || memoExistingTask.memo_no || null,
            memo_no: memo.ที่ || memoExistingTask.memo_no || null,
            เรื่อง: memo.เรื่อง || memoExistingTask.title || null,
            title: memo.เรื่อง || memoExistingTask.title || null,
            recipient_to: memo.recipient_to || memo.ถึง || memoExistingTask.recipient_to || null,
            notes: memo.notes || memo.หมายเหตุ || memoExistingTask.notes || null,
            assignments: assignments
          };
        } else {
          return {
            ...memo,
            is_duplicate: false,
            receive_no: finalReceiveNo,
            receive_date: recDate,
            จาก: finalSender,
            sender: finalSender,
            assignments: assignments
          };
        }
      }));

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