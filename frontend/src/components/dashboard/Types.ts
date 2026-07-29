export interface AssigneeData {
    name: string;
    color: string;
}

export interface TaskFromAPI {
    id: string;
    name: string;
    personInCharge: string;
    assigneesData: AssigneeData[];
    date: string; 
    createdAt: string;
    status: string; 
    isUrgent: boolean;
    receive_year?: number | string;
    memo_date?: string;
    receive_no?: number | string;
}

export interface TaskDetail {
    taskId: string;
    taskName: string;
    status: string;
    dueDate: string;
    isUrgent: boolean;
}

export interface UserStat {
    userName: string;
    color: string;
    totalTasks: number;
    completedTasks: number;
    incompleteTasks: number;
    tasksDetails: TaskDetail[];
}

export type SortKey = 'userName' | 'totalTasks' | 'completedTasks' | 'incompleteTasks';

export interface GlobalMetrics {
    total: number;
    completed: number;
    rate: number;
    totalPeople: number;
}