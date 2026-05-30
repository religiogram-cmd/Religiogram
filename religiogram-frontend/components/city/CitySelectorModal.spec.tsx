/**
 * Tests for components/city/CitySelectorModal.tsx
 *
 * CityContext is provided via a hand-rolled wrapper so each test
 * controls the initial city state independently.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CityContext, type CityContextValue } from '@/contexts/CityContext';
import { CitySelectorModal } from './CitySelectorModal';
import { CITIES } from '@/lib/cities';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<CityContextValue> = {}): CityContextValue {
  return {
    city: null,
    isHydrated: true,
    setCity: jest.fn(),
    cities: CITIES,
    ...overrides,
  };
}

function renderModal(
  props: Partial<React.ComponentProps<typeof CitySelectorModal>> = {},
  ctxOverrides: Partial<CityContextValue> = {},
) {
  const ctx = makeCtx(ctxOverrides);
  const onClose = props.onClose ?? jest.fn();
  const onSelected = props.onSelected ?? jest.fn();

  const utils = render(
    <CityContext.Provider value={ctx}>
      <CitySelectorModal
        open={props.open ?? true}
        onClose={onClose}
        onSelected={onSelected}
        title={props.title}
        subtitle={props.subtitle}
      />
    </CityContext.Provider>,
  );
  return { ...utils, ctx, onClose, onSelected };
}

describe('CitySelectorModal', () => {
  // ── Visibility ────────────────────────────────────────────────────────────────

  it('renders nothing when open=false', () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal when open=true', () => {
    renderModal({ open: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // ── Title / subtitle ─────────────────────────────────────────────────────────

  it('shows the default title "Where are you?" when no title prop given', () => {
    renderModal();
    expect(screen.getByText('Where are you?')).toBeInTheDocument();
  });

  it('shows a custom title when provided', () => {
    renderModal({ title: 'Change your city' });
    expect(screen.getByText('Change your city')).toBeInTheDocument();
  });

  it('shows the default subtitle when no subtitle prop given', () => {
    renderModal();
    expect(screen.getByText(/show nearby temples/i)).toBeInTheDocument();
  });

  it('shows a custom subtitle when provided', () => {
    renderModal({ subtitle: 'Pick a different city below.' });
    expect(screen.getByText('Pick a different city below.')).toBeInTheDocument();
  });

  // ── City buttons ──────────────────────────────────────────────────────────────

  it('renders one button per city in CITIES', () => {
    renderModal();
    // Each city button has role="radio"
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(CITIES.length);
  });

  it('displays every city displayName', () => {
    renderModal();
    CITIES.forEach((c) => {
      expect(screen.getByText(c.displayName)).toBeInTheDocument();
    });
  });

  // ── City selection ────────────────────────────────────────────────────────────

  it('calls setCity with the city slug when a city button is clicked', () => {
    const { ctx } = renderModal();
    const delhiBtn = screen.getByText('Delhi').closest('button')!;
    fireEvent.click(delhiBtn);
    expect(ctx.setCity).toHaveBeenCalledWith('delhi');
  });

  it('calls onSelected with the City object when a city is picked', () => {
    const { onSelected } = renderModal();
    const mumbaiBtn = screen.getByText('Mumbai').closest('button')!;
    fireEvent.click(mumbaiBtn);
    const called = (onSelected as jest.Mock).mock.calls[0][0];
    expect(called.slug).toBe('mumbai');
    expect(called.displayName).toBe('Mumbai');
  });

  it('calls onClose after a city is picked', () => {
    const { onClose } = renderModal();
    const varanasiBtn = screen.getByText('Varanasi').closest('button')!;
    fireEvent.click(varanasiBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── "Keep city" button ────────────────────────────────────────────────────────

  it('does NOT show "Keep …" button when no city is currently set', () => {
    renderModal({}, { city: null });
    expect(screen.queryByText(/Keep /i)).not.toBeInTheDocument();
  });

  it('shows "Keep <displayName>" button when a city is already set', () => {
    const delhi = CITIES.find((c) => c.slug === 'delhi')!;
    renderModal({}, { city: delhi });
    expect(screen.getByText(`Keep ${delhi.displayName}`)).toBeInTheDocument();
  });

  it('"Keep" button calls onClose without changing the city', () => {
    const delhi = CITIES.find((c) => c.slug === 'delhi')!;
    const { onClose, ctx } = renderModal({}, { city: delhi });
    fireEvent.click(screen.getByText(`Keep ${delhi.displayName}`));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ctx.setCity).not.toHaveBeenCalled();
  });

  // ── Active (checked) state ────────────────────────────────────────────────────

  it('the currently-set city radio is aria-checked', () => {
    const delhi = CITIES.find((c) => c.slug === 'delhi')!;
    renderModal({}, { city: delhi });
    const delhiRadio = screen.getByText('Delhi').closest('button')!;
    expect(delhiRadio).toHaveAttribute('aria-checked', 'true');
  });

  it('other city radios are NOT aria-checked when a city is set', () => {
    const delhi = CITIES.find((c) => c.slug === 'delhi')!;
    renderModal({}, { city: delhi });
    const mumbaiRadio = screen.getByText('Mumbai').closest('button')!;
    expect(mumbaiRadio).toHaveAttribute('aria-checked', 'false');
  });
});
