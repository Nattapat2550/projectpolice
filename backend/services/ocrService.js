const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { parseSuryaOutput } = require('./suryaParser');

// เพิ่มฟังก์ชันหน่วงเวลา (Delay) ไว้ใช้ตอน Server ทำงานหนัก
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ฟังก์ชันหลักที่ใช้ประมวลผลด้วย EasyOCR
exports.extractDataWithGemini = async (filePath, mimeType) => {
  return new Promise((resolve, reject) => {
    console.log(`กำลังส่งไฟล์ให้ EasyOCR ประมวลผล...`);
    
    // กำหนด Path ของ Python script
    const scriptPath = path.join(__dirname, '../scripts/easyocr_runner.py');
    const command = `python "${scriptPath}" "${filePath}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error && !stdout.trim()) {
        console.error("EasyOCR exec error:", error);
        console.error("EasyOCR stderr:", stderr);
        return reject(new Error(`EasyOCR Processing Failed: ${error.message}`));
      }

      try {
        const rawJson = stdout.trim();
        const ocrResult = JSON.parse(rawJson);

        if (ocrResult.error) {
          return reject(new Error(`EasyOCR Error: ${ocrResult.error}`));
        }

        const rawText = ocrResult.full_text || "";
        
        // แปลง Raw Text ให้เป็น JSON Structure ด้วย Parser ตัวเดิม
        const structuredData = parseSuryaOutput(rawText);

        resolve({
            text: structuredData.full_text || "",
            extractedData: structuredData.memos || []
        });

      } catch (parseError) {
        console.error("Failed to parse EasyOCR output:", parseError.message);
        console.log("Raw Output:", stdout);
        reject(new Error("Failed to parse output from EasyOCR"));
      }
    });
  });
};