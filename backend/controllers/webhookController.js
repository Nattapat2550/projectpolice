const pool = require('../config/db');

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

      const editorEmail = data.editorEmail || null;
      const logDetails = { source: 'google_sheets' };
      if (editorEmail) logDetails.editor = editorEmail;

      await client.query(
        `INSERT INTO task_logs (task_id, user_id, action, details) VALUES ($1, null, 'updated_from_sheet', $2)`,
        [taskId, JSON.stringify(logDetails)]
      );

      await client.query('COMMIT');
      console.log(`[Webhook] Successfully updated task ID ${taskId} from Google Sheets`);
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
