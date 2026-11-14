/** Session undo stack for reversible actions (status changes): `z` pops the latest. */
export interface UndoEntry {
  label: string;
  run: () => void;
}

const stack: UndoEntry[] = [];

export function pushUndo(e: UndoEntry): void {
  stack.push(e);
  if (stack.length > 30) stack.shift();
}

export function popUndo(): UndoEntry | undefined {
  return stack.pop();
}

/** Drop an entry once it has been used from elsewhere (the toast button). */
export function removeUndo(e: UndoEntry): void {
  const i = stack.lastIndexOf(e);
  if (i >= 0) stack.splice(i, 1);
}
