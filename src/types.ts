export const SyncedStoreShape = {
    config: {} as Config,
    tasks: [] as Task[],
    tags: [] as Tag[],
    boxes: [] as Box[]
};

export type SyncedStoreType = {
    config: Config,
    tasks: Array<Task>,
    tags: Array<Tag>,
    boxes: Array<Box>
}

export type Config = {
    numColumns: number,
    showBoxTagsInTasks: boolean
}

export enum TaskStatus {
    New = "new",
    InProgress = "in_progress",
    Done = "done",
}

export type Task = {
    title: string,
    id: string,
    status: TaskStatus,
    tags: string[],
    boxPositions?: BoxPositions,
};

export type BoxPositions = { [name: string]: number | undefined };

export type TaskRef = {
    boxId?: string,
    taskId: string,
};

export type Tag = { name: string, color?: string };

export type Box = {
    name?: string,
    tags: string[],
    id: string,
    columnIndex?: number,
}