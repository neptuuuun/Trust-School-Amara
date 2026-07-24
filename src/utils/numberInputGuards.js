/**
 * numberInputGuards.js
 * --------------------
 * Guards for `<input type="number">` against ACCIDENTAL value changes.
 *
 * A focused number input silently steps its value on two inputs the user never
 * intends as edits:
 *   - mouse-wheel scroll (each tick = ±1 step), and
 *   - the Up / Down arrow keys.
 *
 * For money / score fields this corrupts data with no visible cause. The real
 * bug this fixes: an admin types a price of 5000, the field stays focused, and
 * scrolling down to reach the Save button ticks it 5000 → 4999 → 4998 → 4997,
 * which is then persisted verbatim. (See ClassFormModal price field.)
 *
 * Usage — spread onto a sensitive number input:
 *   import { numberInputGuards } from '../../utils/numberInputGuards';
 *   <input type="number" {...numberInputGuards} value={...} onChange={...} />
 *
 * Implementation notes:
 * - onWheel BLURS the field. React attaches `onWheel` as a PASSIVE listener, so
 *   `e.preventDefault()` is a no-op there; dropping focus is the reliable
 *   cross-browser way to stop the spinner from stepping while still letting the
 *   page/modal scroll normally.
 * - onKeyDown swallows ArrowUp / ArrowDown — the only keys that step a number
 *   input — without touching typing, Tab, Enter, etc.
 */

const blurOnWheel = (e) => {
  // Removing focus ends the spinner's "focused" requirement, so the wheel
  // scrolls the page instead of mutating the value.
  e.currentTarget.blur();
};

const blockArrowStepping = (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
};

/** Static handlers — spread directly onto inputs that have no own onWheel/onKeyDown. */
export const numberInputGuards = {
  onWheel: blurOnWheel,
  onKeyDown: blockArrowStepping,
};

/**
 * Compose the guards with a component's existing props, preserving any
 * caller-supplied onWheel / onKeyDown. Returns a new props object.
 * Used by the shared <Input> primitive so every `type="number"` is safe.
 */
export const withNumberInputGuards = ({ onWheel, onKeyDown, ...rest } = {}) => ({
  ...rest,
  onWheel: (e) => { blurOnWheel(e); if (onWheel) onWheel(e); },
  onKeyDown: (e) => { blockArrowStepping(e); if (onKeyDown) onKeyDown(e); },
});
