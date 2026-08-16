const xlsx = require("xlsx");
const pool = require("../config/db");
const { appendMultipleTasksToSheet, appendTaskToSheet } = require('../services/googleSheetsService');
const { calculateFiscalRoundAndYear, parseAnyDateToIso, formatDateTH } = require("../utils/fiscalYearHelper");
const { syncTaskDocumentNotesFromText, parseAdditionalDocsText } = require("../utils/attachmentSync");
const { cleanToOnlyName } = require("../utils/filenameParser");

const processExcelAssigneesWithMaps = (assigneeStr, userByNameMap, userByCleanNameMap) => {
    if (!assigneeStr || typeof assigneeStr !== 'string') return [];
    const names = assigneeStr.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return [];

    const results = [];
    const addedKeys = new Set();

    for (const nameStr of names) {
        const lower = nameStr.toLowerCase();
        const clean = cleanToOnlyName(nameStr).toLowerCase();
        const matchedUser = userByNameMap.get(lower) || userByCleanNameMap.get(clean);

        const finalUserId = matchedUser ? matchedUser.id : null;
        const finalRoleOrName = matchedUser ? matchedUser.name : nameStr;
        const key = `${finalUserId || ''}_${finalRoleOrName}`;

        if (!addedKeys.has(key)) {
            addedKeys.add(key);
            results.push({ user_id: finalUserId, role_or_name: finalRoleOrName });
        }
    }
    return results;
};

// สร้างตัวแปร Global สำหรับเก็บ Progress 
if (!global.uploadProgress) { 
    global.uploadProgress = {}; 
}

// 💡 ฟังก์ชันใหม่สำหรับส่ง Progress กลับไปให้ Frontend
exports.getUploadProgress = (req, res) => {
    const jobId = req.params.jobId;
    res.json(global.uploadProgress[jobId] || { current: 0, total: 0, status: 'pending' });
};

exports.uploadExcelTasks = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: "กรุณาแนบไฟล์ Excel" });
        }

        const action = req.query.action || "upload";
        const jobId = req.query.jobId; // รับ Job ID มาเพื่อทำ Progress
        
        const filename = req.file.originalname || "";
        // 1. อ่านไฟล์ด้วย exceljs เพื่อดึงสีตัวอักษร เฉพาะไฟล์ Excel
        const ExcelJS = require('exceljs');
        const excelWorkbook = new ExcelJS.Workbook();
        if (!filename.toLowerCase().endsWith(".docx")) {
            await excelWorkbook.xlsx.load(req.file.buffer);
        }

        const redSubjects = new Set();
        if (!filename.toLowerCase().endsWith(".docx")) {
            excelWorkbook.eachSheet((worksheet) => {
            let subjectCol = -1;
            worksheet.eachRow((row, rowNumber) => {
                if (subjectCol === -1) {
                    row.eachCell((cell, colNumber) => {
                        const val = cell.value ? String(cell.value).trim() : '';
                        if (val === 'เรื่อง') subjectCol = colNumber;
                    });
                } else {
                    const cell = row.getCell(subjectCol);
                    let isRed = false;
                    
                    if (cell.value && cell.value.richText) {
                        isRed = cell.value.richText.some(rt => {
                            if (!rt.font || !rt.font.color) return false;
                            
                            // เช็ค Indexed Color (10 = Red)
                            if (rt.font.color.indexed === 10) return true;
                            
                            if (!rt.font.color.argb) return false;
                            
                            const upper = rt.font.color.argb.toUpperCase();
                            if (upper === 'FFFF0000' || upper === 'FF0000') return true;
                            
                            let offset = upper.length === 8 ? 2 : 0;
                            if (upper.length >= 6) {
                                const r = parseInt(upper.substring(offset, offset + 2), 16);
                                const g = parseInt(upper.substring(offset + 2, offset + 4), 16);
                                const b = parseInt(upper.substring(offset + 4, offset + 6), 16);
                                if (r > 150 && g < 100 && b < 100) return true;
                            }
                            return false;
                        });
                    } else if (cell.font && cell.font.color) {
                        if (cell.font.color.indexed === 10) isRed = true;
                        else if (cell.font.color.argb) {
                            const upper = cell.font.color.argb.toUpperCase();
                            if (upper === 'FFFF0000' || upper === 'FF0000') isRed = true;
                            else {
                                let offset = upper.length === 8 ? 2 : 0;
                                if (upper.length >= 6) {
                                    const r = parseInt(upper.substring(offset, offset + 2), 16);
                                    const g = parseInt(upper.substring(offset + 2, offset + 4), 16);
                                    const b = parseInt(upper.substring(offset + 4, offset + 6), 16);
                                    if (r > 150 && g < 100 && b < 100) isRed = true;
                                }
                            }
                        }
                    }
                    
                    if (isRed) {
                        let textValue = cell.value;
                        if (textValue && textValue.richText) {
                            textValue = textValue.richText.map(rt => rt.text).join('');
                        }
                        if (textValue) {
                            redSubjects.add(String(textValue).trim());
                        }
                    }
                }
            });
        });
        }

        // อ่านไฟล์ Excel หรือ Word จาก Buffer ด้วย xlsx เพื่อดึงข้อมูลดิบ
        let workbook;
        if (filename.toLowerCase().endsWith(".docx")) {
            const mammoth = require("mammoth");
            const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
            workbook = xlsx.read(result.value, { type: "string" });
        } else {
            workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        }
        
        let allData = [];

        const parseDateSafe = (d) => {
            if (!d) return null;
            return parseAnyDateToIso(d);
        };

        workbook.SheetNames.forEach(sheetName => {
            const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
            
            rawData.forEach((row, index) => {
                // Find subject/title from multiple possible header keys
                let subject = null;
                for (const key of Object.keys(row)) {
                    if (!key) continue;
                    const cleanKey = key.trim().replace(/\s+/g, '');
                    if (cleanKey === "เรื่อง" || cleanKey === "ชื่อเรื่อง" || cleanKey === "หัวข้อ" || cleanKey === "เรื่อง/งาน" || cleanKey === "ชื่อเอกสาร" || cleanKey === "title") {
                        if (row[key] !== null && row[key] !== undefined && String(row[key]).trim()) {
                            subject = String(row[key]).trim();
                            break;
                        }
                    }
                }

                if (!subject) {
                    if (row["ที่หนังสือ"]) subject = String(row["ที่หนังสือ"]).trim();
                    else if (row["ข้อสั่งการ"]) subject = String(row["ข้อสั่งการ"]).trim();
                    else if (row["เรื่อง"]) subject = String(row["เรื่อง"]).trim();
                }
                
                // ถ้าไม่มีเรื่องหรือข้อมูลงานเลย ให้คัดออก
                if (!subject) return;

                // นำเข้าข้อมูลปกติ ไม่ผูกมัดสีแดงกับงานด่วน
                const isUrgent = false;

                const command = row["ข้อสั่งการ"] ? String(row["ข้อสั่งการ"]).trim() : "";
                
                // แยกย่อยข้อสั่งการด้วยการขึ้นบรรทัดใหม่
                const commandTopics = command 
                    ? command.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0)
                    : [];

                // ค้นหาวันที่รับจากคอลัมน์ที่เป็นไปได้
                let receivedDateInput = null;
                for (const key of Object.keys(row)) {
                    if (!key) continue;
                    const cleanKey = key.trim().replace(/\s+/g, '');
                    if (cleanKey === "วันที่รับ" || cleanKey === "วันที่ลงรับ" || cleanKey === "วันรับ" || cleanKey === "ลงรับ" || cleanKey === "created_at" || cleanKey === "วันที่สร้าง") {
                        if (row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') {
                            receivedDateInput = row[key];
                            break;
                        }
                    }
                }
                let receivedDate = parseDateSafe(receivedDateInput);

                // 🔒 ข้อ 1: ถ้าไม่มีวันที่รับ ให้ข้ามแถวนี้ไปเลย (ไม่นำเข้า)
                if (!receivedDate) return;

                let dueDate = parseDateSafe(row["วันที่"]) || parseDateSafe(row["วันครบกำหนด"]) || parseDateSafe(row["กำหนดส่ง"]);
                
                // ค้นหาเลขรับ (Registration Number) จากคอลัมน์ที่เป็นไปได้
                let receiveNoInput = null;
                for (const key of Object.keys(row)) {
                    if (!key) continue;
                    const cleanKey = key.trim().replace(/\s+/g, '');
                    if (cleanKey === "เลขทะเบียน" || cleanKey === "ทะเบียนรับ" || cleanKey === "ทะเบียน" || cleanKey === "เลขรับ" || cleanKey === "เลขทะเบียนรับ" || cleanKey === "ที่" || cleanKey === "ลำดับ" || cleanKey.includes("เลขทะเบียน") || cleanKey.includes("ทะเบียนรับ")) {
                        if (row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') {
                            receiveNoInput = row[key];
                            break;
                        }
                    }
                }
                
                let receiveNo = null;
                if (receiveNoInput !== null && receiveNoInput !== undefined) {
                    if (typeof receiveNoInput === 'string') {
                        const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
                        receiveNoInput = receiveNoInput.replace(/[๐-๙]/g, match => thaiNumerals[match]);
                    }
                    // ค้นหาตัวเลขแรกที่พบในข้อความ เผื่อมีตัวอักษรนำหน้า
                    const matchNum = String(receiveNoInput).match(/\d+/);
                    const parsedNum = matchNum ? parseInt(matchNum[0], 10) : NaN;
                    receiveNo = isNaN(parsedNum) ? null : parsedNum;
                }

                // ถ้าไม่มีเลขทะเบียน ให้ข้ามแถวนี้ไป
                if (!receiveNo) return;

                // ค้นหาปีทะเบียนจากคอลัมน์ที่เป็นไปได้
                let receiveYearInput = null;
                for (const key of Object.keys(row)) {
                    if (!key) continue;
                    const cleanKey = key.trim().replace(/\s+/g, '');
                    if (cleanKey === "ปีทะเบียน" || cleanKey === "ปี" || cleanKey === "ปีงบประมาณ" || cleanKey === "ปีพ.ศ." || cleanKey === "พ.ศ." || cleanKey === "ปีงบ" || cleanKey === "receive_year") {
                        if (row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') {
                            receiveYearInput = row[key];
                            break;
                        }
                    }
                }

                const { round, fiscalYear, fiscalYearBE } = calculateFiscalRoundAndYear(receivedDate);
                let receiveYear = null;
                if (receiveYearInput !== null && receiveYearInput !== undefined) {
                    let yearClean = String(receiveYearInput).replace(/[๐-๙]/g, match => ({ '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' }[match])).replace(/\D/g, '');
                    let yearNum = parseInt(yearClean, 10);
                    if (!isNaN(yearNum) && yearNum > 0) {
                        receiveYear = yearNum;
                    }
                }
                if (!receiveYear) {
                    receiveYear = fiscalYearBE; // e.g. 2569
                }

                // ถ้าไม่มีข้อมูลช่อง วันที่ (due date) ให้บวกเพิ่ม 14 วันจาก วันที่รับ (received date) หรือวันที่ปัจจุบัน
                if (!dueDate) {
                    const rDate = receivedDate ? new Date(receivedDate) : new Date();
                    rDate.setDate(rDate.getDate() + 14);
                    dueDate = rDate.getFullYear() + '-' + String(rDate.getMonth() + 1).padStart(2, '0') + '-' + String(rDate.getDate()).padStart(2, '0');
                }

                // ค้นหาฟิลด์ต่างๆ จากคอลัมน์ที่เป็นไปได้ (รองรับภาษาไทยหลายแบบ)
                let excelSender = null;
                let excelRecipientTo = null;
                let excelAdditionalDocs = null;
                let excelDocumentLink = null;
                let excelMemoNo = null;
                let excelMemoDate = null;
                let excelSignedDate = null;
                let excelMeetingDate = null;
                let excelReplyDueDate = null;
                let excelUrgencyLevel = null;
                let excelSecretLevel = null;

                for (const key of Object.keys(row)) {
                    if (!key) continue;
                    const cleanKey = key.trim().replace(/\s+/g, '');
                    const val = row[key];
                    if (val === null || val === undefined || val === '') continue;

                    let strVal = null;
                    let linkVal = null;

                    if (typeof val === 'object') {
                        strVal = val.text ? String(val.text).trim() : (val.result ? String(val.result).trim() : String(val).trim());
                        linkVal = val.hyperlink || val.target || null;
                    } else {
                        strVal = String(val).trim();
                        if (strVal.startsWith('http://') || strVal.startsWith('https://')) {
                            linkVal = strVal;
                        }
                    }

                    // 1. จาก / ผู้ส่ง
                    if (cleanKey === "จาก" || cleanKey === "ส่วนราชการ" || cleanKey === "ผู้ส่ง" || cleanKey === "หน่วยงาน" || cleanKey === "หน่วยงานผู้ส่ง") {
                        if (!excelSender) excelSender = strVal;
                    }
                    // 2. ถึง / ผู้รับ
                    if (cleanKey === "ถึง" || cleanKey === "เรียน" || cleanKey === "ผู้รับ" || cleanKey === "หน่วยงานรับ") {
                        if (!excelRecipientTo) excelRecipientTo = strVal;
                    }
                    // 3. เอกสารข้อมูลเพิ่มเติม / เอกสารเพิ่มเติม / เอกสารแนบ / สิ่งที่ส่งมาด้วย
                    if (
                        cleanKey === "เอกสารข้อมูลเพิ่มเติม" || 
                        cleanKey === "เอกสารเพิ่มเติม" || 
                        cleanKey === "สิ่งที่ส่งมาด้วย" || 
                        cleanKey === "สิ่งที่ส่งมา" || 
                        cleanKey === "เอกสารแนบ" || 
                        cleanKey === "เอกสารประกอบ" ||
                        cleanKey === "รายละเอียดเพิ่มเติม" ||
                        cleanKey === "เพิ่มเติม" ||
                        cleanKey.includes("เอกสารเพิ่มเติม") ||
                        cleanKey.includes("สิ่งที่ส่งมา") ||
                        cleanKey.includes("เอกสารแนบ") ||
                        cleanKey.includes("เอกสารประกอบ")
                    ) {
                        if (!excelAdditionalDocs) {
                            excelAdditionalDocs = strVal || linkVal;
                        }
                    }
                    // 4. ลิงก์ไฟล์ต้นฉบับ / ลิงก์เอกสาร / Google Drive Link
                    if (
                        cleanKey === "ลิงก์ไฟล์ต้นฉบับ" || 
                        cleanKey === "ลิงก์ต้นฉบับ" || 
                        cleanKey === "ไฟล์ต้นฉบับ" || 
                        cleanKey === "เอกสารต้นฉบับ" ||
                        cleanKey === "ลิงก์เอกสาร" || 
                        cleanKey === "ลิงก์ไฟล์" || 
                        cleanKey === "ลิงก์" || 
                        cleanKey === "URL" || 
                        cleanKey === "document_link" || 
                        cleanKey === "drive_web_view_link" ||
                        cleanKey.includes("ลิงก์") ||
                        cleanKey.includes("ต้นฉบับ") ||
                        cleanKey.includes("document_link") ||
                        cleanKey.includes("drive_link")
                    ) {
                        if (!excelDocumentLink) {
                            excelDocumentLink = linkVal || strVal;
                        }
                    }
                    // 5. ที่หนังสือ
                    if (cleanKey === "ที่หนังสือ" || cleanKey === "เลขที่หนังสือ" || cleanKey === "ที่") {
                        if (!excelMemoNo) excelMemoNo = strVal;
                    }
                    // 6. ลงวันที่
                    if (cleanKey === "ลงวันที่" || cleanKey === "วันที่ลง" || cleanKey === "วันที่หนังสือ" || cleanKey === "วันที่เอกสาร" || cleanKey === "memo_date") {
                        if (!excelMemoDate) excelMemoDate = strVal || val;
                    }
                    // 7. วันที่ลงนาม
                    if (cleanKey === "วันที่ลงนาม" || cleanKey === "วันลงนาม" || cleanKey === "ลงนาม" || cleanKey === "sign_date") {
                        if (!excelSignedDate) excelSignedDate = strVal || val;
                    }
                    // 8. วันประชุม
                    if (cleanKey === "วันประชุม" || cleanKey === "วันที่ประชุม" || cleanKey === "meeting_date") {
                        if (!excelMeetingDate) excelMeetingDate = strVal || val;
                    }
                    // 9. กำหนดส่งตอบรับ
                    if (cleanKey === "กำหนดส่งตอบรับ" || cleanKey === "กำหนดตอบกลับ" || cleanKey === "วันกำหนดตอบกลับ" || cleanKey === "reply_due_date") {
                        if (!excelReplyDueDate) excelReplyDueDate = strVal || val;
                    }
                    // 10. ความเร่งด่วน
                    if (cleanKey === "ความเร่งด่วน" || cleanKey === "ระดับความเร่งด่วน" || cleanKey === "ชั้นความเร่งด่วน" || cleanKey === "ชั้นความเร็ว") {
                        if (!excelUrgencyLevel) excelUrgencyLevel = strVal;
                    }
                    // 11. ความลับ
                    if (cleanKey === "ความลับ" || cleanKey === "ชั้นความลับ" || cleanKey === "ระดับความลับ") {
                        if (!excelSecretLevel) excelSecretLevel = strVal;
                    }
                }

                const parsedDocs = parseAdditionalDocsText(excelAdditionalDocs);

                const computedUrgency = excelUrgencyLevel || row["ชั้นความเร็ว"] || row["ระดับความเร่งด่วน"] || row["ความเร่งด่วน"] ? String(excelUrgencyLevel || row["ชั้นความเร็ว"] || row["ระดับความเร่งด่วน"] || row["ความเร่งด่วน"]).trim() : "ปกติ";
                const computedSecret = excelSecretLevel || row["ชั้นความลับ"] || row["ความลับ"] ? String(excelSecretLevel || row["ชั้นความลับ"] || row["ความลับ"]).trim() : "ปกติ";

                allData.push({
                    original_row: index + 1,
                    received_date: formatDateTH(receivedDate),
                    receive_no: receiveNo,
                    receive_year: receiveYear,
                    round: round,
                    memo_no: excelMemoNo || (row["ที่หนังสือ"] ? String(row["ที่หนังสือ"]).trim() : null),
                    memo_date: formatDateTH(excelMemoDate || row["ลงวันที่"]),
                    sender: excelSender || (row["จาก"] ? String(row["จาก"]).trim() : null),
                    recipient_to: excelRecipientTo || (row["ถึง"] || row["เรียน"] ? String(row["ถึง"] || row["เรียน"]).trim() : null),
                    additional_docs: excelAdditionalDocs || null,
                    parsed_docs: parsedDocs,
                    document_link: excelDocumentLink || null,
                    title: subject || "ไม่มีชื่องาน",
                    assignee_name: row["ผู้ปฏิบัติ"] ? String(row["ผู้ปฏิบัติ"]).trim() : null,
                    due_date_str: formatDateTH(dueDate),
                    main_text: subject || null,
                    command_text: commandTopics, // Send array of topics
                    signed_date: formatDateTH(excelSignedDate || row["วันที่ลงนาม"]),
                    meeting_date: formatDateTH(excelMeetingDate || row["วันประชุม"]),
                    reply_due_date: formatDateTH(excelReplyDueDate || row["กำหนดส่งตอบรับ"]),
                    urgency_level: computedUrgency,
                    secret_level: computedSecret,
                    notes: row["หมายเหตุ"] ? String(row["หมายเหตุ"]).trim() : null,
                    is_urgent: computedUrgency !== "ปกติ" ? true : isUrgent,
                    raw_data: row
                });
            });
        });

        // 🟢 โหมดพรีวิว (ส่งข้อมูลกลับไปแสดงผล)
        if (action === "preview") {
            return res.status(200).json({ 
                success: true, 
                message: "ดึงข้อมูลพรีวิวสำเร็จ",
                total_rows: allData.length, 
                preview_data: allData 
            });
        }

        // 🔵 โหมดบันทึกจริง (Upload)
        const created_by = req.user ? req.user.id : null;
        let successCount = 0;
        let errors = [];

        // ตั้งค่า Progress เริ่มต้น
        if (jobId) {
            global.uploadProgress[jobId] = { current: 0, total: allData.length, status: 'processing' };
        }

        // Cache users once in memory for high-performance assignee mapping
        const { rows: allUsers } = await pool.query('SELECT id, name FROM users');
        const userByNameMap = new Map();
        const userByCleanNameMap = new Map();
        for (const u of allUsers) {
            userByNameMap.set(u.name.trim().toLowerCase(), u);
            const clean = cleanToOnlyName(u.name).trim().toLowerCase();
            if (clean) userByCleanNameMap.set(clean, u);
        }

        let processedCount = 0;
        const createdTaskIds = [];
        const updatedTaskIds = [];
        
        const CHUNK_SIZE = 500; // Process 500 items at a time per chunk

        for (let i = 0; i < allData.length; i += CHUNK_SIZE) {
            const chunk = allData.slice(i, i + CHUNK_SIZE);
            
            try {
                // Step 1: Pre-fetch existing tasks for this chunk by (receive_no, receive_year, round)
                const conditions = [];
                const params = [];
                let paramIdx = 1;
                const setKeys = new Set();
                
                chunk.forEach(item => {
                    if (item.receive_no && item.receive_year) {
                        const key = `${item.receive_no}_${item.receive_year}_${item.round || 1}`;
                        if (!setKeys.has(key)) {
                            setKeys.add(key);
                            conditions.push(`(receive_no = $${paramIdx++} AND (receive_year = $${paramIdx++} OR receive_year = $${paramIdx++}) AND COALESCE(round, 1) = $${paramIdx++})`);
                            params.push(item.receive_no, item.receive_year, item.receive_year > 2400 ? item.receive_year - 543 : item.receive_year + 543, item.round || 1);
                        }
                    }
                });
                
                let existingMap = {};
                if (conditions.length > 0) {
                    const query = `SELECT id, receive_no, receive_year, COALESCE(round, 1) as round FROM tasks WHERE ${conditions.join(' OR ')}`;
                    const { rows } = await pool.query(query, params);
                    rows.forEach(r => {
                        existingMap[`${r.receive_no}_${r.receive_year}_${r.round}`] = r.id;
                        const altYear = r.receive_year > 2400 ? r.receive_year - 543 : r.receive_year + 543;
                        existingMap[`${r.receive_no}_${altYear}_${r.round}`] = r.id;
                    });
                }

                // Step 2: Separate into inserts and updates
                const toInsert = [];
                const toUpdate = [];
                const pendingInsertKeys = new Map();

                chunk.forEach(item => {
                    const key = (item.receive_no && item.receive_year) ? `${item.receive_no}_${item.receive_year}_${item.round || 1}` : null;
                    const existingId = key ? existingMap[key] : null;

                    if (existingId) {
                        toUpdate.push({ ...item, id: existingId });
                    } else if (key && pendingInsertKeys.has(key)) {
                        const insertIdx = pendingInsertKeys.get(key);
                        toUpdate.push({ ...item, _deferredKeyIndex: insertIdx });
                    } else {
                        if (key) {
                            pendingInsertKeys.set(key, toInsert.length);
                        }
                        toInsert.push(item);
                    }
                });

                // Step 3: Bulk Insert for new items
                if (toInsert.length > 0) {
                    let valuesPlaceholders = [];
                    let flatValues = [];
                    let counter = 1;

                    toInsert.forEach(item => {
                        let parsedDueDate = parseDateSafe(item.due_date_str);
                        let parsedMemoDate = parseDateSafe(item.memo_date);
                        let parsedCreatedAt = parseDateSafe(item.received_date) || new Date().toISOString().split('T')[0];
                        let parsedSignedDate = parseDateSafe(item.signed_date);
                        let parsedMeetingDate = parseDateSafe(item.meeting_date);
                        let parsedReplyDueDate = parseDateSafe(item.reply_due_date);

                        let safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                        let safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                        let safeSender = item.sender ? String(item.sender) : null;
                        let safeTaskDetail = item.command_text && item.command_text.length > 0 ? item.command_text.join('\n') : null;

                        let safeRecipientTo = item.recipient_to ? String(item.recipient_to) : null;
                        let safeAdditionalDocs = item.additional_docs ? String(item.additional_docs) : null;

                        let rowPlaceholders = [];
                        for(let j = 0; j < 21; j++) rowPlaceholders.push(`$${counter++}`);
                        valuesPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
                        
                        flatValues.push(
                            safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, 
                            safeSender, parsedDueDate, created_by, parsedCreatedAt, safeTaskDetail, item.is_urgent,
                            item.receive_no, item.receive_year, item.round || 1, parsedSignedDate, 
                            parsedMeetingDate, parsedReplyDueDate, item.urgency_level || 'ปกติ', item.secret_level || 'ปกติ',
                            safeRecipientTo, safeAdditionalDocs
                        );
                    });

                    const taskQuery = `
                        INSERT INTO tasks 
                        (title, memo_no, memo_date, main_text, notes, sender, due_date, created_by, created_at, task_detail, is_urgent, receive_no, receive_year, round, sign_date, meeting_date, reply_due_date, urgency_level, secret_level, recipient_to, additional_docs) 
                        VALUES ${valuesPlaceholders.join(', ')} 
                        RETURNING id
                    `;

                    const taskRes = await pool.query(taskQuery, flatValues);
                    
                    let assignPlaceholders = [];
                    let assignFlatValues = [];
                    let assignCounter = 1;

                    await Promise.all(taskRes.rows.map(async (row, idx) => {
                        const taskId = row.id;
                        createdTaskIds.push(taskId);
                        const item = toInsert[idx];
                        
                        toUpdate.forEach(uItem => {
                            if (uItem._deferredKeyIndex === idx) {
                                uItem.id = taskId;
                            }
                        });
                        
                        const assignee = item.assignee_name;
                        if (assignee) {
                            const processed = processExcelAssigneesWithMaps(String(assignee), userByNameMap, userByCleanNameMap);
                            for (const ass of processed) {
                                assignPlaceholders.push(`($${assignCounter++}, $${assignCounter++}, $${assignCounter++})`);
                                assignFlatValues.push(taskId, ass.user_id, ass.role_or_name);
                            }
                        }

                        if (item.additional_docs !== null) {
                            syncTaskDocumentNotesFromText(pool, taskId, item.additional_docs).catch(e => console.error(e));
                        }

                        if (item.document_link) {
                            const linkStr = String(item.document_link).trim();
                            let docId = null;
                            const docCheck = await pool.query('SELECT id FROM documents WHERE drive_web_view_link = $1 LIMIT 1', [linkStr]);
                            if (docCheck.rows.length > 0) {
                                docId = docCheck.rows[0].id;
                            } else {
                                const newDoc = await pool.query(
                                    'INSERT INTO documents (filename, drive_web_view_link, created_by) VALUES ($1, $2, $3) RETURNING id',
                                    [item.title || 'เอกสารต้นฉบับ', linkStr, created_by]
                                );
                                docId = newDoc.rows[0].id;
                            }
                            if (docId) {
                                await pool.query('UPDATE tasks SET document_id = $1 WHERE id = $2', [docId, taskId]);
                            }
                        }
                    }));

                    if (assignPlaceholders.length > 0) {
                        const BATCH_SIZE = 500;
                        for (let a = 0; a < assignPlaceholders.length; a += BATCH_SIZE) {
                            const slicePlaceholders = assignPlaceholders.slice(a, a + BATCH_SIZE);
                            const sliceFlat = assignFlatValues.slice(a * 3, (a + BATCH_SIZE) * 3);
                            let reindexedPlaceholders = [];
                            let reCounter = 1;
                            for (let p = 0; p < slicePlaceholders.length; p++) {
                                reindexedPlaceholders.push(`($${reCounter++}, $${reCounter++}, $${reCounter++})`);
                            }
                            await pool.query(`INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ${reindexedPlaceholders.join(', ')}`, sliceFlat);
                        }
                    }
                }

                // Step 4: Process Updates in sub-batches of 25 to preserve DB pool connections
                if (toUpdate.length > 0) {
                    const UPDATE_SUB_BATCH = 25;
                    for (let u = 0; u < toUpdate.length; u += UPDATE_SUB_BATCH) {
                        const updateSlice = toUpdate.slice(u, u + UPDATE_SUB_BATCH);
                        await Promise.all(updateSlice.map(async (item) => {
                            try {
                                const taskId = item.id;
                                let parsedDueDate = parseDateSafe(item.due_date_str);
                                let parsedMemoDate = parseDateSafe(item.memo_date);
                                let parsedSignedDate = parseDateSafe(item.signed_date);
                                let parsedMeetingDate = parseDateSafe(item.meeting_date);
                                let parsedReplyDueDate = parseDateSafe(item.reply_due_date);

                                let safeTitle = item.title ? String(item.title) : 'ไม่มีชื่อเรื่อง';
                                let safeMemoNo = item.memo_no ? String(item.memo_no) : null;
                                let safeSender = item.sender ? String(item.sender) : null;
                                let safeTaskDetail = item.command_text && item.command_text.length > 0 ? item.command_text.join('\n') : null;

                                let safeRecipientTo = item.recipient_to ? String(item.recipient_to) : null;
                                let safeAdditionalDocs = item.additional_docs ? String(item.additional_docs) : null;

                                await pool.query(
                                    `UPDATE tasks SET 
                                       title = COALESCE($1, title), 
                                       memo_no = COALESCE($2, memo_no), 
                                       memo_date = COALESCE($3, memo_date), 
                                       main_text = COALESCE($4, main_text), 
                                       notes = COALESCE($5, notes), 
                                       sender = COALESCE($6, sender), 
                                       due_date = COALESCE($7, due_date), 
                                       task_detail = COALESCE($8, task_detail), 
                                       is_urgent = COALESCE($9, is_urgent), 
                                       sign_date = COALESCE($10, sign_date), 
                                       meeting_date = COALESCE($11, meeting_date), 
                                       reply_due_date = COALESCE($12, reply_due_date), 
                                       urgency_level = COALESCE($13, urgency_level), 
                                       secret_level = COALESCE($14, secret_level), 
                                       recipient_to = COALESCE($15, recipient_to), 
                                       additional_docs = COALESCE($16, additional_docs), 
                                       round = COALESCE($17, round), 
                                       updated_at = NOW() 
                                     WHERE id = $18`,
                                    [safeTitle, safeMemoNo, parsedMemoDate, item.main_text, item.notes, safeSender, parsedDueDate, safeTaskDetail, item.is_urgent, parsedSignedDate, parsedMeetingDate, parsedReplyDueDate, item.urgency_level || 'ปกติ', item.secret_level || 'ปกติ', safeRecipientTo, safeAdditionalDocs, item.round || 1, taskId]
                                );
                                
                                pool.query(
                                    `INSERT INTO task_logs (task_id, user_id, action, details) VALUES ($1, $2, 'reuploaded_excel_task', $3)`,
                                    [taskId, created_by, JSON.stringify({ filename, original_row: item.original_row })]
                                ).catch(e => console.error(e));

                                if (safeAdditionalDocs !== null) {
                                    syncTaskDocumentNotesFromText(pool, taskId, safeAdditionalDocs).catch(e => console.error(e));
                                }

                                if (item.document_link) {
                                    const linkStr = String(item.document_link).trim();
                                    let docId = null;
                                    const docCheck = await pool.query('SELECT id FROM documents WHERE drive_web_view_link = $1 LIMIT 1', [linkStr]);
                                    if (docCheck.rows.length > 0) {
                                        docId = docCheck.rows[0].id;
                                    } else {
                                        const newDoc = await pool.query(
                                            'INSERT INTO documents (filename, drive_web_view_link, created_by) VALUES ($1, $2, $3) RETURNING id',
                                            [safeTitle || 'เอกสารต้นฉบับ', linkStr, created_by]
                                        );
                                        docId = newDoc.rows[0].id;
                                    }
                                    if (docId) {
                                        await pool.query('UPDATE tasks SET document_id = COALESCE(document_id, $1) WHERE id = $2', [docId, taskId]);
                                    }
                                }

                                updatedTaskIds.push(taskId);
                                if (item.assignee_name) {
                                    await pool.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
                                    const processed = processExcelAssigneesWithMaps(String(item.assignee_name), userByNameMap, userByCleanNameMap);
                                    for (const ass of processed) {
                                        await pool.query(`INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3)`, [taskId, ass.user_id, ass.role_or_name]);
                                    }
                                }
                            } catch (err) {
                                errors.push(`ข้อผิดพลาดแถวที่ ${item.original_row} (Update): ${err.message}`);
                            }
                        }));
                    }
                }

                successCount += chunk.length;
            } catch (err) {
                errors.push(`เกิดข้อผิดพลาดในการประมวลผล Chunk: ${err.message}`);
            }

            processedCount += chunk.length;
            if (jobId && global.uploadProgress[jobId]) {
                global.uploadProgress[jobId].current = Math.min(processedCount, allData.length);
            }
        }

        // Sync to Google Sheets asynchronously in background without blocking HTTP response
        try {
            const allAffectedIds = [...createdTaskIds, ...updatedTaskIds];
            if (allAffectedIds.length > 0) {
                const getFullData = async (ids) => {
                    const query = `
                        SELECT t.*, d.drive_web_view_link as document_link,
                        (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge"
                        FROM tasks t 
                        LEFT JOIN documents d ON t.document_id = d.id
                        WHERE t.id = ANY($1)
                    `;
                    const { rows } = await pool.query(query, [ids]);
                    return rows;
                };

                getFullData(allAffectedIds)
                    .then(data => appendMultipleTasksToSheet(data))
                    .catch(e => console.error("[Google Sheets Sync Error]", e.message));
            }
        } catch (e) {
            console.error("Sheet sync error in uploadExcelTasks", e.message);
        }

        // เมื่อทำงานเสร็จ เปลี่ยนสถานะเป็น completed
        if (jobId && global.uploadProgress[jobId]) {
            global.uploadProgress[jobId].status = 'completed';
            global.uploadProgress[jobId].current = allData.length;
        }

        if (successCount === 0 && allData.length > 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่สามารถบันทึกข้อมูลได้เลย: ${errors[0] || 'เกิดข้อผิดพลาด'}`
            });
        }

        res.status(200).json({
            success: true,
            message: `บันทึกข้อมูลสำเร็จ ${successCount} จาก ${allData.length} รายการ`,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error("Excel Upload Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
    }
};