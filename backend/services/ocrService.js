const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// ดึง API Key จาก .env
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Warning: GEMINI_API_KEY is not defined in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// เพิ่มฟังก์ชันหน่วงเวลา (Delay) ไว้ใช้ตอน Server AI ทำงานหนัก
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ฟังก์ชันแปลงไฟล์เป็นรูปแบบที่ Gemini รองรับ (Inline Data)
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

// ฟังก์ชันหลักที่ใช้ประมวลผลด้วย Gemini
exports.extractDataWithGemini = async (filePath, mimeType) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" }); 

    const prompt = `
    คุณเป็นผู้ช่วยผู้เชี่ยวชาญในการอ่านและสกัดข้อมูลจากเอกสารราชการไทย (Thai Official Documents) โดยเฉพาะบันทึกข้อความ (Memo)
    กรุณาอ่านเอกสารที่แนบมานี้อย่างละเอียด (รองรับทั้งตัวพิมพ์และลายมือภาษาไทย)

    หากในไฟล์มีเอกสารหลายหน้า หรือมีหลายบันทึกข้อความ ให้แยกข้อมูลแต่ละฉบับออกจากกันเป็น Array ของ "memos"

    ให้สกัดข้อมูลออกมาเป็นรูปแบบ JSON (Valid JSON) อย่างเคร่งครัดตามโครงสร้างดังต่อไปนี้:
    {
      "full_text": "ข้อความดั้งเดิมทั้งหมดที่อ่านได้จากเอกสาร (นำมาต่อกันให้อ่านรู้เรื่อง)",
      "memos": [
        {
          "ที่": "ระบุที่ของเอกสาร (ถ้าไม่มีให้ใส่ null)",
          "วันที่": "ระบุวันที่ (ถ้าไม่มีให้ใส่ null)",
          "เวลา": "ระบุเวลา (ถ้าไม่มีให้ใส่ null)",
          "เรื่อง": "ระบุเรื่อง (ถ้าไม่มีให้ใส่ null)",
          "เรียน": "ระบุผู้ที่เอกสารส่งถึง (ถ้าไม่มีให้ใส่ null)",
          "main_text": "ข้อความเนื้อหาทั้งหมดที่อยู่หลังคำว่า 'เรียน' (ยกเว้นส่วนการมอบหมายงาน) **ห้ามตัดทอนข้อความ ห้ามสรุปความเด็ดขาด ให้ดึงเนื้อหาต้นฉบับมาแบบ 100%** หน้าที่ของคุณคือเพียงแค่เพิ่มการจัดย่อหน้า (ขึ้นบรรทัดใหม่ด้วย \\n) และทำตัวหนา (ใส่ **เน้นคำ**) ในจุดที่สำคัญ เพื่อให้อ่านง่ายขึ้นเท่านั้น",
          "assignments": [
            {
              "responsible_person": "ระบุตัวย่อหรือชื่อยศของผู้รับผิดชอบ เช่น ฝอ.๑, สว.ฝอ.๔, ผกก.",
              "topics": [
                "หัวข้อหรือรายละเอียดที่ต้องรับผิดชอบ 1 (สังเกตจากเครื่องหมาย - หรือหัวข้อย่อย)",
                "หัวข้อที่ 2..."
              ]
            }
          ]
        }
      ]
    }

    **กฎเกณฑ์สำคัญในการสกัดข้อมูล:**
    1. **memos**: สกัดข้อมูลบันทึกข้อความ หากมีหลายหน้าหรือหลายบันทึก ให้เพิ่ม Object เข้าไปใน Array "memos" เรื่อยๆ
    2. **main_text**: ทุกอย่างที่อยู่ **หลังเส้น "เรียน"** จะต้องอยู่ในหมวดนี้ (ห้ามสรุปความ ห้ามตัดคำทิ้ง ให้ดึงมาทั้งหมด)
    3. **หลักการมอบหมายงาน (Assignments)**:
        * สังเกตโครงสร้างรายการหลังจาก "เรียน"
        * **"คนที่รับผิดชอบ" (responsible_person)** คือตัวย่อของตำแหน่งหรือยศที่ปรากฏชัดเจน (เช่น 'ฝอ.๑', 'ผกก.ฝอ.๑')
        * **"หัวข้อที่ต้องรับผิดชอบ" (topics)** คือรายการเนื้อหาที่ตามหลังตัวย่อเหล่านั้น มักจะเริ่มต้นด้วยเครื่องหมายยัติภังค์ '-' หรือเครื่องหมายหัวข้ออื่นๆ
    4. **สำคัญมาก: ห้ามใช้ Emoji หรือ Emoticon ใดๆ ในผลลัพธ์โดยเด็ดขาด ให้ใช้เฉพาะข้อความ Text ปกติเท่านั้น**

    ข้อควรระวัง: 
    1. คืนค่าผลลัพธ์เป็น JSON เท่านั้น ห้ามมีคำอธิบายเพิ่มเติม ห้ามใช้ Markdown block (เช่น \`\`\`json)
    2. หากในเอกสารไม่มีข้อมูลส่วนไหน ให้ใส่ null ในฟิลด์นั้น
    3. หากพบเนื้อหาหลัง "เรียน" แต่ไม่มีการมอบหมายงานชัดเจน ให้ใส่ค่าใน 'main_text' และปล่อย 'assignments' เป็น Array ว่าง
    `;

    const filePart = fileToGenerativePart(filePath, mimeType);

    let parsedData = null;
    let maxRetries = 3; 

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`กำลังส่งไฟล์ให้ Gemini ประมวลผล... (รอบที่ ${attempt}/${maxRetries})`);
      
      try {
        const result = await model.generateContent([prompt, filePart]);
        const responseText = result.response.text();

        // 💡 แก้บัค VS Code Syntax Error: เปลี่ยนการลบสัญลักษณ์ ``` จาก /.../ เป็น new RegExp แทน
        const cleanJsonString = responseText
            .replace(new RegExp('```json', 'g'), '')
            .replace(new RegExp('```', 'g'), '')
            .trim();
            
        parsedData = JSON.parse(cleanJsonString);

        const memos = parsedData.memos || [];
        
        const isComplete = memos.length > 0 && memos.every(memo => 
          memo["ที่"] && memo["ที่"] !== "-" &&
          memo["วันที่"] && memo["วันที่"] !== "-" &&
          memo["เรื่อง"] && memo["เรื่อง"] !== "-" &&
          memo["เรียน"] && memo["เรียน"] !== "-"
        );

        if (isComplete) {
          console.log("ข้อมูลครบถ้วนสมบูรณ์!");
          break; 
        } else if (attempt < maxRetries) {
          console.log("⚠️ ข้อมูลสำคัญหายไป กำลังสั่งให้ AI รีเช็คและแสกนใหม่อีกครั้ง...");
        }

      } catch (innerError) {
        console.error(`พบข้อผิดพลาดระหว่างเรียก API (รอบที่ ${attempt}):`, innerError.message);
        
        if (attempt === maxRetries) {
          throw innerError; 
        }

        if (innerError.message.includes('503') || innerError.message.includes('429')) {
          const waitTime = attempt * 3000; 
          console.log(`⏳ เซิร์ฟเวอร์ AI ทำงานหนักชั่วคราว รอ ${waitTime/1000} วินาทีแล้วลองใหม่...`);
          await delay(waitTime);
        } else {
          throw innerError;
        }
      }
    }

    return {
      text: parsedData.full_text || "",
      extractedData: parsedData.memos || [] 
    };

  } catch (error) {
    console.error("Gemini OCR Final Error:", error.message);

    if (error.message.includes('429') || error.message.toLowerCase().includes('quota')) {
      throw new Error(`โควตา AI เต็มชั่วคราว: กรุณารอประมาณ 1 นาทีแล้วกดอัพโหลดใหม่อีกครั้ง`);
    }
    
    if (error.message.includes('503')) {
       throw new Error(`ระบบ AI ทำงานหนักเกินไป (503 Service Unavailable): กรุณารอสักครู่แล้วกดอัปโหลดใหม่อีกครั้ง`);
    }
    
    throw new Error(`Gemini Processing Failed: ${error.message}`);
  }
};