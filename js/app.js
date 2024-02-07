(function () {
    var tasks = [
        { title: 'my first task', id: crypto.randomUUID() },
        { title: 'my 2nd task', id: crypto.randomUUID() }
    ];

    var tags = [
        { name: "prio::high", color: 'red', shortcut: "1"}
    ];

    var inputMode = 'v'; // start in view mode

    // handle global key events
    window.addEventListener('keydown', (event) => {
        if (inputMode == 'v' && (event.key == "j" || event.key == "ArrowDown")) {
            // handle j event
            let taskId;
            
            // find focused task
            const focusedTask = document.querySelector(`.task:focus`);
            if (focusedTask != null) {
                // get task id of next task
                let nextTask = getTaskAfterTask(focusedTask);
                focusTaskWithId(nextTask.id);
            } else {
                // no focused task found => focus first task
                focusTaskWithId(tasks[0]['id']);
            }
        } else if (inputMode == 'v' && (event.key == 'k' || event.key == 'ArrowUp')) {
            // handle k event

            // find focused task
            const focusedTask = document.querySelector(`.task:focus`);
            if (focusedTask != null) {
                // get task id of previous task
                let previousTask = getTaskBeforeTask(focusedTask);
                focusTaskWithId(previousTask.id);
            } else {
                // no focused task found => focus last task
                focusTaskWithId(tasks[tasks.length-1]['id']);
            }
        } else if (inputMode == 'v' && event.key == "i") {
            // handle i event
            event.preventDefault();
            const focusedTask = document.querySelector(`.task:focus`);
            console.log('focusedTask', focusedTask);
            document.querySelector('.task:focus h2').setAttribute('contentEditable', true);
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
            const focusedTitle = document.querySelector('.task h2:focus');
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
        console.log("rendering tasks");
        const template = document.getElementById('task-template').innerHTML;
        const rendered = Mustache.render(template, {tasks: tasks, "tagColor": tagBackgroundColor, "tagTextColor": tagTextColor});
        document.getElementById('task-list').innerHTML = rendered;
        
        document.querySelectorAll('.task h2').forEach((el) => {
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
                    // handle '#' key on h2: create new tag
                    event.preventDefault();
                    let newTagEl = newTagElement('#');
                    insertNodeAtCursor(newTagEl);
                    setCursorToEnd(newTagEl);
                } else if (event.key == "Tab" || event.key == " " || event.key == "Spacebar") {
                    // handle space / tab key on h2: add tag
                    if (event.key == "Tab") {
                        event.preventDefault();
                    }
                    const focusedTaskEl = getFocusedTaskElement();
                    const focusedTaskId = getTaskIdForTaskElement(focusedTaskEl);
                    const newTagEl = focusedTaskEl.querySelector('h2 .tag');
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
        for (var i = 0; i < taskEl.querySelector('h2').childNodes.length; ++i) {
            if (taskEl.querySelector('h2').childNodes[i].nodeType === Node.TEXT_NODE) {
                title += taskEl.querySelector('h2').childNodes[i].textContent;
            }
        }
        return title.trim();
    }

    function saveAndUpdateTask(taskEl) {
        taskEl.querySelectorAll('h2 .tag').forEach((tagEl) => {
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
    function getTaskAfterTask(taskElOrTaskId) {
        if (taskElOrTaskId instanceof HTMLElement) {
            return getTaskAfterTaskWithId(getTaskIdForTaskElement(taskElOrTaskId));
        }
        return getTaskAfterTaskWithId(taskElOrTaskId);
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
    function getTaskBeforeTask(taskElOrTaskId) {
        if (taskElOrTaskId instanceof HTMLElement) {
            return getTaskBeforeTaskWithId(getTaskIdForTaskElement(taskElOrTaskId));
        }
        return getTaskBeforeTaskWithId(taskElOrTaskId);
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
        const el = document.querySelector(`.task[data-task-id='${taskId}'] h2`);
        console.log('h2', el);
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