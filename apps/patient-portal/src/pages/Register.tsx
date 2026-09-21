import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Logo from '../components/Logo';
import InputField from '../components/InputField';
import Button from '../components/Button';
import apiClient from '../api/client';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeToggle from '../components/ThemeToggle';



type Step = 'details' | 'otp' | 'success';

interface FormData {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  age: string;
  blood_group: string;
  allergies: string;
}

interface FormErrors {
  [key: string]: string;
}

/**
 * Multi-step patient registration page.
 * Step 1: Enter details → Step 2: Verify OTP → Step 3: Success (shows patient ID)
 */
const Register: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [patientId, setPatientId] = useState('');
  const [userName, setUserName] = useState('');
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    age: '',
    blood_group: '',
    allergies: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const updateField = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateDetails = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = 'Invalid email address';
    if (!form.phone.trim()) newErrors.phone = 'Phone number is required';
    else if (form.phone.trim().length < 10) newErrors.phone = 'Phone number must be at least 10 digits';
    if (!form.password) newErrors.password = 'Password is required';
    else if (form.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOtp = async () => {
    if (!validateDetails()) return;

    setLoading(true);
    setError('');

    try {
      await apiClient.sendOtp(form.email);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter a 6-digit OTP code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Verify OTP
      const otpResult = await apiClient.verifyOtp(form.email, otpCode);
      if (!otpResult.verified) {
        setError(otpResult.message);
        setLoading(false);
        return;
      }

      // 2. Register patient
      const result = await apiClient.registerPatient({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        otp_code: otpCode,
        age: form.age ? parseInt(form.age, 10) : undefined,
        blood_group: form.blood_group || undefined,
        allergies: form.allergies || undefined,
      });

      // 3. Save token and show success
      apiClient.setToken(result.access_token);
      localStorage.setItem('health_user', JSON.stringify({
        userId: result.user_id,
        name: result.name,
        role: result.role,
        patientId: result.patient_id,
      }));

      setPatientId(result.patient_id);
      setUserName(result.name);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(patientId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = patientId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStepIndex = () => {
    switch (step) {
      case 'details': return 0;
      case 'otp': return 1;
      case 'success': return 2;
    }
  };

  return (
    <div className="auth-layout" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '16px', right: '20px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <div className="glass-card glass-card--auth glass-card--elevated">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <Logo size="lg" subtitle="Patient Registration" />
        </div>


        {/* Step indicator */}
        <div className="step-indicator">
          {[0, 1, 2].map((i) => (
            <React.Fragment key={i}>
              <div
                className={`step-dot ${
                  i === getStepIndex() ? 'step-dot--active' : ''
                } ${i < getStepIndex() ? 'step-dot--completed' : ''}`}
              />
              {i < 2 && (
                <div
                  className={`step-connector ${
                    i < getStepIndex() ? 'step-connector--completed' : ''
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error alert */}
        {error && (
          <div className="alert alert--error">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Step 1: Details */}
        {step === 'details' && (
          <div className="animate-fade-in-up">
            <div className="auth-header">
              <h1 className="auth-header__title">Create Your Account</h1>
              <p className="auth-header__subtitle">
                Enter your details to get started
              </p>
            </div>

            <InputField
              id="register-name"
              label="Full Name"
              placeholder="Enter your full name"
              value={form.name}
              isValid={form.name.trim().length >= 2}
              onChange={updateField('name')}
              error={errors.name}
              required
              autoComplete="name"
            />

            <InputField
              id="register-email"
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              isValid={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)}
              onChange={updateField('email')}
              error={errors.email}
              required
              autoComplete="email"
            />

            <InputField
              id="register-phone"
              label="Phone Number"
              type="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              isValid={form.phone.trim().length >= 8}
              onChange={updateField('phone')}
              error={errors.phone}
              required
              autoComplete="tel"
            />

            <div className="form-row">
              <InputField
                id="register-password"
                label="Password"
                type="password"
                placeholder="Min. 8 characters"
                value={form.password}
                isValid={form.password.length >= 8}
                onChange={updateField('password')}
                error={errors.password}
                required
                autoComplete="new-password"
              />
              <InputField
                id="register-confirm-password"
                label="Confirm Password"
                type="password"
                placeholder="Re-enter password"
                value={form.confirmPassword}
                isValid={Boolean(form.confirmPassword && form.confirmPassword === form.password)}
                onChange={updateField('confirmPassword')}
                error={errors.confirmPassword}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="form-row">
              <InputField
                id="register-age"
                label="Age"
                type="number"
                placeholder="e.g. 30"
                value={form.age}
                onChange={updateField('age')}
              />
              <InputField
                id="register-blood-group"
                label="Blood Group"
                placeholder="e.g. O+"
                value={form.blood_group}
                onChange={updateField('blood_group')}
              />
            </div>

            <InputField
              id="register-allergies"
              label="Known Allergies"
              placeholder="e.g. Penicillin, Peanuts (optional)"
              value={form.allergies}
              onChange={updateField('allergies')}
            />

            <Button
              id="btn-send-otp"
              type="button"
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              onClick={handleSendOtp}
            >
              Continue → Verify OTP
            </Button>

            <div className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          </div>
        )}

        {/* Step 2: OTP Verification */}
        {step === 'otp' && (
          <div className="animate-fade-in-up">
            <div className="auth-header">
              <h1 className="auth-header__title">Verify Your Identity</h1>
              <p className="auth-header__subtitle">
                Enter the 6-digit code sent to <strong>{form.email}</strong>
                <br />
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  (Dev mode: any 6-digit code works)
                </span>
              </p>
            </div>

            <InputField
              id="register-otp"
              label="OTP Code"
              placeholder="Enter 6-digit code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              autoComplete="one-time-code"
            />

            <Button
              id="btn-verify-register"
              type="button"
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              onClick={handleVerifyAndRegister}
            >
              Verify & Create Account
            </Button>

            <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
              <Button
                variant="secondary"
                onClick={() => { setStep('details'); setError(''); }}
              >
                ← Back to Details
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="success-card">
            <div className="success-icon">✓</div>
            <h1 className="success-card__title">Welcome, {userName}!</h1>
            <p className="success-card__message">
              Your account has been created successfully.
              Here's your permanent Patient ID — save it somewhere safe.
            </p>

            <div className="patient-id-badge">
              <div className="patient-id-badge__label">Your Patient ID</div>
              <div className="patient-id-badge__id">{patientId}</div>
              <button
                className="patient-id-badge__copy"
                onClick={handleCopyId}
                id="btn-copy-patient-id"
              >
                {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
              </button>
            </div>

            <p className="success-card__message" style={{ fontSize: 'var(--font-size-sm)' }}>
              This ID is permanent and unique to you. Share it with your doctor
              when they need to access your records.
            </p>

            <Button
              id="btn-go-dashboard"
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => navigate('/dashboard')}
            >
              Go to Dashboard →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
