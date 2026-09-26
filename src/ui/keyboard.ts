import type { Controller } from '../player/controller';
export function handleShortcut(event: KeyboardEvent, controller: Controller | undefined) {
  if (!controller || event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
  const target = event.target;
  if (target instanceof Element && target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return;
  if (event.repeat) {
    // Suppress native Enter repetition too, without stealing arrow repeats from inputs.
    if (target instanceof Element && target.closest('button') && (event.key === ' ' || event.key === 'Enter')) event.preventDefault();
    return;
  }
  if (target instanceof Element && target.closest('button') && (event.key === ' ' || event.key === 'Enter')) return;
  const key = event.key.toLowerCase();
  if (![' ', 't', 'r', 'u'].includes(key)) return;
  event.preventDefault();
  if (key === ' ') void controller.toggle('keyboard');
  if (key === 't') controller.toggleTranslation('keyboard');
  if (key === 'r') void controller.replay('keyboard');
  if (key === 'u') controller.mark('keyboard');
}
