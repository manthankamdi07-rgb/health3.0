import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ParticleNetwork from '../components/ParticleNetwork';
import WireframeSphere from '../components/WireframeSphere';
import DNAStrand from '../components/DNAStrand';
import { HeartPulseIcon, ChevronDownIcon, ShieldCheckIcon, SparklesIcon, FileTextIcon } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useTheme } from '../context/ThemeContext';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [scrollY, setScrollY] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [showFeatures, setShowFeatures] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
      if (window.scrollY > 80) {
        setShowFeatures(true);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      style={{
        minHeight: '200vh',
        background: isDark
          ? 'radial-gradient(circle at 50% 20%, #0c1824 0%, #050a0f 60%, #020408 100%)'
          : 'radial-gradient(circle at 50% 15%, #f0f9ff 0%, #f8fafc 55%, #eef6fc 100%)',
        color: 'var(--color-text-primary, #0f172a)',
        position: 'relative',
        transition: 'background 0.3s ease, color 0.3s ease',
        overflowX: 'hidden',
      }}
    >
      {/* Background ambient radial glow layers */}
      <div
        style={{
          position: 'absolute',
          top: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '400px',
          background: isDark
            ? 'radial-gradient(ellipse, rgba(0, 188, 212, 0.14) 0%, transparent 70%)'
            : 'radial-gradient(ellipse, rgba(2, 132, 199, 0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(70px)',
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '40%',
          right: '5%',
          width: '450px',
          height: '450px',
          background: isDark
            ? 'radial-gradient(circle, rgba(0, 229, 196, 0.08) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(13, 148, 136, 0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(80px)',
          zIndex: 1,
        }}
      />

      {/* Canvas background layers */}
      <ParticleNetwork interactive={true} />
      <WireframeSphere scrollY={scrollY} mouseX={mousePos.x} mouseY={mousePos.y} />
      <DNAStrand orientation="vertical" animated={true} />
      <DNAStrand orientation="diagonal" animated={true} />

      {/* Navbar */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 40px',
          background: isDark
            ? 'rgba(5, 10, 18, 0.82)'
            : 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(20px)',
          borderBottom: isDark
            ? '1px solid rgba(0, 188, 212, 0.15)'
            : '1px solid rgba(148, 163, 184, 0.25)',
          boxShadow: isDark
            ? '0 4px 20px rgba(0, 0, 0, 0.4)'
            : '0 4px 20px rgba(15, 23, 42, 0.05)',
          transition: 'background-color 0.25s ease, border-color 0.25s ease',
        }}
      >
        {/* Left: Logo + Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              fontSize: '1.3rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              cursor: 'pointer',
            }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(0, 188, 212, 0.2) 0%, rgba(0, 229, 196, 0.2) 100%)',
                border: '1px solid rgba(0, 188, 212, 0.4)',
                boxShadow: '0 0 15px rgba(0, 188, 212, 0.25)',
              }}
            >
              <HeartPulseIcon size={22} style={{ color: '#00bcd4' }} />
            </div>
            <span style={{ color: 'var(--color-text-primary, #0f172a)' }}>
              Medi<span style={{ color: '#00bcd4' }}>Kiosk</span>
            </span>
          </div>
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: '9999px',
              padding: '3px 10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            HEALTH 4.0
          </span>
        </div>

        {/* Right: Controls & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Dark / Light Theme Toggle */}
          <ThemeToggle showText={true} />

          {/* Language switcher */}
          <LanguageSwitcher />

          {/* Skip Intro */}
          <button
            type="button"
            onClick={scrollToFeatures}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary, #64748b)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: 500,
              padding: '6px 10px',
              borderRadius: '6px',
              transition: 'color 0.15s ease',
            }}
          >
            Features
          </button>

          {/* Sign In Button */}
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: 'linear-gradient(135deg, #00bcd4, #00e5c4)',
              border: 'none',
              color: '#032024',
              fontSize: '0.88rem',
              fontWeight: 700,
              padding: '9px 20px',
              borderRadius: '10px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0, 188, 212, 0.3)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        style={{
          position: 'relative',
          zIndex: 10,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '120px 24px 60px',
        }}
      >
        {/* Crisp Pill badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 20px',
            background: isDark ? 'rgba(0, 188, 212, 0.1)' : 'rgba(2, 132, 199, 0.08)',
            border: isDark ? '1px solid rgba(0, 188, 212, 0.35)' : '1px solid rgba(2, 132, 199, 0.28)',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: isDark ? '#00e5ff' : '#0284c7',
            marginBottom: '28px',
            boxShadow: isDark
              ? '0 0 20px rgba(0, 188, 212, 0.2)'
              : '0 4px 14px rgba(2, 132, 199, 0.12)',
            animation: 'fadeIn 0.5s ease',
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>✦</span>
          <span>Next-Generation Medical Care & Clinical Intelligence</span>
        </div>

        {/* Main Heading — Eye-catching, High Contrast, Theme Adaptive */}
        <h1
          style={{
            fontSize: 'clamp(2.8rem, 6.5vw, 5.2rem)',
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            marginBottom: '20px',
            maxWidth: '960px',
            textAlign: 'center',
            color: 'var(--color-text-primary, #0f172a)',
          }}
        >
          <span>Medi</span>
          <span
            style={{
              color: '#00bcd4',
              textShadow: isDark
                ? '0 0 35px rgba(0, 188, 212, 0.55)'
                : '0 2px 12px rgba(0, 188, 212, 0.25)',
            }}
          >
            Kiosk
          </span>
          <span style={{ marginLeft: '12px' }}>
            Health
          </span>
        </h1>


        {/* Subtitle */}
        <p
          style={{
            fontSize: 'clamp(1.05rem, 2vw, 1.3rem)',
            color: 'var(--color-text-secondary, #475569)',
            maxWidth: '680px',
            lineHeight: 1.7,
            marginBottom: '40px',
            fontWeight: 450,
          }}
        >
          Unified digital health records, AI-powered pre-visit triage, and
          cryptographic doctor access control compliant with ABDM standards.
        </p>

        {/* Primary CTA Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginBottom: '54px',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/register')}
            style={{
              background: 'linear-gradient(135deg, #00bcd4 0%, #00e5c4 100%)',
              border: 'none',
              color: '#032024',
              fontSize: '1.05rem',
              fontWeight: 700,
              padding: '16px 36px',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: isDark
                ? '0 6px 32px rgba(0, 188, 212, 0.45)'
                : '0 8px 25px rgba(2, 132, 199, 0.3)',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Get Started Free
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: isDark ? 'rgba(10, 20, 30, 0.7)' : '#ffffff',
              border: isDark
                ? '1.5px solid rgba(0, 188, 212, 0.4)'
                : '1.5px solid rgba(2, 132, 199, 0.35)',
              color: isDark ? '#00e5ff' : '#0284c7',
              fontSize: '1.05rem',
              fontWeight: 600,
              padding: '16px 36px',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: isDark
                ? '0 4px 20px rgba(0, 0, 0, 0.3)'
                : '0 4px 16px rgba(15, 23, 42, 0.06)',
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#00bcd4';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = isDark
                ? 'rgba(0, 188, 212, 0.4)'
                : 'rgba(2, 132, 199, 0.35)';
            }}
          >
            Doctor & Patient Sign In
          </button>
        </div>

        {/* Feature Badges Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            maxWidth: '800px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.92)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              fontSize: '0.82rem',
              color: 'var(--color-text-secondary, #475569)',
              boxShadow: isDark ? '0 4px 12px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <ShieldCheckIcon size={16} style={{ color: '#10b981' }} />
            <span>ABDM &amp; ABHA Ready</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.92)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              fontSize: '0.82rem',
              color: 'var(--color-text-secondary, #475569)',
              boxShadow: isDark ? '0 4px 12px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <SparklesIcon size={16} style={{ color: '#00bcd4' }} />
            <span>AI Pre-Consult Triage</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.92)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              fontSize: '0.82rem',
              color: 'var(--color-text-secondary, #475569)',
              boxShadow: isDark ? '0 4px 12px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <FileTextIcon size={16} style={{ color: '#6366f1' }} />
            <span>Instant E-Prescriptions</span>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          onClick={scrollToFeatures}
          style={{
            marginTop: '50px',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-text-muted, #94a3b8)',
            fontSize: '0.82rem',
            cursor: 'pointer',
            transition: 'color 0.2s ease',
          }}
        >
          <span>Scroll to explore features</span>
          <ChevronDownIcon size={18} style={{ animation: 'bounce 2s infinite' }} />
        </div>
      </section>

      {/* Features Section */}
      <section
        ref={featuresRef}
        style={{
          position: 'relative',
          zIndex: 10,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px 120px',
          textAlign: 'center',
        }}
      >
        {/* Large subtle outline decorative rings */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            border: isDark
              ? '1px solid rgba(0, 188, 212, 0.1)'
              : '1px solid rgba(2, 132, 199, 0.12)',
            pointerEvents: 'none',
          }}
        />

        {/* Heading */}
        <h2
          style={{
            fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)',
            fontWeight: 800,
            color: 'var(--color-text-primary, #0f172a)',
            letterSpacing: '-0.02em',
            marginBottom: '16px',
            opacity: showFeatures ? 1 : 0.4,
            transform: showFeatures ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          Experience Next-Generation Care
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '1.1rem',
            color: 'var(--color-text-secondary, #475569)',
            maxWidth: '620px',
            lineHeight: 1.7,
            marginBottom: '54px',
            opacity: showFeatures ? 1 : 0.4,
            transform: showFeatures ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s',
          }}
        >
          Join thousands of patients and doctors collaborating securely with unified records and AI assistance.
        </p>

        {/* 3 Interactive Feature Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
            maxWidth: '1080px',
            width: '100%',
            marginBottom: '60px',
            opacity: showFeatures ? 1 : 0.4,
            transform: showFeatures ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s',
          }}
        >
          {/* Card 1 */}
          <div
            style={{
              background: isDark ? 'rgba(10, 20, 30, 0.75)' : 'rgba(255, 255, 255, 0.94)',
              border: isDark ? '1px solid rgba(0, 188, 212, 0.2)' : '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: '20px',
              padding: '32px 28px',
              textAlign: 'left',
              boxShadow: isDark
                ? '0 10px 30px rgba(0, 0, 0, 0.5)'
                : '0 8px 24px rgba(15, 23, 42, 0.06)',
              backdropFilter: 'blur(16px)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(0, 188, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00bcd4',
                marginBottom: '20px',
              }}
            >
              <ShieldCheckIcon size={26} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary, #0f172a)' }}>
              ABDM &amp; ABHA Records
            </h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary, #64748b)', lineHeight: 1.6 }}>
              Seamlessly link your Ayushman Bharat Health Account. Access verifiable prescriptions, lab reports, and diagnostics anywhere in India.
            </p>
          </div>

          {/* Card 2 */}
          <div
            style={{
              background: isDark ? 'rgba(10, 20, 30, 0.75)' : 'rgba(255, 255, 255, 0.94)',
              border: isDark ? '1px solid rgba(0, 188, 212, 0.2)' : '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: '20px',
              padding: '32px 28px',
              textAlign: 'left',
              boxShadow: isDark
                ? '0 10px 30px rgba(0, 0, 0, 0.5)'
                : '0 8px 24px rgba(15, 23, 42, 0.06)',
              backdropFilter: 'blur(16px)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
                marginBottom: '20px',
              }}
            >
              <SparklesIcon size={26} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary, #0f172a)' }}>
              AI Clinical Summaries
            </h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary, #64748b)', lineHeight: 1.6 }}>
              Get automatic multimodal symptom extraction and smart summaries before your consultation to help doctors make faster, accurate diagnoses.
            </p>
          </div>

          {/* Card 3 */}
          <div
            style={{
              background: isDark ? 'rgba(10, 20, 30, 0.75)' : 'rgba(255, 255, 255, 0.94)',
              border: isDark ? '1px solid rgba(0, 188, 212, 0.2)' : '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: '20px',
              padding: '32px 28px',
              textAlign: 'left',
              boxShadow: isDark
                ? '0 10px 30px rgba(0, 0, 0, 0.5)'
                : '0 8px 24px rgba(15, 23, 42, 0.06)',
              backdropFilter: 'blur(16px)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6366f1',
                marginBottom: '20px',
              }}
            >
              <HeartPulseIcon size={26} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary, #0f172a)' }}>
              Dual Portals &amp; Queuing
            </h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary, #64748b)', lineHeight: 1.6 }}>
              Tailored experience for patients to track appointments and records, plus a powerful clinical dashboard for doctors to manage visits and orders.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/register')}
            style={{
              background: 'linear-gradient(135deg, #00bcd4, #00e5c4)',
              border: 'none',
              color: '#032024',
              fontSize: '1rem',
              fontWeight: 700,
              padding: '16px 36px',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 25px rgba(0, 188, 212, 0.35)',
              transition: 'all 200ms ease',
            }}
          >
            Create Patient Account
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: isDark ? 'transparent' : '#ffffff',
              border: '1.5px solid rgba(0, 188, 212, 0.4)',
              color: isDark ? '#00bcd4' : '#0284c7',
              fontSize: '1rem',
              fontWeight: 600,
              padding: '16px 36px',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: isDark ? 'none' : '0 4px 14px rgba(15, 23, 42, 0.05)',
              transition: 'all 200ms ease',
            }}
          >
            Doctor Sign In
          </button>
        </div>
      </section>
    </div>
  );
};

export default Landing;
