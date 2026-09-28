/** True when a keyboard event's target is a text input, so global
 *  shortcuts (Space for Quick Look, Ctrl+Z for undo, ...) don't fire while
 *  the user is typing into a filter box, dialog field, etc. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
