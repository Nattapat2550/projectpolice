/**
 * Helper to sync notes in task_documents when additional_docs text is provided
 * (e.g. from Google Sheet Webhook or Excel upload or direct update)
 */
exports.syncTaskDocumentNotesFromText = async (dbQueryable, taskId, additionalDocsText) => {
  if (additionalDocsText === undefined || taskId == null) return;

  try {
    const { rows: docs } = await dbQueryable.query(
      `SELECT id, filename, notes, drive_web_view_link FROM task_documents WHERE task_id = $1 ORDER BY id ASC`,
      [taskId]
    );

    if (!docs || docs.length === 0) return;

    const rawText = additionalDocsText !== null ? String(additionalDocsText).trim() : '';

    if (!rawText) {
      await dbQueryable.query(`UPDATE task_documents SET notes = NULL WHERE task_id = $1`, [taskId]);
      return;
    }

    const parts = rawText.split(/,\s*/);

    if (docs.length === 1) {
      const doc = docs[0];
      let noteToSave = null;

      const parentMatch = rawText.match(/\(([^)]+)\)/);
      if (parentMatch && parentMatch[1]) {
        noteToSave = parentMatch[1].trim();
      } else {
        const cleanStr = rawText
          .replace(/https?:\/\/\S+/gi, '')
          .replace(doc.filename, '')
          .replace(/^[:\s\(\)]+/, '')
          .replace(/[:\s\(\)]+$/, '')
          .trim();
        if (cleanStr && cleanStr !== doc.filename) {
          noteToSave = cleanStr;
        }
      }

      await dbQueryable.query(`UPDATE task_documents SET notes = $1 WHERE id = $2`, [noteToSave, doc.id]);
    } else {
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const matchedPart = parts.find(p => p.includes(doc.filename)) || parts[i] || '';
        let noteToSave = null;

        const parentMatch = matchedPart.match(/\(([^)]+)\)/);
        if (parentMatch && parentMatch[1]) {
          noteToSave = parentMatch[1].trim();
        } else if (matchedPart) {
          const cleanStr = matchedPart
            .replace(/https?:\/\/\S+/gi, '')
            .replace(doc.filename, '')
            .replace(/^[:\s\(\)]+/, '')
            .replace(/[:\s\(\)]+$/, '')
            .trim();
          if (cleanStr && cleanStr !== doc.filename) {
            noteToSave = cleanStr;
          }
        }

        await dbQueryable.query(`UPDATE task_documents SET notes = $1 WHERE id = $2`, [noteToSave, doc.id]);
      }
    }
  } catch (err) {
    console.error("[syncTaskDocumentNotesFromText Error]:", err.message);
  }
};
