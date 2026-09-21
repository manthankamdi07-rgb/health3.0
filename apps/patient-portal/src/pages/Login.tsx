import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import InputField from '../components/InputField';
import Button from '../components/Button';
import apiClient from '../api/client';
import { AlertCircleIcon, UserIcon, ActivityIcon, MailIcon, AbhaIcon } from '../components/Icons';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeToggle from '../components/ThemeToggle';



type LoginMode = 'choice' | 'patient' | 'doctor';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('choice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ABDM / ABHA Login state (Health 4.0 Part A)
  const [patientAuthMethod, setPatientAuthMethod] = useState<'password' | 'abha'>('password');
  const [abhaIdentifier, setAbhaIdentifier] = useState('');
  const [abhaTxnId, setAbhaTxnId] = useState('');
  const [abhaOtp, setAbhaOtp] = useState('');
  const [abhaStep, setAbhaStep] = useState<'identifier' | 'otp'>('identifier');
  const [abhaMsg, setAbhaMsg] = useState('');

  const handleSendAbhaOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abhaIdentifier.trim()) {
      setError('Please enter your 14-digit ABHA Number, 12-digit Aadhaar, or Mobile');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const authMode = abhaIdentifier.replace(/\D/g, '').length === 12 ? 'AADHAAR_OTP' : 'MOBILE_OTP';
      const res = await apiClient.initAbhaAuth(authMode, abhaIdentifier.trim());
      setAbhaTxnId(res.txn_id);
      setAbhaMsg(res.message);
      setAbhaStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send ABDM OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAbhaLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abhaOtp.trim()) {
      setError('Please enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.loginWithAbha(abhaTxnId, abhaOtp.trim());
      localStorage.setItem(
        'health_user',
        JSON.stringify({
          userId: res.user_id,
          name: res.name,
          role: res.role,
          patientId: res.patient_id,
          profilePhotoUrl: res.profile_photo_url,
          email: res.email,
          abhaNumber: res.abha_number,
          abhaAddress: res.abha_address,
        })
      );
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ABHA Login failed. Check OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRole = (selectedMode: 'patient' | 'doctor') => {
    setMode(selectedMode);
    setError('');
    setEmail('');
    setPassword('');
  };

  const handleBackToChoice = () => {
    setMode('choice');
    setError('');
    setEmail('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await apiClient.login(email.trim(), password);

      if (mode === 'patient' && res.role !== 'PATIENT') {
        throw new Error('This portal is reserved for patients. Please log in through the Doctor Login.');
      }

      if (mode === 'doctor' && res.role !== 'DOCTOR') {
        throw new Error('This portal is reserved for doctors. Please log in through the Patient Login.');
      }

      // Save user session
      localStorage.setItem(
        'health_user',
        JSON.stringify({
          userId: res.user_id,
          name: res.name,
          role: res.role,
          patientId: res.patient_id,
          profilePhotoUrl: res.profile_photo_url,
          email: email.trim(),
        })
      );

      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '16px', right: '20px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <div className="auth-glow" />
      <div className="auth-glow auth-glow--secondary" />

      <div className="glass-card glass-card--auth">
        {/* Choice / Landing Screen (New Entry Point) */}
        {mode === 'choice' && (
          <div className="animate-fade-in-up">
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              <Logo subtitle="Healthcare Platform" size="lg" />
            </div>


            <div className="auth-header" style={{ textAlign: 'center' }}>
              <h1 className="auth-header__title">Welcome to Medikiosk</h1>
              <p className="auth-header__subtitle">Select your portal to continue</p>
            </div>

            <div className="role-choice-grid">
              <button
                type="button"
                className="role-choice-card"
                onClick={() => handleSelectRole('patient')}
                id="btn-select-patient-login"
              >
                <div className="role-choice-icon">
                  <UserIcon size={26} />
                </div>
                <div className="role-choice-content">
                  <div className="role-choice-title">Patient Login</div>
                  <div className="role-choice-subtitle">
                    Manage appointments, medical records & pre-visit questionnaires
                  </div>
                </div>
                <span className="role-choice-arrow" aria-hidden="true">→</span>
              </button>

              <button
                type="button"
                className="role-choice-card"
                onClick={() => handleSelectRole('doctor')}
                id="btn-select-doctor-login"
              >
                <div className="role-choice-icon role-choice-icon--doctor">
                  <ActivityIcon size={26} />
                </div>
                <div className="role-choice-content">
                  <div className="role-choice-title">Doctor Login</div>
                  <div className="role-choice-subtitle">
                    Review consultations, patients & AI pre-visit summaries
                  </div>
                </div>
                <span className="role-choice-arrow" aria-hidden="true">→</span>
              </button>
            </div>

            <div className="auth-footer" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
              Don't have a patient account? <Link to="/register">Create an account</Link>
            </div>
          </div>
        )}

        {/* Form Screens (Patient or Doctor) */}
        {mode !== 'choice' && (
          <div className="animate-fade-in-up">
            <button
              type="button"
              className="auth-back-link"
              onClick={handleBackToChoice}
              id="btn-back-to-choice"
            >
              ← Back to portal selection
            </button>

            <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              <Logo
                subtitle={mode === 'patient' ? 'Patient Portal' : 'Doctor Portal'}
                size="lg"
              />
            </div>


            <div className="auth-header">
              <h1 className="auth-header__title">
                {mode === 'patient' ? 'Patient Sign In' : 'Doctor Sign In'}
              </h1>
              <p className="auth-header__subtitle">
                {mode === 'patient'
                  ? 'Sign in to access your personal health portal'
                  : 'Sign in to manage consultations and clinical records'}
              </p>
            </div>

            {mode === 'patient' && (
              <div className="auth-segmented-tabs">
                <button
                  type="button"
                  className={`auth-segmented-tab ${patientAuthMethod === 'password' ? 'auth-segmented-tab--active' : ''}`}
                  onClick={() => { setPatientAuthMethod('password'); setError(''); }}
                  id="tab-login-password"
                >
                  <MailIcon size={16} />
                  <span>Email &amp; Password</span>
                </button>
                <button
                  type="button"
                  className={`auth-segmented-tab ${patientAuthMethod === 'abha' ? 'auth-segmented-tab--active' : ''}`}
                  onClick={() => { setPatientAuthMethod('abha'); setError(''); }}
                  id="tab-login-abha"
                >
                  <AbhaIcon size={18} />
                  <span>ABHA Login (ABDM)</span>
                </button>
              </div>
            )}

            {error && (
              <div className="alert alert--error" role="alert">
                <AlertCircleIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Standard Email/Password Form (Doctors and standard patient login) */}
            {(mode === 'doctor' || patientAuthMethod === 'password') && (
              <form onSubmit={handleSubmit} noValidate>
                <InputField
                  id="login-email"
                  label="Email Address"
                  type="email"
                  placeholder={mode === 'doctor' ? 'doctor@hospital.com' : 'you@example.com'}
                  value={email}
                  isValid={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />

                <InputField
                  id="login-password"
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  isValid={password.length >= 6}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />

                <div style={{ marginTop: 'var(--space-6)' }}>
                  <Button
                    id="btn-login-submit"
                    type="submit"
                    variant="primary"
                    fullWidth
                    size="lg"
                    loading={loading}
                  >
                    {mode === 'patient' ? 'Sign In as Patient' : 'Sign In as Doctor'}
                  </Button>
                </div>
              </form>
            )}

            {/* ABHA Direct OTP Login Form */}
            {mode === 'patient' && patientAuthMethod === 'abha' && (
              <div>
                {abhaStep === 'identifier' ? (
                  <form onSubmit={handleSendAbhaOtp} noValidate>
                    <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', color: '#fdba74' }}>
                      ⚡ <strong>Ayushman Bharat Health Account (ABDM)</strong>
                      <div style={{ marginTop: '4px', opacity: 0.9 }}>
                        Log in using your 14-digit ABHA Number, Aadhaar Number, or registered mobile. A verification OTP will be sent to authenticate.
                      </div>
                    </div>

                    <InputField
                      id="input-abha-identifier"
                      label="ABHA Number / Aadhaar / Mobile"
                      type="text"
                      placeholder="e.g. 14-1234-5678-9012 or 9876543210"
                      value={abhaIdentifier}
                      isValid={abhaIdentifier.length >= 10}
                      onChange={(e) => setAbhaIdentifier(e.target.value)}
                      required
                    />

                    <div style={{ marginTop: 'var(--space-5)' }}>
                      <Button
                        id="btn-send-abha-otp"
                        type="submit"
                        variant="primary"
                        fullWidth
                        size="lg"
                        loading={loading}
                        style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', borderColor: '#fb923c' }}
                      >
                        Send ABDM OTP 📲
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyAbhaLogin} noValidate>
                    <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', color: '#6ee7b7' }}>
                      ✓ {abhaMsg || 'OTP dispatched to registered mobile.'}
                      <div style={{ marginTop: '4px', color: '#a7f3d0' }}>
                        💡 <em>Sandbox test OTP is <strong>123456</strong></em>
                      </div>
                    </div>

                    <InputField
                      id="input-abha-otp"
                      label="6-Digit Verification OTP"
                      type="text"
                      placeholder="123456"
                      value={abhaOtp}
                      isValid={abhaOtp.length === 6}
                      onChange={(e) => setAbhaOtp(e.target.value)}
                      required
                      autoFocus
                    />

                    <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => { setAbhaStep('identifier'); setError(''); }}
                      >
                        ← Back
                      </Button>
                      <Button
                        id="btn-verify-abha-login"
                        type="submit"
                        variant="primary"
                        fullWidth
                        size="lg"
                        loading={loading}
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', borderColor: '#34d399' }}
                      >
                        Verify & Sign In 🚀
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div className="auth-footer">
              {mode === 'patient' ? (
                <>Don't have an account? <Link to="/register">Create an account</Link></>
              ) : (
                <>New doctor? Accounts require administrative verification before sign-in.</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
