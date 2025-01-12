import { getBoxesInColumn, createAndRenderBoxInColumn, deleteBoxWithId, newTaskInTaskBoxEl, focusTaskTitle, getTaskElById, getBoxWithId, saveTaskPositions, getFocusedTaskElement, getTaskTitleFromTaskElement, newTaskAfterTaskEl, saveNewTagsForTask, getTaskRef, focusTaskTitleByRef, focusTaskByRef, saveTaskTitle, getTaskIdForTaskElement, getFirstTaskEl, deleteTag, getTagBackgroundColor, getTagShortCut, getTagTextColor, newTagElement, removeTagFromBox, setTagColor, tagsWithOrWithoutBoxTags, getTaskByTaskId } from "./helpers.js";
import { Task, TaskStatus } from "./types.js";
import { rgba2hex } from "./utils.js";

declare var Mustache: any

// render predefined tags bar
export function renderTags() {
    const template = document.getElementById('tags-template')!.innerHTML;
    const rendered = Mustache.render(template, {tags: config.tags, "tagTextColor": getTagTextColor, "shortcut": getTagShortCut});
    document.getElementById('tag-list')!.innerHTML = rendered;

    // register click-event for delete tag buttons
    document.querySelectorAll('#tag-list .tag .delete').forEach((el) => {
        el.addEventListener('click', (event) => {
            if (event.target instanceof HTMLElement && event.target.parentElement instanceof HTMLElement) deleteTag(event.target.parentElement.dataset.tagName!);
            renderTags();
        })
    });

    // set value and register change events for color input
    document.querySelectorAll('#tag-list .color-input').forEach((el) => {
        (el as HTMLInputElement).value = rgba2hex(window.getComputedStyle(el.parentElement!.querySelector('.tag')!).backgroundColor);

        el.addEventListener('change', (event) => {
            setTagColor(((event.target! as HTMLInputElement).parentElement!.querySelector('.tag')! as HTMLElement).dataset.tagName!, (event.target! as HTMLInputElement).value);
            renderTags();
            renderTasks(); // re-render tags in tasks
        })
    });

    // register drag and drop handlers
    document.querySelector('#tag-list')!.addEventListener('dragover', event => {
        event.preventDefault();
    });

    document.querySelectorAll('#tag-list .tag-label').forEach((el) => {
        el.addEventListener('drag', event => {
            (event.target! as HTMLElement).closest('.tag-label')!.classList.add('dragged');
        });

        el.addEventListener('dragend', event => {
            event.preventDefault();

            // remove dragged tag from tags list
            const draggedTagIndex = config.tags.map(t => t.name).indexOf(((event.target! as HTMLElement).querySelector('.tag')! as HTMLElement).dataset.tagName!);
            const draggedTag = config.tags[draggedTagIndex];
            config.tags.splice(draggedTagIndex, 1);

            // find indices of drag over elements
            let dragOverTagLeftIndex = -1, dragOverTagRightIndex = -1;
            const dragOverLeftTagEl: HTMLElement = document.querySelector('#tag-list .tag-label.drag-over-left .tag')!;
            const dragOverRightTagEl: HTMLElement = document.querySelector('#tag-list .tag-label.drag-over-right .tag')!;
            if (dragOverLeftTagEl) dragOverTagLeftIndex = config.tags.map(t => t.name).indexOf(dragOverLeftTagEl.dataset.tagName!);
            if (dragOverRightTagEl) dragOverTagRightIndex = config.tags.map(t => t.name).indexOf(dragOverRightTagEl.dataset.tagName!);

            // re-add dragged tag...
            if (dragOverTagLeftIndex != -1) {
                // ...left to drag over element
                config.tags.splice(dragOverTagLeftIndex, 0, draggedTag);
            } else if (dragOverTagRightIndex != -1) {
                // ... right to drag over element
                config.tags.splice(dragOverTagRightIndex + 1, 0, draggedTag);
            } else {
                // ... to original position
                config.tags.splice(draggedTagIndex, 0, draggedTag);
            }

            renderTags();
        });

        (el as HTMLElement).addEventListener('dragover', (event: DragEvent) => {
            event.preventDefault();
            document.querySelectorAll('#tag-list .tag-label').forEach(el => {
                el.classList.remove('drag-over-left');
                el.classList.remove('drag-over-right');
            });

            if (!(event.target instanceof HTMLElement)) return;
            const dragOverTagLabel: HTMLElement = event.target.closest('.tag-label')!;

            const mouseXCoordinateInDragOverTarget = event.clientX - dragOverTagLabel.getBoundingClientRect().left;
            if (dragOverTagLabel.offsetWidth / 2 > mouseXCoordinateInDragOverTarget) {
                // mouse hovering over left side of target
                dragOverTagLabel.classList.add('drag-over-left');
            } else {
                // mouse hovering over right side of target
                dragOverTagLabel.classList.add('drag-over-right');
            }
        })

    });

}

// render all tasks and register task-specific key events
export function renderTasks() {
    console.log("rendering tasks...");

    // create columns skeleton
    const columns: number[] = Array.from(Array(config.numColumns).keys())
    const columnsTemplate = document.getElementById('columns-template')!.innerHTML;
    const columnsRendered = Mustache.render(columnsTemplate, {columns});
    document.getElementById('tasks-wrapper')!.innerHTML = columnsRendered;

    // create boxes in columns
    const boxesTemplate = document.getElementById('boxes-template')!.innerHTML;

    for (let columnIndex of columns) {
        const columnBoxes = getBoxesInColumn(columnIndex);
        const boxesRendered = Mustache.render(boxesTemplate, { boxes: columnBoxes, "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor });
        document.querySelector(`#tasks-wrapper .column[data-column-index='${columnIndex}']`)!.innerHTML = boxesRendered;
    }

    // add event listeners for new box button (below each column)
    document.querySelectorAll('#tasks-wrapper .column:not(:last-child)').forEach(el => {
        el.querySelector('.new-box-button')!.addEventListener('click', event => {
            const columnIndex = parseInt(((event.target! as HTMLElement).closest('.column')! as HTMLElement).dataset.columnIndex!);
            createAndRenderBoxInColumn(columnIndex);
        });
    });

    // add event listener for new column button (last column, right next to the task columns)
    document.querySelector('#tasks-wrapper .column:last-child .button')!.addEventListener('click', event => {
        config.numColumns++;
        createAndRenderBoxInColumn(config.numColumns-1);
    });

    // register box-specific events
    document.querySelectorAll('.task-box').forEach((el) => {
        // delete box when delete button is pressed
        el.querySelector('.task-box-heading .button.delete')!.addEventListener('click', event => {
            const boxId = ((event.target! as HTMLElement).closest('.task-box') as HTMLElement).dataset.taskBoxId!;
            deleteBoxWithId(boxId);
            renderTasks();
        });

        // show new tag input when button is pressed
        el.querySelector('.task-box-heading label.button')!.addEventListener('click', event => {
            (event.target! as HTMLElement).style.display = "none";
            (event.target! as HTMLElement).parentElement!.querySelector('input')!.style.display = "inline-flex";
        });

        // hide input when focus is lost
        el.querySelector('.task-box-heading input')!.addEventListener('focusout', event => {
            (event.target as HTMLElement).style.display = "none";
            ((event.target as HTMLElement).parentElement!.querySelector('.button')! as HTMLElement).style.display = "inline-flex";
        });

        // add new tag when enter key is pressed
        el.querySelector('.task-box-heading input')!.addEventListener('keydown', (event) => {
            if (event instanceof KeyboardEvent && event.key == 'Enter' && (event.target as HTMLInputElement).value.trim().replace(/^#/, "") != '') {
                const boxId = (el as HTMLElement).dataset.taskBoxId;

                for (let box of config.boxes) {
                    if (box.id == boxId) {
                        box.tags.push((event.target as HTMLInputElement).value.trim().replace(/^#/, ""));
                    };
                }

                (event.target! as HTMLInputElement).value = '';
                renderTasks();
            }
        });

        // delete tag when delete button is pressed
        el.querySelectorAll('.task-box-heading .tag button.delete').forEach(deleteBtn => {
            deleteBtn.addEventListener('click', event => {
                const tagName = (event.target! as HTMLElement).parentElement!.dataset.tagName!;
                const boxId = ((event.target! as HTMLElement).closest('.task-box')! as HTMLElement).dataset!.taskBoxId!;
                const tags = removeTagFromBox(tagName, boxId);
                if (tags.length == 0) {
                    deleteBoxWithId(boxId);
                }
                renderTasks();
            });
        });

        el.querySelectorAll('.new-task-placeholder').forEach(newTaskPlaceholder => {
            newTaskPlaceholder.addEventListener('click', event => {
                event.preventDefault();
                const parentTaskBox = (event.currentTarget! as HTMLElement).parentElement!;
                let newTask = newTaskInTaskBoxEl(parentTaskBox);
                renderTasks();
                focusTaskTitle(getTaskElById(newTask.id));

                // hide .new-task-placeholder
                (getTaskElById(newTask.id).closest('.task-box')!.querySelector('.new-task-placeholder')! as HTMLElement).style.display = "none";
                config.inputMode = 'i';
            })
        });
    });

    // render tasks in boxes
    const task_template = document.getElementById('tasks-template')!.innerHTML;

    // sort tasks by position inside box with given id
    function sortTasksByPosition(tasks: Task[], boxId: string) {
        return tasks.sort((a: Task,b: Task) => {
            if (!a.boxPositions) return 1;
            if (!b.boxPositions) return -1;
            if (a.boxPositions[boxId] === undefined) return 1;
            if (b.boxPositions[boxId] === undefined) return -1;
            return a.boxPositions[boxId] - b.boxPositions[boxId];
        });
    }

    // get tasks for box with given boxId
    function getTasksForBox(boxId: string): Task[] {
        const box = getBoxWithId(boxId)!;
        const boxTasks = config.tasks.filter(task =>
            task.tags.length > 0 && // make sure that task has tags
            box.tags.length > 0 &&
            box.tags.every(boxTag => task.tags.includes(boxTag)) && // the task's tags must include every tag of the box
            !config.boxes.some(otherBox => box.id != otherBox.id && otherBox.tags.every(boxTag => task.tags.includes(boxTag)) && box.tags.every(boxTag => otherBox.tags.includes(boxTag)) && !otherBox.tags.every(otherBoxTag => box.tags.includes(otherBoxTag))) // no other box exists that contains the task's tags AND contains the same but strictly more tags than the box in question
            );
        return boxTasks;
    }

    let tasks_in_boxes: Task[] = [];

    for (let box of config.boxes) {
        if (box.id == 'default') continue;
        const boxTasks = getTasksForBox(box.id);
        const rendered = Mustache.render(task_template, {tasks: sortTasksByPosition(boxTasks, box.id), "tagsWithOrWithoutBoxTags": tagsWithOrWithoutBoxTags(box.tags), "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor});
        const taskListEl = document.getElementById('task-list-' + box.id)!;
        taskListEl.innerHTML = rendered;

        // render task status
        taskListEl.querySelectorAll('.task').forEach(taskEl => {
            if (!(taskEl instanceof HTMLElement)) {
                throw new Error("taskEl unexpectedly no instance of HTMLElement");
            }
            const checkboxEl = taskEl.querySelector('input[type="checkbox"]');
            if (checkboxEl == null || !(checkboxEl instanceof HTMLInputElement)) {
                throw new Error("checkoxEl unexpectedly null or no instance of HTMLInputElement");
            }
            const taskStatus = getTaskByTaskId(getTaskIdForTaskElement(taskEl));
            if (!taskStatus.success) {
                throw new Error("taskStatus unexpectedly could not be retrieved");
            }

            switch(taskStatus.value.status) {
                case TaskStatus.InProgress:
                    checkboxEl.setAttribute('checked', 'false');
                    checkboxEl.indeterminate = true;
                    break;
                case TaskStatus.Done:
                    checkboxEl.setAttribute('checked', 'true');
                    break;
            }
        });


        tasks_in_boxes = tasks_in_boxes.concat(boxTasks);
    }

    // render remaining tasks in default box
    const remaining_tasks = config.tasks.filter(t => !tasks_in_boxes.includes(t));
    const remaining_tasks_rendered = Mustache.render(task_template, {tasks: sortTasksByPosition(remaining_tasks, 'default'), "tagsWithOrWithoutBoxTags": tagsWithOrWithoutBoxTags([]), "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor});
    document.getElementById('task-list-default')!.innerHTML = remaining_tasks_rendered;

    saveTaskPositions();

    // register task-specific key events
    document.querySelectorAll('.task .task-title').forEach((el) => {
        (el as HTMLElement).addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key == 'Enter') {
                // catch key press of 'enter' key on task titles
                event.preventDefault();

                // only create new task if current task title is not empty
                const focusedTaskEl = getFocusedTaskElement();
                if (!focusedTaskEl.success) {
                    throw new Error("focusedTaskEl.success unexpectedly false");
                }
                if (getTaskTitleFromTaskElement(focusedTaskEl.value) != '') {
                    // save current task
                    saveTaskTitle(focusedTaskEl.value); // this is required when pasting text via middle mouse button (no keyup event fired yet)

                    // create new task after current task
                    let newTask = newTaskAfterTaskEl(focusedTaskEl.value);
                    saveNewTagsForTask(focusedTaskEl.value);
                    renderTasks();
                    focusTaskTitle(getTaskElById(newTask.id));
                }
            } else if (event.key == "#") {
                // handle '#' key on .task-title: create new tag
                event.preventDefault();
                let newTagEl = newTagElement('#');
                insertNodeAtCursor(newTagEl);
                setCursorToEnd(newTagEl);
            } else if (event.key == "Tab" || event.key == " " || event.key == "Spacebar") {
                // handle space / tab key on .task-title: add tag
                if (event.key == "Tab") {
                    event.preventDefault();
                }
                const focusedTaskEl = getFocusedTaskElement();
                if (!focusedTaskEl.success) {
                    throw new Error("focusedTaskEl.success unexpectedly false");
                }
                const focusedTaskRef = getTaskRef(focusedTaskEl.value);
                if (focusedTaskEl.value.querySelector('.task-title .tag')) {
                    // when new tag is being created, save tag
                    saveNewTagsForTask(focusedTaskEl.value);
                    renderTasks();
                    focusTaskTitleByRef(focusedTaskRef);
                } else if (event.key == "Tab" && getTaskTitleFromTaskElement(focusedTaskEl.value) != '') {
                    // when tab key is pressed and task title is not empty, unfocus task title and focus task
                    renderTasks();
                    focusTaskByRef(focusedTaskRef);
                    config.inputMode = 'v';
                }
            }
        });

        function insertNodeAtCursor(node: Node) {
            var range, html;
            if (window.getSelection && window.getSelection()?.getRangeAt) {
                range = window.getSelection()!.getRangeAt(0);
                range.insertNode(node);
            } else if ((document as any).selection && (document as any).selection.createRange) {
                range = (document as any).selection.createRange();
                html = (node.nodeType == 3) ? (node as any).data : (node as any).outerHTML;
                range.pasteHTML(html);
            }
        }

        function setCursorToEnd(ele: HTMLElement){
            var range = document.createRange();
            var sel = window.getSelection();
            range.setStart(ele, 1);
            range.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }

        // update task title on keyup
        (el as HTMLElement).addEventListener('keyup', (event: KeyboardEvent) => {
            if (event.key != "Enter") {
                if (!(event.target instanceof HTMLElement)) {
                    throw new Error("event.target unexpectedly no instance of HTMLElement");
                }

                const taskEl: HTMLElement | null = event.target.closest('.task');
                if (!taskEl) throw new Error("taskEl unexpectedly not found")

                saveTaskTitle(taskEl);
            }
        });

        // update task on focusout
        el.addEventListener('focusout', (event) => {
            let nextFocusedTaskRef;
            const taskEl = (event.target! as HTMLElement).parentElement!;
            (event.target! as HTMLElement).setAttribute('contentEditable', "false");
            config.inputMode = 'v';

            // update data model of task that lost focus
            saveNewTagsForTask(taskEl);

            if (getTaskTitleFromTaskElement(taskEl) == '') {
                // delete task if title is empty
                const taskId = getTaskIdForTaskElement(taskEl);

                if (taskEl.previousElementSibling) {
                    nextFocusedTaskRef = getTaskRef(taskEl.previousElementSibling as HTMLElement);
                } else if (taskEl.nextElementSibling) {
                    nextFocusedTaskRef = getTaskRef(taskEl.nextElementSibling as HTMLElement);
                }

                for (const [i, task] of config.tasks.entries()) {
                    if (task.id == taskId) {
                        config.tasks.splice(i, 1);
                        break;
                    }
                }
            } else {
                // re-render tasks
                nextFocusedTaskRef = getTaskRef(taskEl);
            }

            // re-render tasks and restore focus
            renderTasks();
            if (nextFocusedTaskRef) {
                focusTaskByRef(nextFocusedTaskRef);
            } else {
                let taskEl = getFirstTaskEl();
                if (taskEl) taskEl.focus();
            }
        })
    });
}