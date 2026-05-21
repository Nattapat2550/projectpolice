const pdfParse = require("pdf-parse");

exports.scanPDF = async (req, res, next) => {
  try {
    // ดึงไฟล์ตัวแรกออกมาจาก req.files (เพราะเราไม่ได้ระบุชื่อ Key แล้ว)
    const uploadedFile = req.files && req.files.length > 0 ? req.files[0] : req.file;

    if (!uploadedFile) {
      return res.status(400).json({ success: false, message: "Please upload a valid PDF file." });
    }

    // สแกนข้อมูลจากไฟล์
    const data = await pdfParse(uploadedFile.buffer);
    
    res.status(200).json({
      success: true,
      data: {
        numberOfPages: data.numpages,
        author: data.info.Author || "Unknown",
        title: data.info.Title || "Unknown",
        text: data.text.trim()
      },
    });
  } catch (err) {
    console.error("DEBUG ERROR:", err); // เพิ่มบรรทัดนี้
    res.status(500).json({ 
        success: false, 
        message: "PDF Scan Error: " + err.message // เพิ่ม err.message เพื่อดูว่าบั๊กคืออะไร
    });
}
};