/**
 * AdminModal — focus stability regression.
 *
 * Root cause this pins: AdminModal's open-transition effect moves focus
 * imperatively (into the dialog on open, back to the trigger on close). It used
 * to list `onClose` / `initialFocusRef` in its dependency array, so EVERY parent
 * re-render that handed the modal a fresh inline `onClose` — e.g. a background
 * poll calling setState on the page that renders it (UsersPage's setInterval,
 * AdminOverviewContext's poll) — tore the effect down and re-ran it. The cleanup
 * refocused the trigger and the re-run refocused the dialog, yanking focus out
 * of whatever field the admin was typing in. That is the "inputs randomly lose
 * focus while adding a student" bug, and it hit every admin form because they
 * are all built on AdminModal.
 *
 * Every admin page mounts its modals with a brand-new inline onClose on each
 * render, so that is exactly what these tests reproduce.
 */

import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import AdminModal from './AdminModal';

describe('AdminModal focus stability', () => {
  it('keeps focus in the active field when the parent re-renders with a new onClose', () => {
    // Capture the host's setState so we can simulate a background poll re-render
    // WITHOUT a DOM interaction (a click would move focus on its own and muddy
    // the assertion).
    let poll;
    function Host() {
      const [tick, setTick] = useState(0);
      poll = () => setTick((t) => t + 1);
      return (
        // A fresh inline onClose every render — identical to how UsersPage and
        // the other admin pages mount their modals.
        <AdminModal open onClose={() => {}} title="اختبار" data-tick={tick}>
          <input aria-label="field" />
        </AdminModal>
      );
    }

    jest.useFakeTimers();
    try {
      render(<Host />);
      // Flush the open-focus timeout (focus moves into the dialog on open).
      act(() => { jest.runOnlyPendingTimers(); });

      // The admin clicks into a field and starts typing.
      const field = screen.getByLabelText('field');
      act(() => { field.focus(); });
      expect(document.activeElement).toBe(field);

      // The background poll fires and re-renders the host → new onClose identity.
      act(() => { poll(); });
      act(() => { jest.runOnlyPendingTimers(); });

      // Focus must remain in the field. Before the fix it jumped to the dialog
      // container (and briefly the trigger), forcing the admin to click back in.
      expect(document.activeElement).toBe(field);
    } finally {
      jest.useRealTimers();
    }
  });

  it('still closes on Escape, using the latest onClose after a re-render', () => {
    const firstClose = jest.fn();
    const secondClose = jest.fn();

    const { rerender } = render(
      <AdminModal open onClose={firstClose} title="اختبار">
        <input aria-label="field" />
      </AdminModal>,
    );

    // A re-render swaps in a new onClose (new identity) — the ref-backed Escape
    // handler must call the CURRENT one, not a stale closure.
    rerender(
      <AdminModal open onClose={secondClose} title="اختبار">
        <input aria-label="field" />
      </AdminModal>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(firstClose).not.toHaveBeenCalled();
  });
});
