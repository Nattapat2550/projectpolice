const parseSuryaOutput = (rawText) => {
    // กำหนดโครงสร้างเริ่มต้น
    const result = {
        full_text: rawText,
        memos: [
            {
                "ที่": null,
                "วันที่": null,
                "เวลา": null,
                "เรื่อง": null,
                "เรียน": null,
                "main_text": "",
                "assignments": []
            }
        ]
    };

    const memo = result.memos[0];
    const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let mainTextStarted = false;
    let currentMainText = [];
    
    // รูปแบบการดึงข้อมูล
    // เราจะใช้ Regex แบบยืดหยุ่นเพื่อรับมือกับความผิดพลาดของ OCR
    const extractRegex = (regex, line) => {
        const match = line.match(regex);
        return match ? match[1].trim() : null;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!memo["ที่"]) {
            const match = extractRegex(/^(?:ที่|ท)\s*(.+)/, line);
            if (match) memo["ที่"] = match;
        }
        
        if (!memo["วันที่"]) {
            const match = extractRegex(/^(?:วันที่|วนท)\s*(.+)/, line);
            if (match) memo["วันที่"] = match;
        }

        if (!memo["เรื่อง"]) {
            const match = extractRegex(/^(?:เรื่อง|เรือง|เรอง)\s*(.+)/, line);
            if (match) memo["เรื่อง"] = match;
        }

        if (!memo["เรียน"]) {
            const match = extractRegex(/^(?:เรียน|เรยน)\s*(.+)/, line);
            if (match) {
                memo["เรียน"] = match;
                mainTextStarted = true;
                continue; // ข้ามบรรทัดนี้ไป ไม่ต้องเอาลง main_text
            }
        }

        if (mainTextStarted) {
            currentMainText.push(line);
        }
    }

    memo.main_text = currentMainText.join('\n');

    // การดึง Assignments (พยายามเดาจาก pattern)
    let currentResponsiblePerson = null;
    
    for (let i = 0; i < currentMainText.length; i++) {
        const line = currentMainText[i];
        
        // ถ้าเจอคำที่น่าจะเป็นตำแหน่ง (มีจุด เช่น ฝอ.๑, ผกก.ฝอ., ภ.จว.)
        const posMatch = line.match(/([ก-ฮa-zA-Z]+\.[ก-ฮa-zA-Z0-9.]+)/);
        if (posMatch) {
            currentResponsiblePerson = posMatch[1];
        }

        // ถ้าเจอหัวข้อย่อยที่ขึ้นต้นด้วย - หรือ ๑. ๒.
        if (line.match(/^[-–—]\s*/) || line.match(/^[๐-๙0-9]+\.\s*/)) {
            const topicClean = line.replace(/^[-–—]\s*/, '').replace(/^[๐-๙0-9]+\.\s*/, '');
            
            // หา assignment ของคนนี้ว่ามีหรือยัง
            let assign = memo.assignments.find(a => a.responsible_person === currentResponsiblePerson);
            if (!assign) {
                assign = { responsible_person: currentResponsiblePerson || "ไม่ระบุตำแหน่ง", topics: [] };
                memo.assignments.push(assign);
            }
            assign.topics.push(topicClean);
        }
    }

    return result;
};

module.exports = { parseSuryaOutput };
