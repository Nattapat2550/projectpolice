const pool = require('../config/db');
const fs = require('fs').promises;
const path = require('path'); // เพิ่ม module path สำหรับป้องกัน Path Traversal
const { uploadToDrive, deleteFromDrive, renameFileOnDrive } = require('../services/googleDriveService');
const { appendTaskToSheet, appendMultipleTasksToSheet, updateTaskInSheet, deleteTaskFromSheet, clearTaskLinksInSheet } = require('../services/googleSheetsService');
const { generateHash } = require('../utils/duplicateChecker');
const { parseFilenameInfo, formatStandardFilename, cleanToOnlyName } = require('../utils/filenameParser');
const { extractDataWithGemini } = require('../services/ocrService');
const { calculateFiscalRoundAndYear, parseAnyDateToIso } = require('../utils/fiscalYearHelper');
const { syncTaskDocumentNotesFromText } = require('../utils/attachmentSync');

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; 
// กำหนดโฟลเดอร์สำหรับเก็บไฟล์ชั่วคราวให้ชัดเจน (แก้ไข path ให้ตรงกับที่ตั้งโฟลเดอร์ uploads ของคุณ)
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads'); 

const convertThaiDigits = (str) => {
  if (!str) return str;
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return String(str).replace(/[๐-๙]/g, (m) => thaiDigits.indexOf(m).toString());
};

// Helper function to validate UUID
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
};

// Helper function to check if a user is superadmin OR is creator/assigned to a task
const canUserEditTask = async (user, taskId, dbClient = pool) => {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  if (user.role !== 'admin') return false;

  const { rows } = await dbClient.query(
    `SELECT t.id 
     FROM tasks t 
     LEFT JOIN task_assignments ta ON ta.task_id = t.id 
     WHERE t.id = $1 
       AND (
         t.created_by = $2 
         OR ta.user_id = $2 
         OR (ta.role_or_name IS NOT NULL AND LOWER(TRIM(ta.role_or_name)) = LOWER(TRIM($3)))
       )
     LIMIT 1`,
    [taskId, user.id, user.name]
  );
  return rows.length > 0;
};
exports.canUserEditTask = canUserEditTask;

// Helper function to parse Thai date string into YYYY-MM-DD (or YYYY-MM-DD HH:mm:ss if time present)
const parseThaiDateToIso = (dateStr) => {
  if (!dateStr) return null;
  if (typeof dateStr !== 'string') {
    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      let y = dateStr.getFullYear();
      if (y > 2400) y -= 543;
      const m = (dateStr.getMonth() + 1).toString().padStart(2, '0');
      const d = dateStr.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return null;
  }
  
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Convert Thai numerals to Arabic numerals
  const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
  let normalizedStr = trimmed.replace(/[๐-๙]/g, match => thaiNumerals[match]);

  // Check ISO format YYYY-MM-DD or YYYY-MM-DDTHH:mm / YYYY-MM-DD HH:mm:ss with time
  const isoMatch = normalizedStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch && isoMatch[4] !== undefined && isoMatch[5] !== undefined) {
    let y = parseInt(isoMatch[1], 10);
    if (y > 2400) y -= 543;
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    const datePart = `${y}-${m}-${d}`;
    const hh = isoMatch[4].padStart(2, '0');
    const mm = isoMatch[5].padStart(2, '0');
    const ss = isoMatch[6] ? isoMatch[6].padStart(2, '0') : null;
    return `${datePart} ${hh}:${mm}${ss ? `:${ss}` : ''}`;
  }

  // Use universal parser
  const parsed = parseAnyDateToIso(normalizedStr);
  return parsed;
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

// Helper to process, split comma-separated names, match users, and format assignees
const processAssignmentsInput = async (assignments, dbClient = pool) => {
  if (!assignments) return [];
  
  let rawList = [];
  if (typeof assignments === 'string') {
    rawList = assignments.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(role => ({ role_or_name: role }));
  } else if (Array.isArray(assignments)) {
    rawList = assignments;
  } else if (typeof assignments === 'object') {
    rawList = [assignments];
  }

  // Fetch users for matching
  const { rows: allUsers } = await dbClient.query('SELECT id, name, color FROM users');
  const userByIdMap = new Map();
  const userByNameMap = new Map();
  const userByCleanNameMap = new Map();

  for (const u of allUsers) {
    userByIdMap.set(String(u.id), u);
    userByNameMap.set(u.name.trim().toLowerCase(), u);
    const cleanName = cleanToOnlyName(u.name).trim().toLowerCase();
    if (cleanName) {
      userByCleanNameMap.set(cleanName, u);
    }
  }

  const result = [];
  const addedKeys = new Set();

  for (const item of rawList) {
    let roleOrName = typeof item === 'string' ? item : (item.role_or_name || item.responsible_person || item.personInCharge || item.name || '');
    let userId = (typeof item === 'object' && isValidUUID(item.user_id)) ? item.user_id : null;

    if (!roleOrName && !userId) continue;

    // Split if roleOrName contains comma/semicolon/newline
    let namesToProcess = [roleOrName];
    if (roleOrName && typeof roleOrName === 'string' && /[,;\n]/.test(roleOrName)) {
      namesToProcess = roleOrName.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    }

    for (const nameStr of namesToProcess) {
      let matchedUser = null;
      if (userId && userByIdMap.has(String(userId))) {
        matchedUser = userByIdMap.get(String(userId));
      } else if (nameStr) {
        const lower = nameStr.trim().toLowerCase();
        if (userByNameMap.has(lower)) {
          matchedUser = userByNameMap.get(lower);
        } else {
          const clean = cleanToOnlyName(nameStr).trim().toLowerCase();
          if (userByCleanNameMap.has(clean)) {
            matchedUser = userByCleanNameMap.get(clean);
          }
        }
      }

      const finalUserId = matchedUser ? matchedUser.id : userId;
      const finalRoleOrName = matchedUser ? matchedUser.name : nameStr;
      const key = `${finalUserId || ''}_${finalRoleOrName}`;

      if (!addedKeys.has(key)) {
        addedKeys.add(key);
        result.push({
          user_id: finalUserId,
          role_or_name: finalRoleOrName,
          color: matchedUser ? matchedUser.color : (typeof item === 'object' && item.color ? item.color : '#e5e7eb')
        });
      }
    }
  }

  return result;
};

// Helper to enrich task lists with split assignees and accurate user colors
const enrichTasksWithAssignees = async (rows, dbClient = pool) => {
  const { rows: allUsers } = await dbClient.query('SELECT id, name, color FROM users');
  const userByNameMap = new Map();
  const userByCleanNameMap = new Map();

  for (const u of allUsers) {
    userByNameMap.set(u.name.trim().toLowerCase(), u);
    const clean = cleanToOnlyName(u.name).trim().toLowerCase();
    if (clean) userByCleanNameMap.set(clean, u);
  }

  return rows.map(task => {
    let rawAssignees = Array.isArray(task.assigneesData) ? task.assigneesData : [];
    let expandedAssignees = [];
    let addedKeys = new Set();

    for (const item of rawAssignees) {
      const rawName = item?.name || '';
      const names = rawName.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      for (const nameStr of names) {
        const lower = nameStr.toLowerCase();
        const clean = cleanToOnlyName(nameStr).toLowerCase();
        const matchedUser = userByNameMap.get(lower) || userByCleanNameMap.get(clean);

        const finalName = matchedUser ? matchedUser.name : nameStr;
        const finalColor = matchedUser ? matchedUser.color : (item.color && item.color !== '#e5e7eb' ? item.color : '#e5e7eb');

        if (!addedKeys.has(finalName)) {
          addedKeys.add(finalName);
          expandedAssignees.push({
            name: finalName,
            personInCharge: finalName,
            role_or_name: finalName,
            color: finalColor
          });
        }
      }
    }

    task.assigneesData = expandedAssignees;
    task.personInCharge = expandedAssignees.length > 0 ? expandedAssignees.map(a => a.name).join(', ') : 'ไม่ระบุ';
    return task;
  });
};


// Helper function to handle receive_no, receive_year and round logic
const handleReceiveNoAndYear = async (client, inputReceiveNo, parsedReceiveDate) => {
    let receiveNoInput = inputReceiveNo;
    if (typeof receiveNoInput === 'string') {
        const thaiNumerals = { '๐':'0', '๑':'1', '๒':'2', '๓':'3', '๔':'4', '๕':'5', '๖':'6', '๗':'7', '๘':'8', '๙':'9' };
        receiveNoInput = receiveNoInput.replace(/[๐-๙]/g, match => thaiNumerals[match]);
    }
    
    let receiveNo = parseInt(receiveNoInput, 10) || null;
    const { round, fiscalYearBE: fiscalYear } = calculateFiscalRoundAndYear(parsedReceiveDate);
    let receiveYear = fiscalYear;

    if (!receiveNo) {
        // Generate new sequential number for this fiscal year and round
        const res = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1 AND COALESCE(round, 1) = $2', [receiveYear, round]);
        receiveNo = (res.rows[0].max_no || 0) + 1;
    }
    return { receiveNo, receiveYear, round };
};

const fetchTaskDataForSheet = async (taskIdOrIds) => {
  const isArray = Array.isArray(taskIdOrIds);
  const ids = isArray ? taskIdOrIds : [taskIdOrIds];
  if (ids.length === 0) return isArray ? [] : null;

  const query = `
    SELECT t.*, d.drive_web_view_link as document_link, d.filename, d.drive_file_id,
    (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge",
    (SELECT string_agg(
      CONCAT(
        td.filename,
        CASE WHEN td.notes IS NOT NULL AND td.notes != '' THEN CONCAT(' (', td.notes, ')') ELSE '' END,
        CASE WHEN td.drive_web_view_link IS NOT NULL AND td.drive_web_view_link != '' THEN CONCAT(': ', td.drive_web_view_link) ELSE '' END
      ),
      ', '
    ) FROM task_documents td WHERE td.task_id = t.id AND td.filename != 'เอกสารต้นฉบับ' AND LOWER(td.filename) NOT LIKE '%เอกสารต้นฉบับ%') as attachment_info
    FROM tasks t 
    LEFT JOIN documents d ON t.document_id = d.id
    WHERE t.id = ANY($1)
  `;
  const { rows } = await pool.query(query, [ids]);

  const processed = rows.map(row => {
    let docs = (row.attachment_info && row.attachment_info.trim()) ? row.attachment_info.trim() : (row.additional_docs || '').trim();
    row.additional_docs = docs;
    return row;
  });

  return isArray ? processed : (processed[0] || null);
};

exports.getAllTasks = async (req, res) => {
  try {
    const query = `
      WITH raw_assignees AS (
        SELECT ta.task_id, ta.user_id, ta.role_or_name
        FROM task_assignments ta
        WHERE ta.role_or_name IS NOT NULL AND ta.role_or_name != ''
      ),
      unique_assignees AS (
        SELECT DISTINCT 
          ra.task_id, 
          COALESCE(u.name, ra.role_or_name) AS name, 
          COALESCE(u.color, '#e5e7eb') AS color
        FROM raw_assignees ra
        LEFT JOIN users u ON ra.user_id = u.id OR (ra.user_id IS NULL AND LOWER(TRIM(ra.role_or_name)) = LOWER(TRIM(u.name)))
        WHERE COALESCE(u.name, ra.role_or_name) IS NOT NULL
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
        t.updated_at AS "updatedAt",
        t.status,
        t.is_urgent AS "isUrgent",
        t.urgency_level,
        t.secret_level,
        t.meeting_date,
        t.reply_due_date,
        t.receive_no,
        t.receive_year,
        COALESCE(t.round, 1) AS round,
        t.memo_no,
        t.memo_date,
        t.sender,
        t.recipient_to,
        t.additional_docs,
        d.drive_web_view_link AS document_link,
        d.drive_web_view_link AS drive_web_view_link,
        (
          CASE 
            WHEN d.drive_web_view_link IS NOT NULL AND d.drive_web_view_link != '' THEN true
            WHEN t.document_id IS NOT NULL THEN true
            ELSE false
          END
        ) AS has_document
      FROM tasks t
      LEFT JOIN agg_assignees aa ON t.id = aa.task_id
      LEFT JOIN documents d ON t.document_id = d.id
      ORDER BY 
        t.created_at DESC NULLS LAST,
        COALESCE(t.updated_at, t.created_at) DESC NULLS LAST,
        t.receive_no DESC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    const enriched = await enrichTasksWithAssignees(rows, pool);
    res.status(200).json(enriched);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getUrgentTasks = async (req, res) => {
  try {
    const query = `
      WITH raw_assignees AS (
        SELECT ta.task_id, ta.user_id, ta.role_or_name
        FROM task_assignments ta
        WHERE ta.role_or_name IS NOT NULL AND ta.role_or_name != ''
      ),
      unique_assignees AS (
        SELECT DISTINCT 
          ra.task_id, 
          COALESCE(u.name, ra.role_or_name) AS name, 
          COALESCE(u.color, '#e5e7eb') AS color
        FROM raw_assignees ra
        LEFT JOIN users u ON ra.user_id = u.id OR (ra.user_id IS NULL AND LOWER(TRIM(ra.role_or_name)) = LOWER(TRIM(u.name)))
        WHERE COALESCE(u.name, ra.role_or_name) IS NOT NULL
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
        t.updated_at AS "updatedAt",
        t.status,
        t.is_urgent AS "isUrgent",
        t.urgency_level,
        t.secret_level,
        t.meeting_date,
        t.reply_due_date,
        t.receive_no,
        t.receive_year,
        COALESCE(t.round, 1) AS round,
        t.memo_no,
        t.memo_date,
        t.sender,
        t.recipient_to,
        t.additional_docs,
        d.drive_web_view_link AS document_link,
        d.drive_web_view_link AS drive_web_view_link,
        (
          CASE 
            WHEN d.drive_web_view_link IS NOT NULL AND d.drive_web_view_link != '' THEN true
            WHEN t.document_id IS NOT NULL THEN true
            ELSE false
          END
        ) AS has_document
      FROM tasks t
      LEFT JOIN agg_assignees aa ON t.id = aa.task_id
      LEFT JOIN documents d ON t.document_id = d.id
      WHERE t.is_urgent = true
      ORDER BY 
        t.created_at DESC NULLS LAST,
        COALESCE(t.updated_at, t.created_at) DESC NULLS LAST,
        t.receive_no DESC NULLS LAST
    `;
    const { rows } = await pool.query(query);
    const enriched = await enrichTasksWithAssignees(rows, pool);
    res.status(200).json(enriched);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!(await canUserEditTask(req.user, id))) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
    }

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

          const { receiveNo, receiveYear, round } = await handleReceiveNoAndYear(client, memo.receive_no, parsedReceiveDate);

          const memoSender = memo.sender || memo.จาก || null;
          const memoRecipient = memo.recipient_to || memo.ถึง || null;
          const memoAdditionalDocs = memo.additional_docs || memo.เอกสารข้อมูลเพิ่มเติม || null;
          const memoNotes = memo.notes || memo.หมายเหตุ || null;

          const memoMemoNo = memo.ที่ || memo.memo_no || null;
          
          let taskId = null;
          let oldDocumentId = null;

          // 1. ตรวจสอบจาก existing_task_id หรือ id ของงานเดิมเป็นอันดับแรก
          const targetTaskId = memo.existing_task_id || memo.id || memo.taskId;
          if (targetTaskId && isValidUUID(targetTaskId)) {
            const byIdRes = await client.query('SELECT id, document_id FROM tasks WHERE id = $1 LIMIT 1', [targetTaskId]);
            if (byIdRes.rows.length > 0) {
              taskId = byIdRes.rows[0].id;
              oldDocumentId = byIdRes.rows[0].document_id;
            }
          }

          // 2. ถ้าไม่พบจาก id ให้ตรวจสอบจาก receive_no + receive_year + round
          if (!taskId && receiveNo) {
            const byNoRes = await client.query(
              `SELECT id, document_id FROM tasks 
               WHERE receive_no = $1 
                 AND (receive_year = $2 OR receive_year = $3 OR receive_year = $2 - 543 OR receive_year = $2 + 543)
               ORDER BY 
                 CASE WHEN COALESCE(round, 1) = $4 THEN 0 ELSE 1 END,
                 created_at DESC
               LIMIT 1`,
              [receiveNo, receiveYear, (receiveYear > 2400 ? receiveYear - 543 : receiveYear + 543), round]
            );
            if (byNoRes.rows.length > 0) {
              taskId = byNoRes.rows[0].id;
              oldDocumentId = byNoRes.rows[0].document_id;
            }
          }
          
          if (taskId) {
              // 1. เขียนทับ (Overwrite) ข้อมูลงานเดิมในตาราง tasks
              await client.query(
                  `UPDATE tasks SET 
                     document_id = COALESCE($1, document_id), 
                     title = COALESCE($2, title), 
                     memo_no = COALESCE($3, memo_no), 
                     memo_date = COALESCE($4, memo_date), 
                     main_text = COALESCE($5, main_text), 
                     task_detail = COALESCE($6, task_detail), 
                     due_date = COALESCE($7, due_date), 
                     is_urgent = COALESCE($8, is_urgent), 
                     urgency_level = COALESCE($9, urgency_level), 
                     secret_level = COALESCE($10, secret_level), 
                     sign_date = COALESCE($11, sign_date), 
                     meeting_date = COALESCE($12, meeting_date), 
                     reply_due_date = COALESCE($13, reply_due_date), 
                     sender = COALESCE($15, sender), 
                     recipient_to = COALESCE($16, recipient_to), 
                     additional_docs = COALESCE($17, additional_docs), 
                     round = COALESCE($18, round), 
                     notes = COALESCE($19, notes), 
                     updated_at = NOW() 
                   WHERE id = $14`,
                  [
                    documentId, 
                    memo.เรื่อง || memo.title || null, 
                    memoMemoNo, 
                    parsedMemoDate, 
                    memo.main_text || null, 
                    memo.task_detail || null, 
                    finalDueDate, 
                    memo.isUrgent !== undefined ? memo.isUrgent : (memo.urgency_level && memo.urgency_level !== 'ปกติ'), 
                    memo.urgency_level || null, 
                    memo.secret_level || null, 
                    parsedSignDate, 
                    parsedMeetingDate, 
                    parsedReplyDueDate, 
                    taskId, 
                    memoSender, 
                    memoRecipient, 
                    memoAdditionalDocs, 
                    round, 
                    memoNotes
                  ]
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
              updatedTaskIds.push(taskId);
          } else {
              const taskRes = await client.query(
                `INSERT INTO tasks (document_id, title, memo_no, memo_date, main_text, task_detail, due_date, is_urgent, created_by, urgency_level, secret_level, sign_date, meeting_date, reply_due_date, receive_no, receive_year, round, sender, recipient_to, additional_docs, notes, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $14, $15, $16, $17, $21, $18, $19, $20, $22, COALESCE(CAST($13 AS timestamp), NOW())) RETURNING id`,
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
                  memoAdditionalDocs,
                  round,
                  memoNotes
                ]
              );
              taskId = taskRes.rows[0].id;
              await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'confirm_tasks' });
              createdTaskIds.push(taskId);
          }
          const processedAssigns = await processAssignmentsInput(memo.assignments, client);
          for (const assign of processedAssigns) {
            const checkAss = await client.query(
              `SELECT id FROM task_assignments WHERE task_id = $1 AND (role_or_name = $2 OR (user_id IS NOT NULL AND user_id = $3))`,
              [taskId, assign.role_or_name, assign.user_id]
            );
            if (checkAss.rows.length === 0) {
              await client.query(
                `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3)`,
                [taskId, assign.user_id, assign.role_or_name]
              );
              await logTaskAction(client, taskId, validCreatorId, 'assigned_user', { user_id: assign.user_id, role_or_name: assign.role_or_name });
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
        const allSyncIds = [...createdTaskIds, ...updatedTaskIds];
        if (allSyncIds.length > 0) {
            const syncData = await fetchTaskDataForSheet(allSyncIds);
            await appendMultipleTasksToSheet(syncData);
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

      if (!(await canUserEditTask(req.user, id, client))) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
      }

      const { name, date, notes, assignments, isUrgent, main_text, task_detail, urgency_level, secret_level, receive_date, sign_date, meeting_date, reply_due_date, receive_no, recipient_to, additional_docs, sender, memo_no, memo_date } = req.body;
  
      const validDate = (date === "" || !date) ? null : parseThaiDateToIso(date) || date;
      const urgentValue = isUrgent !== undefined ? isUrgent : null; 
      
      const mDate = (meeting_date === "" || !meeting_date) ? null : parseThaiDateToIso(meeting_date) || meeting_date;
      const rDate = (reply_due_date === "" || !reply_due_date) ? null : parseThaiDateToIso(reply_due_date) || reply_due_date;
      const sDate = (sign_date === "" || !sign_date) ? null : parseThaiDateToIso(sign_date) || sign_date;
      const memoDate = (memo_date === "" || !memo_date) ? null : parseThaiDateToIso(memo_date) || memo_date;

      const cleanMemoNo = memo_no ? convertThaiDigits(memo_no) : memo_no;

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
             sender = COALESCE($20, sender),
             memo_no = CASE WHEN $23::boolean THEN $21 ELSE memo_no END,
             memo_date = CASE WHEN $24::boolean THEN $22 ELSE memo_date END,
             updated_at = NOW() 
         WHERE id = $14`,
        [
          name, validDate, notes, urgentValue, main_text, task_detail, urgency_level, secret_level, 
          receive_date, sDate, mDate, rDate, receive_no, id,
          req.body.hasOwnProperty('sign_date'), req.body.hasOwnProperty('meeting_date'), req.body.hasOwnProperty('reply_due_date'),
          recipient_to, additional_docs, sender, cleanMemoNo, memoDate,
          req.body.hasOwnProperty('memo_no'), req.body.hasOwnProperty('memo_date')
        ]
      );

    // 📌 Sync หมายเหตุเอกสารแนบ เมื่อ additional_docs ถูกแก้ไข
    if (additional_docs !== undefined) {
      await syncTaskDocumentNotesFromText(client, id, additional_docs);
    }

    if (req.body.hasOwnProperty('assignments') && assignments !== undefined) {
      const processedAssigns = await processAssignmentsInput(assignments, client);
      
      // ลบรายการผู้รับผิดชอบเดิมเพื่อให้อัปเดตข้อมูลถูกต้องเสมอ (ไม่ค้างคนเดิมที่โดนลบออก)
      await client.query('DELETE FROM task_assignments WHERE task_id = $1', [id]);

      for (const assign of processedAssigns) {
        await client.query(
          `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3)`,
          [id, assign.user_id, assign.role_or_name]
        );
      }
    }

    await logTaskAction(client, id, req.user?.id, 'updated_details', { name, date, main_text, urgency_level, secret_level });

    await client.query('COMMIT');

    // Sync Update to Google Sheets & Rename file in Google Drive if needed
    try {
      const taskForSheet = await fetchTaskDataForSheet(id);

      if (taskForSheet) {
        const personInCharge = taskForSheet.personInCharge || (Array.isArray(assignments) ? assignments.map(a => a.role_or_name || 'เพิ่มด้วยตนเอง').join(', ') : '');
        
        // 🏷️ เปลี่ยนชื่อไฟล์บน Google Drive และ DB ให้ตรงตามรูปแบบมาตรฐานล่าสุดเสมอ
        if (taskForSheet.document_id && taskForSheet.filename) {
          const newFilename = formatStandardFilename(taskForSheet.receive_no, taskForSheet.sender, personInCharge, taskForSheet.filename);
          if (newFilename && newFilename !== taskForSheet.filename) {
            if (taskForSheet.drive_file_id) {
              renameFileOnDrive(taskForSheet.drive_file_id, newFilename).catch(e => console.error("Drive rename error:", e.message));
            }
            await pool.query('UPDATE documents SET filename = $1 WHERE id = $2', [newFilename, taskForSheet.document_id]);
          }
        }

        updateTaskInSheet(taskForSheet).catch(e => console.error("Sheet update error:", e.message));
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
              'user_id', COALESCE(ta.user_id, u.id),             
              'role_or_name', ta.role_or_name,   
              'personInCharge', COALESCE(u.name, ta.role_or_name),
              'color', COALESCE(u.color, '#e5e7eb')
            )
          ) FILTER (WHERE ta.id IS NOT NULL), '[]'
        ) AS assignments
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id OR (ta.user_id IS NULL AND LOWER(TRIM(ta.role_or_name)) = LOWER(TRIM(u.name)))
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
    const rawAssignments = Array.isArray(task.assignments) ? task.assignments : [];
    const processedAssignments = await processAssignmentsInput(rawAssignments, pool);
    task.assignments = processedAssignments.map((a, idx) => ({
      assignment_id: rawAssignments[idx]?.assignment_id || `${id}-${idx}`,
      user_id: a.user_id,
      role_or_name: a.role_or_name,
      personInCharge: a.role_or_name,
      color: a.color
    }));
    task.personInCharge = task.assignments.map(a => a.personInCharge).join(', ') || 'ไม่ระบุ';

    const docsRes = await pool.query(
      `SELECT d.id, d.filename, d.drive_file_id, d.drive_web_view_link, d.doc_type, d.notes, d.created_at, d.created_by,
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

    if (!(await canUserEditTask(req.user, id, client))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ลบงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
    }

    const taskRes = await client.query('SELECT document_id, receive_year, receive_no FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const { document_id: docId, receive_year: receiveYear, receive_no: receiveNo } = taskRes.rows[0];

    // ลบไฟล์เอกสารประกอบเพิ่มเติม (task_documents) ใน Google Drive
    const attachRes = await client.query('SELECT drive_file_id FROM task_documents WHERE task_id = $1', [id]);
    for (const attachRow of attachRes.rows) {
      if (attachRow.drive_file_id) {
        try {
          await deleteFromDrive(attachRow.drive_file_id);
        } catch (e) {
          console.error("Drive delete error for attachment:", e.message);
        }
      }
    }
    await client.query('DELETE FROM task_documents WHERE task_id = $1', [id]);

    await client.query('DELETE FROM task_assignments WHERE task_id = $1', [id]);
    await client.query('DELETE FROM tasks WHERE id = $1', [id]);

    if (docId) {
      const otherRes = await client.query('SELECT COUNT(*) FROM tasks WHERE document_id = $1', [docId]);
      if (parseInt(otherRes.rows[0].count, 10) === 0) {
        const docRes = await client.query('SELECT drive_file_id FROM documents WHERE id = $1', [docId]);
        if (docRes.rows.length > 0 && docRes.rows[0].drive_file_id) {
          try {
            await deleteFromDrive(docRes.rows[0].drive_file_id);
          } catch (e) {
            console.error("Drive delete error on task deletion:", e.message);
          }
        }
        await client.query('DELETE FROM documents WHERE id = $1', [docId]);
      }
    }

    await client.query('COMMIT');

    // เคลียร์ลิงก์ไฟล์เอกสารทั้ง 2 แบบใน Google Sheets (คอลัมน์ Q และ R)
    clearTaskLinksInSheet(id, receiveYear, receiveNo).catch(e => console.error("[Google Sheets Clear Links Error]:", e.message));
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
    
    const { title, memo_no, memo_date, due_date, main_text, is_urgent, assignments, createdBy, created_by, urgency_level, secret_level, receive_date, sign_date, meeting_date, reply_due_date, sender, recipient_to, additional_docs, notes } = req.body;
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

    const { receiveNo, receiveYear, round } = await handleReceiveNoAndYear(client, req.body.receive_no, parsedReceiveDate);

    const existingRes = await client.query(
        'SELECT id FROM tasks WHERE receive_no = $1 AND receive_year = $2 AND COALESCE(round, 1) = $3 LIMIT 1',
        [receiveNo, receiveYear, round]
    );
    let taskId;

    if (existingRes.rows.length > 0) {
        taskId = existingRes.rows[0].id;
        await client.query(
          `UPDATE tasks SET title = COALESCE(title, $1), memo_no = COALESCE(memo_no, $2), memo_date = COALESCE(memo_date, $3), main_text = COALESCE($4, main_text), due_date = COALESCE($5, due_date), is_urgent = COALESCE(is_urgent, $6), urgency_level = COALESCE(urgency_level, $7), secret_level = COALESCE(secret_level, $8), sign_date = COALESCE(sign_date, $9), meeting_date = COALESCE($10, meeting_date), reply_due_date = COALESCE($11, reply_due_date), sender = COALESCE(sender, $13), recipient_to = COALESCE(recipient_to, $14), additional_docs = COALESCE($15, additional_docs), round = COALESCE(round, $16), notes = COALESCE($17, notes), updated_at = NOW() WHERE id = $12`,
          [title || 'ไม่ระบุชื่อเรื่อง', memo_no, parsedMemoDate, main_text, finalDueDate, is_urgent, urgency_level, secret_level, parsedSignDate, parsedMeetingDate, parsedReplyDueDate, taskId, sender, recipient_to, additional_docs, round, notes]
        );
        await logTaskAction(client, taskId, validCreatorId, 'updated_task', { source: 'manual_create_upsert' });
    } else {
        const taskRes = await client.query(
          `INSERT INTO tasks (title, memo_no, memo_date, main_text, due_date, is_urgent, status, created_by, urgency_level, secret_level, sign_date, meeting_date, reply_due_date, receive_no, receive_year, round, sender, recipient_to, additional_docs, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13, $14, $15, $16, $20, $17, $18, $19, $21, COALESCE(CAST($11 AS timestamp), NOW())) RETURNING id`,
          [title || 'ไม่ระบุชื่อเรื่อง', memo_no, parsedMemoDate, main_text, finalDueDate, is_urgent || false, 'following', validCreatorId, urgency_level, secret_level, parsedReceiveDate, parsedSignDate, parsedMeetingDate, parsedReplyDueDate, receiveNo, receiveYear, sender, recipient_to, additional_docs, round, notes]
        );
        taskId = taskRes.rows[0].id;
        await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'manual_create' });
    }

    // 🔒 ตรวจสอบ Array Type ป้องกัน Crash 
    if (Array.isArray(assignments) && assignments.length > 0) {
      const processedAssigns = await processAssignmentsInput(assignments, client);
      for (const assign of processedAssigns) {
        const checkAss = await client.query(
          `SELECT id FROM task_assignments WHERE task_id = $1 AND (role_or_name = $2 OR (user_id IS NOT NULL AND user_id = $3))`,
          [taskId, assign.role_or_name, assign.user_id]
        );
        if (checkAss.rows.length === 0) {
          await client.query(
            `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3)`,
            [taskId, assign.user_id, assign.role_or_name]
          );
        }
      }
    }


    await client.query('COMMIT');

    // 🚀 ยิงข้อมูลขึ้น Google Sheets แบบไม่ต้องรอให้เสร็จ (Background task)
    try {
        const fullTaskData = await fetchTaskDataForSheet(taskId);
        if (fullTaskData) {
            if (existingRes.rows.length > 0) {
                updateTaskInSheet(fullTaskData).catch(err => console.error("[Google Sheets Update Sync error]", err.message));
            } else {
                appendTaskToSheet(fullTaskData).catch(err => console.error("[Google Sheets Append Sync error]", err.message));
            }
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
  try {
    const { id } = req.params;

    if (!(await canUserEditTask(req.user, id))) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์เอกสารที่ต้องการอัปโหลด' });
    }

    const taskRes = await pool.query('SELECT id, document_id, memo_no, sender, receive_no FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      try { await fs.unlink(file.path); } catch (e) {}
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลงานนี้' });
    }
    const oldTask = taskRes.rows[0];

    const safeFileName = path.basename(file.path);
    const safePath = path.join(path.dirname(file.path), safeFileName);

    const fnInfo = parseFilenameInfo(file.originalname);

    // เช็คว่าเลขรับในชื่อไฟล์ตรงกับงานเดิมหรือไม่ หากเลขรับไม่ตรง ให้ยกเลิกและแจ้งเตือนทันทีโดยไม่ต้องแสกน
    if (fnInfo.receive_no && oldTask.receive_no) {
      const fileRecNo = String(fnInfo.receive_no).trim();
      const taskRecNo = String(oldTask.receive_no).trim();
      if (fileRecNo !== taskRecNo) {
        try { await fs.unlink(safePath); } catch (e) {}
        return res.status(400).json({
          success: false,
          isMismatched: true,
          message: `เลขรับหนังสือในชื่อไฟล์ (${fileRecNo}) ไม่ตรงกับเลขรับของงานเดิมในระบบ (${taskRecNo}) กรุณาตรวจสอบไฟล์อีกครั้ง`
        });
      }
    }

    // คำนวณ receive_date จากวันที่ไฟล์หรือวันที่สแกนปัจจุบัน
    let computedReceiveDate = new Date().toISOString().split('T')[0];
    try {
      const stats = await fs.stat(safePath);
      if (stats && stats.mtime) {
        computedReceiveDate = new Date(stats.mtime).toISOString().split('T')[0];
      }
    } catch (e) {}

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

    let assignments = [];
    if (fnInfo.assignee) {
      assignments = [{ responsible_person: fnInfo.assignee, role_or_name: fnInfo.assignee }];
    } else if (Array.isArray(primaryMemo.assignments) && primaryMemo.assignments.length > 0) {
      assignments = primaryMemo.assignments;
    }
    primaryMemo.assignments = assignments;
    if (fnInfo.receive_no && !primaryMemo.receive_no) primaryMemo.receive_no = fnInfo.receive_no;
    if (fnInfo.sender && !primaryMemo.sender) primaryMemo.sender = fnInfo.sender;
    primaryMemo.receive_date = computedReceiveDate;

    const formattedFilename = formatStandardFilename(
      primaryMemo.receive_no || oldTask.receive_no,
      primaryMemo.sender || primaryMemo.จาก || oldTask.sender,
      primaryMemo.assignments || null,
      file.originalname
    );

    if (primaryMemo.ที่) {
      primaryMemo.ที่ = convertThaiDigits(primaryMemo.ที่);
    }

    res.status(200).json({
      success: true,
      message: 'สแกนเอกสารสำเร็จ กรุณาตรวจสอบและเลือกข้อมูลก่อนยืนยัน',
      data: {
        tempFilePath: safePath,
        originalname: file.originalname,
        mimetype: file.mimetype,
        filename: formattedFilename,
        extractedMemo: primaryMemo,
        currentTask: oldTask
      }
    });
  } catch (err) {
    console.error('Scan overwrite document error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
};

exports.confirmOverwriteTaskDocument = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { tempFilePath, originalname, mimetype, filename: customFilename, updates } = req.body;

    if (!(await canUserEditTask(req.user, id, client))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
    }

    if (!tempFilePath) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'ไม่พบบันทึกไฟล์ชั่วคราว กรุณาสแกนเอกสารใหม่อีกครั้ง' });
    }

    const safeFileName = path.basename(tempFilePath);
    const safePath = path.join(path.dirname(tempFilePath), safeFileName);

    try {
      await fs.access(safePath);
    } catch (e) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'ไฟล์ชั่วคราวหมดอายุหรือถูกลบแล้ว กรุณาอัปโหลดสแกนใหม่อีกครั้ง' });
    }

    const taskRes = await client.query('SELECT id, document_id, memo_no, sender, receive_no FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลงานนี้' });
    }
    const oldTask = taskRes.rows[0];

    const fileOriginalName = originalname || safeFileName;
    const fileMimeType = mimetype || 'application/pdf';
    const finalFilename = customFilename || fileOriginalName;

    let driveData = null;
    try {
      driveData = await uploadToDrive(
        { path: safePath, originalname: finalFilename, mimetype: fileMimeType },
        DRIVE_FOLDER_ID
      );

      // ลบไฟล์เก่าออกจาก Google Drive หากมีอยู่เดิม
      if (oldTask.document_id) {
        const oldDocRes = await client.query('SELECT drive_file_id FROM documents WHERE id = $1', [oldTask.document_id]);
        if (oldDocRes.rows.length > 0 && oldDocRes.rows[0].drive_file_id) {
          const oldDriveFileId = oldDocRes.rows[0].drive_file_id;
          deleteFromDrive(oldDriveFileId).catch(err => console.error('[Overwrite Drive Delete Warning]:', err.message));
        }
      }
    } catch (driveErr) {
      console.error('[Overwrite Drive Error]:', driveErr.message);
    }

    const hash = generateHash(fileOriginalName + Date.now().toString());
    const docRes = await client.query(
      `INSERT INTO documents (filename, content, content_hash, keywords_found, drive_file_id, drive_web_view_link, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        finalFilename,
        '',
        hash,
        JSON.stringify({ updates }),
        driveData ? driveData.id : null,
        driveData ? driveData.webViewLink : null,
        req.user ? req.user.id : null
      ]
    );
    const newDocId = docRes.rows[0].id;

    // อัปเดตผูก document_id ใหม่
    await client.query(
      `UPDATE tasks SET document_id = $1, updated_at = NOW() WHERE id = $2`,
      [newDocId, id]
    );

    // หากมีการอัปเดตฟิลด์เพิ่มเติมที่ส่งมาจากผู้ใช้ ให้ทำการอัปเดตลงใน tasks table
    if (updates && typeof updates === 'object' && Object.keys(updates).length > 0) {
      const fieldMap = {
        name: 'title',
        title: 'title',
        notes: 'notes',
        sign_date: 'sign_date',
        meeting_date: 'meeting_date',
        reply_due_date: 'reply_due_date',
        memo_no: 'memo_no',
        memo_date: 'memo_date',
        sender: 'sender',
        recipient_to: 'recipient_to',
        urgency_level: 'urgency_level',
        is_urgent: 'is_urgent',
        secret_level: 'secret_level',
        main_text: 'main_text',
        task_detail: 'task_detail'
      };

      const setClauses = [];
      const queryParams = [];
      let paramIdx = 1;

      for (const [key, val] of Object.entries(updates)) {
        const col = fieldMap[key];
        if (col) {
          setClauses.push(`${col} = $${paramIdx}`);
          queryParams.push(val);
          paramIdx++;
        }
      }

      if (setClauses.length > 0) {
        queryParams.push(id);
        await client.query(
          `UPDATE tasks SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx}`,
          queryParams
        );
      }
    }

    try { await fs.unlink(safePath); } catch (e) {}

    await logTaskAction(client, id, req.user ? req.user.id : null, 'overwrite_document', { filename: finalFilename });

    await client.query('COMMIT');

    // 🚀 Sync อัปเดตข้อมูลไป Google Sheets หลังอัปโหลดทับเอกสาร
    try {
      const row = await fetchTaskDataForSheet(id);
      if (row) {
        updateTaskInSheet(row).catch(e => console.error("[Overwrite Sheet Sync Error]", e.message));
      }
    } catch (e) {
      console.error("[Overwrite Sheet Sync Error]", e.message);
    }

    res.status(200).json({
      success: true,
      message: 'อัปโหลดทับเอกสารและบันทึกข้อมูลเรียบร้อยแล้ว!'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Confirm overwrite document error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};

exports.getSuggestions = async (req, res) => {
  try {
    const sendersRes = await pool.query(
      `SELECT TRIM(sender) as value, MAX(created_at) as last_used, COUNT(*) as usage_count
       FROM tasks 
       WHERE sender IS NOT NULL AND TRIM(sender) != '' 
       GROUP BY TRIM(sender) 
       ORDER BY last_used DESC, usage_count DESC, value ASC 
       LIMIT 500`
    );
    const recipientsRes = await pool.query(
      `SELECT TRIM(recipient_to) as value, MAX(created_at) as last_used, COUNT(*) as usage_count
       FROM tasks 
       WHERE recipient_to IS NOT NULL AND TRIM(recipient_to) != '' 
       GROUP BY TRIM(recipient_to) 
       ORDER BY last_used DESC, usage_count DESC, value ASC 
       LIMIT 500`
    );

    res.status(200).json({
      success: true,
      senders: sendersRes.rows.map(r => r.value).filter(Boolean),
      recipients: recipientsRes.rows.map(r => r.value).filter(Boolean)
    });
  } catch (err) {
    console.error("Get suggestions error:", err.message);
    res.status(500).json({ success: false, message: "Server Error", senders: [], recipients: [] });
  }
};

exports.attachTaskDocument = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    if (!(await canUserEditTask(req.user, id, client))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
    }

    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์เอกสารที่ต้องการแนบเพิ่มเติม' });
    }

    if (files.length > 3) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'ระบบรองรับการแนบเอกสารเพิ่มเติมได้สูงสุดครั้งละไม่เกิน 3 ไฟล์เท่านั้น' });
    }

    const taskRes = await client.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (taskRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลงานนี้' });
    }

    let fileNotes = [];
    if (req.body.notes) {
      if (Array.isArray(req.body.notes)) {
        fileNotes = req.body.notes;
      } else if (typeof req.body.notes === 'string') {
        try {
          const parsed = JSON.parse(req.body.notes);
          if (Array.isArray(parsed)) fileNotes = parsed;
          else fileNotes = [req.body.notes];
        } catch (e) {
          fileNotes = [req.body.notes];
        }
      }
    }

    const createdDocs = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeFileName = path.basename(file.path);
      const safePath = path.join(path.dirname(file.path), safeFileName);
      const noteForFile = fileNotes[i] ? String(fileNotes[i]).trim() : null;

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
        `INSERT INTO task_documents (task_id, filename, drive_file_id, drive_web_view_link, doc_type, notes, created_by)
         VALUES ($1, $2, $3, $4, 'attachment', $5, $6) RETURNING id, filename, drive_web_view_link, notes, created_at, created_by`,
        [id, file.originalname, driveData ? driveData.id : null, driveData ? driveData.webViewLink : null, noteForFile, req.user ? req.user.id : null]
      );
      const insertedDoc = docRes.rows[0];
      if (req.user && req.user.name) {
        insertedDoc.uploader_name = req.user.name;
      }
      createdDocs.push(insertedDoc);

      try { await fs.unlink(safePath); } catch (e) {}
    }

    // 📌 อัปเดตฟิลด์ additional_docs ในตาราง tasks ให้ตรงกับ task_documents ล่าสุด
    const attRes = await client.query(
      `SELECT string_agg(
        CONCAT(
          filename,
          CASE WHEN notes IS NOT NULL AND notes != '' THEN CONCAT(' (', notes, ')') ELSE '' END,
          CASE WHEN drive_web_view_link IS NOT NULL AND drive_web_view_link != '' THEN CONCAT(': ', drive_web_view_link) ELSE '' END
        ),
        ', '
      ) as att_str FROM task_documents WHERE task_id = $1 AND filename != 'เอกสารต้นฉบับ' AND LOWER(filename) NOT LIKE '%เอกสารต้นฉบับ%'`,
      [id]
    );
    const newAttStr = (attRes.rows.length > 0 && attRes.rows[0].att_str) ? attRes.rows[0].att_str : null;
    await client.query('UPDATE tasks SET additional_docs = $1, updated_at = NOW() WHERE id = $2', [newAttStr, id]);

    await logTaskAction(client, id, req.user ? req.user.id : null, 'attached_document', { count: files.length });

    await client.query('COMMIT');

    // 🚀 Sync เอกสารแนบเพิ่มเติมไป Google Sheets
    try {
      const row = await fetchTaskDataForSheet(id);
      if (row) {
        updateTaskInSheet(row).catch(e => console.error("[Attach Sheet Sync Error]", e.message));
      }
    } catch (e) {
      console.error("[Attach Sheet Sync Error]", e.message);
    }

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

    if (!(await canUserEditTask(req.user, id))) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
    }

    const docRes = await pool.query('SELECT drive_file_id FROM task_documents WHERE id = $1 AND task_id = $2', [docId, id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบเอกสารแนบนี้' });
    }
    const driveFileId = docRes.rows[0].drive_file_id;
    if (driveFileId) {
      deleteFromDrive(driveFileId).catch(e => console.error('[Drive Delete Error]:', e.message));
    }
    await pool.query('DELETE FROM task_documents WHERE id = $1', [docId]);

    // 📌 อัปเดตฟิลด์ additional_docs ในตาราง tasks
    const attRes = await pool.query(
      `SELECT string_agg(
        CONCAT(
          filename,
          CASE WHEN notes IS NOT NULL AND notes != '' THEN CONCAT(' (', notes, ')') ELSE '' END,
          CASE WHEN drive_web_view_link IS NOT NULL AND drive_web_view_link != '' THEN CONCAT(': ', drive_web_view_link) ELSE '' END
        ),
        ', '
      ) as att_str FROM task_documents WHERE task_id = $1 AND filename != 'เอกสารต้นฉบับ' AND LOWER(filename) NOT LIKE '%เอกสารต้นฉบับ%'`,
      [id]
    );
    const newAttStr = (attRes.rows.length > 0 && attRes.rows[0].att_str) ? attRes.rows[0].att_str : null;
    await pool.query('UPDATE tasks SET additional_docs = $1, updated_at = NOW() WHERE id = $2', [newAttStr, id]);

    // 🚀 Sync Sheet หลังลบเอกสารแนบ
    try {
      const row = await fetchTaskDataForSheet(id);
      if (row) {
        updateTaskInSheet(row).catch(e => console.error("[Delete Attach Sheet Sync Error]", e.message));
      }
    } catch (e) {
      console.error("[Delete Attach Sheet Sync Error]", e.message);
    }

    res.status(200).json({ success: true, message: 'ลบเอกสารแนบเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Delete attachment error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateTaskAttachmentNote = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { notes } = req.body;

    if (!(await canUserEditTask(req.user, id))) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขงานที่ไม่ได้อยู่ในความรับผิดชอบของคุณ' });
    }

    const docRes = await pool.query('SELECT id FROM task_documents WHERE id = $1 AND task_id = $2', [docId, id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบเอกสารแนบนี้' });
    }

    await pool.query('UPDATE task_documents SET notes = $1 WHERE id = $2', [notes !== undefined ? notes : null, docId]);

    // 📌 อัปเดตฟิลด์ additional_docs ในตาราง tasks
    const attRes = await pool.query(
      `SELECT string_agg(
        CONCAT(
          filename,
          CASE WHEN notes IS NOT NULL AND notes != '' THEN CONCAT(' (', notes, ')') ELSE '' END,
          CASE WHEN drive_web_view_link IS NOT NULL AND drive_web_view_link != '' THEN CONCAT(': ', drive_web_view_link) ELSE '' END
        ),
        ', '
      ) as att_str FROM task_documents WHERE task_id = $1 AND filename != 'เอกสารต้นฉบับ' AND LOWER(filename) NOT LIKE '%เอกสารต้นฉบับ%'`,
      [id]
    );
    const newAttStr = (attRes.rows.length > 0 && attRes.rows[0].att_str) ? attRes.rows[0].att_str : null;
    await pool.query('UPDATE tasks SET additional_docs = $1, updated_at = NOW() WHERE id = $2', [newAttStr, id]);

    await logTaskAction(pool, id, req.user ? req.user.id : null, 'updated_attachment_note', { docId, notes });

    // 🚀 Sync ข้อมูลไป Google Sheets หลังแก้ไขหมายเหตุเอกสารแนบ
    try {
      const row = await fetchTaskDataForSheet(id);
      if (row) {
        updateTaskInSheet(row).catch(e => console.error("[Update Attach Note Sheet Sync Error]", e.message));
      }
    } catch (e) {
      console.error("[Update Attach Note Sheet Sync Error]", e.message);
    }

    res.status(200).json({ success: true, message: 'อัปเดตหมายเหตุเอกสารแนบเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Update attachment note error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getNextReserveNo = async (req, res) => {
  const client = await pool.connect();
  try {
    const dateInput = req.query.date ? parseThaiDateToIso(req.query.date) : new Date();
    const { round, fiscalYearBE: fiscalYear } = calculateFiscalRoundAndYear(dateInput);
    const resCount = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1 AND COALESCE(round, 1) = $2', [fiscalYear, round]);
    const nextReceiveNo = (resCount.rows[0].max_no || 0) + 1;
    res.status(200).json({ success: true, nextReceiveNo, currentYear: fiscalYear, round });
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
    const dateInput = req.body.date ? parseThaiDateToIso(req.body.date) : new Date();
    const { round, fiscalYearBE: fiscalYear } = calculateFiscalRoundAndYear(dateInput);
    
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
      const resCount = await client.query('SELECT MAX(receive_no) as max_no FROM tasks WHERE receive_year = $1 AND COALESCE(round, 1) = $2', [fiscalYear, round]);
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
        `INSERT INTO tasks (title, status, created_by, receive_no, receive_year, round, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        ['กันเลขลงรับ', 'following', validCreatorId, i, fiscalYear, round, dueDate]
      );
      const taskId = taskRes.rows[0].id;
      createdIds.push({
        id: taskId,
        receive_no: i,
        receive_year: fiscalYear,
        round: round,
        created_at: new Date(),
        title: 'กันเลขลงรับ',
        due_date: dueDate
      });
      await logTaskAction(client, taskId, validCreatorId, 'created_task', { source: 'reserve_number', no: i, round });
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
      receive_year: fiscalYear,
      round
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Reserve task error:", err.message);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  } finally {
    client.release();
  }
};