import React from 'react';
import VoiceInputButton from './VoiceInputButton';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  isValid?: boolean;
  helperText?: string;
  required?: boolean;
  onVoiceInput?: (transcript: string) => void;
}

/**
 * Styled input field with label, real-time validation states, and helper hints.
 * Follows Medikiosk design tokens and accessibility guidelines.
 */
const InputField: React.FC<InputFieldProps> = ({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  isValid = false,
  helperText,
  required = false,
  disabled = false,
  className = '',
  onVoiceInput,
  ...rest
}) => {
  const isError = Boolean(error);
  const showValid = !isError && isValid && Boolean(value);

  return (
    <div className="form-group">
      <div className="form-label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label htmlFor={id} className="form-label">
          {label}
          {required && <span className="form-required-mark">*</span>}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {showValid && (
            <span className="form-valid-indicator" aria-label="Field is valid">
              ✓ Valid
            </span>
          )}
          {onVoiceInput && (
            <VoiceInputButton onTranscript={onVoiceInput} size={14} />
          )}
        </div>
      </div>

      <div className="form-input-wrapper">
        <input
          id={id}
          type={type}
          className={`form-input ${isError ? 'form-input--error' : ''} ${showValid ? 'form-input--valid' : ''} ${className}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-invalid={isError}
          aria-describedby={isError ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          {...rest}
        />
      </div>

      {isError && (
        <div className="form-error" id={`${id}-error`} role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      {!isError && helperText && (
        <div className="form-helper" id={`${id}-helper`}>
          {helperText}
        </div>
      )}
    </div>
  );
};

export default InputField;
