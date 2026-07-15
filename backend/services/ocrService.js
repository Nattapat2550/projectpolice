const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { parseSuryaOutput } = require('./suryaParser');

// เพิ่มฟังก์ชันหน่วงเวลา (Delay) ไว้ใช้ตอน Server ทำงานหนัก
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ฟังก์ชันหลักที่ใช้ประมวลผลด้วย Surya OCR
exports.extractDataWithGemini = async (filePath, mimeType) => {
  return new Promise((resolve, reject) => {
    console.log(`กำลังส่งไฟล์ให้ Surya OCR ประมวลผล...`);
    
    // สร้างโฟลเดอร์ temp ไม่ซ้ำกันสำหรับเก็บผลลัพธ์
    const uniqueId = Date.now().toString();
    const outputDir = path.join(__dirname, `../uploads/surya_out_${uniqueId}`);
    
    // คำสั่งเรียกใช้ surya_ocr CLI โดยตรง (เวอร์ชัน 0.2.x)
    const command = `surya_ocr "${filePath}" --langs th,en --results_dir "${outputDir}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      // ไม่ต้องสนใจ error ถ้าโปรแกรมรันจบและสร้างไฟล์ results.json สำเร็จ
      const fileNameWithoutExt = path.parse(filePath).name;
      const resultsFilePath = path.join(outputDir, fileNameWithoutExt, 'results.json');
      
      if (!fs.existsSync(resultsFilePath)) {
        console.error("Surya exec error:", error);
        console.error("Surya stderr:", stderr);
        return reject(new Error(`Surya Processing Failed: ไม่พบไฟล์ผลลัพธ์จาก Surya`));
      }

      try {
        // อ่านไฟล์ results.json ที่ surya_ocr สร้างขึ้น
        const rawJson = fs.readFileSync(resultsFilePath, 'utf8');
        const ocrResult = JSON.parse(rawJson);

        // ดึงข้อความจากผลลัพธ์ของ Surya
        // โครงสร้างของ results.json ใน Surya 0.2.x:
        // { "filename.pdf": [ { "text_lines": [ {"text": "..."}, ... ] } ] }
        let allText = [];
        for (const fileName in ocrResult) {
            const pages = ocrResult[fileName];
            for (const page of pages) {
                if (page.text_lines) {
                    for (const line of page.text_lines) {
                        allText.push(line.text);
                    }
                }
            }
        }
        
        const rawText = allText.join('\n');
        
        // แปลง Raw Text ให้เป็น JSON Structure แบบเดิมด้วย Parser
        const structuredData = parseSuryaOutput(rawText);

        // ลบโฟลเดอร์ผลลัพธ์ทิ้งหลังจากใช้งานเสร็จ
        fs.rmSync(outputDir, { recursive: true, force: true });

        resolve({
            text: structuredData.full_text || "",
            extractedData: structuredData.memos || []
        });

      } catch (parseError) {
        console.error("Failed to parse Surya output:", parseError.message);
        reject(new Error("Failed to parse output from Surya OCR"));
      }
    });
  });
};