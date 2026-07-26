const fs = require('fs').promises; 
const path = require('path');
const { extractDataWithGemini } = require('../services/ocrService'); 
const { parseFilenameInfo } = require('../utils/filenameParser');

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
      const geminiResult = await extractDataWithGemini(safePath, file.mimetype, engine);
      const { text, extractedData } = geminiResult;

      // สกัดข้อมูลจากชื่อไฟล์ (เช่น 556-ศตคม.(ตู่).pdf => 556=receive_no, ศตคม.=sender, ตู่=assignee)
      const fnInfo = parseFilenameInfo(file.originalname);

      let memos = Array.isArray(extractedData) ? extractedData : [];
      if (memos.length === 0) {
        memos = [{}];
      }

      const processedMemos = memos.map(memo => {
        const receive_no = fnInfo.receive_no || memo.receive_no || null;
        const sender = fnInfo.sender || memo.จาก || memo.sender || null;
        
        let assignments = Array.isArray(memo.assignments) ? [...memo.assignments] : [];
        if (fnInfo.assignee) {
          const exists = assignments.some(a => a && a.responsible_person === fnInfo.assignee);
          if (!exists) {
            assignments.unshift({ responsible_person: fnInfo.assignee });
          }
        }

        return {
          ...memo,
          receive_no: receive_no,
          จาก: sender,
          sender: sender,
          assignments: assignments
        };
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