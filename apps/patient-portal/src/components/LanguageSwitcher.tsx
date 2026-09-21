import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobeIcon, ChevronDownIcon } from './Icons';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { useTheme } from '../context/ThemeContext';

interface LanguageSwitcherProps {
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ compact = false }) => {
  const { i18n } = useTranslation();
  const { isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  const handleSelectLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <button
        type="button"
        id="btn-language-switcher"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.85)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(148, 163, 184, 0.4)',
          color: isDark ? 'var(--color-text-primary, #f1f5f9)' : 'var(--color-text-primary, #0f172a)',
          padding: compact ? '4px 8px' : '6px 12px',
          borderRadius: 'var(--radius-md, 8px)',
          fontSize: '0.82rem',
          fontWeight: 500,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          boxShadow: isDark ? '0 2px 8px rgba(0, 0, 0, 0.25)' : '0 2px 8px rgba(15, 23, 42, 0.08)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        title="Switch Language"
        aria-label="Switch Language"
      >
        <GlobeIcon size={compact ? 14 : 16} style={{ opacity: 0.9, color: isDark ? '#38bdf8' : '#0284c7' }} />
        <span style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>{compact ? currentLang.code.toUpperCase() : currentLang.nativeName}</span>
        <ChevronDownIcon size={12} style={{ opacity: 0.7, color: isDark ? '#94a3b8' : '#64748b', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 1000,
            minWidth: '150px',
            background: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: isDark ? '0 12px 28px rgba(0, 0, 0, 0.5)' : '0 12px 28px rgba(15, 23, 42, 0.12), 0 4px 10px rgba(15, 23, 42, 0.06)',
            backdropFilter: 'blur(12px)',
            padding: '5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.code === currentLang.code;
            return (
              <button
                key={lang.code}
                id={`lang-option-${lang.code}`}
                type="button"
                onClick={() => handleSelectLanguage(lang.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 12px',
                  background: isSelected
                    ? (isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.12)')
                    : 'transparent',
                  color: isSelected
                    ? (isDark ? '#38bdf8' : '#0284c7')
                    : (isDark ? 'var(--color-text-secondary, #cbd5e1)' : 'var(--color-text-primary, #1e293b)'),
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span>{lang.nativeName}</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7, color: isDark ? '#94a3b8' : '#64748b' }}>{lang.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;

