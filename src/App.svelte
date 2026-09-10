<script lang="ts">
    import type { BoxPositions, Task, Box } from "./types";
    import { createTaskInTaskBox, getBoxWithId, getTaskByTaskId, appendTaskAfterTaskEl, focusTaskBelowFocusedTaskOrFirstTask, focusTaskAboveFocusedTaskOrLastTask, focusTaskByRef, focusTaskTitle, focusTaskTitleByRef, getFocusedTaskElement, getTaskElById, getTaskIdForTaskElement, getTaskRef, toggleTaskStatus, getBoxIdForTaskEl, getBoxPositionForTaskEl, getTaskElAboveFocusedTask, getTaskElBelowFocusedTask, toggleTagForTaskId, getTaskListElById, focusTaskRightToFocusedTask, focusTaskLeftToFocusedTask } from "./helpers.svelte"
    import { pickTextColorBasedOnBackgroundColor, safeColor, DEFAULT_TAG_COLOR } from "./utils";
    import { sanitizeTag, sanitizeBox, sanitizeTask, MAX_COLUMNS, MAX_TAGS, MAX_BOXES, MAX_TASKS, MAX_IMPORT_BYTES } from "./validate";
    import TagList from "./TagList.svelte";
    import SyncStatus from "./SyncStatus.svelte";
    import TaskEl from "./TaskEl.svelte";
    import { tick } from "svelte";
    import { localState, svelteStore, transact } from "./shared.svelte";

    let boxIdOfFocusedNewTagInput = $state("");
    let importError = $state("");

    // columnIndex is untrusted: it comes from imported files and, once the
    // document is shared through a Matrix room, from any room member. An
    // unclamped value here becomes Array(numColumns) below - a value like
    // 1e9 hangs the tab, and a non-integer throws RangeError during render.
    let numColumns = $derived(Math.min(
        MAX_COLUMNS,
        Math.max(1, $svelteStore.boxes.reduce((max, box) => {
            const idx = Number(box.columnIndex);
            return Number.isInteger(idx) && idx > max && idx < MAX_COLUMNS ? idx : max;
        }, 0) + 1)
    ));

    // handle global key events
    window.addEventListener('keydown', (event: KeyboardEvent) => {
        if (['i', 'd'].includes(localState.mode) && event.key == "Escape") {
            // return to view mode
            localState.mode = 'v';

            // remove delte class from focused task
            let taskEl = getFocusedTaskElement();

            if (taskEl.success) {
                taskEl.value.classList.remove('delete-preview');
            }

        } else if (['v', 'd'].includes(localState.mode) && !event.shiftKey && !event.altKey && (event.key == "j" || event.key == "ArrowDown")) {
            event.preventDefault(); // prevent scrolling (arrow keys)

            // return to view mode
            localState.mode = 'v';

            // handle j event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            focusTaskBelowFocusedTaskOrFirstTask();
        } else if (['v', 'd'].includes(localState.mode) && !event.shiftKey && !event.altKey && (event.key == 'k' || event.key == 'ArrowUp')) {
            event.preventDefault(); // prevent scrolling (arrow keys)

            // return to view mode
            localState.mode = 'v';

            // handle k event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            focusTaskAboveFocusedTaskOrLastTask();
        } else if (['v', 'd'].includes(localState.mode) && !event.shiftKey && !event.altKey && (event.key == 'l' || event.key == 'ArrowRight')) {
            event.preventDefault(); // prevent scrolling (arrow keys)

            // return to view mode
            localState.mode = 'v';

            // handle l event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            focusTaskRightToFocusedTask();
        } else if (['v', 'd'].includes(localState.mode) && !event.shiftKey && !event.altKey && (event.key == 'h' || event.key == 'ArrowLeft')) {
            event.preventDefault(); // prevent scrolling (arrow keys)

            // return to view mode
            localState.mode = 'v';

            // handle h event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            focusTaskLeftToFocusedTask();
        } else if (localState.mode == 'v' && (event.shiftKey || event.altKey) && (event.key == "k" || event.key == 'K' || event.key == 'ArrowUp')) {

            // move task up
            moveFocusedTaskUp();
        } else if (localState.mode == 'v' && (event.shiftKey || event.altKey) && (event.key == "j" || event.key == "J" || event.key == 'ArrowDown')) {

            // move task down
            moveFocusedTaskDown();
        } else if (localState.mode != 'i' && event.key == "i") {

            // handle i event
            if (event.target instanceof HTMLInputElement) {
                return;
            }
            const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);
            if (focusedTask) {
                event.preventDefault();
                focusTaskTitle(focusedTask);
                localState.mode = 'i'; // switch to insert mode
            }
        } else if (localState.mode == 'v' && event.code == "Space") {

            // handle space key event
            const taskEl = getFocusedTaskElement();
            if (taskEl.success) {
                event.preventDefault(); // prevent scrolling down
                const taskId = getTaskIdForTaskElement(taskEl.value);
                const task = getTaskByTaskId(taskId, $svelteStore.tasks);
                if (task.success) {
                    toggleTaskStatus(task.value);
                }
            }
        } else if (localState.mode == 'v' && event.key == 'o') {

            // handle o key event
            if (event.target instanceof HTMLInputElement) {
                return;
            }
            event.preventDefault();

            // create new task
            let newTask: Task;
            const focusedTask = document.querySelector(`.task:focus`);
            if (focusedTask instanceof HTMLElement) {
                newTask = appendTaskAfterTaskEl(focusedTask, $svelteStore.boxes, $svelteStore.tasks);
            } else {
                newTask = appendTaskInTaskBox("default", $svelteStore.boxes);
            }

            // focus title of new task
            localState.mode = 'i';
            tick().then(() => {
                focusTaskTitle(getTaskElById(newTask.id));
            });

        } else if (localState.mode == 'v' && (event.key == 'd' || event.key == "Delete")) {
            // switch to delete mode
            localState.mode = 'd';

            let taskEl = getFocusedTaskElement();
            if (taskEl.success) taskEl.value.classList.add('delete-preview');

        } else if (localState.mode == 'd' && (event.key == 'd' || event.key == "Delete")) {
            let taskEl = getFocusedTaskElement();
            if (taskEl.success) {
                // delete task
                let taskId = getTaskIdForTaskElement(taskEl.value);
                let task = getTaskByTaskId(taskId, $svelteStore.tasks);
                if (!task.success) return;
                $svelteStore.tasks.splice($svelteStore.tasks.indexOf(task.value), 1);

                // return to view mode
                localState.mode = 'v';
                focusTaskAboveFocusedTaskOrLastTask();
            }

        } else if ((event.ctrlKey || event.altKey) && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(event.key)) {

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

            if (tagIndex >= $svelteStore.tags.length) {
                console.log(`no shortcut defined for ctrl+${event.key}`);
                return;
            }

            // toggle predefined tag for shortcut event
            toggleTagForTaskId(taskId, $svelteStore.tags[tagIndex].name, $svelteStore.tasks);

            tick().then(() => {
                if (localState.mode == 'v') {
                    focusTaskByRef(taskRef);
                } else if (localState.mode == 'i') {
                    focusTaskTitleByRef(taskRef);
                }
            });

            event.preventDefault(); // this prevents tab switching using (crtl+[num] or alt+[num] in Firefox)
        }
    });

    // import button
    function importFile() {
        var input = document.createElement('input');
        input.type = 'file';
        input.click();

        input.onchange = file_event => {
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];

            if (file.size > MAX_IMPORT_BYTES) {
                importError = `File is too large (limit ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB).`;
                return;
            }

            const reader = new FileReader();
            reader.onerror = () => { importError = "Could not read that file."; };
            reader.onload = readerEvent => {
                try {
                    applyImport(JSON.parse(readerEvent.target?.result as string));
                    importError = "";
                } catch (err) {
                    importError = "That file is not a valid ultimate-lists export.";
                    console.warn("import failed", err);
                }
            };
            reader.readAsText(file, 'UTF-8');
        }
    }

    // Merge an imported document. Every entity is sanitized: an import is
    // untrusted input, and once the list is shared through a Matrix room a bad
    // import poisons the document for everyone in it.
    function applyImport(parsed: unknown) {
        if (typeof parsed !== 'object' || parsed === null) throw new Error("expected an object");
        const doc = parsed as Record<string, unknown>;

        const existingTagNames = new Set($svelteStore.tags.map(t => t.name));
        const existingBoxIds = new Set($svelteStore.boxes.map(b => b.id));
        const existingTaskIds = new Set($svelteStore.tasks.map(t => t.id));

        if (Array.isArray(doc.tags)) {
            for (const raw of doc.tags) {
                if ($svelteStore.tags.length >= MAX_TAGS) break;
                const tag = sanitizeTag(raw);
                if (tag && !existingTagNames.has(tag.name)) {
                    existingTagNames.add(tag.name);
                    $svelteStore.tags.push(tag);
                }
            }
        }

        if (Array.isArray(doc.boxes)) {
            for (const raw of doc.boxes) {
                if ($svelteStore.boxes.length >= MAX_BOXES) break;
                const box = sanitizeBox(raw);
                if (box && !existingBoxIds.has(box.id)) {
                    existingBoxIds.add(box.id);
                    $svelteStore.boxes.push(box);
                }
            }
        }

        if (Array.isArray(doc.tasks)) {
            for (const raw of doc.tasks) {
                if ($svelteStore.tasks.length >= MAX_TASKS) break;
                const task = sanitizeTask(raw);
                if (task && !existingTaskIds.has(task.id)) {
                    existingTaskIds.add(task.id);
                    $svelteStore.tasks.push(task);
                }
            }
        }
    }

    // Sort tasks by position inside the box with the given id.
    //
    // This must be a *total* order: the previous comparator returned 1 for both
    // (a,b) and (b,a) when neither task had a position, so different engines and
    // insertion orders produced different orderings on different clients. Once
    // the document is shared that divergence is self-reinforcing, because
    // TaskEl's self-healing onMount writes the DOM order back into the document
    // and two clients would rewrite each other's positions forever.
    function sortTasksByPosition(tasks: Task[], boxId: string) {
        return tasks.sort((a: Task, b: Task) => {
            const pa = a.boxPositions?.[boxId];
            const pb = b.boxPositions?.[boxId];

            const aHas = typeof pa === 'number' && Number.isFinite(pa);
            const bHas = typeof pb === 'number' && Number.isFinite(pb);

            if (aHas && bHas && pa !== pb) return pa - pb;
            if (aHas !== bHas) return aHas ? -1 : 1; // positioned tasks first
            // deterministic tiebreak so every client agrees
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
    }

    // ----- task helper functions -----
    export function appendTaskInTaskBox(boxId: string, boxes: Array<Box>) {
        const taskBox = getBoxWithId(boxId, boxes);
        if (!taskBox.success) throw taskBox.error;

        let taskBoxLength = getTaskListElById(boxId).querySelectorAll('.task').length;

        // create task
        const newTask = createTaskInTaskBox(taskBox.value, taskBoxLength);

        // add task
        $svelteStore.tasks.push(newTask);
        return newTask;
    }

    // Indexed once per tags change rather than linear-scanned per tag per render.
    const tagColorByName = $derived.by(() => {
        const m = new Map<string, string>();
        for (const tag of $svelteStore.tags) {
            if (tag.color && !m.has(tag.name)) m.set(tag.name, tag.color);
        }
        return m;
    });

    function getTagColor(tagName: string) {
        return tagColorByName.get(tagName);
    }

    function getBoxesInColumn(columnIndex: number) {
        // put all boxes with undefined columnIndex or columnIndex >= config.numColumns in column 0
        return $svelteStore.boxes.filter(box =>
            columnIndex == 0 && !(box.columnIndex && box.columnIndex > 0 && box.columnIndex < numColumns) || box.columnIndex == columnIndex);
    }

    function createBoxInColumn(columnIndex: number) {
        const newBoxId = crypto.randomUUID();
        $svelteStore.boxes.push({ tags: [], id: newBoxId, columnIndex: columnIndex });

        // focus tag input field after new box has been rendered
        tick().then(() => {
            focusNewTagInput(newBoxId);
        })
    }

    function deleteBoxWithId(boxId: string) {
        let columnIndex;

        // find and delete box with given boxId
        for (let [index, box] of $svelteStore.boxes.entries()) {
            if (box.id == boxId) {
                columnIndex = box.columnIndex;
                $svelteStore.boxes.splice(index, 1);
            }
        }

        // delete column if deleted box was the last box of this column
        if (columnIndex !== undefined && getBoxesInColumn(columnIndex).length == 0) {
            // move all boxes right to the deleted column one column to the left
            for (let box of $svelteStore.boxes) {
                if (box.columnIndex != undefined && box.columnIndex > columnIndex) box.columnIndex--;
            }

            // FIXME: remove: $svelteStore.config.numColumns--;
        }
    }

    function focusNewTagInput(boxId: string) {
        boxIdOfFocusedNewTagInput = boxId;

        // focus tag input after css updates
        tick().then(() => {
            const focusedNewTagInput = document.querySelector(`#new-tag-input-${boxId}`)
            if (focusedNewTagInput instanceof HTMLInputElement) focusedNewTagInput.focus();
        });
    }

    // add new tag to box
    function onKeyDownNewTagInput(boxTags: string[]) {
        return (event: KeyboardEvent) => {
            if (event.key == 'Enter' && event.target instanceof HTMLInputElement && event.target.value.trim().replace(/^#/, "") != '') {
                console.log("enter");

                boxTags.push(event.target.value.trim().replace(/^#/, ""));
                event.target.value = '';
            }
        }
    }

    function removeTagFromBox(tagName: string, boxId: string) {
        for (let box of $svelteStore.boxes) {
            if (box.id == boxId) {
                const index = box.tags.indexOf(tagName);
                if (index == -1) {
                    throw "tag not found in box";
                }
                box.tags.splice(index, 1);
                if (box.tags.length == 0) {
                    deleteBoxWithId(box.id);
                }
            }
        }
        throw "box not found"
    }

    function onClickNewTaskPlaceholder(boxId: string) {
        return (event: MouseEvent) => {
            event.preventDefault();
            let newTask = appendTaskInTaskBox(boxId, $svelteStore.boxes);

            // focus task title after it has been rendered
            tick().then(() => {
                focusTaskTitle(getTaskElById(newTask.id));
            });

            // hide .new-task-placeholder
            //(getTaskElById(newTask.id).closest('.task-box')!.querySelector('.new-task-placeholder')! as HTMLElement).style.display = "none";
            localState.mode = 'i';
        }
    }

    function moveFocusedTaskUp() {
        const taskElAbove = getTaskElAboveFocusedTask();
        if (taskElAbove.success) {
            switchFocusedTaskWithTaskEl(taskElAbove.value);
        }
    }

    function moveFocusedTaskDown() {
        const taskElBelow = getTaskElBelowFocusedTask();
        if (taskElBelow.success && taskElBelow.value) {
            switchFocusedTaskWithTaskEl(taskElBelow.value);
        }
    }

    function switchFocusedTaskWithTaskEl(taskEl: HTMLElement) {
        const focusedTask: HTMLElement | null = document.querySelector(`.task:focus`);

        // note: this implementation does not support moving task accros boxes, hence boxId == boxId
        if (focusedTask != null && taskEl && getBoxIdForTaskEl(focusedTask) == getBoxIdForTaskEl(taskEl)) {
            const taskRef = getTaskRef(focusedTask);

            // both position writes belong to one gesture, so one Yjs update
            transact(() => {
                for (let task of $svelteStore.tasks) {
                    if (task.id == getTaskIdForTaskElement(focusedTask)) {
                        if (!task.boxPositions) task["boxPositions"] = {};
                        task.boxPositions[getBoxIdForTaskEl(focusedTask)] = getBoxPositionForTaskEl(taskEl);
                    } else if (task.id == getTaskIdForTaskElement(taskEl)) {
                        if (!task.boxPositions) task["boxPositions"] = {};
                        task.boxPositions[getBoxIdForTaskEl(focusedTask)] = getBoxPositionForTaskEl(focusedTask as HTMLElement);
                    }
                }
            });

            tick().then(() => {
                focusTaskByRef(taskRef);
            });
        }
    }

    function addNewColumn() {
        if($svelteStore.config.numColumns === undefined) $svelteStore.config.numColumns = 0;
        $svelteStore.config.numColumns++;
        createBoxInColumn($svelteStore.config.numColumns - 1);
    }
</script>

<SyncStatus />

<section class="section">
    <h1 class="title">
    ultimate lists [{localState.mode}]
    </h1>
    <p class="subtitle">
    A keyboard-first, tag-based list and task management web app optimized for high-volume task management
    </p>
    <TagList tags={$svelteStore.tags}/><button class="button-import" aria-label="Import file" onclick={() => importFile()}>import</button>
    <div id="tasks-wrapper" class="columns">
        {#each Array(numColumns), index}
        <div class="column" data-column-index="{index}">
            {#each $svelteStore.boxes.filter(box => (!("columnIndex" in box) && index == 0) || box.columnIndex == index) as box}
            <section class="task-box" data-task-box-id="{box.id}">
                <h2 class="task-box-heading">
                    {box.name}
                    {#each box.tags as tagName}
                    <span class="tag" data-tag-name="{tagName}" style:background-color={safeColor(getTagColor(tagName))} style:color={pickTextColorBasedOnBackgroundColor(getTagColor(tagName) ?? DEFAULT_TAG_COLOR)}>
                        {tagName}
                        <button class="delete is-small" aria-label="delete" onclick={() => removeTagFromBox(tagName, box.id)}></button>
                    </span>
                    {/each}
                    <button class="tag button {boxIdOfFocusedNewTagInput==box.id?'is-hidden':''}" onclick={() => focusNewTagInput(box.id)}>+</button>
                    <input onblur={() => boxIdOfFocusedNewTagInput=""} onkeydown={onKeyDownNewTagInput(box.tags)} type="text" id="new-tag-input-{box.id}" placeholder="add new tag filter" style:display={boxIdOfFocusedNewTagInput==box.id?'inline-flex':'none'}/>
                    <button class="button delete" style="float: right;" onclick={() => deleteBoxWithId(box.id)}>x</button>
                </h2>
                <section id="task-list-{box.id}" class="task-list">
                    {#if box.id == "default"}
                    {#each sortTasksByPosition($svelteStore.tasks.filter(task =>
                            task.tags.length == 0 || // task has no tags
                            !$svelteStore.boxes.some(otherBox => 'default' != otherBox.id && otherBox.tags.length > 0 && otherBox.tags.every(boxTag => task.tags.includes(boxTag))) // no other box exists that contains the task's tags
                        ), 'default') as task}
                        <TaskEl {task} taskStatus={task.status} bind:taskTitle={task.title} boxId={box.id} filteredTagNames={task.tags} />
                    {/each}
                    {:else}
                    {#each sortTasksByPosition($svelteStore.tasks.filter(task =>
                            task.tags.length > 0 && // make sure that task has tags
                            box.tags.length > 0 &&
                            box.tags.every(boxTag => task.tags.includes(boxTag)) && // the task's tags must include every tag of the box
                            !$svelteStore.boxes.some(otherBox => box.id != otherBox.id && otherBox.tags.every(boxTag => task.tags.includes(boxTag)) && box.tags.every(boxTag => otherBox.tags.includes(boxTag)) && !otherBox.tags.every(otherBoxTag => box.tags.includes(otherBoxTag))) // no other box exists that contains the task's tags AND contains the same but strictly more tags than the box in question
                        ), box.id) as task}
                        <TaskEl {task} taskStatus={task.status} bind:taskTitle={task.title} boxId={box.id} filteredTagNames={task.tags.filter(t => box.tags.indexOf(t) == -1 )} />
                    {/each}
                    {/if}
                </section>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="new-task-placeholder" onclick={onClickNewTaskPlaceholder(box.id)} onkeydown={() => {}}>
                    <input type="checkbox" disabled><h3 class="task-title">create new task here</h3>
                </span>
            </section>
            {/each}
            <button class="button new-box-button is-small is-fullwidth" onclick={() => createBoxInColumn(index)}>+</button>
        </div>
        {/each}
        <div class="column is-narrow">
            <button class="button new-column-button is-small" onclick={addNewColumn}>+</button>
        </div>
    </div>
</section>

<section class="footer">Thanks for using <em>ultimate lists</em>! This web application is Free Software (Open-Source-Software), licensed under the terms of the <a href="https://codeberg.org/codedust/ultimate-lists/src/branch/main/LICENSE.md">GNU Affero General Public License</a>.</section>

<style>
  @import './app.css';
</style>
