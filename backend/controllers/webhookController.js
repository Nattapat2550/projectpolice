const pool = require('../config/db');
const { cleanToOnlyName, formatStandardFilename } = require('../utils/filenameParser');
const { renameFileOnDrive } = require('../services/googleDriveService');

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
  const memo_no = data.memo_no;
  const memo_date = data.memo_date;
  const sender = data.sender;
  const title = data.title;
  const due_date = data.due_date;
  const task_detail = data.task_detail;
  const sign_date = data.sign_date;
  const notes = data.notes;

  const parseDate = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0];
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
          memo_no = COALESCE($3, memo_no),
          memo_date = COALESCE($4, memo_date),
          sender = COALESCE($5, sender),
          title = COALESCE($6, title),
          due_date = COALESCE($7, due_date),
          task_detail = COALESCE($8, task_detail),
          sign_date = COALESCE($9, sign_date),
          notes = COALESCE($10, notes),
          updated_at = NOW()
        WHERE id = $11
      `;

      await client.query(updateQuery, [
        receive_no ? parseInt(receive_no, 10) : null,
        receive_year ? parseInt(receive_year, 10) : null,
        memo_no,
        parseDate(memo_date),
        sender,
        title,
        parseDate(due_date),
        task_detail,
        parseDate(sign_date),
        notes,
        taskId
      ]);
            // 👥 หากมีการส่งข้อมูลผู้รับผิดชอบ (personInCharge / Column I) มาจาก Google Sheets
      const personInCharge = data.personInCharge !== undefined ? data.personInCharge 
        : (data.person_in_charge !== undefined ? data.person_in_charge 
        : (data.responsible_person !== undefined ? data.responsible_person 
        : (data.assignee !== undefined ? data.assignee : undefined)));
      if (personInCharge !== undefined && personInCharge !== null) {
        await client.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
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
          await client.query(
            `INSERT INTO task_assignments (task_id, user_id, role_or_name)
             VALUES ($1, $2, $3)`,
            [taskId, matchedUserId, cleanName]
          );
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
