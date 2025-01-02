declare var Mustache: any

(function () {
    type Task = {
        title: string,
        id: string,
        tags: string[],
        boxPositions?: BoxPositions,
    };

    type BoxPositions = {[name:string]: number | undefined};

    type taskRef = {
        boxId?: string,
        taskId: string,
    };

    var tasks: Task[] = [
        { title: 'my prio high task', id: crypto.randomUUID(), tags: ['today', 'orga'] },
        { title: 'my 2nd task', id: crypto.randomUUID(), tags: ['focus'] }
    ];

    type Tag = {name: string, color?: string};

    var tags: Tag[] = [
        { name: "prio::high", color: 'crimson' },
        { name: "today", color: 'green' },
        { name: "focus", color: 'gold' },
        { name: "orga", color: 'darkcyan' },
    ];

    type Box = {
        name?: string,
        tags: string[],
        id: string,
        columnIndex?: number,
    }

    var boxes: Box[] = [
        { name: "Inbox", tags: [], id: 'default'},
        { tags: ['orga', 'today'], id: crypto.randomUUID(), columnIndex: 1 },
        { tags: ['orga'], id: crypto.randomUUID(), columnIndex: 1 },
        { tags: ['focus', 'today'], id: crypto.randomUUID(), columnIndex: 2 },
        { tags: ['focus'], id: crypto.randomUUID(), columnIndex: 2 },
    ];

    var inputMode = 'v'; // start in view mode
    var numColumns = 3;
    var showBoxTagsInTasks = true;

    // handle global key events
    window.addEventListener('keydown', (event: KeyboardEvent) => {
        if (inputMode == 'v' && (event.key == "j" || event.key == "ArrowDown")) {
            // handle j event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);
            if (focusedTask != null) {
                // focus next task
                let nextTask = getTaskElAfterTaskEl(focusedTask);
                if (nextTask) {
                    nextTask.focus();
                }
            } else {
                // no focused task found => focus first task
                const firstTask: HTMLElement | null = document.querySelector('.task');
                if (firstTask) {
                    firstTask.focus();
                }
            }
        } else if (inputMode == 'v' && (event.key == 'k' || event.key == 'ArrowUp')) {
            // handle k event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);
            if (focusedTask != null) {
                // focus previous task
                let previousTask = getTaskElBeforeTaskEl(focusedTask);
                if (previousTask) {
                    previousTask.focus();
                }
            } else {
                // no focused task found => focus last task
                const lastTaskEl = getLastTaskEl();
                if (lastTaskEl) {
                    lastTaskEl.focus();
                }
            }
        } else if (inputMode == 'v' && event.key == "K") {
            // move task up
            const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);
            if (focusedTask != null) {
                if (focusedTask.previousElementSibling != null) {
                    focusedTask.previousElementSibling.before(focusedTask);
                }
                // re-focus task after moving in DOM
                focusedTask.focus();
                saveTaskPositions();
            }
        } else if (inputMode == 'v' && event.key == "J") {
            // move task down
            const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);
            if (focusedTask != null) {
                if (focusedTask.nextElementSibling != null) {
                    focusedTask.nextElementSibling.after(focusedTask);
                }
                // re-focus task after moving in DOM
                focusedTask.focus();
                saveTaskPositions();
            }
        } else if (inputMode == 'v' && event.key == "i") {
            // handle i event
            if (event.target instanceof HTMLInputElement) {
                return;
            }
            const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);
            if (focusedTask) {
                event.preventDefault();
                focusTaskTitle(focusedTask);
                inputMode = 'i'; // switch to insert mode
            }
        } else if (inputMode == 'v' && event.code == "Space") {
            // handle space key event
            const focusedTaskCheckbox = document.querySelector(`.task:focus input`);
            if (focusedTaskCheckbox) {
                focusedTaskCheckbox.toggleAttribute('checked');
            }
        } else if (inputMode == 'v' && event.key == 'o') {
            // handle o key event
            if (event.target instanceof HTMLInputElement) {
                return;
            }
            event.preventDefault();
            let newTask;
            const focusedTask = document.querySelector(`.task:focus`) as HTMLElement;
            if (focusedTask) {
                newTask = newTaskAfterTaskEl(focusedTask);
            } else {
                newTask = newTaskInTaskBox("default");
            }
            renderTasks();
            focusTaskTitle(getTaskElById(newTask.id));
            inputMode = 'i';
        } else if (inputMode == 'i' && event.key == 'Escape') {
            // handle escape key event
            console.log('return to view mode');
            if (event.target instanceof HTMLElement) {
                const focusedTitle = event.target.closest('.task-box')!.querySelector('.task .task-title:focus');
                if (focusedTitle instanceof HTMLElement) {
                    // this will unfocus the title element which will also trigger the 'focusout' event handler
                    focusedTitle.setAttribute('contentEditable', "false");
                    const taskEl = focusedTitle.parentElement;
                    taskEl!.focus();
                }
            }
            inputMode = 'v';
        } else if (event.ctrlKey && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(event.key)) {
            // handle ctr+[0-9] key event
            console.log("ctrl", event.key);
            const focusedTaskEl = getFocusedTaskElement();
            const taskId = getTaskIdForTaskElement(focusedTaskEl);
            const taskRef = getTaskRef(focusedTaskEl);

            const tagIndex = parseInt(event.key) == 0 ? 9 : parseInt(event.key) - 1;

            if (tagIndex >= tags.length) {
                console.log(`no shortcut defined for ctrl+${event.key}`);
                return;
            }

            // toggle predefined tag for shortcut event
            toggleTagForTaskId(taskId, tags[tagIndex].name);

            renderTasks();
            if (inputMode == 'v') {
                focusTaskByRef(taskRef);
            } else if (inputMode == 'i') {
                focusTaskTitleByRef(taskRef);
            }
        }
    });

    // handle enter key on new tag input
    document.getElementById('new-tag-input')!.addEventListener('keydown', (event) => {
        if (event.key == 'Enter' && event.target instanceof HTMLInputElement && event.target.value.trim() != '') {
            tags.push({"name": event.target.value.trim() });
            event.target.value = '';
            renderTags();
        }
    });

    // render predefined tags bar
    function renderTags() {
        const template = document.getElementById('tags-template')!.innerHTML;
        const rendered = Mustache.render(template, {tags: tags, "tagTextColor": getTagTextColor, "shortcut": getTagShortCut});
        document.getElementById('tag-list')!.innerHTML = rendered;

        // register click-event for delete buttons
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
                const draggedTagIndex = tags.map(t => t.name).indexOf(((event.target! as HTMLElement).querySelector('.tag')! as HTMLElement).dataset.tagName!);
                const draggedTag = tags[draggedTagIndex];
                tags.splice(draggedTagIndex, 1);

                // find indices of drag over elements
                let dragOverTagLeftIndex = -1, dragOverTagRightIndex = -1;
                const dragOverLeftTagEl: HTMLElement = document.querySelector('#tag-list .tag-label.drag-over-left .tag')!;
                const dragOverRightTagEl: HTMLElement = document.querySelector('#tag-list .tag-label.drag-over-right .tag')!;
                if (dragOverLeftTagEl) dragOverTagLeftIndex = tags.map(t => t.name).indexOf(dragOverLeftTagEl.dataset.tagName!);
                if (dragOverRightTagEl) dragOverTagRightIndex = tags.map(t => t.name).indexOf(dragOverRightTagEl.dataset.tagName!);

                // re-add dragged tag...
                if (dragOverTagLeftIndex != -1) {
                    // ...left to drag over element
                    tags.splice(dragOverTagLeftIndex, 0, draggedTag);
                } else if (dragOverTagRightIndex != -1) {
                    // ... right to drag over element
                    tags.splice(dragOverTagRightIndex + 1, 0, draggedTag);
                } else {
                    // ... to original position
                    tags.splice(draggedTagIndex, 0, draggedTag);
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
    renderTags();

    // render all tasks and register task-specific key events
    function renderTasks() {
        console.log("rendering tasks...");

        // create columns skeleton
        const columns: number[] = Array.from(Array(numColumns).keys())
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
            numColumns++;
            createAndRenderBoxInColumn(numColumns-1);
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
                if (event instanceof KeyboardEvent && event.key == 'Enter' && (event.target as HTMLInputElement).value.trim() != '') {
                    const boxId = (el as HTMLElement).dataset.taskBoxId;

                    for (let box of boxes) {
                        if (box.id == boxId) {
                            box.tags.push((event.target as HTMLInputElement).value.trim());
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
                    inputMode = 'i';
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
            const boxTasks = tasks.filter(task =>
                task.tags.length > 0 && // make sure that task has tags
                box.tags.length > 0 &&
                box.tags.every(boxTag => task.tags.includes(boxTag)) && // the task's tags must include every tag of the box
                !boxes.some(otherBox => box.id != otherBox.id && otherBox.tags.every(boxTag => task.tags.includes(boxTag)) && box.tags.every(boxTag => otherBox.tags.includes(boxTag)) && !otherBox.tags.every(otherBoxTag => box.tags.includes(otherBoxTag))) // no other box exists that contains the task's tags AND contains the same but strictly more tags than the box in question
                );
            return boxTasks;
        }

        let tasks_in_boxes: Task[] = [];

        for (let box of boxes) {
            if (box.id == 'default') continue;
            const boxTasks = getTasksForBox(box.id);
            const rendered = Mustache.render(task_template, {tasks: sortTasksByPosition(boxTasks, box.id), "tagsWithOrWithoutBoxTags": tagsWithOrWithoutBoxTags(box.tags), "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor});
            document.getElementById('task-list-' + box.id)!.innerHTML = rendered;
            tasks_in_boxes = tasks_in_boxes.concat(boxTasks);
        }

        // render remaining tasks in default box
        const remaining_tasks = tasks.filter(t => !tasks_in_boxes.includes(t));
        const remaining_tasks_rendered = Mustache.render(task_template, {tasks: sortTasksByPosition(remaining_tasks, 'default'), "tagsWithOrWithoutBoxTags": tagsWithOrWithoutBoxTags([]), "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor});
        document.getElementById('task-list-default')!.innerHTML = remaining_tasks_rendered;

        saveTaskPositions();

        // register task-specific key events
        document.querySelectorAll('.task .task-title').forEach((el) => {
            (el as HTMLElement).addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.keyCode == 13) { // enter
                    // catch key press of 'enter' key on task titles
                    event.preventDefault();

                    // only create new task if current task title is not empty
                    const focusedTaskEl = getFocusedTaskElement();
                    if (getTaskTitleFromTaskElement(focusedTaskEl) != '') {
                        let newTask = newTaskAfterTaskEl(focusedTaskEl);
                        saveNewTagsForTask(focusedTaskEl);
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
                    const focusedTaskRef = getTaskRef(focusedTaskEl);
                    if (focusedTaskEl.querySelector('.task-title .tag')) {
                        // when new tag is being created, save tag
                        saveNewTagsForTask(focusedTaskEl);
                        renderTasks();
                        focusTaskTitleByRef(focusedTaskRef);
                    } else if (event.key == "Tab" && getTaskTitleFromTaskElement(focusedTaskEl) != '') {
                        // when tab key is pressed and task title is not empty, unfocus task title and focus task
                        renderTasks();
                        focusTaskByRef(focusedTaskRef);
                        inputMode = 'v';
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
                    saveTaskTitle((event.target! as HTMLElement).parentElement!);
                }
            });

            // update task on focusout
            el.addEventListener('focusout', (event) => {
                let nextFocusedTaskRef;
                const taskEl = (event.target! as HTMLElement).parentElement!;
                (event.target! as HTMLElement).setAttribute('contentEditable', "false");
                inputMode = 'v';

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

                    for (const [i, task] of tasks.entries()) {
                        if (task.id == taskId) {
                            tasks.splice(i, 1);
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

    // ----- box functions -----

    function createAndRenderBoxInColumn(columnIndex: number) {
        const newBoxId = crypto.randomUUID();
        boxes.push({ tags: [], id: newBoxId, columnIndex: columnIndex });
        renderTasks();
        (document.querySelector(`.task-box[data-task-box-id='${newBoxId}'] .task-box-heading .button`)! as HTMLElement).style.display = "none";
        (document.querySelector(`#new-tag-input-${newBoxId}`)! as HTMLElement).style.display = "inline-flex";
        (document.querySelector(`#new-tag-input-${newBoxId}`)! as HTMLElement).focus();
    }

    function getBoxIdForTaskEl(taskEl: HTMLElement): string {
       return (taskEl.closest('.task-box')! as HTMLElement).dataset.taskBoxId!;
    }

    function getBoxPositionForTaskEl(taskEl: HTMLElement) {
        return Array.from((taskEl.closest('.task-list')! as HTMLElement).children).indexOf(taskEl);
    }

    function getBoxWithId(boxId: string): Box | undefined {
        for (let box of boxes) {
            if (box.id == boxId) {
                return box;
            }
        }
    }

    function getBoxesInColumn(columnIndex: number) {
        // put all boxes with undefined columnIndex or columnIndex >= numColumns in column 0
        return boxes.filter(box =>
            columnIndex == 0 && !(box.columnIndex && box.columnIndex > 0 && box.columnIndex < numColumns) || box.columnIndex == columnIndex);
    }

    function deleteBoxWithId(boxId: string) {
        let columnIndex;

        // find and delete box with given boxId
        for (let [index, box] of boxes.entries()) {
            if (box.id == boxId) {
                columnIndex = box.columnIndex;
                boxes.splice(index, 1);
            }
        }

        // delete column if deleted box was the last box of this column
        if (columnIndex !== undefined && getBoxesInColumn(columnIndex).length == 0) {
            // move all boxes right to the deleted column one column to the left
            for (let box of boxes) {
                if (box.columnIndex != undefined && box.columnIndex > columnIndex) box.columnIndex--;
            }

            numColumns--;
        }
    }

    // ----- task functions -----

    function createTask(taskId: string, boxPositions: BoxPositions, tags: string[]) {
        if (boxPositions == null) boxPositions = {};
        if (tags == null) tags = [];
        return {
            title: '',
            id: taskId,
            tags: structuredClone(tags),
            boxPositions: boxPositions,
        }
    }

    // focus task by given task reference
    function focusTaskByRef(taskRef: taskRef) {
        const taskEl = getTaskElByRef(taskRef);
        if (taskEl) {
            taskEl.focus();
        } else {
            console.error(`task element for task with boxId ${taskRef.boxId} and taskId ${taskRef.taskId} not found`);
            throw "[focusTaskByRef] task element not found";
        }
    }

    // focus title of given task element
    function focusTaskTitle(taskEl: HTMLElement) {
        if (!(taskEl instanceof HTMLElement)) {
            console.error("[focusTaskTitle] taskEl is not an instance of HTMLElement", taskEl);
            throw "[focusTaskTitle] taskEl is not an instance of HTMLElement";
        }
        const titleEl = taskEl.querySelector(`.task-title`)!;
        titleEl.setAttribute('contentEditable', "true");
        const r = document.createRange();
        r.selectNodeContents(titleEl);
        r.collapse(false);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
    }

    // focus task title by given task reference
    function focusTaskTitleByRef(taskRef: taskRef) {
        const taskEl = getTaskElByRef(taskRef);
        if (taskEl) {
            focusTaskTitle(taskEl);
        } else {
            console.error(`task element for task with boxId ${taskRef.boxId} and taskId ${taskRef.taskId} not found`);
            throw "[focusTaskTitleByRef] task element not found";
        }
    }

    function getFocusedTaskElement(): HTMLElement {
        let focusedElement: HTMLElement = document.querySelector('*:focus')!;
        if (focusedElement == null) {
            throw "could not find focused task element: no element is focused"
        } else if (focusedElement.classList.contains('task')) {
            return focusedElement;
        } else if (focusedElement.parentElement!.classList.contains('task')) {
            return focusedElement.parentElement!;
        } else {
            throw "could not find focused task element: focused element is neither task, nor task title"
        }
    }

    function getTaskElById(taskId: string): HTMLElement {
        return document.querySelector(`.task[data-task-id='${taskId}']`)!;
    }

    function getTaskElByRef(taskRef: taskRef): HTMLElement {
        let taskEl = document.querySelector(`.task-box[data-task-box-id='${taskRef.boxId}'] .task[data-task-id='${taskRef.taskId}']`) as HTMLElement;
        if (!taskEl) {
            // task element could not be found. Try again without boxId...
            taskEl = getTaskElById(taskRef.taskId);
        }
        return taskEl;
    }

    function getTaskIdForTaskElement(el: HTMLElement): string {
        return el.dataset!.taskId!;
    }

    // get next task after task with given task id or task element
    // returns task with given task id if no next task exists
    function getTaskElAfterTaskEl(taskEl: HTMLElement): HTMLElement {
        if (!(taskEl instanceof HTMLElement)) {
            console.error('taskEl is not an instance of HTMLElement', taskEl);
        }

        if (taskEl.nextElementSibling) {
            // return next sibling in current task box
            return taskEl.nextElementSibling as HTMLElement;
        } else {
            // find next task box
            let nextParentSibling = taskEl.closest('.task-box')!.nextElementSibling;
            while(nextParentSibling) {
                // find first task in next task box
                let nextSibling = nextParentSibling.querySelector('.task');
                if (nextSibling instanceof HTMLElement) {
                    return nextSibling;
                } else {
                    // if task box does not contain any task, continue with next task box
                    nextParentSibling = nextParentSibling.nextElementSibling;
                }
            }
        }
        return document.querySelector('.task')!;
    }

    // get previous task before task with given task id or task element
    function getTaskElBeforeTaskEl(taskEl: HTMLElement): HTMLElement {
        if (taskEl.previousElementSibling) {
            // return previous sibling in current task box
            return taskEl.previousElementSibling as HTMLElement;
        } else {
            // find previous task box
            let prevParentSibling = taskEl.closest('.task-box')!.previousElementSibling;
            while(prevParentSibling){
                // find last task in previous task box
                let prevSibling = prevParentSibling.querySelector('.task:last-of-type') as HTMLElement;
                if (prevSibling) {
                    return prevSibling;
                } else {
                    // if task box does not contain any task, continue with previous task box
                    prevParentSibling = prevParentSibling.previousElementSibling;
                }
            }
        }
        // return last task
        return getLastTaskEl();
    }

    // get re-render safe reference to specific task in specific box
    function getTaskRef(taskEl: HTMLElement): taskRef {
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

    function getFirstTaskEl(): HTMLElement {
        return document.querySelector('.task')!;
    }

    function getTaskTitleFromTaskElement(taskEl: HTMLElement) {
        let title = '';
        for (var i = 0; i < taskEl.querySelector('.task-title')!.childNodes.length; ++i) {
            if (taskEl.querySelector('.task-title')!.childNodes[i].nodeType === Node.TEXT_NODE) {
                title += taskEl.querySelector('.task-title')!.childNodes[i].textContent;
            }
        }
        return title.trim();
    }

    function setTaskTitle(taskId: string, title: string) {
        for (let task of tasks) {
            if (task.id == taskId) {
                task.title = title;
            }
        }
    }

    function saveTaskTitle(taskEl: HTMLElement) {
        const taskId = getTaskIdForTaskElement(taskEl);
        const title = getTaskTitleFromTaskElement(taskEl);
        setTaskTitle(taskId, title);
    }

    function saveNewTagsForTask(taskEl: HTMLElement) {
        taskEl.querySelectorAll('.task-title .tag').forEach((tagEl) => {
            toggleTagForTaskId(getTaskIdForTaskElement(taskEl), (tagEl as HTMLElement).innerText);
            tagEl.remove();
        });
    }

    // save positions (order) of task elements in boxes
    function saveTaskPositions() {
        // clear all task positions
        tasks.forEach(t => delete t.boxPositions);

        // save task positions for all tasks
        document.querySelectorAll('.task').forEach(taskEl => {
            const taskId = getTaskIdForTaskElement(taskEl as HTMLElement);
            const boxId = getBoxIdForTaskEl(taskEl as HTMLElement);

            for (let task of tasks) {
                if (task.id == taskId) {
                    if (!task.boxPositions) task["boxPositions"] = {};
                    task.boxPositions[boxId] = getBoxPositionForTaskEl(taskEl as HTMLElement)
                }
            }
        });
    }

    function toggleTagForTaskId(taskId: string, tagName: string) {
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

    // add new task after task with given id
    function newTaskInTaskBox(boxId: string, position?: number) {
        const newTaskId = crypto.randomUUID();
        const boxPositions: BoxPositions = {};
        boxPositions[boxId] = position;
        const tags = getBoxWithId(boxId)!.tags;
        const newTask = createTask(newTaskId, boxPositions, tags);
        tasks.push(newTask);
        return newTask;
    }

    function newTaskInTaskBoxEl(boxEl: HTMLElement) {
        const boxId = boxEl.dataset.taskBoxId!;
        return newTaskInTaskBox(boxId);
    }

    function newTaskAfterTaskEl(taskEl: HTMLElement) {
        const boxId = getBoxIdForTaskEl(taskEl);
        const position = getBoxPositionForTaskEl(taskEl) + 0.5; // add task between taskEl and next task element
        return newTaskInTaskBox(boxId, position);
    }

    // ----- tag functions -----

    function newTagElement(tagText: string) {
        const el = document.createElement('span');
        el.classList.add('tag');
        el.innerText = tagText;
        return el;
    }

    function deleteTag(tagName: string) {
        for (let [index, tag] of tags.entries()) {
            if (tag.name == tagName) {
                tags.splice(index, 1);
            }
        }
    }

    // helper function for mustache to get tag background color
    function getTagBackgroundColor(this: string) {
        for (let tag of tags) {
            if (tag.name == this && 'color' in tag) {
                return tag.color;
            }
        }
    }

    // helper function for mustache to get tag text color
    function getTagTextColor(this: string | Tag) {
        if (typeof this === "string") {
            // when used for tasks-template, 'this' references a tag name
            for (let tag of tags) {
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
    function getTagShortCut(this: Tag) {
        return tags.map(t => t.name).indexOf(this.name) + 1;
    }

    // helper function for mustache to filter box-specific tags from a task's tags
    function tagsWithOrWithoutBoxTags(boxTags: string[]) {
        // closure that stores the boxTags variable
        return function(this: Task) {
            if (showBoxTagsInTasks) {
                return this.tags;
            } else {
                return this.tags.filter(t => !boxTags.includes(t));
            }
        }
    }

    function removeTagFromBox(tagName: string, boxId: string) {
        for (let box of boxes) {
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

    function setTagColor(tagName: string, color: string) {
        for (let [_, tag] of tags.entries()) {
            if (tag.name == tagName) {
                tag.color = color;
            }
        }
    }

    // ----- color functions -----

    // helper function to determine whether to use white or black as text color depending on given background color
    // based on https://stackoverflow.com/a/3943023
    function pickTextColorBasedOnBackgroundColor(backgroundColor: string) {
        // if given color is not in hex format, convert it via canvas
        if (!backgroundColor.startsWith('#')) {
            var ctx = document.createElement('canvas').getContext('2d')!;
            ctx.fillStyle = backgroundColor;
            backgroundColor = ctx.fillStyle;
        }
        var r = parseInt(backgroundColor.substring(1, 3), 16); // hex to r
        var g = parseInt(backgroundColor.substring(3, 5), 16); // hex to g
        var b = parseInt(backgroundColor.substring(5, 7), 16); // hex to b
        return (((r * 0.299) + (g * 0.587) + (b * 0.114)) > 186) ?  'black' : 'white';
    }
    // see https://stackoverflow.com/a/3627747

    function rgba2hex(rgba: string): string {
        return `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/)!.slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`;
    }

    // init
    renderTasks();
})();
