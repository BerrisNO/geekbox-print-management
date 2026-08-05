import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../components/ui/dialog';
import { TabBar } from '../components/ui/tabs';
import { FormField } from '../forms/FormField';

/**
 * Accessibility remediation tests (frontier A-1/A-2/A-3):
 *  - FormField wires aria-describedby to hint/error ids and aria-required.
 *  - TabBar implements roving tabindex + arrow-key navigation.
 *  - Dialog contains focus and restores it on close.
 */

/** Minimal field stub matching the AnyFieldApi surface FormField reads. */
function fakeField(opts: { name: string; touched?: boolean; errors?: string[] }) {
  return {
    name: opts.name,
    state: {
      meta: {
        errors: (opts.errors ?? []).map((message) => ({ message })),
        isTouched: opts.touched ?? false,
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: test stub of the form field API
  } as any;
}

describe('FormField aria wiring (A-1)', () => {
  it('links the hint via aria-describedby and marks aria-required', () => {
    render(
      <FormField field={fakeField({ name: 'weight' })} label="Weight" hint="grams" required>
        {(control) => <input aria-label="Weight" {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Weight');
    expect(input).toHaveAttribute('aria-required', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBe('field-weight-hint');
    expect(document.getElementById('field-weight-hint')).toHaveTextContent('grams');
  });

  it('links the error via aria-describedby and sets aria-invalid when touched with errors', () => {
    render(
      <FormField
        field={fakeField({ name: 'weight', touched: true, errors: ['Required'] })}
        label="Weight"
        hint="grams"
      >
        {(control) => <input aria-label="Weight" {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Weight');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe('field-weight-error');
    expect(document.getElementById('field-weight-error')).toHaveTextContent('Required');
  });
});

describe('TabBar roving tabindex + arrow keys (A-3)', () => {
  function Harness() {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
    return (
      <TabBar
        tabs={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
          { value: 'c', label: 'Gamma' },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }

  it('only the selected tab is tabbable (roving tabindex)', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight moves selection and focus to the next tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    alpha.focus();
    await user.keyboard('{ArrowRight}');
    const beta = screen.getByRole('tab', { name: 'Beta' });
    expect(beta).toHaveAttribute('aria-selected', 'true');
    expect(beta).toHaveFocus();
  });

  it('ArrowLeft from the first tab wraps to the last (Home/End too)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('tab', { name: 'Alpha' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveFocus();
  });
});

describe('Dialog focus trap + restore (A-2)', () => {
  it('moves focus into the dialog on open and restores it on close', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Test dialog">
            <button type="button">Inside</button>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    await user.click(opener);
    // Focus should now be inside the dialog, not on the opener.
    expect(document.activeElement).not.toBe(opener);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    // Esc closes and restores focus to the opener.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('Escape triggers onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="X">
        <button type="button">Inside</button>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
