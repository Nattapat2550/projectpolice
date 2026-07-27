"use client";

import { useState, useEffect, useRef } from "react";
import FileUploader from "@/components/Uploader/FileUploader";
import Uploaded from "@/components/Uploader/Uploaded";

export default function AddFilePage() {
    // สร้าง State สำหรับเก็บข้อมูลที่สแกนได้ และ % การอัพโหลด
    const [extractedData, setExtractedData] = useState<any>(null);
    const [progress, setProgress] = useState<number>(0);

    const extractedDataRef = useRef<any>(null);
    useEffect(() => {
        extractedDataRef.current = extractedData;
    }, [extractedData]);

    // 🧹 เมื่อผู้ใช้เปลี่ยนหน้าไปหน้าอื่นโดยไม่ได้กดยืนยัน ให้ส่งสัญญาณลบไฟล์ชั่วคราวออกจากโฟลเดอร์ uploads ทันที
    useEffect(() => {
        return () => {
            const currentData = extractedDataRef.current;
            if (currentData && Array.isArray(currentData) && currentData.length > 0) {
                const pathsToClean: string[] = [];
                currentData.forEach((file: any) => {
                    if (file?.fileInfo?.path) {
                        pathsToClean.push(file.fileInfo.path);
                    }
                });
                if (pathsToClean.length > 0) {
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
                    const token = localStorage.getItem("token") || "";
                    fetch(`${backendUrl}/api/v1/documents/clean-temp`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(token ? { "Authorization": `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({ paths: pathsToClean }),
                        keepalive: true
                    }).catch(() => {});
                }
            }
        };
    }, []);

    return (
        <div className="flex flex-col md:flex-row justify-between w-full md:h-full p-16 pt-8 gap-12 overflow-hidden">
            <div className="flex flex-1 min-h-0">
                {/* ส่งฟังก์ชันไปให้ Uploader เพื่อรับข้อมูลกลับมา */}
                <FileUploader 
                    setExtractedData={setExtractedData} 
                    progress={progress}
                    setProgress={setProgress}
                />
            </div>
            <div className="flex flex-2 min-h-0 ">
                {/* ส่งข้อมูลที่ได้ ไปให้ Uploaded แสดงผลทางขวา พร้อม callback สำหรับล้างข้อมูลเมื่อบันทึกแล้ว */}
                <Uploaded 
                    extractedData={extractedData} 
                    onClearExtractedData={() => setExtractedData(null)}
                /> 
            </div>
        </div>
    );
}