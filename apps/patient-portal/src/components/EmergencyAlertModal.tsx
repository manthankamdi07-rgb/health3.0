import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircleIcon, XIcon, CheckIcon } from './Icons';
import { TriageCheckResponse } from '../api/client';

interface EmergencyAlertModalProps {
  isOpen: boolean;
  triageData: TriageCheckResponse | null;
  onConfirmTriage: () => void;
  onCancel: () => void;
}

export const EmergencyAlertModal: React.FC<EmergencyAlertModalProps> = ({
  isOpen,
  triageData,
  onConfirmTriage,
  onCancel,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !triageData) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          background: 'var(--color-bg-card, #ffffff)',
          border: '2px solid #ef4444',
          borderRadius: '16px',
          maxWidth: '560px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.35)',
          overflow: 'hidden',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header with pulsing alert */}
        <div
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            color: '#ffffff',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'pulse 1.5s infinite',
              }}
            >
              <AlertCircleIcon size={22} style={{ color: '#ffffff' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                {t('triage.emergency_detected', '🚨 RED-FLAG EMERGENCY DETECTED')}
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.9 }}>
                {t('triage.protocol_activated', 'Immediate Triage Protocol Activated')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              opacity: 0.8,
              padding: '4px',
            }}
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Primary Concern Callout */}
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '10px',
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('triage.critical_condition', 'Suspected Critical Condition')}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)', marginTop: '4px' }}>
              {triageData.primary_concern}
            </div>

            {triageData.matched_triggers && triageData.matched_triggers.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {triageData.matched_triggers.map((trigger, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#b91c1c',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    ⚠️ {trigger}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Urgent Warning Message */}
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary, #334155)', lineHeight: 1.5, margin: 0 }}>
            {triageData.patient_warning}
          </p>

          {/* Emergency Call Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              background: 'rgba(2, 132, 199, 0.06)',
              border: '1px solid rgba(2, 132, 199, 0.2)',
              borderRadius: '10px',
              padding: '14px',
              alignItems: 'center',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0284c7' }}>
                National Emergency Ambulance
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
                Dial 108 / 112
              </div>
            </div>
            <a
              href="tel:108"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#dc2626',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
              }}
            >
              📞 Call 108 Now
            </a>
          </div>

          {/* Routing explanation */}
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', background: 'var(--color-bg-secondary, #f1f5f9)', padding: '10px 12px', borderRadius: '8px' }}>
            ℹ️ <strong>Triage Bypass:</strong> {triageData.immediate_action}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'transparent',
                color: 'var(--color-text-secondary, #475569)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              id="btn-confirm-emergency-triage"
              onClick={onConfirmTriage}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
              }}
            >
              <CheckIcon size={16} />
              {t('triage.book_priority', 'Route as Priority Emergency Triage')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmergencyAlertModal;
