import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { SunIcon, MoonIcon } from './Icons';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
  showText?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  compact = false,
  className = '',
  showText = false,
}) => {
  const { toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      id="btn-theme-toggle"
      onClick={toggleTheme}
      className={`theme-toggle-btn ${className}`}
      title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        background: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.85)',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(148, 163, 184, 0.4)',
        color: isDark ? '#fbbf24' : '#0284c7',
        padding: compact ? '4px 8px' : '6px 12px',
        borderRadius: 'var(--radius-md, 8px)',
        fontSize: '0.82rem',
        fontWeight: 500,
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        boxShadow: isDark ? '0 2px 8px rgba(0, 0, 0, 0.25)' : '0 2px 8px rgba(15, 23, 42, 0.08)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {isDark ? (
        <SunIcon
          size={compact ? 14 : 16}
          style={{
            color: '#fbbf24',
            filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.5))',
            transition: 'transform 0.3s ease',
          }}
        />
      ) : (
        <MoonIcon
          size={compact ? 14 : 16}
          style={{
            color: '#0284c7',
            filter: 'drop-shadow(0 0 4px rgba(2, 132, 199, 0.3))',
            transition: 'transform 0.3s ease',
          }}
        />
      )}
      {showText && (
        <span style={{ color: 'var(--color-text-primary, currentColor)', fontSize: '0.82rem', fontWeight: 600 }}>
          {isDark ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  );
};

export default ThemeToggle;
