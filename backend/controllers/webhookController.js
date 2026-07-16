const pool = require('../config/db');

exports.handleSheetUpdate = async (req, res) => {
  const data = req.body;
  const taskId = data.id;

  if (!taskId) {
    return res.status(400).json({ success: false, message: 'Missing Task ID' });
  }

  // Map sheet columns to DB fields based on our known structure
  // 'ID', 'เลขทะเบียน', 'ปีทะเบียน', 'วันที่รับ', 'ที่หนังสือ', 'ลงวันที่', 'จาก', 'เรื่อง', 'ผู้ปฏิบัติ', 'วันที่', 'ข้อสั่งการ', 'วันที่ลงนาม'
  
  const receive_no = data['เลขทะเบียน'];
  const receive_year = data['ปีทะเบียน'];
  // const created_at = data['วันที่รับ']; // Typically we don't update created_at
  const memo_no = data['ที่หนังสือ'];
  const memo_date = data['ลงวันที่'];
  const sender = data['จาก'];
  const title = data['เรื่อง'];
  // const personInCharge = data['ผู้ปฏิบัติ']; // Updating assignments requires more logic (deleting and inserting)
  const due_date = data['วันที่'];
  const task_detail = data['ข้อสั่งการ'];
  const sign_date = data['วันที่ลงนาม'];

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
          updated_at = NOW()
        WHERE id = $10
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
        taskId
      ]);

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
