/**
 * Tests for components/discovery/ReligionPicker.tsx
 *
 * ReligionPicker renders 5 faith options (All Faiths, Hindu, Muslim, Sikh, Christian).
 * Selecting one enables the Continue button. Clicking Continue shows a confirmation
 * modal. Clicking "Confirm Preference" calls onConfirm with the chosen religion.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ReligionPicker from './ReligionPicker';

describe('ReligionPicker', () => {
  // ── initial render ─────────────────────────────────────────────────────────

  it('renders all 5 faith option labels', () => {
    render(<ReligionPicker onConfirm={jest.fn()} />);
    expect(screen.getByText('All Faiths')).toBeInTheDocument();
    expect(screen.getByText('Hindu')).toBeInTheDocument();
    expect(screen.getByText('Muslim')).toBeInTheDocument();
    expect(screen.getByText('Sikh')).toBeInTheDocument();
    expect(screen.getByText('Christian')).toBeInTheDocument();
  });

  it('Continue button is disabled before any selection', () => {
    render(<ReligionPicker onConfirm={jest.fn()} />);
    // Button contains the text "Continue with your faith →" when nothing selected
    expect(screen.getByText(/Continue with your faith/)).toBeDisabled();
  });

  // ── selection ──────────────────────────────────────────────────────────────

  it('clicking a faith option selects it and enables Continue', () => {
    render(<ReligionPicker onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByText('Hindu').closest('button')!);
    const btn = screen.getByText(/Continue with Hindu/);
    expect(btn).not.toBeDisabled();
  });

  it('Continue button label reflects selected faith', () => {
    render(<ReligionPicker onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByText('Muslim').closest('button')!);
    expect(screen.getByText(/Continue with Muslim/)).toBeInTheDocument();
  });

  // ── confirmation modal ─────────────────────────────────────────────────────

  it('clicking Continue shows the confirmation modal', () => {
    render(<ReligionPicker onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByText('Hindu').closest('button')!);
    fireEvent.click(screen.getByText(/Continue with Hindu/));
    expect(screen.getByText('Personalise Your Sacred Journey')).toBeInTheDocument();
  });

  it('modal shows the selected faith name in the preference text', () => {
    render(<ReligionPicker onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByText('Sikh').closest('button')!);
    fireEvent.click(screen.getByText(/Continue with Sikh/));
    expect(screen.getByText(/setting your faith preference to/i)).toBeInTheDocument();
  });

  it('"Choose Again" dismisses the modal', () => {
    render(<ReligionPicker onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByText('Hindu').closest('button')!);
    fireEvent.click(screen.getByText(/Continue with Hindu/));
    fireEvent.click(screen.getByText('Choose Again'));
    expect(screen.queryByText('Personalise Your Sacred Journey')).not.toBeInTheDocument();
  });

  it('"Confirm Preference" calls onConfirm with selected religion', () => {
    const onConfirm = jest.fn();
    render(<ReligionPicker onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Christian').closest('button')!);
    fireEvent.click(screen.getByText(/Continue with Christian/));
    fireEvent.click(screen.getByText('Confirm Preference'));
    expect(onConfirm).toHaveBeenCalledWith('christian');
  });

  it('"Confirm Preference" calls onConfirm for all-faiths selection', () => {
    const onConfirm = jest.fn();
    render(<ReligionPicker onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('All Faiths').closest('button')!);
    fireEvent.click(screen.getByText(/Continue with All Faiths/));
    fireEvent.click(screen.getByText('Confirm Preference'));
    expect(onConfirm).toHaveBeenCalledWith('all');
  });
});
