const fs = require('fs').promises; 
const path = require('path');
const { extractDataWithGemini } = require('../services/ocrService'); 

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
      // รวมกับ Default Directory ของโปรเจค (แก้ path ไปที่โฟลเดอร์เก็บไฟล์ของคุณ เช่น uploads)
      safePath = path.join(process.cwd(), 'uploads', safeFileName);

      const engine = req.body.engine || 'gemini'; // Default to gemini if not provided
      const geminiResult = await extractDataWithGemini(safePath, file.mimetype, engine);
      const { text, extractedData } = geminiResult;

      let dataWithDefaultUser = extractedData || {};
      dataWithDefaultUser.assignee = userName; 

      results.push({
        filename: file.originalname,
        status: 'success',
        extractedData: dataWithDefaultUser,
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