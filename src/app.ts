import { Config } from "./types.js"
import { renderTags, renderTasks } from "./render.js";
import { focusTaskBelowFocusedTaskOrFirstTask, focusTaskAboveFocusedTaskOrLastTask, focusTaskByRef, focusTaskTitle, focusTaskTitleByRef, getFocusedTaskElement, getTaskElById, getTaskIdForTaskElement, getTaskRef, newTaskAfterTaskEl, newTaskInTaskBox, saveTaskPositions, toggleTagForTaskId } from "./helpers.js"

declare global {
    var config: Config;
}
 
globalThis.config = {
    inputMode: 'v', // start in view mode
    numColumns: 3,
    showBoxTagsInTasks: true,
    tasks: [
        { title: 'my prio high task', id: crypto.randomUUID(), tags: ['today', 'orga'] },
        { title: 'my 2nd task', id: crypto.randomUUID(), tags: ['focus'] }
    ],
    tags: [
        { name: "prio::high", color: 'crimson' },
        { name: "today", color: 'green' },
        { name: "focus", color: 'gold' },
        { name: "orga", color: 'darkcyan' },
    ],
    boxes: [
        { name: "Inbox", tags: [], id: 'default'},
        { tags: ['orga', 'today'], id: crypto.randomUUID(), columnIndex: 1 },
        { tags: ['orga'], id: crypto.randomUUID(), columnIndex: 1 },
        { tags: ['focus', 'today'], id: crypto.randomUUID(), columnIndex: 2 },
        { tags: ['focus'], id: crypto.randomUUID(), columnIndex: 2 },
    ],
};

// handle global key events
window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (config.inputMode == 'v' && (event.key == "j" || event.key == "ArrowDown")) {
        // handle j event
        if (event.target instanceof HTMLInputElement) {
            return;
        }

        focusTaskBelowFocusedTaskOrFirstTask();
    } else if (config.inputMode == 'v' && (event.key == 'k' || event.key == 'ArrowUp')) {
        // handle k event
        if (event.target instanceof HTMLInputElement) {
            return;
        }

        focusTaskAboveFocusedTaskOrLastTask();
    } else if (config.inputMode == 'v' && event.key == "K") {
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
    } else if (config.inputMode == 'v' && event.key == "J") {
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
    } else if (config.inputMode == 'v' && event.key == "i") {
        // handle i event
        if (event.target instanceof HTMLInputElement) {
            return;
        }
        const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);
        if (focusedTask) {
            event.preventDefault();
            focusTaskTitle(focusedTask);
            config.inputMode = 'i'; // switch to insert mode
        }
    } else if (config.inputMode == 'v' && event.code == "Space") {
        // handle space key event
        const focusedTaskCheckbox = document.querySelector(`.task:focus input`);
        if (focusedTaskCheckbox) {
            focusedTaskCheckbox.toggleAttribute('checked');
        }
    } else if (config.inputMode == 'v' && event.key == 'o') {
        // handle o key event
        if (event.target instanceof HTMLInputElement) {
            return;
        }
        event.preventDefault();
        let newTask;
        const focusedTask = document.querySelector(`.task:focus`);
        if (focusedTask instanceof HTMLElement) {
            newTask = newTaskAfterTaskEl(focusedTask);
        } else {
            newTask = newTaskInTaskBox("default");
        }
        renderTasks();
        focusTaskTitle(getTaskElById(newTask.id));
        config.inputMode = 'i';
    } else if (config.inputMode == 'i' && event.key == 'Escape') {
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
        config.inputMode = 'v';
    } else if (event.ctrlKey && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(event.key)) {
        // handle ctr+[0-9] key event
        console.log("ctrl", event.key);
        const focusedTaskEl = getFocusedTaskElement();
        if (!focusedTaskEl.success) {
            console.log("no task is focused");
            return;
        }
        const taskId = getTaskIdForTaskElement(focusedTaskEl.value);
        const taskRef = getTaskRef(focusedTaskEl.value);

        const tagIndex = parseInt(event.key) == 0 ? 9 : parseInt(event.key) - 1;

        if (tagIndex >= config.tags.length) {
            console.log(`no shortcut defined for ctrl+${event.key}`);
            return;
        }

        // toggle predefined tag for shortcut event
        toggleTagForTaskId(taskId, config.tags[tagIndex].name);

        renderTasks();
        if (config.inputMode == 'v') {
            focusTaskByRef(taskRef);
        } else if (config.inputMode == 'i') {
            focusTaskTitleByRef(taskRef);
        }
    }
});

// handle enter key on new tag input
document.getElementById('new-tag-input')!.addEventListener('keydown', (event) => {
    if (event.key == 'Enter' && event.target instanceof HTMLInputElement && event.target.value.trim().replace(/^#/, "") != '') {
        config.tags.push({"name": event.target.value.trim().replace(/^#/, "") });
        event.target.value = '';
        renderTags();
    }
});

// init
renderTags();
renderTasks();