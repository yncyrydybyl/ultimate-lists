<script lang="ts">
    import type { ChangeEventHandler } from "svelte/elements";
    import type { Tag } from "./types";
    import { pickTextColorBasedOnBackgroundColor, cssColorToHex, safeColor, normalizeColor, DEFAULT_TAG_COLOR } from "./utils";

    let { tags } = $props();

    // handle enter key on new tag input
    function onKeyDownNewTagInput(event: KeyboardEvent) {
        if (event.key == 'Enter' && event.target instanceof HTMLInputElement && event.target.value.trim().replace(/^#/, "") != '') {
            tags.push({"name": event.target.value.trim().replace(/^#/, "") });
            event.target.value = '';
        }
    }

    function deleteTag(tagName: string) {
        let i = tags.findIndex((t: Tag) => t.name == tagName);
        tags.splice(i, 1);
    }

    function setTagColor(tagName: string, color: string) {
        // never write an unparseable colour into the shared document
        const normalized = normalizeColor(color);
        if (normalized === null) return;

        for (let [_, tag] of tags.entries()) {
            if (tag.name == tagName) {
                tag.color = normalized;
            }
        }
    }

    /*document.querySelector('#tag-list')!.addEventListener('dragover', event => {
        event.preventDefault();
    });*/

    function onTagDrag(event: DragEvent) {
        (event.target! as HTMLElement).closest('.tag-label')!.classList.add('dragged');
    }

    function onTagDragEnd(event: DragEvent) {
        event.preventDefault();

        // remove dragged tag from tags list
        const draggedTagIndex = tags.map((t: Tag) => t.name).indexOf(((event.target! as HTMLElement).querySelector('.tag')! as HTMLElement).dataset.tagName!);
        const draggedTag = tags[draggedTagIndex];
        tags.splice(draggedTagIndex, 1); // remove dragged element

        // find indices of drag over elements
        let dragOverTagLeftIndex = -1, dragOverTagRightIndex = -1;
        const dragOverLeftTagEl: HTMLElement = document.querySelector('#tag-list .tag-label.drag-over-left .tag')!;
        const dragOverRightTagEl: HTMLElement = document.querySelector('#tag-list .tag-label.drag-over-right .tag')!;
        if (dragOverLeftTagEl) dragOverTagLeftIndex = tags.map((t: Tag) => t.name).indexOf(dragOverLeftTagEl.dataset.tagName!);
        if (dragOverRightTagEl) dragOverTagRightIndex = tags.map((t: Tag) => t.name).indexOf(dragOverRightTagEl.dataset.tagName!);

        // re-add dragged tag...
        if (dragOverTagLeftIndex != -1) {
            // ...left to drag over element
            tags.splice(dragOverTagLeftIndex, 0, draggedTag); // re-add dragged element
        } else if (dragOverTagRightIndex != -1) {
            // ... right to drag over element
            tags.splice(dragOverTagRightIndex + 1, 0, draggedTag); // re-add dragged element
        } else {
            tags.splice(draggedTagIndex, 0, draggedTag); // fallback to re-add at original position
        }

        document.querySelectorAll('#tag-list .tag-label').forEach(el => {
            el.classList.remove('drag-over-left');
            el.classList.remove('drag-over-right');
            el.classList.remove('dragged');
        });
    }

    function onTagDragOver(event: DragEvent) {
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
    }

    const onColorInputChange = (tagName: string): ChangeEventHandler<HTMLInputElement> => {
        return (event) => {
            setTagColor(tagName, (event?.target as HTMLInputElement).value);
        }
    };

</script>

<section class="tag-list-wrapper">
    <nav id="tag-list" ondragover={e => e.preventDefault()}>
    {#each tags as tag, index (tag.name)}
    <label class="tag-label" for="color-{tag.name}" draggable="true" ondrag={onTagDrag} ondragover={onTagDragOver} ondragend={onTagDragEnd}>
        <span class="tag" data-tag-name="{tag.name}" style:background-color={safeColor(tag.color)} style:color={pickTextColorBasedOnBackgroundColor(tag.color ?? DEFAULT_TAG_COLOR)}>{index+1}: {tag.name} <button class="delete is-small" aria-label="delete" onclick={() => deleteTag(tag.name)}></button></span>
        <input class="color-input" id="color-{tag.name}" type="color" value="{cssColorToHex(tag.color)}" onchange={onColorInputChange(tag.name)}>
    </label>
    {/each}
    </nav>
    <input type="text" id="new-tag-input" placeholder="create new tag" onkeydown={onKeyDownNewTagInput}/>
</section>