import { renderTasks } from "./render.js";
import { Box, BoxPositions, Tag, Task, TaskRef, TaskStatus } from "./types.js";
import { pickTextColorBasedOnBackgroundColor } from "./utils.js";

// ----- Result helper functions -----

type Result<T> = { success: true, value: T } | { success: false, error: Error };

function Ok<T>(value: T): { success: true, value: T} {
    return { success: true, value: value };
}

function Err(error: Error): { success: false, error: Error} {
    return { success: false, error: error };
}

// ----- tag helper functions -----

export function newTagElement(tagText: string) {
    const el = document.createElement('span');
    el.classList.add('tag');
    el.innerText = tagText;
    return el;
}

export function deleteTag(tagName: string) {
    for (let [index, tag] of config.tags.entries()) {
        if (tag.name == tagName) {
            config.tags.splice(index, 1);
        }
    }
}

// helper function for mustache to get tag background color
export function getTagBackgroundColor(this: string) {
    for (let tag of config.tags) {
        if (tag.name == this && 'color' in tag) {
            return tag.color;
        }
    }
}

// helper function for mustache to get tag text color
export function getTagTextColor(this: string | Tag) {
    if (typeof this === "string") {
        // when used for tasks-template, 'this' references a tag name
        for (let tag of config.tags) {
            if (tag.name == this && tag.color) {
                return pickTextColorBasedOnBackgroundColor(tag.color);
            }
        }
    } else {
        // when used for tags-template, 'this' references a tag object
        if (this.color) {
            return pickTextColorBasedOnBackgroundColor(this.color);
        }
    }
    return "black";
}

// helper function for mustache to get tag shortcut
export function getTagShortCut(this: Tag) {
    return config.tags.map(t => t.name).indexOf(this.name) + 1;
}

// helper function for mustache to filter box-specific tags from a task's tags
export function tagsWithOrWithoutBoxTags(boxTags: string[]) {
    // closure that stores the boxTags variable
    return function(this: Task) {
        if (config.showBoxTagsInTasks) {
            return this.tags;
        } else {
            return this.tags.filter(t => !boxTags.includes(t));
        }
    }
}

export function removeTagFromBox(tagName: string, boxId: string) {
    for (let box of config.boxes) {
        if (box.id == boxId) {
            const index = box.tags.indexOf(tagName);
            if (index == -1) {
                throw "tag not found in box";
            }
            box.tags.splice(index, 1);
            return box.tags;
        }
    }
    throw "box not found"
}

export function setTagColor(tagName: string, color: string) {
    for (let [_, tag] of config.tags.entries()) {
        if (tag.name == tagName) {
            tag.color = color;
        }
    }
}

// ----- box helper functions -----

export function createAndRenderBoxInColumn(columnIndex: number) {
    const newBoxId = crypto.randomUUID();
    config.boxes.push({ tags: [], id: newBoxId, columnIndex: columnIndex });
    renderTasks();
    (document.querySelector(`.task-box[data-task-box-id='${newBoxId}'] .task-box-heading .button`)! as HTMLElement).style.display = "none";
    (document.querySelector(`#new-tag-input-${newBoxId}`)! as HTMLElement).style.display = "inline-flex";
    (document.querySelector(`#new-tag-input-${newBoxId}`)! as HTMLElement).focus();
}

export function getBoxIdForTaskEl(taskEl: HTMLElement): string {
    return (taskEl.closest('.task-box')! as HTMLElement).dataset.taskBoxId!;
}

export function getBoxPositionForTaskEl(taskEl: HTMLElement) {
    return Array.from((taskEl.closest('.task-list')! as HTMLElement).children).indexOf(taskEl);
}

export function getBoxWithId(boxId: string): Box | undefined {
    for (let box of config.boxes) {
        if (box.id == boxId) {
            return box;
        }
    }
}

export function getBoxesInColumn(columnIndex: number) {
    // put all boxes with undefined columnIndex or columnIndex >= config.numColumns in column 0
    return config.boxes.filter(box =>
        columnIndex == 0 && !(box.columnIndex && box.columnIndex > 0 && box.columnIndex < config.numColumns) || box.columnIndex == columnIndex);
}

export function deleteBoxWithId(boxId: string) {
    let columnIndex;

    // find and delete box with given boxId
    for (let [index, box] of config.boxes.entries()) {
        if (box.id == boxId) {
            columnIndex = box.columnIndex;
            config.boxes.splice(index, 1);
        }
    }

    // delete column if deleted box was the last box of this column
    if (columnIndex !== undefined && getBoxesInColumn(columnIndex).length == 0) {
        // move all boxes right to the deleted column one column to the left
        for (let box of config.boxes) {
            if (box.columnIndex != undefined && box.columnIndex > columnIndex) box.columnIndex--;
        }

        config.numColumns--;
    }
}

// ----- task helper functions -----

export function createTask(taskId: string, boxPositions: BoxPositions, tags: string[]): Task {
    if (boxPositions == null) boxPositions = {};
    if (tags == null) tags = [];
    return {
        title: '',
        id: taskId,
        status: TaskStatus.New,
        tags: structuredClone(tags),
        boxPositions: boxPositions,
    }
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

export function getTaskElByRef(taskRef: TaskRef): HTMLElement {
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
function getTaskElBelowFocusedTask(): Result<HTMLElement> {
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
function getTaskElAboveFocusedTask(): Result<HTMLElement> {
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

// get re-render-safe reference to specific task in specific box
export function getTaskRef(taskEl: HTMLElement): TaskRef {
    return {
        'boxId': getBoxIdForTaskEl(taskEl),
        'taskId': getTaskIdForTaskElement(taskEl)
    };
}

export function getLastTaskEl(): HTMLElement {
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

export function getTaskByTaskId(taskId: string): Result<Task> {
    for (let task of config.tasks) {
        if (task.id == taskId) {
            return Ok(task);
        }
    }
    return Err(new Error(`task with taskId ${taskId} not found.`));
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

export function setTaskTitle(taskId: string, title: string) {
    for (let task of config.tasks) {
        if (task.id == taskId) {
            task.title = title;
        }
    }
}

export function saveTaskTitle(taskEl: HTMLElement) {
    const taskId = getTaskIdForTaskElement(taskEl);
    const title = getTaskTitleFromTaskElement(taskEl);
    setTaskTitle(taskId, title);
}

export function saveNewTagsForTask(taskEl: HTMLElement) {
    taskEl.querySelectorAll('.task-title .tag').forEach((tagEl) => {
        toggleTagForTaskId(getTaskIdForTaskElement(taskEl), (tagEl as HTMLElement).innerText);
        tagEl.remove();
    });
}

// save positions (order) of task elements in boxes
export function saveTaskPositions() {
    // clear all task positions
    config.tasks.forEach(t => delete t.boxPositions);

    // save task positions for all tasks
    document.querySelectorAll('.task').forEach(taskEl => {
        const taskId = getTaskIdForTaskElement(taskEl as HTMLElement);
        const boxId = getBoxIdForTaskEl(taskEl as HTMLElement);

        for (let task of config.tasks) {
            if (task.id == taskId) {
                if (!task.boxPositions) task["boxPositions"] = {};
                task.boxPositions[boxId] = getBoxPositionForTaskEl(taskEl as HTMLElement)
            }
        }
    });
}

export function toggleTagForTaskId(taskId: string, tagName: string) {
    tagName = tagName.replace('#', '').trim();
    for (let task of config.tasks) {
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

export function toggleTaskStatus(taskId: string) {
    for (let task of config.tasks) {
        if (task.id == taskId) {
            switch (task.status) {
                case TaskStatus.Done:
                    task.status = TaskStatus.InProgress;
                    config.numColumns = config.numColumns; // FIXME: hack to trigger localstorage.setItem
                    break;
                case TaskStatus.InProgress:
                    task.status = TaskStatus.New;
                    config.numColumns = config.numColumns; // FIXME: hack to trigger localstorage.setItem
                    break;
                default:
                    task.status = TaskStatus.Done;
                    config.numColumns = config.numColumns; // FIXME: hack to trigger localstorage.setItem
                    break;
            }
        }
    }

}

// add new task after task with given id
export function newTaskInTaskBox(boxId: string, position?: number) {
    const newTaskId = crypto.randomUUID();
    const boxPositions: BoxPositions = {};
    boxPositions[boxId] = position;
    const tags = getBoxWithId(boxId)!.tags;
    const newTask = createTask(newTaskId, boxPositions, tags);
    config.tasks.push(newTask);
    return newTask;
}

export function newTaskInTaskBoxEl(boxEl: HTMLElement) {
    const boxId = boxEl.dataset.taskBoxId!;
    return newTaskInTaskBox(boxId);
}

export function newTaskAfterTaskEl(taskEl: HTMLElement) {
    const boxId = getBoxIdForTaskEl(taskEl);
    const position = getBoxPositionForTaskEl(taskEl) + 0.5; // add task between taskEl and next task element
    return newTaskInTaskBox(boxId, position);
}