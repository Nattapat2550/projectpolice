"use client";

import { useState, useRef, DragEvent, ChangeEvent, useEffect } from "react";
import styles from "./fileUploader.module.css";
import axios from "axios";
import { useRouter } from "next/navigation";

interface FileUploaderProps {
    setExtractedData: (data: any) => void;
    progress: number;
    setProgress: (progress: number) => void;
}

export default function FileUploader({ setExtractedData, progress, setProgress }: FileUploaderProps) {
    const router = useRouter();
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [ocrEngine, setOcrEngine] = useState<"gemini" | "ocr">("gemini");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Timer effect
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isUploading) {
            timer = setInterval(() => {
                setElapsedTime((prev) => prev + 1);
            }, 1000);
        } else {
            setElapsedTime(0);
        }
        return () => clearInterval(timer);
    }, [isUploading]);

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const validFiles = Array.from(e.dataTransfer.files as FileList).filter(
                (file) => file.name && file.name !== "folder.png"
            );
            if (validFiles.length > 0) {
                setFiles((prev) => [...prev, ...validFiles]);
            }
        }
    };

    const handleClick = () => { fileInputRef.current?.click(); };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles((prev) => [...prev, ...Array.from(e.target.files as FileList)]);
        }
    };

    const removeFile = (indexToRemove: number) => {
        setFiles(files.filter((_, index) => index !== indexToRemove));
    };

    const handleUpload = async () => {
        if (files.length === 0) {
            setMessage({ text: "กรุณาเลือกไฟล์ก่อนทำการอัพโหลด", type: "error" });
            return;
        }

        setIsUploading(true);
        setMessage(null);
        setProgress(1); 
        setExtractedData(null); 

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5003";
        const token = localStorage.getItem("token"); 
        const allResults: any[] = [];
        const totalFiles = files.length;

        try {
            for (let i = 0; i < totalFiles; i++) {
                const currentFile = files[i];
                setMessage({ 
                    text: `กำลังให้ AI ประมวลผลไฟล์ที่ ${i + 1}/${totalFiles} (${currentFile.name})...`, 
                    type: "success" 
                });

                const formData = new FormData();
                formData.append("files", currentFile); 
                formData.append("engine", ocrEngine);

                try {
                    const response = await axios.post(`${backendUrl}/api/v1/documents/process`, formData, {
                        headers: { 
                            "Content-Type": "multipart/form-data",
                            "Authorization": `Bearer ${token}` 
                        }
                    });

                    if (response.status === 200 && response.data?.results) {
                        allResults.push(...response.data.results);
                    }
                } catch (fileError: any) {
                    console.error(`Error processing file ${currentFile.name}:`, fileError);
                    allResults.push({
                        filename: currentFile.name,
                        status: "error",
                        error: fileError.response?.data?.message || fileError.message || "เกิดข้อผิดพลาดในการประมวลผล"
                    });
                }

                // คำนวณความคืบหน้ารวมตามจำนวนไฟล์
                const currentPercent = Math.round(((i + 1) / totalFiles) * 100);
                setProgress(currentPercent);
            }

            const successResults = allResults.filter((r: any) => r.status === "success");
            const errorResults = allResults.filter((r: any) => r.status === "error");

            if (successResults.length > 0) {
                if (errorResults.length > 0) {
                    setMessage({ 
                        text: `สแกนสำเร็จ ${successResults.length}/${totalFiles} ไฟล์ (มี ${errorResults.length} ไฟล์ล้มเหลว)`, 
                        type: "success" 
                    });
                } else {
                    setMessage({ 
                        text: `แสกนข้อมูลสำเร็จครบทั้ง ${totalFiles} ไฟล์! กรุณาตรวจสอบและมอบหมายงานทางขวามือ`, 
                        type: "success" 
                    });
                }
                setFiles([]); 
                setExtractedData(allResults);
            } else {
                const firstErrMsg = errorResults[0]?.error || "ไม่สามารถเชื่อมต่อได้";
                setMessage({ text: `เกิดข้อผิดพลาด: ${firstErrMsg}`, type: "error" });
            }
        } catch (error: any) {
            console.error("Upload error:", error);
            setMessage({ text: `เกิดข้อผิดพลาด: ${error.response?.data?.message || error.message || "ไม่สามารถเชื่อมต่อได้"}`, type: "error" });
        } finally {
            setIsUploading(false);
            setProgress(0); 
        }
    };

    const isUploadDisabled = isUploading || files.length === 0;

    return (
        <div className="flex flex-col w-full h-full gap-6 min-h-75">
            <h1 className={styles.Header}>อัพโหลดไฟล์เอกสาร</h1>
            
            <div 
                className={styles.ContentWrapper}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={handleClick}
                style={{ cursor: "pointer" }}
            >
                <div className={styles.ContentContainer}>
                    {files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center w-full h-full gap-4 text-foreground p-4 opacity-80 hover:opacity-100 transition-opacity select-none">
                            {/* รูปภาพ folder.png (ปิด draggable และ pointer-events ป้องกันการลากตัวรูป) */}
                            <img 
                                src="/folder.png" 
                                alt="Folder Upload" 
                                draggable={false}
                                className="w-full h-full max-h-48 object-contain drop-shadow-md pointer-events-none select-none"
                            />
                            <span className="font-medium text-lg pointer-events-none">อัพโหลดหรือลากไฟล์เอกสารมาที่นี่</span>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-2 w-full max-w-sm px-4 text-sm text-foreground">
                            {files.map((file, index) => (
                                <li key={index} className="flex justify-between items-center bg-(--wrapper) p-2 rounded">
                                    <span className="truncate pr-4">{file.name}</span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                        className="text-red-500 font-bold hover:text-red-700"
                                    >✕</button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" style={{ display: 'none' }} />

            {message && (
                <div className={`text-sm text-center ${message.type === "success" ? "text-green-600 font-bold" : "text-red-600"}`}>
                    {message.text}
                </div>
            )}

            {progress > 0 && (
                <div className="w-full flex flex-col gap-1">
                    <div className="w-full bg-(--wrapper) rounded-full h-2.5 overflow-hidden">
                        {progress < 100 ? (
                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                        ) : isUploading ? (
                            <div className={styles.indeterminateBar}></div>
                        ) : (
                            <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `100%` }}></div>
                        )}
                    </div>
                    {isUploading && (
                        <div className="text-xs text-center text-gray-500 mt-1">
                            กำลังประมวลผล... ผ่านไปแล้ว {elapsedTime} วินาที
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="flex flex-row gap-2 justify-center mt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input 
                            type="radio" 
                            name="ocrEngine" 
                            value="gemini" 
                            checked={ocrEngine === "gemini"} 
                            onChange={() => setOcrEngine("gemini")} 
                            className="cursor-pointer w-4 h-4 text-blue-600"
                        />
                        ใช้ Gemini (Google Cloud) - แนะนำ
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm ml-4">
                        <input 
                            type="radio" 
                            name="ocrEngine" 
                            value="ocr" 
                            checked={ocrEngine === "ocr"} 
                            onChange={() => setOcrEngine("ocr")} 
                            className="cursor-pointer w-4 h-4 text-blue-600"
                        />
                        ใช้ Local OCR (EasyOCR)
                    </label>
                </div>

                <button 
                    className={styles.Button} 
                    onClick={handleUpload}
                    disabled={isUploadDisabled}
                    style={{ 
                        opacity: isUploadDisabled ? 0.6 : 1, 
                        cursor: isUploadDisabled ? "not-allowed" : "pointer",
                        backgroundColor: files.length === 0 ? "#9ca3af" : undefined, 
                        color: files.length === 0 ? "#ffffff" : undefined
                    }}
                >
                    {isUploading ? "กำลังประมวลผล..." : "อัพโหลดไฟล์"}
                </button>
                <button 
                    className={styles.Button} 
                    onClick={() => router.push("/addFile/self-add")}
                >
                    เพิ่มงานติดตามด้วยตนเอง
                </button>
                <button 
                    className={styles.Button} 
                    onClick={() => router.push("/addFile/excel-upload")}
                >
                    นำเข้าจาก Excel
                </button>
            </div>
        </div>
    );
}