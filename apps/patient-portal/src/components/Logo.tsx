import React from 'react';
import { HeartPulseIcon } from './Icons';

interface LogoProps {
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * App logo component — fully vector, crisp, theme-aware and visible in both light & dark modes.
 */
const Logo: React.FC<LogoProps> = ({ subtitle, size = 'md', className = '' }) => {
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 26 : 22;
  const fontSize = size === 'sm' ? '1.15rem' : size === 'lg' ? '1.75rem' : '1.4rem';
  const boxSize = size === 'sm' ? 30 : size === 'lg' ? 44 : 36;

  return (
    <div
      className={`logo logo--${size} ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: size === 'sm' ? 'flex-start' : 'center',
        gap: '6px',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: size === 'sm' ? '8px' : '10px',
        }}
      >
        {/* Glowing Emblem Tile */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: `${boxSize}px`,
            height: `${boxSize}px`,
            borderRadius: size === 'sm' ? '8px' : '12px',
            background: 'linear-gradient(135deg, #00bcd4 0%, #00e5c4 100%)',
            boxShadow: '0 4px 14px rgba(0, 188, 212, 0.35)',
            color: '#032024',
            flexShrink: 0,
          }}
        >
          <HeartPulseIcon size={iconSize} />
        </div>

        {/* Brand Text */}
        <span
          style={{
            fontSize,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--color-text-primary, #0f172a)',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Medi<span style={{ color: '#00bcd4' }}>Kiosk</span>
        </span>
      </div>

      {subtitle && subtitle !== 'Healthcare Portal' && (
        <span
          style={{
            fontSize: size === 'sm' ? '0.65rem' : '0.72rem',
            fontWeight: 700,
            color: '#0284c7',
            background: 'rgba(2, 132, 199, 0.08)',
            border: '1px solid rgba(2, 132, 199, 0.25)',
            borderRadius: '9999px',
            padding: '2px 10px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
};

export default Logo;
