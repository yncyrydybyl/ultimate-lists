<script lang="ts">
    import type { BoxPositions, Config, Task } from "./types";
    import { TaskStatus } from "./types";
    import { focusTaskBelowFocusedTaskOrFirstTask, focusTaskAboveFocusedTaskOrLastTask, focusTaskByRef, focusTaskTitle, focusTaskTitleByRef, getFocusedTaskElement, getTaskElById, getTaskIdForTaskElement, getTaskRef, newTaskAfterTaskEl, newTaskInTaskBox, toggleTagForTaskId, toggleTaskStatus, deleteBoxWithId, createTask, getBoxIdForTaskEl, getBoxPositionForTaskEl, getTaskElAboveFocusedTask, getTaskElBelowFocusedTask, getTaskByTaskId } from "./helpers"
    import TagList from "./TagList.svelte";
    import { pickTextColorBasedOnBackgroundColor } from "./utils";
    import TaskEl from "./TaskEl.svelte";
    import { tick } from "svelte";
    import { localState } from "./shared.svelte";

    let configObj: Config;

    // read config from localStorage
    let configFromLocalstorage = localStorage.getItem('ultimateLists.config');
    if (configFromLocalstorage) {
        console.log("loading config from localStorage...");
        configObj = JSON.parse(configFromLocalstorage);
    } else {
        // populate default config
        configObj = {
            numColumns: 3,
            showBoxTagsInTasks: true,
            tasks: [
                { title: 'my prio high task', id: crypto.randomUUID(), status: TaskStatus.New, tags: ['today', 'orga'] },
                { title: 'my 2nd task', id: crypto.randomUUID(), status: TaskStatus.New, tags: ['focus'] }
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
    }

    export const config = $state(configObj);
    $inspect(config);

    let stringifiedConfig = $derived(JSON.stringify(config));
    $effect(() => {
        console.log("writing to localStorage...");
        localStorage.setItem('ultimateLists.config', stringifiedConfig);
    });

    let boxIdOfFocusedNewTagInput = $state("");

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
                const task = getTaskByTaskId(taskId, config);
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
                newTask = newTaskAfterTaskEl(focusedTask, config);
            } else {
                newTask = newTaskInTaskBox("default", config);
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

            if (tagIndex >= config.tags.length) {
                console.log(`no shortcut defined for ctrl+${event.key}`);
                return;
            }

            // toggle predefined tag for shortcut event
            toggleTagForTaskId(taskId, config.tags[tagIndex].name, config);

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

    function getTagColor(tagName: string) {
        for (let tag of config.tags) {
            if (tag.name == tagName && tag.color) {
                return tag.color;
            }
        }
    }

    function createBoxInColumn(columnIndex: number) {
        const newBoxId = crypto.randomUUID();
        config.boxes.push({ tags: [], id: newBoxId, columnIndex: columnIndex });

        // focus tag input field after new box has been rendered
        tick().then(() => {
            focusNewTagInput(newBoxId);
        })
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
        for (let box of config.boxes) {
            if (box.id == boxId) {
                const index = box.tags.indexOf(tagName);
                if (index == -1) {
                    throw "tag not found in box";
                }
                box.tags.splice(index, 1);
                if (box.tags.length == 0) {
                    deleteBoxWithId(box.id, config);
                }
            }
        }
        throw "box not found"
    }

    function onClickNewTaskPlaceholder(config: Config, tags: string[]) {
        return (event: MouseEvent) => {
            event.preventDefault();
            const newTaskId = crypto.randomUUID();
            const boxPositions: BoxPositions = {};
            const newTask = createTask(newTaskId, boxPositions, tags);
            config.tasks.push(newTask);

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

            for (let task of config.tasks) {
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
        config.numColumns++;
        createBoxInColumn(config.numColumns - 1);
    }

    let defaultBoxTasks = $derived(sortTasksByPosition(config.tasks.filter(task =>
                            task.tags.length == 0 || // task has no tags
                            !config.boxes.some(otherBox => 'default' != otherBox.id && otherBox.tags.length > 0 && otherBox.tags.every(boxTag => task.tags.includes(boxTag))) // no other box exists that contains the task's tags
                        ), 'default'));

</script>

<section class="section">
    <h1 class="title">
    ultimate lists [{localState.mode}]
    </h1>
    <p class="subtitle">
    A keyboard-first, tag-based list and task management web app optimized for high-volume task management
    </p>
    <TagList tags={config.tags}/>
    <div id="tasks-wrapper" class="columns">
        {#each Array(config.numColumns), index}
        <div class="column" data-column-index="{index}">
            {#each config.boxes.filter(box => (!("columnIndex" in box) && index == 0) || box.columnIndex == index) as box}
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
                    <button class="button delete" style="float: right;" onclick={() => deleteBoxWithId(box.id, config)}>x</button>
                </h2>
                <section id="task-list-{box.id}" class="task-list">
                    {#if box.id == "default"}
                    {#each defaultBoxTasks as task}
                        <TaskEl {task} bind:taskTitle={task.title} boxId={box.id} filteredTags={task.tags} {config} />
                    {/each}
                    {:else}
                    {#each sortTasksByPosition(config.tasks.filter(task =>
                            task.tags.length > 0 && // make sure that task has tags
                            box.tags.length > 0 &&
                            box.tags.every(boxTag => task.tags.includes(boxTag)) && // the task's tags must include every tag of the box
                            !config.boxes.some(otherBox => box.id != otherBox.id && otherBox.tags.every(boxTag => task.tags.includes(boxTag)) && box.tags.every(boxTag => otherBox.tags.includes(boxTag)) && !otherBox.tags.every(otherBoxTag => box.tags.includes(otherBoxTag))) // no other box exists that contains the task's tags AND contains the same but strictly more tags than the box in question
                        ), box.id) as task}
                        <TaskEl {task} bind:taskTitle={task.title} boxId={box.id} filteredTags={task.tags.filter(t => box.tags.indexOf(t) == -1 )} {config} />
                    {/each}
                    {/if}
                </section>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="new-task-placeholder" onclick={onClickNewTaskPlaceholder(config, box.tags)} onkeydown={() => {}}>
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
