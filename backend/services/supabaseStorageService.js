const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'police-documents';

// สร้าง Supabase Client สำหรับเชื่อมต่อกับ Storage
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * อัพโหลดไฟล์ขึ้น Supabase Storage บักเก็ต
 * @param {Object} fileObject - ออบเจกต์ไฟล์ที่ได้รับมาจาก Multer (req.file)
 */
const uploadToSupabase = async (fileObject) => {
  try {
    // อ่านไฟล์ออกมาเป็น Buffer เพื่อเตรียมอัปโหลด
    const fileBuffer = await fs.promises.readFile(fileObject.path);
    
    // ตั้งชื่อไฟล์ใน Storage เพื่อป้องกันชื่อซ้ำกันโดยใช้ Timestamp
    const fileExtension = fileObject.originalname.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

    // ส่งไฟล์ขึ้นไปยัง Supabase Storage Bucket
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(uniqueFileName, fileBuffer, {
        contentType: fileObject.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // ดึงลิงก์ Public URL สำหรับนำไปเข้าถึงไฟล์ได้โดยตรง
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uniqueFileName);

    return {
      id: data.path, // นำ path ของไฟล์มาเก็บแทน File ID
      publicUrl: publicUrlData.publicUrl
    };
  } catch (error) {
    console.error('[Supabase Storage Service Error]:', error.message);
    throw error;
  }
};

module.exports = { uploadToSupabase };