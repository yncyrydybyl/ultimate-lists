<script lang="ts">
    import type { BoxPositions, Task, Box } from "./types";
    import { createTaskInTaskBox, getBoxWithId, getTaskByTaskId, appendTaskAfterTaskEl, focusTaskBelowFocusedTaskOrFirstTask, focusTaskAboveFocusedTaskOrLastTask, focusTaskByRef, focusTaskTitle, focusTaskTitleByRef, getFocusedTaskElement, getTaskElById, getTaskIdForTaskElement, getTaskRef, toggleTaskStatus, createTask, getBoxIdForTaskEl, getBoxPositionForTaskEl, getTaskElAboveFocusedTask, getTaskElBelowFocusedTask, toggleTagForTaskId, getTaskListElById } from "./helpers.svelte"
    import { pickTextColorBasedOnBackgroundColor } from "./utils";
    import TagList from "./TagList.svelte";
    import TaskEl from "./TaskEl.svelte";
    import { tick } from "svelte";
    import { localState, svelteStore } from "./shared.svelte";

    $inspect($svelteStore);

    // write svelteStore to localStorage
    let stringifiedConfig = $derived(JSON.stringify($svelteStore));
    $effect(() => {
        console.log("writing to localStorage (for backup reasons only)...");
        localStorage.setItem('ultimateLists.config', stringifiedConfig);
    });

    let boxIdOfFocusedNewTagInput = $state("");
    let numColumns = $derived($svelteStore.boxes.reduce((max, box) => Math.max(max, box.columnIndex || 0), 0) + 1);

    // handle global key events
    window.addEventListener('keydown', (event: KeyboardEvent) => {
        if (localState.mode == 'v' && (event.key == "j" || event.key == "ArrowDown")) {
            event.preventDefault(); // prevent scrolling (arrow keys)

            // handle j event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            focusTaskBelowFocusedTaskOrFirstTask();
        } else if (localState.mode == 'v' && (event.key == 'k' || event.key == 'ArrowUp')) {
            event.preventDefault(); // prevent scrolling (arrow keys)

            // handle k event
            if (event.target instanceof HTMLInputElement) {
                return;
            }

            focusTaskAboveFocusedTaskOrLastTask();
        } else if (localState.mode == 'v' && event.key == "K") {

            // move task up
            moveFocusedTaskUp();
        } else if (localState.mode == 'v' && event.key == "J") {

            // move task down
            moveFocusedTaskDown();
        } else if (localState.mode == 'v' && event.key == "i") {

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
        }
    });

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

    function getTagColor(tagName: string) {
        for (let tag of $svelteStore.tags) {
            if (tag.name == tagName && tag.color) {
                return tag.color;
            }
        }
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

            // render task title after it has been rendered
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

            for (let task of $svelteStore.tasks) {
                if (task.id == getTaskIdForTaskElement(focusedTask)) {
                    if (!task.boxPositions) task["boxPositions"] = {};
                    task.boxPositions[getBoxIdForTaskEl(focusedTask)] = getBoxPositionForTaskEl(taskEl);
                } else if (task.id == getTaskIdForTaskElement(taskEl)) {
                    if (!task.boxPositions) task["boxPositions"] = {};
                    task.boxPositions[getBoxIdForTaskEl(focusedTask)] = getBoxPositionForTaskEl(focusedTask as HTMLElement);
                }
            }

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

<section class="section">
    <h1 class="title">
    ultimate lists [{localState.mode}] {$svelteStore.config.numColumns}
    </h1>
    <p class="subtitle">
    A keyboard-first, tag-based list and task management web app optimized for high-volume task management
    </p>
    <TagList tags={$svelteStore.tags}/>
    <div id="tasks-wrapper" class="columns">
        {#each Array(numColumns), index}
        <div class="column" data-column-index="{index}">
            {#each $svelteStore.boxes.filter(box => (!("columnIndex" in box) && index == 0) || box.columnIndex == index) as box}
            <section class="task-box" data-task-box-id="{box.id}">
                <h2 class="task-box-heading">
                    {box.name}
                    {#each box.tags as tagName}
                    <span class="tag" data-tag-name="{tagName}" style="background-color: {getTagColor(tagName)}; color: {pickTextColorBasedOnBackgroundColor(getTagColor(tagName) || "white")}">
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
                        <TaskEl {task} bind:taskTitle={task.title} boxId={box.id} filteredTagNames={task.tags} />
                    {/each}
                    {:else}
                    {#each sortTasksByPosition($svelteStore.tasks.filter(task =>
                            task.tags.length > 0 && // make sure that task has tags
                            box.tags.length > 0 &&
                            box.tags.every(boxTag => task.tags.includes(boxTag)) && // the task's tags must include every tag of the box
                            !$svelteStore.boxes.some(otherBox => box.id != otherBox.id && otherBox.tags.every(boxTag => task.tags.includes(boxTag)) && box.tags.every(boxTag => otherBox.tags.includes(boxTag)) && !otherBox.tags.every(otherBoxTag => box.tags.includes(otherBoxTag))) // no other box exists that contains the task's tags AND contains the same but strictly more tags than the box in question
                        ), box.id) as task}
                        <TaskEl {task} bind:taskTitle={task.title} boxId={box.id} filteredTagNames={task.tags.filter(t => box.tags.indexOf(t) == -1 )} />
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
