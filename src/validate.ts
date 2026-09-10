// Shared input validation.
//
// Two untrusted sources feed the document: imported JSON files, and - once the
// list is shared through a Matrix room - every other member of that room. A
// CRDT has no schema and no per-field authorization, so structural limits have
// to be enforced here, on the way in and before render.
//
// Policy: drop or clamp the offending *entity*, never reject the whole
// document. A hostile member must not be able to blank the board by poisoning
// a single field.

import { SyncedText } from "@syncedstore/core";
import { TaskStatus, type Box, type Tag, type Task } from "./types";
import { normalizeColor } from "./utils";

// ----- limits -----

export const MAX_COLUMNS = 12;
export const MAX_TASKS = 5000;
export const MAX_TAGS = 200;
export const MAX_BOXES = 100;
export const MAX_TAGS_PER_ENTITY = 32;
export const MAX_TITLE_LENGTH = 8192;
export const MAX_TAG_NAME_LENGTH = 512;
export const MAX_BOX_NAME_LENGTH = 512;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// ----- primitives -----

/** Identifiers are interpolated into CSS selectors, so keep them conservative. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(value: unknown): value is string {
    return typeof value === 'string' && ID_RE.test(value);
}

export function clampString(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function clampColumnIndex(value: unknown): number | undefined {
    const idx = Number(value);
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_COLUMNS) return undefined;
    return idx;
}

export function sanitizeTagNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const raw of value) {
        if (out.length >= MAX_TAGS_PER_ENTITY) break;
        const name = clampString(raw, MAX_TAG_NAME_LENGTH);
        if (name !== undefined && name.length > 0 && !out.includes(name)) out.push(name);
    }
    return out;
}

function sanitizeBoxPositions(value: unknown): Record<string, number> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const out: Record<string, number> = {};
    let count = 0;
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (count >= MAX_BOXES) break;
        if (!isValidId(key)) continue;
        const pos = Number(raw);
        if (!Number.isFinite(pos)) continue;
        out[key] = pos;
        count++;
    }
    return out;
}

// ----- entities -----

/** Returns a clean Tag, or null if the input cannot be salvaged. */
export function sanitizeTag(input: unknown): Tag | null {
    if (typeof input !== 'object' || input === null) return null;
    const raw = input as Record<string, unknown>;

    const name = clampString(raw.name, MAX_TAG_NAME_LENGTH);
    if (name === undefined || name.length === 0) return null;

    // normalizeColor rejects anything that is not a lone CSS <color>,
    // which is what stops style-attribute injection via tag colours.
    const color = normalizeColor(raw.color);
    return color === null ? { name } : { name, color };
}

/** Returns a clean Box, or null if the input cannot be salvaged. */
export function sanitizeBox(input: unknown): Box | null {
    if (typeof input !== 'object' || input === null) return null;
    const raw = input as Record<string, unknown>;

    if (!isValidId(raw.id)) return null;

    const box: Box = { id: raw.id, tags: sanitizeTagNames(raw.tags) };

    const name = clampString(raw.name, MAX_BOX_NAME_LENGTH);
    if (name !== undefined) box.name = name;

    const columnIndex = clampColumnIndex(raw.columnIndex);
    if (columnIndex !== undefined) box.columnIndex = columnIndex;

    return box;
}

function sanitizeStatus(value: unknown): TaskStatus {
    return value === TaskStatus.Done || value === TaskStatus.InProgress || value === TaskStatus.New
        ? value
        : TaskStatus.New;
}

/**
 * Returns a clean Task, or null if the input cannot be salvaged.
 *
 * `title` is constructed as a fresh SyncedText from a coerced string. The
 * previous import path did `task.title += json.title`, which stringified the
 * Y.Text and replaced it with a scalar, breaking the collaborative-text
 * invariant that every remote peer depends on.
 */
export function sanitizeTask(input: unknown): Task | null {
    if (typeof input !== 'object' || input === null) return null;
    const raw = input as Record<string, unknown>;

    if (!isValidId(raw.id)) return null;

    const title = clampString(typeof raw.title === 'string' ? raw.title : String(raw.title ?? ''), MAX_TITLE_LENGTH) ?? '';

    const task: Task = {
        id: raw.id,
        title: new SyncedText(title) as Task['title'],
        status: sanitizeStatus(raw.status),
        tags: sanitizeTagNames(raw.tags),
    };

    const boxPositions = sanitizeBoxPositions(raw.boxPositions);
    if (boxPositions !== undefined) task.boxPositions = boxPositions;

    return task;
}
