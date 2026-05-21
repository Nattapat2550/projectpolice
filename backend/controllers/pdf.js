const pdfParse = require("pdf-parse");

// @desc    Upload and scan PDF to extract text
// @route   POST /api/v1/pdf/scan
// @access  Public (สามารถปรับเป็น Private ได้ถ้าเพิ่ม Middleware auth)
exports.scanPDF = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "Please upload a valid PDF file." 
      });
    }

    // อ่านข้อมูลจาก Buffer ที่ multer เก็บไว้ในหน่วยความจำ
    const data = await pdfParse(req.file.buffer);

    res.status(200).json({
      success: true,
      data: {
        numberOfPages: data.numpages,
        author: data.info.Author || "Unknown",
        title: data.info.Title || "Unknown",
        text: data.text.trim() // ข้อความที่สแกนได้จาก PDF
      },
    });
  } catch (err) {
    console.error(`PDF Scan Error: ${err.message}`);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while scanning the PDF file." 
    });
  }
};