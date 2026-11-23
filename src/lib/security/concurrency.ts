let active = 0;

export function acquireSlot(max: number): (() => void) | null {
  if (active >= max) return null;
  active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
  };
}
