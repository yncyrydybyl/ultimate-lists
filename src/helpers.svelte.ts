import { SyncedText } from "@syncedstore/core";
import type { Box, BoxPositions, Task, TaskRef } from "./types";
import { TaskStatus } from "./types";
import { transact } from "./shared.svelte";

// ----- Result helper functions -----

export type Result<T> = { success: true, value: T } | { success: false, error: Error };

export function Ok<T>(value: T): { success: true, value: T} {
    return { success: true, value: value };
}

export function Err(error: Error): { success: false, error: Error} {
    return { success: false, error: error };
}

// ----- tag helper functions -----

export function newTagElement(tagText: string) {
    const el = document.createElement('span');
    el.classList.add('tag');
    el.innerText = tagText;
    return el;
}

export function saveNewTagsForTask(taskEl: HTMLElement, tasks: Array<Task>) {
    taskEl.querySelectorAll('.task-title .tag').forEach((tagEl) => {
        toggleTagForTaskId(getTaskIdForTaskElement(taskEl), (tagEl as HTMLElement).innerText, tasks);
        tagEl.remove();
    });
}

export function toggleTagForTaskId(taskId: string, tagName: string, tasks: Array<Task>) {
    tagName = tagName.replace('#', '').trim();
    for (let task of tasks) {
        if (task.id == taskId) {
            if (!task.tags) {
                task['tags'] = [];
            }

            let index = task.tags.indexOf(tagName);
            if (index === -1) {
                // add tag
                if (tagName.length != 0) {
                    task.tags.push(tagName);
                }
            } else {
                // remove tag
                task.tags.splice(index, 1);
            }
            break;
        }
    }
}


// ----- box helper functions -----

export function getBoxIdForTaskEl(taskEl: HTMLElement): string {
    return (taskEl.closest('.task-box')! as HTMLElement).dataset.taskBoxId!;
}

export function getTaskListElById(boxId: string): HTMLElement {
    return document.querySelector(`#task-list-${boxId}`)!;
}

export function getBoxPositionForTaskEl(taskEl: HTMLElement) {
    return Array.from((taskEl.closest('.task-list')! as HTMLElement).children).indexOf(taskEl);
}

// ----- task helper functions -----

export function createTask(taskId: string, boxPositions: BoxPositions, tags: string[]): Task {
    if (boxPositions == null) boxPositions = {};
    if (tags == null) tags = [];
    return {
        title: new SyncedText(''),
        id: taskId,
        status: TaskStatus.New,
        tags: [...tags],
        boxPositions: boxPositions,
    }
}

export function getBoxWithId(boxId: string, boxes: Array<Box>): Result<Box> {
    for (let box of boxes) {
        if (box.id == boxId) {
            return Ok(box);
        }
    }
    return Err(new Error(`box with id ${boxId} not found.`));
}

export function getTaskByTaskId(taskId: string, tasks: Array<Task>): Result<Task> {
    for (let task of tasks) {
        if (task.id == taskId) {
            return Ok(task);
        }
    }
    return Err(new Error(`task with taskId ${taskId} not found.`));
}

export function appendTaskAfterTaskEl(taskEl: HTMLElement, boxes: Array<Box>, tasks: Array<Task>) {
    const boxId = getBoxIdForTaskEl(taskEl);
    const taskBox = getBoxWithId(boxId, boxes);
    if (!taskBox.success) throw taskBox.error;
    let position = getBoxPositionForTaskEl(taskEl) + 1;

    // create task
    const newTask = createTaskInTaskBox(taskBox.value, position);

    // One transaction for the whole gesture. This rewrites boxPositions for
    // every task below the insertion point; without the transaction each of
    // those is a separate Yjs update and therefore a separate Matrix event.
    return transact(() => {
        // update box position of tasks below
        let taskBelow = taskEl;
        while (taskBelow.nextElementSibling && taskBelow.nextElementSibling instanceof HTMLElement) {
            taskBelow = taskBelow.nextElementSibling;
            let task = getTaskByTaskId(getTaskIdForTaskElement(taskBelow), tasks);
            if (task.success) {
                if (!task.value.boxPositions) task.value.boxPositions = {};
                task.value.boxPositions[boxId] = ++position;
            }
        }

        // add new task
        tasks.push(newTask);
        return newTask;
    });
}


// focus task by given task reference
export function focusTaskByRef(taskRef: TaskRef) {
    const taskEl = getTaskElByRef(taskRef);
    if (taskEl) {
        taskEl.focus();
    } else {
        console.error(`task element for task with boxId ${taskRef.boxId} and taskId ${taskRef.taskId} not found`);
        throw "[focusTaskByRef] task element not found";
    }
}

// focus title of given task element
export function focusTaskTitle(taskEl: HTMLElement) {
    if (!(taskEl instanceof HTMLElement)) {
        console.error("[focusTaskTitle] taskEl is not an instance of HTMLElement", taskEl);
        throw "[focusTaskTitle] taskEl is not an instance of HTMLElement";
    }

    const titleEl = taskEl.querySelector(`.task-title`)!;
    titleEl.setAttribute('contentEditable', "true");
    (titleEl as HTMLElement).focus();

    // prevent user from pasting rich text (only text/plain allowed)
    titleEl.addEventListener('paste', (e) => {
        e.preventDefault()
        var text = (e as ClipboardEvent).clipboardData?.getData('text/plain')
        document.execCommand('insertText', false, text)
    });

    const r = document.createRange();
    r.selectNodeContents(titleEl);
    r.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
}

// focus task title by given task reference
export function focusTaskTitleByRef(taskRef: TaskRef) {
    const taskEl = getTaskElByRef(taskRef);
    if (taskEl) {
        focusTaskTitle(taskEl);
    } else {
        console.error(`task element for task with boxId ${taskRef.boxId} and taskId ${taskRef.taskId} not found`);
        throw "[focusTaskTitleByRef] task element not found";
    }
}

export function getFocusedTaskElement(): Result<HTMLElement>{
    let focusedElement: HTMLElement = document.querySelector('*:focus')!;
    if (focusedElement == null) {
        return Err(new Error("could not find focused task element: no element is focused"));
    } else if (focusedElement.classList.contains('task')) {
        return Ok(focusedElement);
    } else if (focusedElement.parentElement?.classList.contains('task')) {
        return Ok(focusedElement.parentElement);
    } else {
        return Err(new Error("could not find focused task element: focused element is neither task, nor task title"));
    }
}

export function getTaskElById(taskId: string): HTMLElement {
    return document.querySelector(`.task[data-task-id='${taskId}']`)!;
}

function getTaskElByRef(taskRef: TaskRef): HTMLElement {
    let taskEl = document.querySelector(`.task-box[data-task-box-id='${taskRef.boxId}'] .task[data-task-id='${taskRef.taskId}']`) as HTMLElement;
    if (!taskEl) {
        // task element could not be found. Try again without boxId...
        taskEl = getTaskElById(taskRef.taskId);
    }
    return taskEl;
}

export function getTaskIdForTaskElement(el: HTMLElement): string {
    return el.dataset!.taskId!;
}

// get next task after focused task
export function getTaskElBelowFocusedTask(): Result<HTMLElement> {
    const focusedTaskEl = getFocusedTaskElement();
    if (!focusedTaskEl.success) {
        return Err(focusedTaskEl.error);
    }

    if (focusedTaskEl.value.nextElementSibling && focusedTaskEl.value.nextElementSibling instanceof HTMLElement) {
        // return next sibling in current task box
        return Ok(focusedTaskEl.value.nextElementSibling);
    }

    let taskBoxEl = focusedTaskEl.value.closest('.task-box')!.nextElementSibling;
    let columnEl = focusedTaskEl.value.closest('.column');
    while (columnEl) {
        // find next task box in column
        while(taskBoxEl) {
            // find first task in task box
            let taskEl = taskBoxEl.querySelector('.task');
            if (taskEl instanceof HTMLElement) {
                return Ok(taskEl);
            }

            // if task box does not contain any tasks, continue with next task box
            taskBoxEl = taskBoxEl.nextElementSibling;
        }
        // if column does no contain further task boxes, continue with next column
        columnEl = columnEl.nextElementSibling
        taskBoxEl = columnEl?.querySelector('.task-box')!;
    }
    return Err(new Error("no task below focused task found"));
}

export function focusTaskBelowFocusedTaskOrFirstTask() {
    const taskBelowFocusedTask = getTaskElBelowFocusedTask();
    if (taskBelowFocusedTask.success) {
        taskBelowFocusedTask.value.focus();
    } else {
        // no focused task found => focus first task
        const firstTask = getFirstTaskEl();
        if (firstTask instanceof HTMLElement) firstTask.focus();
    }
}

// get previous task before task with given task id or task element
export function getTaskElAboveFocusedTask(): Result<HTMLElement> {
    const focusedTaskEl = getFocusedTaskElement();
    if (!focusedTaskEl.success) {
        return Err(focusedTaskEl.error);
    }

    if (focusedTaskEl.value.previousElementSibling && focusedTaskEl.value.previousElementSibling instanceof HTMLElement) {
        // return previous sibling in current task box
        return Ok(focusedTaskEl.value.previousElementSibling);
    }

    let taskBoxEl = focusedTaskEl.value.closest('.task-box')!.previousElementSibling;
    let columnEl = focusedTaskEl.value.closest('.column');
    while (columnEl) {
        // find previous task box
        while(taskBoxEl){
            // find last task in previous task box
            let taskEl = taskBoxEl.querySelector('.task:last-of-type') as HTMLElement;
            if (taskEl instanceof HTMLElement) {
                return Ok(taskEl);
            }
            // if task box does not contain any task, continue with previous task box
            taskBoxEl = taskBoxEl.previousElementSibling;
        }
        // if column does no contain further task boxes, continue with previous column
        columnEl = columnEl.previousElementSibling
        taskBoxEl = columnEl?.querySelector('.task-box:last-of-type')!;
    }
    return Err(new Error("no task above focused task found"));
}

export function focusTaskAboveFocusedTaskOrLastTask() {
    const taskAboveFocusedTask = getTaskElAboveFocusedTask();
    if (taskAboveFocusedTask.success) {
        taskAboveFocusedTask.value.focus();
    } else {
        // no focused task found => focus last task
        const lastTaskEl = getLastTaskEl();
        if (lastTaskEl) lastTaskEl.focus();
    }
}

function getTaskElRightToFocusedTask(): Result<HTMLElement> {
    const focusedTaskEl = getFocusedTaskElement();
    if (!focusedTaskEl.success) {
        return Err(focusedTaskEl.error);
    }

    let thisColumnEl = focusedTaskEl.value.closest('.column')!;
    let nextColumnEl = focusedTaskEl.value.closest('.column')!.nextElementSibling;
    let focusedTaskElIndexInCoumn = Array.from(thisColumnEl.querySelectorAll('.task')).indexOf(focusedTaskEl.value);

    // find next column that contains tasks (skip columns without tasks)
    while (!nextColumnEl?.querySelector('.task')) {
        nextColumnEl = nextColumnEl!.nextElementSibling;
        if (nextColumnEl == null) {
            // if no next column, proceed with first column
            nextColumnEl = document.querySelector('.column');
        }
    }

    // select task by index in next column
    let nextColumnTaskEls = Array.from(nextColumnEl!.querySelectorAll('.task'));
    let nextColumnTaskEl = nextColumnTaskEls[(focusedTaskElIndexInCoumn < nextColumnTaskEls.length)? focusedTaskElIndexInCoumn : nextColumnTaskEls.length - 1];

    if (nextColumnTaskEl instanceof HTMLElement) {
        return Ok(nextColumnTaskEl);
    }

    return Err(new Error("no task right to focused task found"));
}

export function focusTaskRightToFocusedTask() {
    const taskRightToFocusedTask = getTaskElRightToFocusedTask();
    if (taskRightToFocusedTask.success) {
        taskRightToFocusedTask.value.focus();
    } else {
        throw new Error("unexpected error");
    }
}

function getTaskElLeftToFocusedTask(): Result<HTMLElement> {
    const focusedTaskEl = getFocusedTaskElement();
    if (!focusedTaskEl.success) {
        return Err(focusedTaskEl.error);
    }

    let thisColumnEl = focusedTaskEl.value.closest('.column')!;
    let prevColumnEl = focusedTaskEl.value.closest('.column')!.previousElementSibling;
    let focusedTaskElIndexInCoumn = Array.from(thisColumnEl.querySelectorAll('.task')).indexOf(focusedTaskEl.value);

    // if no previous column, proceed with last column
    if (prevColumnEl == null) {
        prevColumnEl = document.querySelector('.column:last-of-type');
    }

    // find previous column that contains tasks (skip columns without tasks)
    while (!prevColumnEl?.querySelector('.task')) {
        prevColumnEl = prevColumnEl!.previousElementSibling;
    }

    // select task by index in previous column
    let prevColumnTaskEls = Array.from(prevColumnEl!.querySelectorAll('.task'));
    let prevColumnTaskEl = prevColumnTaskEls[(focusedTaskElIndexInCoumn < prevColumnTaskEls.length)? focusedTaskElIndexInCoumn : prevColumnTaskEls.length - 1];

    if (prevColumnTaskEl instanceof HTMLElement) {
        return Ok(prevColumnTaskEl);
    }

    return Err(new Error("no task right to focused task found"));
}

export function focusTaskLeftToFocusedTask() {
    const taskLeftToFocusedTask = getTaskElLeftToFocusedTask();
    if (taskLeftToFocusedTask.success) {
        taskLeftToFocusedTask.value.focus();
    } else {
        throw new Error("unexpected error");
    }
}

// get re-render-safe reference to specific task in specific box
export function getTaskRef(taskEl: HTMLElement): TaskRef {
    return {
        'boxId': getBoxIdForTaskEl(taskEl),
        'taskId': getTaskIdForTaskElement(taskEl)
    };
}

function getLastTaskEl(): HTMLElement {
    const taskBoxes = document.querySelectorAll('.task-box');
    for (let box of Array.from(taskBoxes).reverse()) {
        let taskEl = box.querySelector('.task:last-of-type');
        if (taskEl instanceof HTMLElement) {
            return taskEl;
        }
    }
    return document.querySelector('.task')!;
}

export function getFirstTaskEl(): HTMLElement | null {
    return document.querySelector('.task');
}

export function getTaskTitleFromTaskElement(taskEl: HTMLElement) {
    let title = '';
    for (var i = 0; i < taskEl.querySelector('.task-title')!.childNodes.length; ++i) {
        if (taskEl.querySelector('.task-title')!.childNodes[i].nodeType === Node.TEXT_NODE) {
            title += taskEl.querySelector('.task-title')!.childNodes[i].textContent;
        }
    }
    return title.trim();
}

export function toggleTaskStatus(task: Task) {
    switch (task.status) {
        case TaskStatus.Done:
            task.status = TaskStatus.InProgress;
            break;
        case TaskStatus.InProgress:
            task.status = TaskStatus.New;
            break;
        default:
            task.status = TaskStatus.Done;
            break;
    }
}

// add new task after task with given id
export function createTaskInTaskBox(taskBox: Box, position?: number) {
    const newTaskId = crypto.randomUUID();
    const boxPositions: BoxPositions = {};
    boxPositions[taskBox.id] = position;
    return createTask(newTaskId, boxPositions, taskBox.tags);
}