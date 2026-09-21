import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'default' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Styled button component with loading spinner, variants, and sizes.
 */
const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  loading = false,
  disabled = false,
  id,
  className = '',
  style,
}) => {
  const classNames = [
    'btn',
    `btn--${variant}`,
    size === 'lg' ? 'btn--lg' : size === 'sm' ? 'btn--sm' : '',
    fullWidth ? 'btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      id={id}
      type={type}
      className={classNames}
      style={style}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading && <span className="btn__spinner" />}
      {children}
    </button>
  );
};

export default Button;
