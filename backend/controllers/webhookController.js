const pool = require('../config/db');
const { cleanToOnlyName, formatStandardFilename } = require('../utils/filenameParser');
const { renameFileOnDrive } = require('../services/googleDriveService');
const { syncTaskDocumentNotesFromText } = require('../utils/attachmentSync');

exports.handleSheetUpdate = async (req, res) => {
  console.log("\n================ WEBHOOK RECEIVED ================");
  console.log("Webhook Payload:", req.body);
  const data = req.body;
  const taskId = data.id;

  if (!taskId) {
    return res.status(400).json({ success: false, message: 'Missing Task ID' });
  }

  const receive_no = data.receive_no;
  const receive_year = data.receive_year;
  const created_at = data.created_at;
  const memo_no = data.memo_no;
  const memo_date = data.memo_date;
  const sender = data.sender;
  const recipient_to = data.recipient_to;
  const title = data.title;
  const due_date = data.due_date;
  const task_detail = data.task_detail;
  const sign_date = data.sign_date;
  const notes = data.notes;
  const urgency_level = data.urgency_level || data.urgencyLevel || data['ชั้นความเร็ว'] || data['ความเร่งด่วน'] || null;
  const secret_level = data.secret_level || data.secretLevel || data['ชั้นความลับ'] || data['ความลับ'] || null;
  const additional_docs = data.additional_docs;
  const document_link = data.document_link || data.drive_web_view_link;

  const parseDate = (d) => {
    if (!d) return null;
    const str = String(d).trim();
    if (!str) return null;

    // Case 1: DD/MM/YYYY or D/M/YYYY (e.g. 22/7/2569, 05/08/2569, 22/07/2026)
    const dmYMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmYMatch) {
      let day = parseInt(dmYMatch[1], 10);
      let month = parseInt(dmYMatch[2], 10);
      let year = parseInt(dmYMatch[3], 10);
      if (year >= 2500 && year <= 2650) year -= 543;
      if (year >= 1900 && year <= 2150 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Case 2: YYYY-MM-DD (e.g. 2569-07-22 or 2026-07-22)
    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      let year = parseInt(ymdMatch[1], 10);
      let month = parseInt(ymdMatch[2], 10);
      let day = parseInt(ymdMatch[3], 10);
      if (year >= 2500 && year <= 2650) year -= 543;
      if (year >= 1900 && year <= 2150 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Case 3: Fallback standard JS Date
    const dt = new Date(str);
    if (isNaN(dt.getTime())) return null;
    let year = dt.getFullYear();
    if (year >= 2500 && year <= 2650) year -= 543;
    if (year < 1900 || year > 2150) return null;
    return `${year}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const updateQuery = `
        UPDATE tasks 
        SET 
          receive_no = COALESCE($1, receive_no),
          receive_year = COALESCE($2, receive_year),
          memo_no = COALESCE(memo_no, $3),
          memo_date = COALESCE(memo_date, $4),
          sender = COALESCE(sender, $5),
          recipient_to = COALESCE(recipient_to, $6),
          title = COALESCE(title, $7),
          due_date = COALESCE($8, due_date),
          task_detail = COALESCE($9, task_detail),
          sign_date = COALESCE(sign_date, $10),
          notes = COALESCE($11, notes),
          additional_docs = COALESCE($12, additional_docs),
          urgency_level = COALESCE(urgency_level, $13),
          secret_level = COALESCE(secret_level, $14),
          updated_at = NOW()
        WHERE id = $16
      `;

      await client.query(updateQuery, [
        receive_no ? parseInt(receive_no, 10) : null,
        receive_year ? parseInt(receive_year, 10) : null,
        memo_no,
        parseDate(memo_date),
        sender,
        recipient_to,
        title,
        parseDate(due_date),
        task_detail,
        parseDate(sign_date),
        notes,
        additional_docs,
        urgency_level,
        secret_level,
        parseDate(created_at),
        taskId
      ]);

      if (additional_docs !== undefined) {
        await syncTaskDocumentNotesFromText(client, taskId, additional_docs);
      }

      // 📄 หากมีการส่ง document_link (ลิงก์ไฟล์ต้นฉบับ / Column P) มาจาก Google Sheets
      if (document_link) {
        const taskRes = await client.query('SELECT document_id FROM tasks WHERE id = $1', [taskId]);
        if (taskRes.rows.length > 0) {
          const docId = taskRes.rows[0].document_id;
          if (docId) {
            await client.query('UPDATE documents SET drive_web_view_link = $1 WHERE id = $2', [document_link, docId]);
          } else {
            const newDocRes = await client.query(
              `INSERT INTO documents (drive_web_view_link, filename) VALUES ($1, $2) RETURNING id`,
              [document_link, 'ไฟล์ต้นฉบับ (จาก Sheet)']
            );
            await client.query('UPDATE tasks SET document_id = $1 WHERE id = $2', [newDocRes.rows[0].id, taskId]);
          }
        }
      }
            // 👥 หากมีการส่งข้อมูลผู้รับผิดชอบ (personInCharge / Column I) มาจาก Google Sheets
      const personInCharge = data.personInCharge !== undefined ? data.personInCharge 
        : (data.person_in_charge !== undefined ? data.person_in_charge 
        : (data.responsible_person !== undefined ? data.responsible_person 
        : (data.assignee !== undefined ? data.assignee : undefined)));
      if (personInCharge !== undefined && personInCharge !== null) {
        const rawAssignees = String(personInCharge)
          .split(/[,;\n]/)
          .map(s => s.trim())
          .filter(Boolean);
        for (const rawAssignee of rawAssignees) {
          const cleanName = cleanToOnlyName(rawAssignee);
          if (!cleanName) continue;
          // ค้นหา user_id ในระบบที่มีชื่อหรือตำแหน่งตรงกัน
          const userRes = await client.query(
            `SELECT id FROM users 
             WHERE LOWER(TRIM(name)) = LOWER($1) 
                OR LOWER(TRIM(role)) = LOWER($1)
                OR LOWER(TRIM(name)) LIKE LOWER($2)
             LIMIT 1`,
            [cleanName, `%${cleanName}%`]
          );
          const matchedUserId = userRes.rows.length > 0 ? userRes.rows[0].id : null;
          const checkAss = await client.query(
            `SELECT id FROM task_assignments WHERE task_id = $1 AND (role_or_name = $2 OR (user_id IS NOT NULL AND user_id = $3))`,
            [taskId, cleanName, matchedUserId]
          );
          if (checkAss.rows.length === 0) {
            await client.query(
              `INSERT INTO task_assignments (task_id, user_id, role_or_name) VALUES ($1, $2, $3)`,
              [taskId, matchedUserId, cleanName]
            );
          }
        }
      }
      // 🏷️ อัปเดตเปลี่ยนชื่อไฟล์บน Google Drive หากแก้ไขข้อมูลที่ส่งผลต่อชื่อไฟล์
      const docRes = await client.query(
        `SELECT t.receive_no, t.sender, d.id as doc_id, d.filename, d.drive_file_id,
         (SELECT string_agg(role_or_name, ', ') FROM task_assignments ta WHERE ta.task_id = t.id) as "personInCharge"
         FROM tasks t
         LEFT JOIN documents d ON t.document_id = d.id
         WHERE t.id = $1`,
        [taskId]
      );
      if (docRes.rows.length > 0 && docRes.rows[0].doc_id && docRes.rows[0].filename) {
        const row = docRes.rows[0];
        const newFilename = formatStandardFilename(row.receive_no, row.sender, row.personInCharge, row.filename);
        if (newFilename && newFilename !== row.filename) {
          if (row.drive_file_id) {
            renameFileOnDrive(row.drive_file_id, newFilename).catch(err => console.error("[Webhook Drive Rename Error]", err.message));
          }
          await client.query('UPDATE documents SET filename = $1 WHERE id = $2', [newFilename, row.doc_id]);
        }
      }
      const editorEmail = data.editorEmail || null;
      const logDetails = { source: 'google_sheets' };
      if (editorEmail) logDetails.editor = editorEmail;

      await client.query(
        `INSERT INTO task_logs (task_id, user_id, action, details) VALUES ($1, null, 'updated_from_sheet', $2)`,
        [taskId, JSON.stringify(logDetails)]
      );

      await client.query('COMMIT');
            console.log(`[Webhook] Successfully updated task ID ${taskId} and assignees from Google Sheets`);
      res.status(200).json({ success: true, message: 'Updated from Sheet' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Webhook] Update Error:', error);
    res.status(500).json({ success: false, message: 'Server error processing webhook' });
  }
};
