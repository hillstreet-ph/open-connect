/**
 * Credential notes are free text and, in practice, often hold sensitive material
 * (imported custom fields, recovery phrases, keys). They must never be sent to the
 * browser as part of a list response. List views get `has_notes` only; the text is
 * fetched for one credential at a time through an explicit reveal action.
 */

export const NOTES_MAX_LENGTH = 4000;

export type WithNotes = { id: string; notes: string | null };

export type WithoutNotes<T extends WithNotes> = Omit<T, "notes"> & { has_notes: boolean };

/** Strip note text from a metadata row, keeping only whether notes exist. */
export function withoutNotes<T extends WithNotes>(row: T): WithoutNotes<T> {
  const { notes, ...rest } = row;
  return { ...rest, has_notes: typeof notes === "string" && notes.trim().length > 0 };
}

/**
 * Decide which notes value to persist when organization (tags/projects) is saved.
 * `undefined` means the client never loaded or edited the notes, so the stored
 * value must be preserved instead of being overwritten with an empty string.
 */
export function resolveNotesForUpdate(
  submitted: string | undefined,
  current: string | null | undefined,
): string {
  if (typeof submitted === "string") return submitted.slice(0, NOTES_MAX_LENGTH);
  return (current ?? "").slice(0, NOTES_MAX_LENGTH);
}

/** Find one owned credential's notes inside a metadata inventory. */
export function findCredentialNotes(rows: WithNotes[], id: string): string {
  const row = rows.find((item) => item.id === id);
  if (!row) throw new Error("credential not found or access denied");
  return row.notes ?? "";
}
