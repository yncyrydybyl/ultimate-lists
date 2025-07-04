<script lang="ts">
    import type { Attachment } from "svelte/attachments";
    import type { Tag, TaskRef } from "./types";
    import { TaskStatus } from "./types";
    import { pickTextColorBasedOnBackgroundColor } from "./utils";
    import { focusTaskByRef, focusTaskTitle, getBoxIdForTaskEl, getFirstTaskEl, getFocusedTaskElement, getTaskElById, getTaskRef, getTaskTitleFromTaskElement, newTagElement, appendTaskAfterTaskEl, saveNewTagsForTask } from "./helpers.svelte";
    import { onMount, tick } from "svelte";
    import { localState, svelteStore } from "./shared.svelte";
    let { task, taskTitle = $bindable(), boxId, filteredTagNames } = $props();

    let taskEl: HTMLElement | undefined = $state();
    let taskTitleEl: HTMLElement | undefined = $state();

    function getColorForTagWithName(tagName: string) {
        const globalTagsWithGivenName = $svelteStore.tags.filter((t: Tag) => t.name == tagName);
        if (globalTagsWithGivenName.length == 1) {
            return globalTagsWithGivenName[0].color;
        }
    }

    function renderTaskStatus(taskStatus: TaskStatus): Attachment {
        return (checkboxEl) => {
            if (checkboxEl == null || !(checkboxEl instanceof HTMLInputElement)) {
                throw new Error("checkoxEl unexpectedly null or no instance of HTMLInputElement");
            }

            switch(taskStatus) {
                case TaskStatus.New:
                    checkboxEl.removeAttribute('checked');
                    checkboxEl.indeterminate = false;
                    break;
                case TaskStatus.InProgress:
                    checkboxEl.removeAttribute('checked');
                    checkboxEl.indeterminate = true;
                    break;
                case TaskStatus.Done:
                    checkboxEl.setAttribute('checked', 'true');
                    checkboxEl.indeterminate = false;
                    break;
            }
        }
    }

    function getTaskTitleFromEl(taskTitleEl: HTMLElement) {
        let title = '';
        for (var i = 0; i < taskTitleEl.childNodes.length; ++i) {
            if (taskTitleEl.childNodes[i].nodeType === Node.TEXT_NODE) {
                title += taskTitleEl.childNodes[i].textContent;
            }
        }
        return title.trim();
    }

    function taskTitleKeyDownListener(event: KeyboardEvent) {
        if (event.key == 'Enter') {
            // catch key press of 'enter' key on task titles
            event.preventDefault();

            if (!taskTitleEl) {
                throw new Error("taskTitleEl unexpectedly undefined");
            }

            // only create new task if current task title is not empty
            if (getTaskTitleFromEl(taskTitleEl) != '') {
                // create new task after current task
                if (!taskEl) {
                    throw new Error("taskEl unexpectedly undefined");
                }

                let newTask = appendTaskAfterTaskEl(taskEl, $svelteStore.boxes, $svelteStore.tasks);

                // focus task title after it has been rendered
                tick().then(() => {
                    focusTaskTitle(getTaskElById(newTask.id));
                    localState.mode = 'i';
                });
            }
        } else if (event.key == "#") {
            // handle '#' key on .task-title: create new tag
            event.preventDefault();
            let newTagEl = newTagElement('#');

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
                saveNewTagsForTask(focusedTaskEl.value, $svelteStore.tasks);
            } else if (event.key == "Tab" && getTaskTitleFromTaskElement(focusedTaskEl.value) != '') {
                // when tab key is pressed and task title is not empty, unfocus task title and focus task
                focusTaskByRef(focusedTaskRef);
                localState.mode = 'v';
            }
        } else if (event.key == 'Escape') {
            // handle escape key event
            const focusedTaskEl = getFocusedTaskElement();
            if (!focusedTaskEl.success) throw new Error("focusedTaskEl.success unexpectedly false");
            focusedTaskEl.value.focus();
            localState.mode = 'v';
        }
    }

    function taskTitleFocusListener(event: FocusEvent) {
        if (!event.target) {
            throw new Error("task title element unexpectedly null on focus");
        }
        (event.target as HTMLElement).setAttribute('contentEditable', "true");
    }

    // edit task on mouse click
    function taskTitleClickListener(event: MouseEvent) {
        if (!(event.target instanceof HTMLElement)) return;
        const taskEl: HTMLElement | null = event.target.closest('.task');
        if (!taskEl) throw new Error("taskEl unexpectedly not found");

        event.preventDefault();
        focusTaskTitle(taskEl);
        localState.mode = 'i'; // switch to insert mode
    }

    // update task on focusout
    function taskTitleFocusOutListener(event: FocusEvent) {
        let nextFocusedTaskRef: TaskRef;
        const taskEl = (event.target! as HTMLElement).parentElement!;
        (event.target! as HTMLElement).setAttribute('contentEditable', "false");
        localState.mode = 'v';

        // update data model of task that lost focus
        saveNewTagsForTask(taskEl, $svelteStore.tasks);

        if (getTaskTitleFromTaskElement(taskEl) == '') {
            // delete task if title is empty
            if (taskEl.previousElementSibling) {
                nextFocusedTaskRef = getTaskRef(taskEl.previousElementSibling as HTMLElement);
            } else if (taskEl.nextElementSibling) {
                nextFocusedTaskRef = getTaskRef(taskEl.nextElementSibling as HTMLElement);
            }

            let index = $svelteStore.tasks.indexOf(task);
            $svelteStore.tasks.splice(index, 1);

            // restore focus after next tick
            tick().then(() => {
                if (nextFocusedTaskRef) {
                    focusTaskByRef(nextFocusedTaskRef);
                } else {
                    let taskEl = getFirstTaskEl();
                    if (taskEl) taskEl.focus();
                }
            });
        }
    }

    onMount(() => {
        // update task element positions (self-healing)
        console.log("mount");

        if (taskEl instanceof HTMLElement) {
            let arr = Array.from((taskEl.closest('.task-list')! as HTMLElement).children);
            if (!task.boxPositions) task.boxPositions = {};
            if (task.boxPositions[boxId] != arr.indexOf(taskEl)) {
                console.log("diff!", boxId, JSON.stringify(task.title), task.boxPositions[boxId], arr.indexOf(taskEl));
                task.boxPositions[boxId] = arr.indexOf(taskEl);
            }
        }
    });

</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article bind:this={taskEl} class="task" data-task-id="{task.id}" tabindex="0" draggable="true">
    <input type="checkbox" {@attach renderTaskStatus(task.status)}><h3 bind:this={taskTitleEl} class="task-title" bind:textContent={ taskTitle } contenteditable onclick={taskTitleClickListener} onkeydown={taskTitleKeyDownListener} onfocusout={taskTitleFocusOutListener}></h3>
    <div class="tags">{#each filteredTagNames as tagName}<span class="tag" style="background-color: {getColorForTagWithName(tagName)}; color: {pickTextColorBasedOnBackgroundColor(getColorForTagWithName(tagName) || "white")}">{tagName}</span>{/each}</div>
</article>