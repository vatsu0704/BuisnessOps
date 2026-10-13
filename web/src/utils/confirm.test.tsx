import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ConfirmHost from '@/components/ui/ConfirmHost';
import { confirm } from './confirm';

const ask = () =>
  confirm({ title: 'Withdraw Masala Chai?', body: 'It stops selling.', confirmLabel: 'Withdraw', cancelLabel: 'Cancel' });

describe('confirm', () => {
  it('resolves true when the person goes ahead', async () => {
    render(<ConfirmHost />);
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = ask();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    await expect(answer).resolves.toBe(true);
  });

  it('resolves false when they back out', async () => {
    render(<ConfirmHost />);
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = ask();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBe(false);
  });

  it('answers an unanswered question "no" when a second one is asked', async () => {
    render(<ConfirmHost />);
    let first: Promise<boolean> = Promise.resolve(true);
    act(() => {
      first = ask();
      void ask();
    });
    await expect(first).resolves.toBe(false);
  });
});
