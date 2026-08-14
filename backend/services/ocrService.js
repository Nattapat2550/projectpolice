const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

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

// ฟังก์ชันแปลงเลขไทยเป็นเลขอารบิก
function convertThaiDigits(str) {
  if (!str) return "";
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return str.replace(/[๐-๙]/g, (m) => thaiDigits.indexOf(m).toString());
}

// ฟังก์ชันแยกวันนัดประชุมอย่างแม่นยำ โดยกรองวันที่ของหนังสือคำสั่งเดิมออก
function extractMeetingDate(text) {
  const normText = text.replace(/\s+/g, ' ');
  let searchStart = 0;
  let idx = normText.indexOf("ประชุม", searchStart);
  
  while (idx !== -1) {
    const segment = normText.substring(idx, idx + 300);
    // แมทช์วันที่ที่มีชื่อวันนำหน้า หรือมีคำว่า "ในวันที่" นำหน้า
    const meetDateRegex = /(?:วัน(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)|วันที่)?(?:ที่)?\s*([๐-๙0-9ดอn|l\sโมใรdOo]{1,3}\s+[ก-์.]{2,12}\s+[๐-๙0-9ดอn|lโมใรdOo]{2,4})/;
    const match = segment.match(meetDateRegex);
    if (match) {
      const dateStr = match[1];
      const ceDate = parseThaiDateToCE(dateStr);
      if (ceDate) {
        const year = parseInt(ceDate.split('-')[0], 10);
        // วันนัดประชุมปัจจุบันมักจะมีปีเป็นปีปัจจุบันหรืออนาคต (พ.ศ. 2569 ขึ้นไป / ค.ศ. 2026 ขึ้นไป)
        if (year >= 2026) {
          return ceDate;
        }
      }
    }
    searchStart = idx + 6;
    idx = normText.indexOf("ประชุม", searchStart);
  }
  
  // กรณี Fallback: ค้นหาวันที่ที่ระบุชื่อวันใดๆ ทั่วทั้งเอกสารที่มีปีตั้งแต่ 2026 ขึ้นไป
  const meetDateRegexAll = /วัน(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)(?:ที่)?\s*([๐-๙0-9ดอn|l\sโมใรdOo]{1,3}\s+[ก-์.]{2,12}\s+[๐-๙0-9ดอn|lโมใรdOo]{2,4})/g;
  let match;
  while ((match = meetDateRegexAll.exec(normText)) !== null) {
    const dateStr = match[1];
    const ceDate = parseThaiDateToCE(dateStr);
    if (ceDate) {
      const year = parseInt(ceDate.split('-')[0], 10);
      if (year >= 2026) {
        return ceDate;
      }
    }
  }
  return null;
}

// ฟังก์ชันช่วยแปลงวันที่ภาษาไทยให้เป็นรูปแบบ YYYY-MM-DD (ปี ค.ศ.) พร้อมระบบแปลลายมือเขียนที่ OCR มักอ่านเพี้ยน
function parseThaiDateToCE(dateStr) {
  if (!dateStr) return null;
  let s = dateStr.trim();
  
  // Clean all noise punctuation in dateStr to make token splitting clean
  s = s.replace(/[\`"'\-_\/\\~]/g, ' ').trim();
  s = s.replace(/\s+/g, ' ');
  
  // ปรับแก้คำสะกดของเดือนที่อาจเพี้ยนเพราะสระบน
  s = s.replace(/มี่\.?ค\.?/g, 'มี.ค.');
  s = s.replace(/ม\.?ค\.?/g, 'ม.ค.');
  s = s.replace(/ก\.?พ\.?/g, 'ก.พ.');
  s = s.replace(/เม\.?ย\.?/g, 'เม.ย.');
  s = s.replace(/ม\.?ย\.?/g, 'เม.ย.');
  s = s.replace(/มย\.?/g, 'เม.ย.');
  s = s.replace(/พ\.?ค\.?/g, 'พ.ค.');
  s = s.replace(/มิ\.?ย\.?/g, 'มิ.ย.');
  s = s.replace(/ก\.?ค\.?/g, 'ก.ค.');
  s = s.replace(/ส\.?ค\.?/g, 'ส.ค.');
  s = s.replace(/ก\.?ย\.?/g, 'ก.ย.');
  s = s.replace(/ต\.?ค\.?/g, 'ต.ค.');
  s = s.replace(/พ\.?ย\.?/g, 'พ.ย.');
  s = s.replace(/ธ\.?ค\.?/g, 'ธ.ค.');
  s = s.replace(/&/g, 'เม.ย.');
  
  const monthPatterns = [
    'มี\\.ค\\.', 'ม\\.ค\\.', 'ก\\.พ\\.', 'เม\\.ย\\.', 'ม\\.ย\\.', 'มย\\.', 'พ\\.ค\\.', 'มิ\\.ย\\.', 
    'ก\\.ค\\.', 'ส\\.ค\\.', 'ก\\.ย\\.', 'ต\\.ค\\.', 'พ\\.ย\\.', 'ธ\\.ค\\.',
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    '&'
  ];
  
  let tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) {
    for (const pat of monthPatterns) {
      const regex = new RegExp(`([^\\s]*)(${pat})([^\\s]*)`, 'i');
      const match = s.match(regex);
      if (match) {
        s = `${match[1]} ${match[2]} ${match[3]}`;
        tokens = s.split(/\s+/).filter(Boolean);
        break;
      }
    }
  }
  
  if (tokens.length >= 3) {
    let dayPart = tokens[0];
    let monthPart = tokens[1];
    let yearPart = tokens[2].replace(/\./g, '');
    
    // แปลงอักษรในตำแหน่งวัน
    dayPart = dayPart.replace(/^(?:วันที่\.?|วัน\.?|ที่\.?|ว\.ด\.ป\.|ันที่\.?|นที่\.?|ที่)/i, '');
    dayPart = dayPart.replace(/\./g, '');
    dayPart = convertThaiDigits(dayPart).replace(/[ดnl|]/g, '1').replace(/[อoO]/g, '0').replace(/\D/g, '');
    
    // แปลงอักษรในตำแหน่งปี
    yearPart = yearPart.replace(/\./g, '');
    yearPart = convertThaiDigits(yearPart).replace(/[ดnl|]/g, '1').replace(/[อoO]/g, '0').replace(/\D/g, '');
    
    const monthMap = {
      'มกราคม': 1, 'ม.ค.': 1, 'ม.ค': 1,
      'กุมภาพันธ์': 2, 'ก.พ.': 2, 'ก.พ': 2,
      'มีนาคม': 3, 'มี.ค.': 3, 'มี.ค': 3,
      'เมษายน': 4, 'เม.ย.': 4, 'เม.ย': 4, 'ม.ย.': 4, 'ม.ย': 4, 'มย.': 4, 'มย': 4, 'เมย': 4,
      'พฤษภาคม': 5, 'พ.ค.': 5, 'พ.ค': 5,
      'มิถุนายน': 6, 'มิ.ย.': 6, 'มิ.ย': 6,
      'กรกฎาคม': 7, 'ก.ค.': 7, 'ก.ค': 7,
      'สิงหาคม': 8, 'ส.ค.': 8, 'ส.ค': 8,
      'กันยายน': 9, 'ก.ย.': 9, 'ก.ย': 9,
      'ตุลาคม': 10, 'ต.ค.': 10, 'ต.ค': 10,
      'พฤศจิกายน': 11, 'พ.ย.': 11, 'พ.ย': 11,
      'ธันวาคม': 12, 'ธ.ค.': 12, 'ธ.ค': 12
    };
    
    let day = parseInt(dayPart, 10);
    let month = null;
    let year = parseInt(yearPart, 10);
    
    for (const [mName, mVal] of Object.entries(monthMap)) {
      if (monthPart.includes(mName)) {
        month = mVal;
        break;
      }
    }
    
    if (year >= 200 && year <= 299) {
      year = year + 2300;
    } else if (year < 100) {
      year = 2500 + year;
    }
    
    if (year > 2400) {
      year = year - 543;
    }
    
    if (day && month && year) {
      const mm = month.toString().padStart(2, '0');
      const dd = day.toString().padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }
  return null;
}

// ฟังก์ชันช่วยแก้ปัญหาลำดับเวลาไม่ถูกต้อง
function correctChronologicalDate(dateStr, referenceDateStr) {
  if (!dateStr || !referenceDateStr) return dateStr;
  const date = new Date(dateStr);
  const refDate = new Date(referenceDateStr);
  if (date >= refDate) return dateStr;
  
  const parts = dateStr.split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let day = parseInt(parts[2], 10);
  
  if (day >= 1 && day <= 3) {
    const testDay = day * 10;
    const maxDays = new Date(year, month, 0).getDate();
    if (testDay <= maxDays) {
      const testDateStr = `${year}-${month.toString().padStart(2, '0')}-${testDay.toString().padStart(2, '0')}`;
      const testDate = new Date(testDateStr);
      if (testDate >= refDate) {
        return testDateStr;
      }
    }
  }
  
  return dateStr;
}

// ฟังก์ชันดึงข้อมูลวันที่อิงตามคีย์เวิร์ดในบริบท (Context Heuristics)
function extractDateByKeyword(text, keywords) {
  const normText = text.replace(/\s+/g, ' ');
  for (const kw of keywords) {
    const kwIdx = normText.indexOf(kw);
    if (kwIdx === -1) continue;
    
    const segment = normText.substring(kwIdx, kwIdx + 300);
    // ใช้ Regex ที่เป็นมิตรกับความผิดเพี้ยนของตัวอักษรทุกชนิด โดยการใช้ [^\s] แทนการจำกัด character set
    const dateRegex = /(?:วัน(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)|วันที่)?(?:ที่)?\s*([^\s]{1,4}\s+[ก-์.&]{2,12}\s+[^\s]{2,5})/;
    const match = segment.match(dateRegex);
    if (match) {
      const dateStr = match[1];
      const ceDate = parseThaiDateToCE(dateStr);
      if (ceDate) return ceDate;
    }
  }
  return null;
}

// ฟังก์ชันดึงเลขที่เอกสารแบบยืดหยุ่นและรองรับสแลชเพี้ยน
function extractDocId(text) {
  // ดึงเฉพาะ 1,500 ตัวอักษรแรกเพื่อป้องกันไม่ให้ไปดึงเลข Zoom ID หรือเอกสารแนบท้าย
  const headerScope = text.substring(0, 1500);
  const normText = convertThaiDigits(headerScope);
  
  // รองรับคำว่า ที่ / เลขที่ / ที / ที่ ตช / ที่ กษ
  const slashRegex = /(?:ที่|เลขที่|[ททืีิุึั]?[ีิุึั]?)\s*\b([0-9ดอoOn|l.]{2,10}\s*[\/|\\lI1=]\s*[0-9ดอoOn|l=A-Za-z.\-]{1,10})\b/g;
  let match;
  const matches = [];
  
  while ((match = slashRegex.exec(normText)) !== null) {
    const matchedId = match[1];
    const matchEndIdx = match.index + match[0].length;
    const lineStart = normText.lastIndexOf('\n', match.index - 1) + 1;
    const sameLine = normText.substring(lineStart, match.index);
    const contextAfter = normText.substring(matchEndIdx, matchEndIdx + 25);
    
    // ข้ามบรรทัดโทรศัพท์ / Zoom meeting ID / Passcode
    if (sameLine.includes('โทร') || sameLine.includes('zoom') || sameLine.includes('meeting') || sameLine.includes('passcode') || sameLine.includes('id:')) continue;
    if (!contextAfter.includes("ลง") && !contextAfter.includes("ลอ")) {
      matches.push(matchedId);
    }
  }
  
  if (matches.length > 0) {
    // ให้ความสำคัญกับเลขที่มี 00 หรือ ตช / กษ ก่อน
    const mainId = matches.find(id => id.startsWith("00") || id.startsWith("0")) || matches[0];
    const parts = mainId.split(/[\/|\\lI1=]/);
    if (parts.length >= 2) {
      let p1 = parts[0].replace(/[^0-9ดอoOn|l.]/g, '');
      let p2 = parts[1].replace(/[^0-9ดอoOn|l=A-Za-z\-]/g, '');
      
      p1 = p1.replace(/=/g, '4').replace(/[ดnl|]/g, '1').replace(/[อoO]/g, '0');
      p2 = p2.replace(/=/g, '4').replace(/[ดnl|]/g, '1').replace(/[อoO]/g, '0');
      
      return `${p1}/${p2}`;
    }
  }
  
  return null;
}

// ฟังก์ชันสกัดวันเขียนเอกสาร (doc_date) โดยตรวจจับคำสะกดเพี้ยน
function extractDocDate(text) {
  const normText = text.replace(/\s+/g, ' ');
  const dateRegexAll = /(?:วันที่|[วว้นททืีิุึั]{2,6})\s*([^\s]{1,4}\s+[ก-์.&]{2,12}\s+[^\s]{2,5})/gi;
  let match;
  
  while ((match = dateRegexAll.exec(normText)) !== null) {
    const startIdx = match.index;
    const contextBefore = normText.substring(Math.max(0, startIdx - 45), startIdx);
    
    if (!contextBefore.includes("เลขรับ") && !contextBefore.includes("เลชรับ") && !contextBefore.includes("เลซรับ") && !contextBefore.includes("เลขรบ")) {
      const ceDate = parseThaiDateToCE(match[1]);
      if (ceDate) return ceDate;
    }
  }
  
  return null;
}

// ฟังก์ชันแยกส่วนข้อความด้วย Regex ขั้นสูง
exports.parseOcrTextToMemos = function(text) {
  const normText = convertThaiDigits(text);
  
  // 1. ระดับความเร็ว/ด่วน (Fuzzy Match)
  let urgency_level = "ปกติ";
  if (/[ดค]\s*ว\s*น\s*[ททืีิุึั]?[ีิุึั]?\s*ส\s*ุ\s*ด/i.test(normText)) urgency_level = "ด่วนที่สุด";
  else if (/[ดค]\s*ว\s*น\s*ม\s*า\s*ก/i.test(normText)) urgency_level = "ด่วนมาก";
  else if (/[ดค]\s*ว\s*น/i.test(normText)) urgency_level = "ด่วน";
  
  // 2. ระดับความลับ (Fuzzy Match)
  let secret_level = "ปกติ";
  if (/[ลลั]\s*บ\s*[ททืีิุึั]?[ีิุึั]?\s*ส\s*ุ\s*ด/i.test(normText)) secret_level = "ลับที่สุด";
  else if (/[ลลั]\s*บ\s*ม\s*า\s*ก/i.test(normText)) secret_level = "ลับมาก";
  else if (/[ลลั]\s*บ/i.test(normText)) secret_level = "ลับ";
  
  const splitLearnIdx = text.indexOf("เรียน");
  const splitSubjectIdx = text.indexOf("เรื่อง");
  const splitIdx = splitLearnIdx !== -1 && splitSubjectIdx !== -1 ? Math.min(splitLearnIdx, splitSubjectIdx) : (splitLearnIdx !== -1 ? splitLearnIdx : (splitSubjectIdx !== -1 ? splitSubjectIdx : -1));
  
  let headerText = text;
  if (splitIdx !== -1) {
    headerText = text.substring(0, splitIdx);
  }

  // 3. ที่ (เลขที่หนังสือ)
  let doc_id = extractDocId(headerText);
  if (!doc_id) doc_id = extractDocId(text);
  
  // 4. วันที่เอกสาร
  let doc_date = extractDocDate(headerText);
  if (!doc_date) doc_date = extractDocDate(text);
  
  // 5. เรื่อง (รองรับหลายบรรทัดจนถึงก่อนคำว่า เรียน)
  let subject = null;
  const rawSubjectMatch = text.match(/[เแ]\s*[รว]\s*[ืีิุึั]?[่้]?\s*[อ]?\s*[งน]\s*(?!(?:เดิม|รับ|ราก))([\s\S]+?)(?=\r?\n\s*[เแ]\s*[รว]\s*[ีิีุึั]?[ย]?\s*น|$)/i);
  if (rawSubjectMatch) {
    subject = rawSubjectMatch[1].replace(/\s+/g, ' ').trim();
  } else {
    // Fallback แบบเดิม
    const subjectMatch = text.match(/เ\s*ร\s*[ืีิุ]?[่]?\s*[อ]?\s*ง\s*(?!(?:เดิม|รับ))\s*([^\n]*)/);
    if (subjectMatch) {
      let val = subjectMatch[1].trim();
      if (val.length < 2) {
        const remainingText = text.substring(subjectMatch.index + subjectMatch[0].length).trim();
        const lines = remainingText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 0) val = lines[0];
      }
      subject = val;
    }
  }
  
  // 5.1 จาก (sender / ส่วนราชการ)
  let sender_from = null;
  const senderMatch = text.match(/(?:ส่วนราชการ|จาก)\s*[:.\-_]?\s*([^\n]*)/i);
  if (senderMatch) {
    let val = senderMatch[1].trim();
    if (val.length < 2) {
      const remainingText = text.substring(senderMatch.index + senderMatch[0].length).trim();
      const linesS = remainingText.split('\n').map(l => l.trim()).filter(Boolean);
      if (linesS.length > 0) val = linesS[0];
    }
    sender_from = val || null;
  }
  
  // 6. เรียน (Fuzzy Match)
  let learn_to = null;
  const learnMatch = text.match(/[เแ]\s*[รว]\s*[ีิีุึั]?[ย]?\s*[นง]\s*(?!(?:เชิญ|เสนอ|ชี้แจง|มาเพื่อ))\s*([^\n]*)/i);
  if (learnMatch) {
    let val = learnMatch[1].trim();
    if (val.length < 2) {
      const remainingText = text.substring(learnMatch.index + learnMatch[0].length).trim();
      const lines = remainingText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) val = lines[0];
    }
    learn_to = val;
  }
  
  // 6.1 ถึง (recipient_to) - ใช้ค่าจาก "เรียน" เป็น "ถึง"
  let recipient_to = learn_to;
  
  // 6.2 เอกสารข้อมูลเพิ่มเติม (สิ่งที่ส่งมาด้วย)
  let additional_docs = null;
  const addDocsMatch = text.match(/(?:สิ่งที่ส่งมาด้วย|สิ่งที่แนบมาด้วย|เอกสารแนบ|สิ่งที่ส่งมา)\s*(?::?|\s)\s*([^\n]*)/i);
  if (addDocsMatch) {
    let val = addDocsMatch[1].trim();
    if (val.length < 2) {
      const remainingText = text.substring(addDocsMatch.index + addDocsMatch[0].length).trim();
      const lines2 = remainingText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines2.length > 0) val = lines2[0];
    }
    additional_docs = val || null;
  }
  
  // 7. ข้อมูลตรายางประทับรับ (เลขรับ & วันที่รับ)
  let receive_no = null;
  const recNoMatch = text.match(/(?:เลขรับ|เลชรับ|เลซรับ|เลขอรับ|รับที่|เลขที่รับ|เลขรบ|เลขรป|รับ\s*[:.\-_])[\s\S]{0,30}?([๐-๙\d]{1,8})/i) ||
                     text.match(/(?:รับ)[^\d\n]*?([๐-๙\d]{2,6})/i);
  if (recNoMatch) {
    const rawDigits = convertThaiDigits(recNoMatch[1].trim()).replace(/\D/g, '');
    if (rawDigits) receive_no = rawDigits;
  }
  
  // วันที่รับ (receive_date)
  let receive_date = null;
  const cleanText = text.replace(/[\`"'\-_\/\\~]/g, ' ');
  const monthRegexPart = '(?:มี\\.?ค\\.?|มี่\\.?ค\\.?|ม\\.?ค\\.?|ก\\.?พ\\.?|เม\\.?ย\\.?|ม\\.?ย\\.?|มย\\.?|พ\\.?ค\\.?|มิ\\.?ย\\.?|ก\\.?ค\\.?|ส\\.?ค\\.?|ก\\.?ย\\.?|ต\\.?ค\\.?|พ\\.?ย\\.?|ธ\\.?ค\\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)';
  
  const recDateRegex = new RegExp(`(?:เลขรับ|เลชรับ|เลซรับ|เลขอรับ|รับที่|รับ|ส่ง\\.รอง)[\\s\\S]{0,120}?([๐-๙\\d]{1,2})\\s*(${monthRegexPart})\\s*([๐-๙\\d]{2,4})`, 'i');
  const recDateMatch = cleanText.match(recDateRegex);
  if (recDateMatch) {
    receive_date = parseThaiDateToCE(`${recDateMatch[1]} ${recDateMatch[2]} ${recDateMatch[3]}`);
  }
  
  // 8. วันที่ลงนาม (กรองไม่เอาวันนัดหมายหรือวันส่งรายงานรอบข้าง)
  // 8. วันที่ลงนาม
  let sign_date = null;
  const pageBreakSignIdx = cleanText.indexOf('Page Break');
  const signatureBlock = pageBreakSignIdx !== -1 
    ? cleanText.substring(pageBreakSignIdx)
    : cleanText.substring(Math.floor(cleanText.length * 0.5));
    
  let parenNameIdx = -1;
  const parenNameRegex = /\(\s*[ก-์\s]+\s*\)/g;
  let pMatch;
  while ((pMatch = parenNameRegex.exec(signatureBlock)) !== null) {
    parenNameIdx = pMatch.index;
  }
  
  let rankIdx = -1;
  const rankRegex = /(?:พล\.ต\.อ\.|พล\.ต\.ท\.|พล\.ต\.ต\.|พ\.ต\.อ\.|พ\.ต\.ท\.|พ\.ต\.ต\.|ร\.ต\.อ\.|ร\.ต\.ท\.|น\.ส\.|นาย|นาง|รอง\s*ผบ|รอง\s*ผอ|ผกก)/g;
  let rMatch;
  while ((rMatch = rankRegex.exec(signatureBlock)) !== null) {
    rankIdx = rMatch.index;
  }
  
  const signAnchor = Math.max(parenNameIdx, rankIdx);
  
  if (signAnchor !== -1) {
    const searchStart = Math.max(0, signAnchor - 300);
    const searchEnd = Math.min(signatureBlock.length, signAnchor + 400);
    const signArea = signatureBlock.substring(searchStart, searchEnd);
    
    const signDateRegex = new RegExp(`([^\\s]{1,8})\\s*(${monthRegexPart})\\s*([^\\s]{2,8})`, 'g');
    let signMatch;
    let lastValidSignDate = null;
    
    while ((signMatch = signDateRegex.exec(signArea)) !== null) {
      const ceDate = parseThaiDateToCE(signMatch[0]);
      if (ceDate) {
        const year = parseInt(ceDate.split('-')[0], 10);
        if (year >= 2024 && year <= 2030) {
          lastValidSignDate = ceDate;
        }
      }
    }
    
    if (lastValidSignDate) {
      sign_date = lastValidSignDate;
    }
  }
  
  // 9. วันที่ประชุม ( anchored to "ประชุม" )
  let meeting_date = extractMeetingDate(text);
  
  // 10. กำหนดส่งรายงาน/ตอบรับ
  let reply_due_date = extractDateByKeyword(text, ["ตอบรับ", "ภายในวัน", "กำหนดส่ง", "ก่อนวันที่"]);
  
  // 11. เนื้อหาหลัก - ตัดเนื้อหาไม่เอาลายเซ็นส่วนท้ายออก
  let main_text = "";
  const learnIdx = text.indexOf("เรียน");
  if (learnIdx !== -1) {
    main_text = text.substring(learnIdx).trim();
  } else {
    main_text = text;
  }
  
  // ลบส่วนหัวเรียน/เรื่องออกไปให้เหลือแต่ข้อความเนื้อหาจริงๆ
  main_text = main_text.replace(/^[\s\S]*?(?:เรียน|เ\s*ร\s*[ีิ]?[ย]?\s*น)\s*[^\n]*\n/, '').trim();
  
  const pageBreakIdx = main_text.indexOf('--- Page Break ---');
  if (pageBreakIdx !== -1) {
    main_text = main_text.substring(0, pageBreakIdx).trim();
  }
  
  // ตัดท้ายเอกสารที่เป็นคำลงท้ายและลายเซ็นออก เพื่อให้ main_text สั้นกระชับเท่าเทียมกับ Gemini
  const cutKeywords = ["จึงเรียนมาเพื่อ", "จึงเสนอมาเพื่อ", "จึงเรียนมาเพอ", "จึงเสนอมาเพอ"];
  let cutIdx = main_text.length;
  for (const kw of cutKeywords) {
    const idx = main_text.indexOf(kw);
    if (idx !== -1 && idx < cutIdx) {
      cutIdx = idx;
    }
  }
  main_text = main_text.substring(0, cutIdx).trim();
  
  // 12. การมอบหมายงาน (Assignments) & ผู้ออกงาน
  const dynamicAssignments = [];
  const lines = text.split('\n').map(l => l.trim());
  const seenAssignees = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTaskLine = /^[-–—•]\s*\S+/.test(line) && !line.startsWith('--');
    if (isTaskLine) {
      let foundAssigneeText = null;
      for (let j = i - 1; j >= 0; j--) {
        const prevLine = lines[j];
        if (!prevLine) continue;
        
        if (/^[-–—•]\s*\S+/.test(prevLine) || prevLine.length > 60 || prevLine.includes("เรียน") || prevLine.includes("เรื่อง")) {
          break;
        }
        
        foundAssigneeText = prevLine;
        break;
      }
      
      if (foundAssigneeText) {
        const cleanAssigneeLine = foundAssigneeText.replace(/[\(\)]/g, '').trim();
        const parts = cleanAssigneeLine.split(/(?:และ|,|&|\+|\s+และ\s+)/).map(p => p.trim()).filter(Boolean);
        
        for (const part of parts) {
          if (part.length > 2 && part.length < 25 && !/^(ทราบ|เสนอ|พิจารณา|เพื่อ|รอง|ผู้ช่วย)/.test(part)) {
            if (!seenAssignees.has(part)) {
              seenAssignees.add(part);
              dynamicAssignments.push({ responsible_person: part });
            }
          }
        }
      }
    }
  }
  
  // Fallback เป็นลิสต์เดิมหากวิธี Dynamic ตรวจจับไม่เจอ
  if (dynamicAssignments.length === 0) {
    const possibleAssignees = [
      "ผบ.รน.", "รอง ผบ.รน.", "ผกก.", "ฝอ.๑", "ฝอ.๒", "ฝอ.๓", "ฝอ.๔", "ฝอ.๕", "ฝอ.๖", 
      "บก.ปคม.", "ศตม.ภ.๕", "ศตม.ภ.5", "บช.สอท.", "สดม.", "ศตม.", "ผอ.ศตม.ตส.", "ศตคม.ตร.", "ฝอ.ศตคม.ตร."
    ];
    
    const assignIdx = text.indexOf("ข้อพิจารณา") !== -1 ? text.indexOf("ข้อพิจารณา") : Math.floor(text.length * 0.5);
    const endBlock = text.substring(assignIdx);
    
    for (const assignee of possibleAssignees) {
      const normalizedAssignee = convertThaiDigits(assignee);
      const normalizedEndBlock = convertThaiDigits(endBlock);
      if (normalizedEndBlock.includes(normalizedAssignee)) {
        if (!seenAssignees.has(assignee)) {
          seenAssignees.add(assignee);
          dynamicAssignments.push({ responsible_person: assignee });
        }
      }
    }
  }
  
  return {
    "full_text": text,
    "memos": [
      {
        "ที่": convertThaiDigits(doc_id),
        "จาก": sender_from,
        "sender": sender_from,
        "วันที่": doc_date,
        "เวลา": null,
        "เรื่อง": subject,
        "เรียน": learn_to,
        "recipient_to": recipient_to || learn_to,
        "additional_docs": additional_docs,
        "receive_no": receive_no,
        "receive_date": receive_date,
        "sign_date": sign_date,
        "urgency_level": urgency_level,
        "secret_level": secret_level,
        "meeting_date": meeting_date,
        "reply_due_date": reply_due_date,
        "main_text": main_text,
        "task_detail": (() => {
          const taskLines = [];
          const taskKeywords = /^(?:[-–—•]\s*)?(ทราบ|ดำเนินการ|รายงาน|สนับสนุน|ประสาน|พิจารณา|ตรวจสอบ|เสนอ|เพื่อโปรด|เข้าร่วม)/;
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (/^[-–—•]\s*\S+/.test(trimmed) && !trimmed.startsWith('--')) {
              taskLines.push(trimmed);
            } else if (taskKeywords.test(trimmed)) {
              if (!/^[-–—•]/.test(trimmed)) {
                taskLines.push(`- ${trimmed}`);
              } else {
                taskLines.push(trimmed);
              }
            }
          }
          return taskLines.length > 0 ? taskLines.join('\n') : '-';
        })(),
        "assignments": dynamicAssignments
      }
    ]
  };
}

// ฟังก์ชันรัน EasyOCR/Python Script พร้อมแสดงสถานะแบบ Real-time
function runRapidOCR(filePath) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const pythonScript = path.join(__dirname, '..', 'utils', 'ocr_processor.py');
    console.log(`[OCR Engine] เริ่มประมวลผลไฟล์: ${filePath}`);
    
    const child = spawn('python', [pythonScript, filePath], { maxBuffer: 10 * 1024 * 1024 });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      stderr += msg + '\n';
      // Real-time progress logging to console
      if (msg.includes('[OCR')) {
        console.log(`${msg}`);
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error("[OCR Engine] เกิดข้อผิดพลาด:", stderr);
        return reject(new Error(`OCR failed: ${stderr}`));
      }
      try {
        const response = JSON.parse(stdout);
        if (!response.success) {
          return reject(new Error(response.error || "Unknown OCR error"));
        }
        console.log("[OCR Engine] สแกนข้อความและจัดกลุ่มบรรทัดเรียบร้อยแล้ว!");
        resolve(response.text);
      } catch (err) {
        console.error("[OCR Engine] ผลลัพธ์จาก Python ไม่เป็น JSON:", stdout);
        reject(new Error(`Failed to parse OCR output: ${err.message}`));
      }
    });
  });
}

// ฟังก์ชันหลักดึงข้อมูล
exports.extractDataWithGemini = async (filePath, mimeType, engine = 'gemini', options = {}) => {
  if (engine === 'gemini') {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    
    // ดึง API Key และ Gemini Model จาก .env
    const apiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    if (!apiKey) {
      console.error("Warning: GEMINI_API_KEY is not defined in environment variables.");
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);

    try {
      // ดึงเวอร์ชันโมเดลจาก environment variable (GEMINI_MODEL)
      const model = genAI.getGenerativeModel({ model: geminiModel }); 

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
          "จาก": "ระบุข้อความหรือหน่วยงานต้นทางที่อยู่หลังคำว่า 'ส่วนราชการ' หรือ 'จาก' เช่น ฝอ.ศตคม.ตร., ภ.5, บก.สส. (ถ้าไม่มีให้ใส่ null)",
          "วันที่": "ระบุวันที่ (ถ้าไม่มีให้ใส่ null)",
          "เวลา": "ระบุเวลา (ถ้าไม่มีให้ใส่ null)",
          "เรื่อง": "ระบุเรื่อง (ถ้าไม่มีให้ใส่ null)",
          "เรียน": "ระบุผู้ที่เอกสารส่งถึงที่อยู่หลังคำว่า 'เรียน' เช่น รอง ผบ.ตร./ผอ.ศตคม.ตร. (ถ้าไม่มีให้ใส่ null)",
          "ถึง": "ระบุผู้รับปลายทาง หรือหน่วยงานที่เอกสารส่งถึงที่อยู่หลังคำว่า 'เรียน' หรือ 'ถึง' เช่น รอง ผบ.ตร./ผอ.ศตคม.ตร. (ถ้าไม่มีให้ใส่ null)",
          "เอกสารข้อมูลเพิ่มเติม": "ระบุข้อมูลสิ่งที่ส่งมาด้วย หรือเอกสารแนบที่ระบุในเอกสาร เช่น 'สำเนาหนังสือ สน.บางนา 1 ฉบับ' (ถ้าเป็นแค่ข้อความตัวเลขลอยๆ เช่น 'เอกสาร ๑', 'เอกสาร ๒', 'เอกสาร ๓' หรือไม่มีข้อมูล ให้ใส่ null เท่านั้น)",
          "receive_no": "ระบุเลขรับ จากตรายางประทับรับหนังสือ (ถ้าไม่มีให้ใส่ null) **สำคัญ: ต้องระบุเป็นตัวเลขอารบิกเท่านั้น (เช่น 556) ห้ามมีตัวอักษร**",
          "sign_date": "ระบุวันที่ลงนาม จากลายเซ็นท้ายเอกสาร (ถ้าไม่มีให้ใส่ null) **สำคัญ: ต้องระบุในรูปแบบ YYYY-MM-DD เท่านั้น (ปี ค.ศ.)**",
          "urgency_level": "ค้นหาคำว่า ด่วน, ด่วนมาก, ด่วนที่สุด บริเวณหัวเอกสาร ถ้าเจอให้ระบุคำนั้น ถ้าไม่เจอให้ระบุ 'ปกติ'",
          "secret_level": "ค้นหาคำว่า ลับ, ลับมาก, ลับที่สุด บริเวณหัวเอกสาร ถ้าเจอให้ระบุคำนั้น ถ้าไม่เจอให้ระบุ 'ปกติ'",
          "meeting_date": "ระบุวันที่ประชุม หากเอกสารเป็นการนัดประชุมหรือแจ้งกำหนดการประชุม (ถ้าไม่มีให้ใส่ null) **สำคัญ: ต้องระบุในรูปแบบ YYYY-MM-DD เท่านั้น (ปี ค.ศ.) เช่น 2024-07-25**",
          "reply_due_date": "ระบุวันกำหนดส่งแบบตอบรับการเข้าร่วมประชุม (ถ้าไม่มีให้ใส่ null) **สำคัญ: ต้องระบุในรูปแบบ YYYY-MM-DD เท่านั้น (ปี ค.ศ.) เช่น 2024-07-20**",
          "main_text": "ข้อความเนื้อหาเรื่อง/สาระสำคัญทั้งหมดที่อยู่หลังคำว่า 'เรียน' มาจนถึงก่อนส่วนการมอบหมายงานสั่งการท้ายเอกสาร **ห้ามตัดทอนข้อความ ห้ามสรุปความเด็ดขาด ให้ดึงเนื้อหาต้นฉบับมาแบบ 100% ทุกย่อหน้า และห้ามนำข้อความสั่งการ/มอบหมายงานท้ายเอกสารมารวมในนี้**",
          "task_detail": "รายละเอียดสิ่งที่ต้องดำเนินการ/การมอบหมายงานคำสั่งการทั้งหมดที่อยู่บริเวณส่วนสั่งการหรือเหนือ/ใต้ลายเซ็นท้ายเอกสาร (เช่น 'เห็นควรดำเนินการตามเสนอ ผบช.กมค.', '- เป็นผู้แทน ตร. เข้าร่วมประชุมฯ') **คัดลอกข้อความมาแบบ 100% ตามที่ปรากฏจริงในเอกสารเท่านั้น ไม่ว่าจะมีย่อหน้าขีด (-) หรือเป็นข้อความธรรมดาก็ตาม ห้ามเรียบเรียงใหม่ ห้ามแต่งประโยคใหม่เด็ดขาด**",
          "assignments": [
            {
              "responsible_person": "ระบุตัวย่อหรือชื่อยศของผู้รับผิดชอบ เช่น ฝอ.๑, สว.ฝอ.๔, ผกก."
            }
          ]
        }
      ]
    }

    **กฎเกณฑ์สำคัญในการสกัดข้อมูล:**
    1. **memos**: สกัดข้อมูลบันทึกข้อความ หากมีหลายหน้าหรือหลายบันทึก ให้เพิ่ม Object เข้าไปใน Array "memos" เรื่อยๆ
    2. **main_text**: เนื้อหาหลักทั้งหมดที่อยู่หลังคำว่า 'เรียน' มาจนถึงก่อนส่วนสั่งการ/การมอบหมายงานท้ายเอกสาร (ดึงมา 100% ห้ามสรุปความ ห้ามตัดคำทิ้ง และห้ามนำข้อความสั่งการท้ายเอกสารมารวมในนี้)
    3. **task_detail**: ข้อความการสั่งการ/การมอบหมายงานทั้งหมดที่อยู่ท้ายเอกสาร (บริเวณเหนือหรือใต้ลายเซ็น เช่น 'เห็นควรดำเนินการตามเสนอ...', '- รายงานผลการประชุม') ไม่ว่าจะมีย่อหน้าขีด (-) หรือเป็นข้อความธรรมดาก็ตาม ให้สกัดแยกออกมาใส่ใน task_detail 100% (ห้ามทิ้ง และห้ามนำไปรวมใน main_text)
    4. **หลักการมอบหมายงาน (Assignments)**:
        * สังเกตโครงสร้างรายการหลังจาก "เรียน"
        * **"คนที่รับผิดชอบ" (responsible_person)** คือตัวย่อของตำแหน่งหรือยศที่ปรากฏชัดเจน (เช่น 'ฝอ.๑', 'ผกก.ฝอ.๑')
    5. **สำคัญมาก: ห้ามใช้ Emoji หรือ Emoticon ใดๆ ในผลลัพธ์โดยเด็ดขาด ให้ใช้เฉพาะข้อความ Text ปกติเท่านั้น**

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

      if (parsedData && Array.isArray(parsedData.memos)) {
        const { cleanAdditionalDocs } = require('../utils/attachmentSync');
        parsedData.memos.forEach(m => {
          if (m["ที่"]) m["ที่"] = convertThaiDigits(m["ที่"]);
          const addDocs = m["เอกสารข้อมูลเพิ่มเติม"] || m.additional_docs || null;
          if (addDocs) {
            const cleaned = cleanAdditionalDocs(addDocs);
            m["เอกสารข้อมูลเพิ่มเติม"] = cleaned;
            m.additional_docs = cleaned;
          }
        });
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
  } else {
    // ใช้งาน Local OCR (EasyOCR + Python)
    let extractedText = "";
    try {
      extractedText = await runRapidOCR(filePath);
    } catch (ocrError) {
      console.error("Local OCR Error:", ocrError.message);
      throw new Error(`OCR Processing Failed: ${ocrError.message}`);
    }

    try {
      console.log("[Local Parser] กำลังสกัดข้อมูลด้วยระบบวิเคราะห์บริบทขั้นสูง...");
      const result = exports.parseOcrTextToMemos(extractedText);
      
      return {
        text: extractedText,
        extractedData: result.memos || []
      };
    } catch (error) {
      console.error("Local Parser Error:", error.message);
      throw new Error(`Local Parsing Failed: ${error.message}`);
    }
  }
};