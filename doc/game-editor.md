# Game editor

## Scene text formatting

Scene text and text hints support a small inline Markdown subset in both the player and editor previews: backticks for code (`` `SELECT *` ``), `*italic*`, and `**bold**`. Code is highlighted as SQL using the current light or dark theme. Emphasis can be nested, including `***both***` and `` **Use `SELECT` here** ``. Existing line breaks, including blank lines, are preserved.

An opening emphasis marker must touch its content: `* text` stays literal, as does `SELECT * FROM users`. Escape a literal asterisk, backtick, or backslash with a backslash. Code keeps its contents literal; matching double backticks can enclose code containing single backticks. Unmatched markers and asterisk runs longer than three stay literal. Headings, lists, links, and HTML are not interpreted.

## Drafts and file state

The game editor separates document identity, local draft persistence, file-save state, and undo history. A stable document ID identifies one draft, its monotonically increasing revision orders committed in-memory changes and protects IndexedDB updates, a SHA-256 fingerprint marks the current game as clean after it is opened from or successfully written to a file, and the scene undo and redo stacks contain only reversible scene commands. None of these values substitutes for another.

IndexedDB is shared by browser tabs on the same origin. Before attaching autosave to a document, a browser context therefore acquires an exclusive Web Lock based on the stable source key when one exists and otherwise on the document ID, and retains that lock while the document is writable. A second browser context does not restore the locked draft as another writable editor and reports that the game is open elsewhere. Different document identities use different locks, so multiple in-app document tabs and browser tabs editing different games remain independent. Browsers without Web Locks use an in-process fallback; the transactional revision check remains the durable protection against cross-context overwrites.

Every draft replacement, incremental update, and deletion supplies the revision that the writer expects to find. The IndexedDB implementation reads and validates that revision in the same read-write transaction that updates the document, scenes, and database source. A mismatch aborts the transaction and reports a persistence failure instead of applying last-writer-wins behavior. Closing a document explicitly waits for queued draft writes, conditionally deletes the matching revision, and then releases its document lock. Closing or crashing the browser context releases browser-managed locks but leaves drafts available for recovery.

The saved-game fingerprint covers the canonical XML produced by `gameToXML`; it deliberately excludes the filename, SQL experiments, scene-test results, and other editor runtime state. An ordinarily opened game starts with its current fingerprint as the clean checkpoint, while a newly created game starts dirty. Persisted draft records must explicitly contain either a valid fingerprint or `null`; incompatible records are skipped rather than migrated. The first committed game-content change clears the checkpoint and makes the document sticky-dirty. Further edits, undo, and redo do not calculate fingerprints or make the document clean. A successful save or export calculates a fingerprint for the exact snapshot that was written and makes the document clean only if that snapshot is still current. Closing uses the same sticky state: a dirty document shows the save or export confirmation even when undo has restored the saved content.

The document tab shows a filled dot while the document is sticky-dirty. The dot appears on the first committed game-content change, remains through undo and redo, and disappears after a successful save or export. Changing only the filename does not make the document dirty.

## Toast events

Notifications appear in the bottom-right corner and do not expire automatically. Use the close button to dismiss the current notification. Filenames are formatted as code; notifications naming multiple games show them in a bulleted list.

- Success: A game is saved to a newly selected file.
- Success: A game is saved through an existing file handle.
- Danger: A save or export exceeds the file-size limit.
- Danger: A save or export fails for another reason.
- Danger: Creating, updating, or deleting a local draft fails, including a revision conflict.
- Danger: A newly opened document is already locked by another browser tab; the toast names the document.
- Danger: One or more restored drafts are already locked by another browser tab at startup; the toast lists the documents.
