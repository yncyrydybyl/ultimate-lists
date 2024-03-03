(function () {
    var tasks = [
        { title: 'my prio high task', id: crypto.randomUUID(), tags: ['prio::high'] },
        { title: 'my 2nd task', id: crypto.randomUUID(), tags: [] }
    ];

    var tags = [
        { name: "prio::high", color: 'red', shortcut: "1"}
    ];

    var boxes = [
        { name: "Inbox", tags: [], id: 'default'},
        { tags: ['prio::high'], id: crypto.randomUUID() },
        { tags: ['test'], id: crypto.randomUUID() },
    ];

    var inputMode = 'v'; // start in view mode

    // handle global key events
    window.addEventListener('keydown', (event) => {
        if (inputMode == 'v' && (event.key == "j" || event.key == "ArrowDown")) {
            // handle j event
            
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
        } else if (inputMode == 'v' && event.key == "i") {
            // handle i event
            event.preventDefault();
            const focusedTask = document.querySelector(`.task:focus`);
            console.log('focusedTask', focusedTask);
            document.querySelector('.task:focus .task-title').setAttribute('contentEditable', true);
            focusTaskTitle(focusedTask);
            inputMode = 'i'; // switch to insert mode
        } else if (inputMode == 'v' && event.code == "Space") {
            // handle space key event
            const focusedTaskCheckbox = document.querySelector(`.task:focus input`);
            console.log(focusedTaskCheckbox);
            focusedTaskCheckbox.toggleAttribute('checked');
        } else if (inputMode == 'v' && event.key == 'o') {
            // handle o key event
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
                taskEl.focus();
                saveAndUpdateTask(taskEl);
            }
            inputMode = 'v';
        } else if (event.ctrlKey && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(event.key)) {
            // handle ctr+[0-9] key event
            console.log("ctrl", event.key);
            const focusedTaskEl = getFocusedTaskElement();
            const taskId = getTaskIdForTaskElement(focusedTaskEl);
           
            // find predefined tag for shortcut event
            for (let tag of tags) {
                if (tag.shortcut == event.key) {
                    toggleTagForTaskId(taskId, tag.name);
                }
            }
            renderTasks();
            if (inputMode == 'v') {
                focusTaskWithId(taskId);
            } else if (inputMode == 'i') {
                focusTaskTitleOfTaskWithId(taskId);
            }
        }
    });

        
    // helper function for mustache to get tag background color
    function tagBackgroundColor () {
        for (let tag of tags) {
            console.log(tag, this);
            if (tag.name == this) {
                return tag.color;
            }
        }
    }

    // helper function for mustache to get tag text color
    function tagTextColor () {
        console.log(this)
        for (let tag of tags) {
            if ('color' in this) { // for tags-template, 'this' is a tag object
                return "white"; // 1 - tag.color
            }
            if (tag.name == this) { // for tasks-template, 'this' is just a tag name
                return "white"; // 1 - tag.color
            }
        }
        return "black";
    }
    
    // render predefined tags bar
    const template = document.getElementById('tags-template').innerHTML;
    const rendered = Mustache.render(template, {tags: tags, "tagColor": tagBackgroundColor, "tagTextColor": tagTextColor});
    document.getElementById('tag-list').innerHTML = rendered;

    // render all tasks and register task-specific key events
    function renderTasks() {
        console.log("rendering tasks...");

        // create boxes
        const boxes_template = document.getElementById('boxes-template').innerHTML;
        const boxes_rendered = Mustache.render(boxes_template, {boxes: boxes});
        document.getElementById('task-boxes-wrapper').innerHTML = boxes_rendered;

        // render tasks in boxes
        const task_template = document.getElementById('tasks-template').innerHTML;
        let tasks_in_boxes = [];

        for (box of boxes) {
            const box_tasks = tasks.filter(task => box.tags.some(boxtag => task.tags.includes(boxtag)));
            const rendered = Mustache.render(task_template, {tasks: box_tasks, "tagColor": tagBackgroundColor, "tagTextColor": tagTextColor});
            document.getElementById('task-list-' + box['id']).innerHTML = rendered;
            tasks_in_boxes = tasks_in_boxes.concat(box_tasks);
        }

        // render remaining tasks in default box
        const remaining_tasks = tasks.filter(t => !tasks_in_boxes.includes(t));
        const remaining_tasks_rendered = Mustache.render(task_template, {tasks: remaining_tasks, "tagColor": tagBackgroundColor, "tagTextColor": tagTextColor});
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
                        saveAndUpdateTask(focusedTaskEl);
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
                    const newTagEl = focusedTaskEl.querySelector('.task-title .tag');
                    if (newTagEl != null) {
                        // save tag
                        saveAndUpdateTask(focusedTaskEl);
                        renderTasks();
                        focusTaskTitleOfTaskWithId(focusedTaskId);
                    } else if (event.key == "Tab") {
                        // unfocus task title and focus task
                        saveAndUpdateTask(focusedTaskEl);
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

            // remove task if title is empty string
            el.addEventListener('focusout', (event) => {
                event.target.setAttribute('contentEditable', false);
                inputMode = 'v';

                // update data model of task that lost focus
                saveAndUpdateTask(event.target.parentElement);
                renderTasks();
                
                // remove task if title is empty
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
   
    function createTask(taskId) {
        return {
            title: '',
            id: taskId,
            tags: []
        }
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

    function getTaskTitleFromTaskElement(taskEl) {
        let title = '';
        for (var i = 0; i < taskEl.querySelector('.task-title').childNodes.length; ++i) {
            if (taskEl.querySelector('.task-title').childNodes[i].nodeType === Node.TEXT_NODE) {
                title += taskEl.querySelector('.task-title').childNodes[i].textContent;
            }
        }
        return title.trim();
    }

    function saveAndUpdateTask(taskEl) {
        taskEl.querySelectorAll('.task-title .tag').forEach((tagEl) => {
            toggleTagForTaskId(getTaskIdForTaskElement(taskEl), tagEl.innerText);
            tagEl.remove();
        });
    }
    
    function toggleTagForTaskId(taskId, tagName) {
        tagName = tagName.replace('#', '').trim();
        for (let task of tasks) {
            if (task.id == taskId) {
                console.log(1, task.tags);
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
                console.log(task.tags);
                break;
            }
        }
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

    // get next task after task with given task id
    // returns task with given task id if no next task exists
    function getTaskAfterTaskWithId(taskId) {
        for (const [i, task] of tasks.entries()) {
            if (task.id == taskId) {
                if (i+1 < tasks.length) {
                    return tasks[i+1];
                } else {
                    return task;
                }
            }
        }
    }

    // get previous task before task with given task id or task element
    function getTaskElBeforeTaskEl(taskEl) {
        /*
        if (taskElOrTaskId instanceof HTMLElement) {
            return getTaskBeforeTaskWithId(getTaskIdForTaskElement(taskElOrTaskId));
        }
        return getTaskBeforeTaskWithId(taskElOrTaskId);
        */
        console.log("search prev el", taskEl);
        if (taskEl.previousElementSibling) {
            // return previous sibling in current task box
            return taskEl.previousElementSibling;
        } else {
            // find previous task box
            let prevParentSibling = taskEl.closest('.task-box').previousElementSibling;
            console.log('ppS', prevParentSibling)
            while(prevParentSibling){
                // find last task in previous task box
                let prevSibling = prevParentSibling.querySelector('.task:last-of-type');
                if (prevSibling) {
                    console.log('returen prev', prevSibling)
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

    // returns task with given task id if no previous task exists
    // get previous task before task with given task id
    // returns task with given task id if no previous task exists
    function getTaskBeforeTaskWithId(taskId) {
        for (const [i, task] of tasks.entries()) {
            if (task.id == taskId) {
                if (i-1 >= 0) {
                    return tasks[i-1];
                } else {
                    return task;
                }
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

    function focusTaskWithId(taskId) {
        let el = document.querySelector(`.task[data-task-id='${taskId}']`);
        if (el) {
            el.focus();
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

    function newTagElement(tagText) {
        const el = document.createElement('span');
        el.classList.add('tag');
        el.innerText = tagText;
        return el;
    }

    // init
    renderTasks();
})();