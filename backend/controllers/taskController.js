const pool = require('../config/db');
const fs = require('fs').promises;
const path = require('path'); // เพิ่ม module path สำหรับป้องกัน Path Traversal
const { uploadToDrive, deleteFromDrive, renameFileOnDrive } = require('../services/googleDriveService');
const { appendTaskToSheet, appendMultipleTasksToSheet, updateTaskInSheet } = require('../services/googleSheetsService');
const { generateHash } = require('../utils/duplicateChecker');
const { formatStandardFilename } = require('../utils/filenameParser');
const { extractDataWithGemini } = require('../services/ocrService');

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; 
// กำหนดโฟลเดอร์สำหรับเก็บไฟล์ชั่วคราวให้ชัดเจน (แก้ไข path ให้ตรงกับที่ตั้งโฟลเดอร์ uploads ของคุณ)
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads'); 

// Helper function to validate UUID
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
};

// Helper function to parse Thai date string into YYYY-MM-DD
const parseThaiDateToIso = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  // If it's already in YYYY-MM-DD format, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr.trim();
  
  // Convert Thai numerals to Arabic numerals
  const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
  let normalizedStr = dateStr.replace(/[๐-๙]/g, match => thaiNumerals[match]);
  
  const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const thaiMonthsAbbr = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  
  const regex = /(\d{1,2})\s*(.+?)\s*(\d{4})/;
  const match = normalizedStr.match(regex);
  
  if (!match) return null;
  
  const day = parseInt(match[1]).toString().padStart(2, '0');
  const monthStr = match[2].trim();
  let year = parseInt(match[3]);
  
  if (year > 2400) year -= 543;
  
  let monthIndex = thaiMonths.findIndex(m => m === monthStr);
  if (monthIndex === -1) monthIndex = thaiMonthsAbbr.findIndex(m => m === monthStr);
  if (monthIndex === -1) monthIndex = thaiMonths.findIndex(m => monthStr.includes(m));
  
  if (monthIndex === -1) return null;
  
  const month = (monthIndex + 1).toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

// Helper function to log task actions
const logTaskAction = async (clientOrPool, taskId, userId, action, details) => {
  try {
    if (!taskId) return;
    await clientOrPool.query(
      `INSERT INTO task_logs (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
      [taskId, userId || null, action, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error("Error logging task action:", err.message);
  }
};

// Helper function to handle receive_no and receive_year logic
const handleReceiveNoAndYear = async (client, inputReceiveNo, parsedReceiveDate) => {
    let receiveNoInput = inputReceiveNo;
    if (typeof receiveNoInput === 'string') {
        const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
        receiveNoInput = receiveNoInput.replace(/[๐-๙]/g, match => thaiNumerals[match]);
    }
    
    let receiveNo = parseInt(receiveNoInput, 10) || null;
    let receiveYear = parsedReceiveDate ? new Date(parsedReceiveDate).getFullYear() : new Date().getFullYear();

    if (!receiveNo) {
        // Generate new sequential number for this year
        const res = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1', [receiveYear]);
        receiveNo = (res.rows[0].max_no || 0) + 1;
    }
    return { receiveNo, receiveYear };
};

exports.getAllTasks = async (req, res) => {
  try {
    const query = `
      WITH unique_assignees AS (
        SELECT DISTINCT 
          ta.task_id, 
          COALESCE(u.name, ta.role_or_name) AS name, 
          COALESCE(u.color, '#e5e7eb') AS color
        FROM task_assignments ta
        LEFT JOIN users u ON ta.user_id = u.id
        WHERE COALESCE(u.name, ta.role_or_name) IS NOT NULL
      ),
      agg_assignees AS (
        SELECT 
          task_id,
          STRING_AGG(name, ', ') AS "personInCharge",
          JSON_AGG(json_build_object('name', name, 'color', color)) AS "assigneesData"
        FROM unique_assignees
        GROUP BY task_id
      )
      SELECT 
        t.id AS id, 
        t.title AS name, 
        COALESCE(aa."personInCharge", 'ไม่ระบุ') AS "personInCharge", 
        COALESCE(aa."assigneesData", '[]'::json) AS "assigneesData",
        TO_CHAR(t.due_date, 'YYYY-MM-DD') AS date, 
        t.created_at AS "createdAt",
        t.status,
        t.is_urgent AS "isUrgent",
        t.urgency_level,
        t.secret_level,
        t.meeting_date,
        t.reply_due_date,
        t.receive_no,
        t.receive_year,
        t.memo_no,
        t.memo_date,
        t.sender,
        t.recipient_to,
        t.additional_docs
      FROM tasks t
      LEFT JOIN agg_assignees aa ON t.id = aa.task_id
      ORDER BY t.due_date ASC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getUrgentTasks = async (req, res) => {
  try {
    const query = `
      WITH unique_assignees AS (
        SELECT DISTINCT 
          ta.task_id, 
          COALESCE(u.name, ta.role_or_name) AS name, 
          COALESCE(u.color, '#e5e7eb') AS color
        FROM task_assignments ta
        LEFT JOIN users u ON ta.user_id = u.id
        WHERE COALESCE(u.name, ta.role_or_name) IS NOT NULL
      ),
      agg_assignees AS (
        SELECT 
          task_id,
          STRING_AGG(name, ', ') AS "personInCharge",
          JSON_AGG(json_build_object('name', name, 'color', color)) AS "assigneesData"
        FROM unique_assignees
        GROUP BY task_id
      )
      SELECT 
        t.id AS id, 
        t.title AS name, 
        COALESCE(aa."personInCharge", 'ไม่ระบุ') AS "personInCharge", 
        COALESCE(aa."assigneesData", '[]'::json) AS "assigneesData",
        TO_CHAR(t.due_date, 'YYYY-MM-DD') AS date, 
        t.created_at AS "createdAt",
        t.status,
        t.is_urgent AS "isUrgent",
        t.urgency_level,
        t.secret_level,
        t.meeting_date,
        t.reply_due_date,
        t.receive_no,
        t.receive_year,
        t.memo_no,
        t.memo_date,
        t.sender,
        t.recipient_to,
        t.additional_docs
      FROM tasks t
      LEFT JOIN agg_assignees aa ON t.id = aa.task_id
      WHERE t.is_urgent = true
      ORDER BY t.due_date ASC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Task not found' });
    
    // Log the action
    await logTaskAction(pool, id, req.user?.id, 'updated_status', { new_status: status });

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Update status error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.confirmTasks = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { fileInfo, memos, createdBy } = req.body;
    const validCreatorId = isValidUUID(createdBy) ? createdBy : null;
    let documentId = null;
    let driveData = null;

    if (fileInfo && fileInfo.path) {
      // 🔒 Snyk Fix (CWE-22): ทำความสะอาด path ที่รับมาจาก Frontend 
      const safeFileName = path.basename(fileInfo.path);
      const safePath = path.join(path.dirname(fileInfo.path), safeFileName);
      
      // บังคับเปลี่ยน path เป็นอันที่ปลอดภัย
      fileInfo.path = safePath;

      // 🏷️ สร้างชื่อไฟล์มาตรฐานตามรูปแบบ (เช่น 556-ศตคม.(ตู่).pdf) จากข้อมูล memo ล่าสุดที่ผู้ใช้ยืนยัน/แก้ไข
      const primaryMemo = Array.isArray(memos) && memos.length > 0 ? memos[0] : {};
      const recNoForName = primaryMemo.receive_no || null;
      const senderForName = primaryMemo.sender || primaryMemo.จาก || null;
      const assigneeForName = primaryMemo.assignments || null;

      const formattedFilename = formatStandardFilename(recNoForName, senderForName, assigneeForName, fileInfo.originalname);

      try {
        driveData = await uploadToDrive(
          { path: fileInfo.path, originalname: formattedFilename, mimetype: fileInfo.mimetype },
          DRIVE_FOLDER_ID
        );
      } catch (driveErr) {
        console.error("[Confirm Drive Upload Error]:", driveErr.message);
      }

      const textContent = fileInfo.text || '';
      const hash = generateHash(textContent + Date.now().toString());

      const docRes = await client.query(
        `INSERT INTO documents (filename, content, content_hash, keywords_found, drive_file_id, drive_web_view_link, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          formattedFilename,
          textContent,
          hash,
          JSON.stringify({ memos }), 
          driveData ? driveData.id : null,
          driveData ? driveData.webViewLink : null,
          validCreatorId
        ]
      );
      documentId = docRes.rows[0].id;
    }

    const createdTaskIds = [];
    const updatedTaskIds = [];

    if (Array.isArray(memos) && memos.length > 0) {
      for (const memo of memos) {
          const parsedMemoDate = parseThaiDateToIso(memo.วันที่) || null;
          const parsedSignDate = parseThaiDateToIso(memo.sign_date) || null;
          const parsedReceiveDate = parseThaiDateToIso(memo.receive_date) || null;

          const parsedMeetingDate = parseThaiDateToIso(memo.meeting_date) || null;
          const parsedReplyDueDate = parseThaiDateToIso(memo.reply_due_date) || null;

          let finalDueDate = memo.due_date || null;
          if (parsedMeetingDate) {
              finalDueDate = parsedMeetingDate;
          }

          const { receiveNo, receiveYear } = await handleReceiveNoAndYear(client, memo.receive_no, parsedReceiveDate);

          const memoSender = memo.sender || memo.จาก || null;
          const memoRecipient = memo.recipient_to || memo.ถึง || null;
          const memoAdditionalDocs = memo.additional_docs || memo.เอกสารข้อมูลเพิ่มเติม || null;

          const existingRes = await client.query('SELECT id, document_id FROM tasks WHERE receive_no = $1 AND receive_year = $2', [receiveNo, receiveYear]);
          let taskId;
          
          if (existingRes.rows.length > 0) {
              taskId = existingRes.rows[0].id;
              const oldDocumentId = existingRes.rows[0].document_id;

              // 1. อัปเดตงานในตาราง tasks ก่อนเพื่อให้ document_id ชี้ไปที่เอกสารใหม่
              await client.query(
                  `UPDATE tasks SET document_id = COALESCE($1, document_id), title = $2, memo_no = $3, memo_date = $4, main_text = $5, task_detail = $6, due_date = COALESCE($7, due_date), is_urgent = $8, urgency_level = $9, secret_level = $10, sign_date = $11, meeting_date = $13, reply_due_date = $14, sender = $16, recipient_to = $17, additional_docs = $18, created_at = COALESCE(CAST($12 AS timestamp), created_at), updated_at = NOW() WHERE id = $15`,
                  [documentId, memo.เรื่อง || 'ไม่ระบุชื่อเรื่อง', memo.ที่, parsedMemoDate, memo.main_text, memo.task_detail || null, finalDueDate, memo.isUrgent || false, memo.urgency_level || null, memo.secret_level || null, parsedSignDate, parsedReceiveDate, parsedMeetingDate, parsedReplyDueDate, taskId, memoSender, memoRecipient, memoAdditionalDocs]
              );

              // 2. ลบเอกสารเก่าและไฟล์เก่าใน Drive หากไม่มีงานอื่นใช้อยู่
              if (documentId && oldDocumentId && documentId !== oldDocumentId) {
                  const countRes = await client.query('SELECT COUNT(*) FROM tasks WHERE document_id = $1', [oldDocumentId]);
                  const otherCount = parseInt(countRes.rows[0].count, 10);

                  if (otherCount === 0) {
                      const docInfoRes = await client.query('SELECT drive_file_id FROM documents WHERE id = $1', [oldDocumentId]);
                      if (docInfoRes.rows.length > 0) {
                          const oldDriveFileId = docInfoRes.rows[0].drive_file_id;
                          if (oldDriveFileId) {
                              deleteFromDrive(oldDriveFileId).catch(err => console.error("[Drive Delete Error]", err.message));
                          }
                      }
                      await client.query('DELETE FROM documents WHERE id = $1', [oldDocumentId]);
                  }
              }

              await logTaskAction(client, taskId, validCreatorId, 'updated_task', { source: 'confirm_tasks_upsert' });
              await client.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
              updatedTaskIds.push(taskId);
          } else {
              const taskRes = await client.query(
                `INSERT INTO tasks (document_id, title, memo_no, memo_date, main_text, task_detail, due_date, is_urgent, created_by, urgency_level, secret_level, sign_date, meeting_date, reply_due_date, receive_no, receive_year, sender, recipient_to, additional_docs, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $14, $15, $16, $17, $18, $19, $20, COALESCE(CAST($13 AS timestamp), NOW())) RETURNING id`,
                [ 
                  documentId, 
                  memo.เรื่อง || 'ไม่ระบุชื่อเรื่อง', 
                  memo.ที่, 
                  parsedMemoDate, 
                  memo.main_text, 
                  memo.task_detail || null,
                  finalDueDate,
                  memo.isUrgent || false,
                  validCreatorId,
                  memo.urgency_level || null,
                  memo.secret_level || null,
                  parsedSignDate,
                  parsedReceiveDate,
                  parsedMeetingDate,
                  parsedReplyDueDate,
                  receiveNo,
                  receiveYear,
                  memoSender,
                  memoRecipient,
                  memoAdditionalDocs
                ]
              );
              taskId = taskRes.rows[0].id;
              await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'confirm_tasks' });
              createdTaskIds.push(taskId);
          }
        

        if (Array.isArray(memo.assignments) && memo.assignments.length > 0) {
          for (const assign of memo.assignments) {
            const userId = isValidUUID(assign.user_id) ? assign.user_id : null; 
            const personStr = assign.responsible_person || '';

            const assignRes = await client.query(
              `INSERT INTO task_assignments (task_id, user_id, role_or_name)
               VALUES ($1, $2, $3) RETURNING id`,
              [taskId, userId, personStr]
            );
            const assignmentId = assignRes.rows[0].id;
            
            await logTaskAction(client, taskId, validCreatorId, 'assigned_user', { user_id: userId, role_or_name: personStr });
          }
        }
      }
    }

    // 🏷️ อัปเดตเปลี่ยนชื่อไฟล์บน Google Drive และ DB ให้ตรงตามข้อมูลรับงานและผู้รับผิดชอบล่าสุดที่บันทึกจริง
    if (documentId && driveData && driveData.id) {
      const finalMemoRes = await client.query(
          `SELECT t.receive_no, t.sender, d.filename,
           (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge"
           FROM tasks t
           LEFT JOIN documents d ON t.document_id = d.id
           WHERE t.document_id = $1 LIMIT 1`,
          [documentId]
      );
      if (finalMemoRes.rows.length > 0) {
          const fm = finalMemoRes.rows[0];
          const finalName = formatStandardFilename(fm.receive_no, fm.sender, fm.personInCharge, fm.filename || fileInfo.originalname);
          if (finalName && finalName !== fm.filename) {
              renameFileOnDrive(driveData.id, finalName).catch(e => console.error("[Confirm Drive Rename Error]", e.message));
              await client.query('UPDATE documents SET filename = $1 WHERE id = $2', [finalName, documentId]);
          }
      }
    }
    
    await client.query('COMMIT');

    // Sync to Google Sheets
    try {
        const getFullData = async (ids) => {
            if (ids.length === 0) return [];
            const query = `
                SELECT t.*, 
                (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge"
                FROM tasks t WHERE t.id = ANY($1)
            `;
            const { rows } = await pool.query(query, [ids]);
            return rows;
        };

        if (createdTaskIds.length > 0) {
            const createdData = await getFullData(createdTaskIds);
            appendMultipleTasksToSheet(createdData).catch(e => console.error(e));
        }
        if (updatedTaskIds.length > 0) {
            const updatedData = await getFullData(updatedTaskIds);
            for (const row of updatedData) {
                updateTaskInSheet(row).catch(e => console.error(e));
            }
        }
    } catch (e) {
        console.error("Sheet sync error in confirmTasks", e.message);
    }

    if (fileInfo && fileInfo.path) {
      try { await fs.unlink(fileInfo.path); } catch (e) { console.error("Warning: Cannot delete temp file", e.message); }
    }

    res.status(200).json({ success: true, message: 'บันทึกเอกสารและงานติดตามสำเร็จเรียบร้อย!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Confirm error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.updateTaskDetail = async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const { name, date, notes, assignments, isUrgent, main_text, task_detail, urgency_level, secret_level, receive_date, sign_date, meeting_date, reply_due_date, receive_no, recipient_to, additional_docs } = req.body;
  
      const validDate = (date === "" || !date) ? null : date;
      const urgentValue = isUrgent !== undefined ? isUrgent : null; 
      
      const mDate = (meeting_date === "" || !meeting_date) ? null : meeting_date;
      const rDate = (reply_due_date === "" || !reply_due_date) ? null : reply_due_date;
      const sDate = (sign_date === "" || !sign_date) ? null : sign_date;

      await client.query(
        `UPDATE tasks 
         SET title = COALESCE($1, title), 
             due_date = COALESCE($2, due_date), 
             notes = COALESCE($3, notes), 
             is_urgent = COALESCE($4, is_urgent),
             main_text = COALESCE($5, main_text),
             task_detail = COALESCE($6, task_detail),
             urgency_level = COALESCE($7, urgency_level),
             secret_level = COALESCE($8, secret_level),
             created_at = COALESCE(CAST($9 AS timestamp), created_at),
             sign_date = CASE WHEN $15::boolean THEN $10 ELSE sign_date END,
             meeting_date = CASE WHEN $16::boolean THEN $11 ELSE meeting_date END,
             reply_due_date = CASE WHEN $17::boolean THEN $12 ELSE reply_due_date END,
             receive_no = COALESCE($13, receive_no),
             recipient_to = COALESCE($18, recipient_to),
             additional_docs = COALESCE($19, additional_docs),
             updated_at = NOW() 
         WHERE id = $14`,
        [
          name, validDate, notes, urgentValue, main_text, task_detail, urgency_level, secret_level, 
          receive_date, sDate, mDate, rDate, receive_no, id,
          req.body.hasOwnProperty('sign_date'), req.body.hasOwnProperty('meeting_date'), req.body.hasOwnProperty('reply_due_date'),
          recipient_to, additional_docs
        ]
      );

    if (Array.isArray(assignments)) {
      const keepAssignmentIds = assignments
        .map(a => a.assignment_id)
        .filter(id => id != null && id !== '');

      if (keepAssignmentIds.length > 0) {
        const deletedAssigns = await client.query(
          `SELECT id FROM task_assignments WHERE task_id = $1 AND NOT (id = ANY($2::uuid[]))`,
          [id, keepAssignmentIds]
        );
        const delIds = deletedAssigns.rows.map(r => r.id);
        
        if (delIds.length > 0) {
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1 AND NOT (id = ANY($2::uuid[]))`, [id, keepAssignmentIds]);
        }
      } else {
        const allAssigns = await client.query(`SELECT id FROM task_assignments WHERE task_id = $1`, [id]);
        const allIds = allAssigns.rows.map(r => r.id);
        if (allIds.length > 0) {
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1`, [id]);
        }
      }

      for (const assign of assignments) {
        let currentAssignmentId = isValidUUID(assign.assignment_id) ? assign.assignment_id : null;
        const userId = isValidUUID(assign.user_id) ? assign.user_id : null;
        
        if (!currentAssignmentId) {
          const newAssignRes = await client.query(
            `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3) RETURNING id`,
            [id, userId, assign.role_or_name || 'เพิ่มด้วยตนเอง']
          );
          currentAssignmentId = newAssignRes.rows[0].id;
        } else {
          await client.query(
            `UPDATE task_assignments SET user_id = $1 WHERE id = $2 AND task_id = $3`,
            [userId, currentAssignmentId, id]
          );
        }
      }
    } else {
        const allAssigns = await client.query(`SELECT id FROM task_assignments WHERE task_id = $1`, [id]);
        const allIds = allAssigns.rows.map(r => r.id);
        if (allIds.length > 0) {
          await client.query(`DELETE FROM task_assignments WHERE task_id = $1`, [id]);
        }
    }

    await logTaskAction(client, id, req.user?.id, 'updated_details', { name, date, main_text, urgency_level, secret_level });

    await client.query('COMMIT');

    // Sync Update to Google Sheets & Rename file in Google Drive if needed
    try {
      const getFresh = await pool.query(
        `SELECT t.*, d.filename, d.drive_file_id,
         (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge"
         FROM tasks t
         LEFT JOIN documents d ON t.document_id = d.id
         WHERE t.id = $1`,
        [id]
      );

      if (getFresh.rows.length > 0) {
        const t = getFresh.rows[0];
        const personInCharge = t.personInCharge || (Array.isArray(assignments) ? assignments.map(a => a.role_or_name || 'เพิ่มด้วยตนเอง').join(', ') : '');
        
        // 🏷️ เปลี่ยนชื่อไฟล์บน Google Drive และ DB ให้ตรงตามรูปแบบมาตรฐานล่าสุดเสมอ
        if (t.document_id && t.filename) {
          const newFilename = formatStandardFilename(t.receive_no, t.sender, personInCharge, t.filename);
          if (newFilename && newFilename !== t.filename) {
            if (t.drive_file_id) {
              renameFileOnDrive(t.drive_file_id, newFilename).catch(e => console.error("Drive rename error:", e.message));
            }
            await pool.query('UPDATE documents SET filename = $1 WHERE id = $2', [newFilename, t.document_id]);
          }
        }

        updateTaskInSheet({
          id: t.id,
          receive_no: t.receive_no,
          receive_year: t.receive_year,
          created_at: t.created_at,
          memo_no: t.memo_no,
          memo_date: t.memo_date,
          sender: t.sender,
          title: t.title,
          personInCharge,
          due_date: t.due_date,
          task_detail: t.task_detail,
          sign_date: t.sign_date
        }).catch(e => console.error("Sheet update error:", e.message));
      }
    } catch (e) {
      console.error("Failed to prepare sheet/drive update", e);
    }

    res.status(200).json({ success: true, message: 'บันทึกความเปลี่ยนแปลงเรียบร้อย' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Update task detail error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    client.release();
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        t.id, 
        t.title AS name, 
        t.status, 
        t.is_urgent AS "isUrgent", 
        TO_CHAR(t.due_date, 'YYYY-MM-DD"T"HH24:MI') AS date, 
        t.main_text,
        t.task_detail,
        t.notes,      
        t.memo_no, 
        TO_CHAR(t.memo_date, 'YYYY-MM-DD') AS memo_date,
        t.urgency_level,
        t.secret_level,
        t.receive_no,
        t.receive_year,
        t.sender,
        t.recipient_to,
        t.additional_docs,
        t.created_at AS "createdAt",
        TO_CHAR(t.sign_date, 'YYYY-MM-DD') AS sign_date,
        TO_CHAR(t.meeting_date, 'YYYY-MM-DD') AS meeting_date,
        TO_CHAR(t.reply_due_date, 'YYYY-MM-DD') AS reply_due_date,
        t.created_by,
        c.name AS "creatorName",
        d.drive_web_view_link AS document_link,
        COALESCE(
          json_agg(
            json_build_object(
              'assignment_id', ta.id,
              'user_id', ta.user_id,             
              'role_or_name', ta.role_or_name,   
              'personInCharge', COALESCE(u.name, ta.role_or_name)
            )
          ) FILTER (WHERE ta.id IS NOT NULL), '[]'
        ) AS assignments
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN documents d ON t.document_id = d.id
      LEFT JOIN users c ON t.created_by = c.id
      WHERE t.id = $1
      GROUP BY t.id, d.drive_web_view_link, c.name, t.created_by
    `;
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const task = rows[0];
    task.personInCharge = task.assignments.map(a => a.personInCharge).join(', ') || 'ไม่ระบุ';

    const docsRes = await pool.query(
      `SELECT d.id, d.filename, d.drive_file_id, d.drive_web_view_link, d.doc_type, d.created_at, d.created_by,
              u.name AS uploader_name
       FROM task_documents d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.task_id = $1
       ORDER BY d.created_at ASC`,
      [id]
    );
    task.attached_documents = docsRes.rows;

    res.status(200).json({ success: true, data: task });
  } catch (err) {
    console.error("Get task by id error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.deleteTask = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const taskRes = await client.query('SELECT document_id FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const docId = taskRes.rows[0].document_id;

    await client.query('DELETE FROM task_assignments WHERE task_id = $1', [id]);
    await client.query('DELETE FROM tasks WHERE id = $1', [id]);

    if (docId) {
      const otherRes = await client.query('SELECT COUNT(*) FROM tasks WHERE document_id = $1', [docId]);
      if (parseInt(otherRes.rows[0].count, 10) === 0) {
        const docRes = await client.query('SELECT drive_file_id FROM documents WHERE id = $1', [docId]);
        if (docRes.rows.length > 0 && docRes.rows[0].drive_file_id) {
          deleteFromDrive(docRes.rows[0].drive_file_id).catch(e => console.error("Drive delete error on task deletion:", e.message));
        }
        await client.query('DELETE FROM documents WHERE id = $1', [docId]);
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Delete task error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    client.release();
  }
};

exports.createTask = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { title, memo_no, memo_date, due_date, main_text, is_urgent, assignments, createdBy, created_by, urgency_level, secret_level, receive_date, sign_date, meeting_date, reply_due_date, sender, recipient_to, additional_docs } = req.body;
    let validCreatorId = createdBy || created_by || null;
    validCreatorId = isValidUUID(validCreatorId) ? validCreatorId : null;

    const parsedMemoDate = parseThaiDateToIso(memo_date) || null;
    const parsedSignDate = parseThaiDateToIso(sign_date) || null;
    const parsedReceiveDate = parseThaiDateToIso(receive_date) || null;

    const parsedMeetingDate = parseThaiDateToIso(meeting_date) || null;
    const parsedReplyDueDate = parseThaiDateToIso(reply_due_date) || null;

    let finalDueDate = due_date || null;
    if (parsedMeetingDate) {
        finalDueDate = parsedMeetingDate;
    }

    const { receiveNo, receiveYear } = await handleReceiveNoAndYear(client, req.body.receive_no, parsedReceiveDate);

    const existingRes = await client.query('SELECT id FROM tasks WHERE receive_no = $1 AND receive_year = $2', [receiveNo, receiveYear]);
    let taskId;

    if (existingRes.rows.length > 0) {
        taskId = existingRes.rows[0].id;
        await client.query(
          `UPDATE tasks SET title = COALESCE($1, title), memo_no = $2, memo_date = $3, main_text = $4, due_date = COALESCE($5, due_date), is_urgent = COALESCE($6, is_urgent), urgency_level = $7, secret_level = $8, sign_date = $10, meeting_date = $11, reply_due_date = $12, sender = $14, recipient_to = $15, additional_docs = $16, created_at = COALESCE(CAST($9 AS timestamp), created_at), updated_at = NOW() WHERE id = $13`,
          [title || 'ไม่ระบุชื่อเรื่อง', memo_no, parsedMemoDate, main_text, finalDueDate, is_urgent, urgency_level, secret_level, parsedReceiveDate, parsedSignDate, parsedMeetingDate, parsedReplyDueDate, taskId, sender, recipient_to, additional_docs]
        );
        await logTaskAction(client, taskId, validCreatorId, 'updated_task', { source: 'manual_create_upsert' });
        await client.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
    } else {
        const taskRes = await client.query(
          `INSERT INTO tasks (title, memo_no, memo_date, main_text, due_date, is_urgent, status, created_by, urgency_level, secret_level, sign_date, meeting_date, reply_due_date, receive_no, receive_year, sender, recipient_to, additional_docs, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13, $14, $15, $16, $17, $18, $19, COALESCE(CAST($11 AS timestamp), NOW())) RETURNING id`,
          [title || 'ไม่ระบุชื่อเรื่อง', memo_no, parsedMemoDate, main_text, finalDueDate, is_urgent || false, 'following', validCreatorId, urgency_level, secret_level, parsedReceiveDate, parsedSignDate, parsedMeetingDate, parsedReplyDueDate, receiveNo, receiveYear, sender, recipient_to, additional_docs]
        );
        taskId = taskRes.rows[0].id;
        await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'manual_create' });
    }

    // 🔒 ตรวจสอบ Array Type ป้องกัน Crash 
    if (Array.isArray(assignments) && assignments.length > 0) {
      for (const assign of assignments) {
        const userId = isValidUUID(assign.user_id) ? assign.user_id : null;
        const roleOrName = assign.role_or_name || null;

        const assignRes = await client.query(
          `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3) RETURNING id`,
          [taskId, userId, roleOrName]
        );
        const assignmentId = assignRes.rows[0].id;
      }
    }


    await client.query('COMMIT');

    // 🚀 ยิงข้อมูลขึ้น Google Sheets แบบไม่ต้องรอให้เสร็จ (Background task)
    try {
        const fullTaskData = {
            id: taskId,
            receive_no: receiveNo,
            receive_year: receiveYear,
            created_at: parsedReceiveDate || new Date(),
            memo_no: memo_no,
            memo_date: parsedMemoDate,
            sender: sender || '',
            title: title || 'ไม่ระบุชื่อเรื่อง',
            personInCharge: assignments ? assignments.map(a => a.role_or_name).join(', ') : '',
            due_date: finalDueDate,
            task_detail: main_text,
            sign_date: parsedSignDate
        };
        if (existingRes.rows.length > 0) {
            updateTaskInSheet(fullTaskData).catch(err => console.error("[Google Sheets Update Sync error]", err.message));
        } else {
            appendTaskToSheet(fullTaskData).catch(err => console.error("[Google Sheets Append Sync error]", err.message));
        }
    } catch (e) {
        console.error("Failed to prepare sheet sync", e);
    }

    res.status(201).json({ success: true, message: 'สร้างงานสำเร็จ!', taskId: taskId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Create task error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.getTaskLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT tl.id, tl.action, tl.details, tl.created_at, u.name as user_name, u.role as user_role, u.color as user_color 
       FROM task_logs tl
       LEFT JOIN users u ON tl.user_id = u.id
       WHERE tl.task_id = $1
       ORDER BY tl.created_at DESC`,
      [id]
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error("Get task logs error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
};

exports.overwriteTaskDocument = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์เอกสารที่ต้องการอัปโหลด' });
    }

    const taskRes = await client.query('SELECT id, document_id, memo_no, sender, receive_no FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลงานนี้' });
    }
    const oldTask = taskRes.rows[0];

    const safeFileName = path.basename(file.path);
    const safePath = path.join(path.dirname(file.path), safeFileName);

    let extractedMemos = [];
    try {
      const geminiRes = await extractDataWithGemini(safePath, file.mimetype, 'gemini');
      if (geminiRes && Array.isArray(geminiRes.extractedData)) {
        extractedMemos = geminiRes.extractedData;
      }
    } catch (ocrErr) {
      console.warn('[Overwrite OCR Warning]:', ocrErr.message);
    }

    const primaryMemo = extractedMemos.length > 0 ? extractedMemos[0] : {};
    const formattedFilename = formatStandardFilename(
      primaryMemo.receive_no || oldTask.receive_no,
      primaryMemo.sender || primaryMemo.จาก || oldTask.sender,
      primaryMemo.assignments || null,
      file.originalname
    );

    let driveData = null;
    try {
      driveData = await uploadToDrive(
        { path: safePath, originalname: formattedFilename, mimetype: file.mimetype },
        DRIVE_FOLDER_ID
      );
    } catch (driveErr) {
      console.error('[Overwrite Drive Error]:', driveErr.message);
    }

    const hash = generateHash(file.originalname + Date.now().toString());
    const docRes = await client.query(
      `INSERT INTO documents (filename, content, content_hash, keywords_found, drive_file_id, drive_web_view_link, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        formattedFilename,
        '',
        hash,
        JSON.stringify({ memos: extractedMemos }),
        driveData ? driveData.id : null,
        driveData ? driveData.webViewLink : null,
        req.user ? req.user.id : null
      ]
    );
    const newDocId = docRes.rows[0].id;

    const newTitle = primaryMemo.เรื่อง || null;
    const newMemoNo = primaryMemo.ที่ || null;
    const newMemoDate = parseThaiDateToIso(primaryMemo.วันที่) || null;
    const newSender = primaryMemo.sender || primaryMemo.จาก || null;
    const newRecipientTo = primaryMemo.recipient_to || primaryMemo.เรียน || null;
    const newAdditionalDocs = primaryMemo.additional_docs || null;
    const newMainText = primaryMemo.main_text || null;
    const newTaskDetail = primaryMemo.task_detail || null;
    const newSignDate = parseThaiDateToIso(primaryMemo.sign_date) || null;
    const newMeetingDate = parseThaiDateToIso(primaryMemo.meeting_date) || null;
    const newReplyDueDate = parseThaiDateToIso(primaryMemo.reply_due_date) || null;

    await client.query(
      `UPDATE tasks SET 
        document_id = $1,
        title = COALESCE($2, title),
        memo_no = COALESCE($3, memo_no),
        memo_date = COALESCE($4, memo_date),
        sender = COALESCE($5, sender),
        recipient_to = COALESCE($6, recipient_to),
        additional_docs = COALESCE($7, additional_docs),
        main_text = COALESCE($8, main_text),
        task_detail = COALESCE($9, task_detail),
        sign_date = COALESCE($10, sign_date),
        meeting_date = COALESCE($11, meeting_date),
        reply_due_date = COALESCE($12, reply_due_date),
        updated_at = NOW()
       WHERE id = $13`,
      [
        newDocId, newTitle, newMemoNo, newMemoDate, newSender, newRecipientTo,
        newAdditionalDocs, newMainText, newTaskDetail, newSignDate, newMeetingDate,
        newReplyDueDate, id
      ]
    );

    try { await fs.unlink(safePath); } catch (e) {}

    await logTaskAction(client, id, req.user ? req.user.id : null, 'overwrite_document', { filename: formattedFilename });

    await client.query('COMMIT');
    res.status(200).json({
      success: true,
      message: 'อัปโหลดเอกสารและอัปเดตข้อมูลทับสำเร็จเรียบร้อย!',
      data: {
        filename: formattedFilename,
        extractedMemo: primaryMemo
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Overwrite document error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.attachTaskDocument = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์เอกสารที่ต้องการแนบเพิ่มเติม' });
    }

    const taskRes = await client.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลงานนี้' });
    }

    const createdDocs = [];
    for (const file of files) {
      const safeFileName = path.basename(file.path);
      const safePath = path.join(path.dirname(file.path), safeFileName);

      let driveData = null;
      try {
        driveData = await uploadToDrive(
          { path: safePath, originalname: file.originalname, mimetype: file.mimetype },
          DRIVE_FOLDER_ID
        );
      } catch (driveErr) {
        console.error('[Attach Drive Error]:', driveErr.message);
      }

      const docRes = await client.query(
        `INSERT INTO task_documents (task_id, filename, drive_file_id, drive_web_view_link, doc_type, created_by)
         VALUES ($1, $2, $3, $4, 'attachment', $5) RETURNING id, filename, drive_web_view_link, created_at, created_by`,
        [id, file.originalname, driveData ? driveData.id : null, driveData ? driveData.webViewLink : null, req.user ? req.user.id : null]
      );
      const insertedDoc = docRes.rows[0];
      if (req.user && req.user.name) {
        insertedDoc.uploader_name = req.user.name;
      }
      createdDocs.push(insertedDoc);

      try { await fs.unlink(safePath); } catch (e) {}
    }

    await logTaskAction(client, id, req.user ? req.user.id : null, 'attached_document', { count: files.length });

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'อัปโหลดเอกสารเพิ่มเติมสำเร็จ!', data: createdDocs });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Attach document error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.deleteTaskAttachment = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const docRes = await pool.query('SELECT drive_file_id FROM task_documents WHERE id = $1 AND task_id = $2', [docId, id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบเอกสารแนบนี้' });
    }
    const driveFileId = docRes.rows[0].drive_file_id;
    if (driveFileId) {
      deleteFromDrive(driveFileId).catch(e => console.error('[Drive Delete Error]:', e.message));
    }
    await pool.query('DELETE FROM task_documents WHERE id = $1', [docId]);
    res.status(200).json({ success: true, message: 'ลบเอกสารแนบเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Delete attachment error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getNextReserveNo = async (req, res) => {
  const client = await pool.connect();
  try {
    const currentYear = new Date().getFullYear();
    const resCount = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1', [currentYear]);
    const nextReceiveNo = (resCount.rows[0].max_no || 0) + 1;
    res.status(200).json({ success: true, nextReceiveNo, currentYear });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.reserveTask = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    let validCreatorId = req.user?.id || null;
    const currentYear = new Date().getFullYear();
    
    let { range } = req.body; 
    
    let startNo = 0;
    let endNo = 0;
    
    if (range) {
      const rangeStr = String(range).trim();
      if (rangeStr.includes('-')) {
        const parts = rangeStr.split('-');
        startNo = parseInt(parts[0], 10);
        endNo = parseInt(parts[1], 10);
      } else {
        startNo = parseInt(rangeStr, 10);
        endNo = startNo;
      }
    } else {
      const resCount = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1', [currentYear]);
      startNo = (resCount.rows[0].max_no || 0) + 1;
      endNo = startNo;
    }
    
    if (isNaN(startNo) || isNaN(endNo) || startNo > endNo) {
      throw new Error("รูปแบบช่วงเลขรับไม่ถูกต้อง (เช่น 100 หรือ 100-105)");
    }

    const createdIds = [];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14); // กำหนดส่ง +14 วัน

    for (let i = startNo; i <= endNo; i++) {
      const taskRes = await client.query(
        `INSERT INTO tasks (title, status, created_by, receive_no, receive_year, due_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['กันเลขลงรับ', 'following', validCreatorId, i, currentYear, dueDate]
      );
      const taskId = taskRes.rows[0].id;
      createdIds.push({
        id: taskId,
        receive_no: i,
        receive_year: currentYear,
        created_at: new Date(),
        title: 'กันเลขลงรับ',
        due_date: dueDate
      });
      await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'reserve_number', no: i });
    }
    
    await client.query('COMMIT');

    // Sync to Google Sheets
    try {
        appendMultipleTasksToSheet(createdIds).catch(e => console.error("Batch Sheet Sync Error:", e.message));
    } catch (e) {
        console.error("Failed to prepare batch sheet sync", e);
    }

    res.status(201).json({ 
      success: true, 
      message: 'จองเลขรับสำเร็จ!', 
      createdCount: createdIds.length,
      startNo, 
      endNo, 
      receive_year: currentYear 
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Reserve task error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};