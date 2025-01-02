export type Config = {
    inputMode: string,
    numColumns: number,
    showBoxTagsInTasks: boolean,
    tasks: Task[],
    tags: Tag[],
    boxes: Box[],
};

export type Task = {
    title: string,
    id: string,
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