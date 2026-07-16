import AllTaskItem from "../TaskContent/AllTaskItem";
import styles from "./TaskDisplayer.module.css";

// 💡 เพิ่ม Type มารองรับข้อมูลสีที่ส่งมาจาก Backend
type AssigneeData = {
    name: string;
    color: string;
};

type Task = {
    id: string;
    name: string;
    personInCharge: string;
    date: string;
    status: string;
    createdAt?: string; // 💡 เพิ่มฟิลด์รับวันที่สร้าง
    assigneesData?: AssigneeData[]; // 💡 เพิ่มฟิลด์รับข้อมูลสี
    urgency_level?: string;
    secret_level?: string;
    meeting_date?: string;
    reply_due_date?: string;
};

type Props = {
    tasks: Task[];
    onStatusChange: (
        id: string,
        status: TaskStatus
    ) => void;
};

type TaskStatus = "following" | "completed";

export default function TaskDisplayer({
    tasks,
    onStatusChange
}: Props) {

    return (
        <div className={styles.ContentContent}>
            <div className={styles.ContentContentScrollable}>
                {tasks.map((task) => (
                    <AllTaskItem
                        key={task.id}
                        id={task.id}
                        name={task.name}
                        personInCharge={task.personInCharge}
                        date={task.date}
                        status={task.status}
                        createdAt={task.createdAt} // 💡 ส่งต่อวันที่สร้างงานให้หลอด Progress
                        assigneesData={task.assigneesData} // 💡 ส่งต่อข้อมูลสีให้กล่องรายชื่อ
                        urgency_level={task.urgency_level}
                        secret_level={task.secret_level}
                        meeting_date={task.meeting_date}
                        reply_due_date={task.reply_due_date}
                        onStatusChange={onStatusChange}
                    />
                ))}
            </div>
        </div>
    );
}