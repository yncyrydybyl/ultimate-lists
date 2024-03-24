(function () {
    var tasks = [
        { title: 'my prio high task', id: crypto.randomUUID(), tags: ['prio::high'] },
        { title: 'my 2nd task', id: crypto.randomUUID(), tags: [] }
    ];

    var tags = [
        { name: "prio::high", color: 'crimson' },
        { name: "today", color: 'green' },
        { name: "focus", color: 'gold' },
        { name: "orga", color: 'darkcyan' },
    ];

    var boxes = [
        { name: "Inbox", tags: [], id: 'default'},
        { tags: ['today', 'prio::high'], id: crypto.randomUUID() },
        { tags: ['prio::high'], id: crypto.randomUUID() },
    ];

    var inputMode = 'v'; // start in view mode

    // handle global key events
    window.addEventListener('keydown', (event) => {
        if (inputMode == 'v' && (event.key == "j" || event.key == "ArrowDown")) {
            // handle j event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            const focusedTask = document.querySelector(`.task:focus`);
            if (focusedTask != null) {
                // focus next task
                let nextTask = getTaskElAfterTaskEl(focusedTask);
                if (nextTask) {
                    nextTask.focus();
                }
            } else {
                // no focused task found => focus first task
                const firstTask = document.querySelector('.task');
                if (firstTask) {
                    firstTask.focus();
                }
            }
        } else if (inputMode == 'v' && (event.key == 'k' || event.key == 'ArrowUp')) {
            // handle k event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            const focusedTask = document.querySelector(`.task:focus`);
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
            const focusedTask = document.querySelector(`.task:focus`);
            const taskId = getTaskIdForTaskElement(focusedTask);
            if (focusedTask != null) {
                if (focusedTask.previousElementSibling != null) {
                    focusedTask.previousElementSibling.before(focusedTask);
                }
                focusTaskWithId(taskId);
                saveTaskPositions();
            }
        } else if (inputMode == 'v' && event.key == "J") {
            // move task down
            const focusedTask = document.querySelector(`.task:focus`);
            const taskId = getTaskIdForTaskElement(focusedTask);
            if (focusedTask != null) {
                if (focusedTask.nextElementSibling != null) {
                    focusedTask.nextElementSibling.after(focusedTask);
                }
                focusTaskWithId(taskId);
                saveTaskPositions();
            }
        } else if (inputMode == 'v' && event.key == "i") {
            // handle i event
            if (event.target instanceof HTMLInputElement) {
                return;
            }
            const focusedTask = document.querySelector(`.task:focus`);
            if (!focusedTask) {
                return;
            }
            event.preventDefault();
            focusedTask.querySelector('.task-title').setAttribute('contentEditable', true);
            focusTaskTitle(focusedTask);
            inputMode = 'i'; // switch to insert mode
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
            const focusedTask = document.querySelector(`.task:focus`);
            let taskId;
            if (focusedTask != null) {
                taskId = getTaskIdForTaskElement(focusedTask);
            } else {
                taskId = tasks[tasks.length-1].id;
            }
            let newTask = newTaskAfterTask(taskId);
            renderTasks();
            focusTaskTitle(newTask.id);
            inputMode = 'i';
        } else if (inputMode == 'i' && event.key == 'Escape') {
            // handle escape key event
            console.log('return to view mode');
            const focusedTitle = document.querySelector('.task .task-title:focus');
            if (focusedTitle != null) {
                focusedTitle.setAttribute('contentEditable', false);
                let taskEl = focusedTitle.parentElement;
                const taskId = getTaskIdForTaskElement(taskEl);
                saveNewTagsForTask(taskEl);
                window.setTimeout(function() {
                    focusTaskWithId(taskId);
                }, 30);
            }
            inputMode = 'v';
        } else if (event.ctrlKey && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(event.key)) {
            // handle ctr+[0-9] key event
            console.log("ctrl", event.key);
            const focusedTaskEl = getFocusedTaskElement();
            const taskId = getTaskIdForTaskElement(focusedTaskEl);

            const tagIndex = parseInt(event.key) == 0 ? 9 : parseInt(event.key) - 1;

            if (tagIndex >= tags.length) {
                console.log(`no shortcut defined for ctrl+${event.key}`);
                return;
            }

            // toggle predefined tag for shortcut event
            toggleTagForTaskId(taskId, tags[tagIndex].name)

            renderTasks();
            if (inputMode == 'v') {
                focusTaskWithId(taskId);
            } else if (inputMode == 'i') {
                focusTaskTitleOfTaskWithId(taskId);
            }
        }
    });

    // handle enter key on new tag input
    document.getElementById('new-tag-input').addEventListener('keydown', (event) => {
        if (event.key == 'Enter') {
            tags.push({"name": event.target.value });
            event.target.value = '';
            renderTags();
        }
    });

    // render predefined tags bar
    function renderTags() {
        const template = document.getElementById('tags-template').innerHTML;
        const rendered = Mustache.render(template, {tags: tags, "tagTextColor": getTagTextColor, "shortcut": getTagShortCut});
        document.getElementById('tag-list').innerHTML = rendered;

        // register click-event for delete buttons
        document.querySelectorAll('#tag-list .tag .delete').forEach((el) => {
            el.addEventListener('click', (event) => {
                deleteTag(event.target.parentElement.dataset.tagName);
                renderTags();
            })
        });

        // set value and register change events for color input
        document.querySelectorAll('#tag-list .color-input').forEach((el) => {
            el.value = rgba2hex(window.getComputedStyle(el.parentElement.querySelector('.tag')).backgroundColor);

            el.addEventListener('change', (event) => {
                setTagColor(event.target.parentElement.querySelector('.tag').dataset.tagName, event.target.value);
                renderTags();
                renderTasks(); // re-render tags in tasks
            })
        });

        // register drag and drop handlers
        document.querySelector('#tag-list').addEventListener('dragover', event => {
            event.preventDefault();
        });

        document.querySelectorAll('#tag-list .tag-label').forEach((el) => {
            el.addEventListener('drag', event => {
                event.target.closest('.tag-label').classList.add('dragged');
            });

            el.addEventListener('dragend', event => {
                event.preventDefault();

                // remove dragged tag from tags list
                const draggedTagIndex = tags.map(t => t.name).indexOf(event.target.querySelector('.tag').dataset.tagName);
                const draggedTag = tags[draggedTagIndex];
                tags.splice(draggedTagIndex, 1);

                // find indices of drag over elements
                let dragOverTagLeftIndex = -1, dragOverTagRightIndex = -1;
                const dragOverLeftTagEl = document.querySelector('#tag-list .tag-label.drag-over-left .tag');
                const dragOverRightTagEl = document.querySelector('#tag-list .tag-label.drag-over-right .tag');
                if (dragOverLeftTagEl) dragOverTagLeftIndex = tags.map(t => t.name).indexOf(dragOverLeftTagEl.dataset.tagName);
                if (dragOverRightTagEl) dragOverTagRightIndex = tags.map(t => t.name).indexOf(dragOverRightTagEl.dataset.tagName);

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

            el.addEventListener('dragover', event => {
                event.preventDefault();
                document.querySelectorAll('#tag-list .tag-label').forEach(el => {
                    el.classList.remove('drag-over-left');
                    el.classList.remove('drag-over-right');
                });

                if (!(event.target instanceof HTMLElement)) return;
                const dragOverTagLabel = event.target.closest('.tag-label');

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

        // create boxes
        const boxes_template = document.getElementById('boxes-template').innerHTML;
        const boxes_rendered = Mustache.render(boxes_template, {boxes: boxes, "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor});
        document.getElementById('task-boxes-wrapper').innerHTML = boxes_rendered;

        // render tasks in boxes
        const task_template = document.getElementById('tasks-template').innerHTML;
        let tasks_in_boxes = [];

        // sort tasks by position inside box with given id
        function sortTasksByPosition(tasks, boxId) {
            return tasks.sort((a,b) => {
                if (!("boxPositions" in a)) return 1;
                if (!("boxPositions" in b)) return -1;
                return a["boxPositions"][boxId] - b["boxPositions"][boxId];
            });
        }

        for (box of boxes) {
            if (box.id == 'default') continue;
            const box_tasks = tasks.filter(task => task.tags.length > 0 && box.tags.every(boxtag => task.tags.includes(boxtag)));
            const rendered = Mustache.render(task_template, {tasks: sortTasksByPosition(box_tasks, box.id), "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor});
            document.getElementById('task-list-' + box['id']).innerHTML = rendered;
            tasks_in_boxes = tasks_in_boxes.concat(box_tasks);
        }

        // render remaining tasks in default box
        const remaining_tasks = tasks.filter(t => !tasks_in_boxes.includes(t));
        const remaining_tasks_rendered = Mustache.render(task_template, {tasks: sortTasksByPosition(remaining_tasks, 'default'), "tagColor": getTagBackgroundColor, "tagTextColor": getTagTextColor});
        document.getElementById('task-list-default').innerHTML = remaining_tasks_rendered;

        // register task-specific key events
        document.querySelectorAll('.task .task-title').forEach((el) => {
            el.addEventListener('keydown', (event) => {
                if (event.keyCode == 13) { // enter
                    // catch key press of 'enter' key on task titles
                    event.preventDefault();

                    // only create new task if current task title is not empty
                    const focusedTaskEl = getFocusedTaskElement();
                    if (getTaskTitleFromTaskElement(focusedTaskEl) != '') {
                        const taskId = getTaskIdForTaskElement(focusedTaskEl);
                        let newTask = newTaskAfterTask(taskId);
                        saveNewTagsForTask(focusedTaskEl);
                        renderTasks();
                        focusTaskTitle(newTask.id);
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
                    const focusedTaskId = getTaskIdForTaskElement(focusedTaskEl);
                    if (focusedTaskEl.querySelector('.task-title .tag')) {
                        // when new tag is being created, save tag
                        saveNewTagsForTask(focusedTaskEl);
                        renderTasks();
                        focusTaskTitleOfTaskWithId(focusedTaskId);
                    } else if (event.key == "Tab" && getTaskTitleFromTaskElement(focusedTaskEl) != '') {
                        // when tab key is pressed and task title is not empty, unfocus task title and focus task
                        renderTasks();
                        focusTaskWithId(focusedTaskId);
                        inputMode = 'v';
                    }
                }
            });

            function insertNodeAtCursor(node) {
                var range, html;
                if (window.getSelection && window.getSelection().getRangeAt) {
                    range = window.getSelection().getRangeAt(0);
                    range.insertNode(node);
                } else if (document.selection && document.selection.createRange) {
                    range = document.selection.createRange();
                    html = (node.nodeType == 3) ? node.data : node.outerHTML;
                    range.pasteHTML(html);
                }
            }

            function setCursorToEnd(ele){
                var range = document.createRange();
                var sel = window.getSelection();
                range.setStart(ele, 1);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }

            // update task title on keyup
            el.addEventListener('keyup', (event) => {
                if (event.key != "Enter") {
                    saveTaskTitle(event.target.parentElement);
                }
            });

            // update task on focusout
            el.addEventListener('focusout', (event) => {
                event.target.setAttribute('contentEditable', false);
                inputMode = 'v';

                // update data model of task that lost focus
                saveNewTagsForTask(event.target.parentElement);

                // re-render tasks
                const taskId = getTaskIdForTaskElement(event.target.parentElement);
                renderTasks();
                focusTaskWithId(taskId);

                // delete task if title is empty
                if (getTaskTitleFromTaskElement(event.target.parentElement) == '') {
                    const taskId = getTaskIdForTaskElement(event.target.parentElement);
                    let taskToBeRemovedIndex;
                    for (const [i, task] of tasks.entries()) {
                        if (task.id == taskId) {
                            tasks.splice(i, 1);
                            taskToBeRemovedIndex = i;
                            break;
                        }
                    }
                    renderTasks();
                    focusTaskWithId(tasks[taskToBeRemovedIndex-1]['id']);
                }
            })
        });
    }

    // ----- task functions -----

    function createTask(taskId) {
        return {
            title: '',
            id: taskId,
            tags: []
        }
    }

    function focusTaskWithId(taskId) {
        let el = document.querySelector(`.task[data-task-id='${taskId}']`);
        if (el) {
            el.focus();
        } else {
            console.error(`task element for task with id ${taskId} not found`);
        }
    }

    // focus title of task with given task id or task element
    function focusTaskTitle(taskElOrTaskId) {
        if (taskElOrTaskId instanceof HTMLElement) {
            let taskId = getTaskIdForTaskElement(taskElOrTaskId);
            focusTaskTitleOfTaskWithId(taskId);
        } else {
            focusTaskTitleOfTaskWithId(taskElOrTaskId);
        }
    }

    // focus title of task with given task id
    function focusTaskTitleOfTaskWithId(taskId) {
        if (typeof taskId != "string") {
            throw "taskId not string"
        }
        const el = document.querySelector(`.task[data-task-id='${taskId}'] .task-title`);
        el.setAttribute('contentEditable', true);
        r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        s = window.getSelection(),
        s.removeAllRanges();
        s.addRange(r);
    }

    function getFocusedTaskElement() {
        let focusedElement = document.querySelector('*:focus');
        if (focusedElement == null) {
            throw "could not find focused task element: no element is focused"
        } else if (focusedElement.classList.contains('task')) {
            return focusedElement;
        } else if (focusedElement.parentElement.classList.contains('task')) {
            return focusedElement.parentElement;
        } else {
            throw "could not find focused task element: focused element is neither task, nor task title"
        }
    }

    function getTaskIdForTaskElement(el) {
        return el.dataset.taskId;
    }

    // get next task after task with given task id or task element
    // returns task with given task id if no next task exists
    function getTaskElAfterTaskEl(taskEl) {
        if (!(taskEl instanceof HTMLElement)) {
            console.error('taskEl is not an instance of HTMLElement', taskEl);
        }

        if (taskEl.nextElementSibling) {
            // return next sibling in current task box
            return taskEl.nextElementSibling;
        } else {
            // find next task box
            let nextParentSibling = taskEl.closest('.task-box').nextElementSibling;
            while(nextParentSibling) {
                // find first task in next task box
                let nextSibling = nextParentSibling.querySelector('.task');
                if (nextSibling) {
                    return nextSibling;
                } else {
                    // if task box does not contain any task, continue with next task box
                    nextParentSibling = nextParentSibling.nextElementSibling;
                }
            }
        }
        return document.querySelector('.task');
    }

    // get previous task before task with given task id or task element
    function getTaskElBeforeTaskEl(taskEl) {
        if (taskEl.previousElementSibling) {
            // return previous sibling in current task box
            return taskEl.previousElementSibling;
        } else {
            // find previous task box
            let prevParentSibling = taskEl.closest('.task-box').previousElementSibling;
            while(prevParentSibling){
                // find last task in previous task box
                let prevSibling = prevParentSibling.querySelector('.task:last-of-type');
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

    function getLastTaskEl() {
        const taskBoxes = document.querySelectorAll('.task-box');
        for (box of Array.from(taskBoxes).reverse()) {
            let taskEl = box.querySelector('.task:last-of-type');
            if (taskEl) {
                return taskEl;
            }
        }
        return document.querySelector('.task');
    }

    function getTaskTitleFromTaskElement(taskEl) {
        let title = '';
        for (var i = 0; i < taskEl.querySelector('.task-title').childNodes.length; ++i) {
            if (taskEl.querySelector('.task-title').childNodes[i].nodeType === Node.TEXT_NODE) {
                title += taskEl.querySelector('.task-title').childNodes[i].textContent;
            }
        }
        return title.trim();
    }

    function setTaskTitle(taskId, title) {
        for (let task of tasks) {
            if (task.id == taskId) {
                task.title = title;
            }
        }
    }

    function saveTaskTitle(taskEl) {
        const taskId = getTaskIdForTaskElement(taskEl);
        const title = getTaskTitleFromTaskElement(taskEl);
        setTaskTitle(taskId, title);
    }

    function saveNewTagsForTask(taskEl) {
        taskEl.querySelectorAll('.task-title .tag').forEach((tagEl) => {
            toggleTagForTaskId(getTaskIdForTaskElement(taskEl), tagEl.innerText);
            tagEl.remove();
        });
    }

    // save positions (order) of task elements in boxes
    function saveTaskPositions() {
        // clear all task positions
        tasks.forEach(t => delete t.boxPositions);

        // save task positions for all tasks
        document.querySelectorAll('.task').forEach(taskEl => {
            const taskId = getTaskIdForTaskElement(taskEl);
            const boxId = taskEl.closest('.task-box').dataset.taskBoxId;
            for (let task of tasks) {
                if (task.id == taskId) {
                    if (!("boxPositions" in task)) task["boxPositions"] = {};
                    task["boxPositions"][boxId] = Array.from(taskEl.closest('.task-list').children).indexOf(taskEl);
                }
            }
        });
    }

    function toggleTagForTaskId(taskId, tagName) {
        tagName = tagName.replace('#', '').trim();
        for (let task of tasks) {
            if (task.id == taskId) {
                if (!('tags' in task)) {
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
    function newTaskAfterTask(taskId) {
        const newTaskId = crypto.randomUUID();
        for (const [i, task] of tasks.entries()) {
            if (task.id == taskId) {
                const newTask = createTask(newTaskId);
                tasks.splice(i+1, 0, newTask);
                return newTask;
            }
        }
    }

    // ----- tag functions -----

    function newTagElement(tagText) {
        const el = document.createElement('span');
        el.classList.add('tag');
        el.innerText = tagText;
        return el;
    }

    function deleteTag(tagName) {
        for (let [index, tag] of tags.entries()) {
            if (tag.name == tagName) {
                tags.splice(index, 1);
            }
        }
    }

    // helper function for mustache to get tag background color
    function getTagBackgroundColor() {
        for (let tag of tags) {
            if (tag.name == this && 'color' in tag) {
                return tag.color;
            }
        }
    }

    // helper function for mustache to get tag text color
    function getTagTextColor() {
        // when used for tags-template, 'this' references a tag object
        if ('color' in this) {
            return pickTextColorBasedOnBackgroundColor(this.color);
        }

        // when used for tasks-template, 'this' references a tag name
        for (let tag of tags) {
            if (tag.name == this && 'color' in tag) {
                return pickTextColorBasedOnBackgroundColor(tag.color);
            }
        }

        return "black";
    }

    // helper function for mustache to get tag shortcut
    function getTagShortCut() {
        return tags.map(t => t.name).indexOf(this["name"]) + 1;
    }

    function setTagColor(tagName, color) {
        for (let [index, tag] of tags.entries()) {
            if (tag.name == tagName) {
                tag.color = color;
            }
        }
    }

    // ----- color functions -----

    // helper function to determine whether to use white or black as text color depending on given background color
    // based on https://stackoverflow.com/a/3943023
    function pickTextColorBasedOnBackgroundColor(backgroundColor) {
        // if given color is not in hex format, convert it via canvas
        if (!backgroundColor.startsWith('#')) {
            var ctx = document.createElement('canvas').getContext('2d');
            ctx.fillStyle = backgroundColor;
            backgroundColor = ctx.fillStyle;
        }
        var r = parseInt(backgroundColor.substring(1, 3), 16); // hex to r
        var g = parseInt(backgroundColor.substring(3, 5), 16); // hex to g
        var b = parseInt(backgroundColor.substring(5, 7), 16); // hex to b
        return (((r * 0.299) + (g * 0.587) + (b * 0.114)) > 186) ?  'black' : 'white';
    }
    // see https://stackoverflow.com/a/3627747

    function rgba2hex(rgba) {
        return `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/).slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`;
    }

    // init
    renderTasks();
})();
