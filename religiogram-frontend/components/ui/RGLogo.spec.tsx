/**
 * Tests for components/ui/RGLogo.tsx
 *
 * RGLogo renders an <img>. RGLogoWordmark wraps it with a text wordmark.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import RGLogo, { RGLogoWordmark } from './RGLogo';

describe('RGLogo', () => {
  it('renders an img with src /logo-icon.png', () => {
    render(<RGLogo />);
    const img = screen.getByRole('img', { name: 'ReligioGram' });
    expect(img).toHaveAttribute('src', '/logo-icon.png');
  });

  it('applies the size prop to width and height', () => {
    render(<RGLogo size={120} />);
    const img = screen.getByRole('img', { name: 'ReligioGram' });
    expect(img).toHaveAttribute('width', '120');
    expect(img).toHaveAttribute('height', '120');
  });

  it('defaults size to 80', () => {
    render(<RGLogo />);
    const img = screen.getByRole('img', { name: 'ReligioGram' });
    expect(img).toHaveAttribute('width', '80');
  });

  it('applies flat=true removes box shadow', () => {
    const { container } = render(<RGLogo flat />);
    const img = container.querySelector('img')!;
    expect(img.style.boxShadow).toBe('none');
  });

  it('applies className prop', () => {
    render(<RGLogo className="my-logo" />);
    const img = screen.getByRole('img', { name: 'ReligioGram' });
    expect(img).toHaveClass('my-logo');
  });
});

describe('RGLogoWordmark', () => {
  it('renders the icon and "ReligioGram" text by default', () => {
    render(<RGLogoWordmark />);
    expect(screen.getByRole('img', { name: 'ReligioGram' })).toBeInTheDocument();
    expect(screen.getByText('ReligioGram')).toBeInTheDocument();
  });

  it('renders the tagline text', () => {
    render(<RGLogoWordmark />);
    expect(screen.getByText('Connecting you to sacred spaces')).toBeInTheDocument();
  });

  it('hides name when showName=false', () => {
    render(<RGLogoWordmark showName={false} />);
    expect(screen.queryByText('ReligioGram')).not.toBeInTheDocument();
  });
});
