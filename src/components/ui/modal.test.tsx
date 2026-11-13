import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal
        open={open}
        title="Settings"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <input aria-label="Name" />
        <button>Save</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} title="T" onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is an aria-modal dialog named by its title', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('Open'));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus in on open and returns it on close', async () => {
    render(<Harness />);
    const opener = screen.getByText('Open');
    await userEvent.click(opener);
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on Escape and calls onClose', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText('Open'));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('Open'));
    const close = screen.getByRole('button', { name: 'Close' });
    const input = screen.getByLabelText('Name');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(input).toHaveFocus();
    await userEvent.tab();
    expect(save).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it('closes from the close button', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('Open'));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the scrim is clicked but not the dialog body', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('Open'));
    await userEvent.click(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('modal-scrim'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
