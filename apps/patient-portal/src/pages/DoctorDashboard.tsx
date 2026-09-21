import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  apiClient,
  Appointment,
  AppointmentStatusType,
  MedicalRecord,
  MedicalFile,
  PatientProfile,
} from '../api/client';
import Logo from '../components/Logo';
import Button from '../components/Button';
import Modal from '../components/Modal';
import SkeletonLoader from '../components/SkeletonLoader';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeToggle from '../components/ThemeToggle';
import DocumentIntelligenceViewer from '../components/DocumentIntelligenceViewer';

import {
  CalendarIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  FileTextIcon,
  LogOutIcon,
  AlertCircleIcon,
  SparklesIcon,
  ActivityIcon,
  DownloadIcon,
  ChevronDownIcon,
} from '../components/Icons';

const safeStr = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    return Object.values(val as Record<string, unknown>)
      .map((v) => safeStr(v))
      .filter(Boolean)
      .join(' • ');
  }
  return String(val);
};

export const DoctorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Doctor session state
  const [doctorUser, setDoctorUser] = useState<{
    userId: number;
    name: string;
    role: string;
    email?: string;
  } | null>(null);

  // Appointments state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedApptId, setSelectedApptId] = useState<number | null>(null);

  // Raw records & files accordion state for selected appointment
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<{
    patient: PatientProfile;
    records: MedicalRecord[];
    files: MedicalFile[];
  } | null>(null);
  const [isRecordsOpen, setIsRecordsOpen] = useState(false);
  const [isDigitizeModalOpen, setIsDigitizeModalOpen] = useState(false);

  // Status updating state
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const appts = await apiClient.getDoctorAppointments();
      setAppointments(appts);
      if (appts.length > 0 && selectedApptId === null) {
        setSelectedApptId(appts[0].id);
      }
    } catch {
      showToast('Could not load appointments. Please refresh.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, selectedApptId]);

  useEffect(() => {
    const stored = localStorage.getItem('health_user');
    const token = localStorage.getItem('health_token');
    if (!stored || !token) {
      navigate('/login');
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (parsed.role !== 'DOCTOR') {
        navigate('/dashboard');
        return;
      }
      setDoctorUser(parsed);
      fetchAppointments();
    } catch {
      navigate('/login');
    }
  }, [navigate, fetchAppointments]);

  // Selected appointment object
  const selectedAppt = useMemo(() => {
    return appointments.find((a) => a.id === selectedApptId) || appointments[0] || null;
  }, [appointments, selectedApptId]);

  // When selected appointment changes, load raw patient history if expanded
  const loadPatientHistory = useCallback(async (patientUniqueId: string) => {
    try {
      setHistoryLoading(true);
      const data = await apiClient.getDoctorPatientHistory(patientUniqueId);
      setHistoryData(data);
    } catch {
      showToast('Could not fetch full patient history.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [showToast]);

  const handleToggleRecords = () => {
    if (!isRecordsOpen && selectedAppt && !historyData) {
      loadPatientHistory(selectedAppt.patient_unique_id);
    }
    setIsRecordsOpen((prev) => !prev);
  };

  // Select another appointment
  const handleSelectAppointment = (appt: Appointment) => {
    setSelectedApptId(appt.id);
    setIsRecordsOpen(false);
    setHistoryData(null);
  };

  // Status transition handlers
  const handleUpdateStatus = async (apptId: number, newStatus: AppointmentStatusType) => {
    try {
      setUpdatingId(apptId);
      const updated = await apiClient.updateAppointmentStatus(apptId, newStatus);
      setAppointments((prev) => prev.map((a) => (a.id === apptId ? updated : a)));
      showToast(
        `Appointment ${newStatus.toLowerCase()} successfully!`,
        newStatus === 'CONFIRMED' ? 'success' : 'info'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status update failed';
      showToast(msg, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleLogout = () => {
    apiClient.logout();
    navigate('/login');
  };

  // Filtered appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      return true;
    });
  }, [appointments, statusFilter]);

  // Emergency Red-Flag Triage Appointments
  const emergencyAppointments = useMemo(() => {
    return appointments.filter(
      (a) => a.is_emergency || a.triage_level === 'RED_FLAG'
    );
  }, [appointments]);

  // Calculation for stats
  const stats = useMemo(() => {
    const total = appointments.length;
    const todayStr = new Date().toISOString().split('T')[0];
    const today = appointments.filter((a) => a.appointment_date?.startsWith(todayStr)).length;
    const pending = appointments.filter((a) => a.status === 'PENDING').length;
    const confirmed = appointments.filter((a) => a.status === 'CONFIRMED').length;
    return { total, today, pending, confirmed };
  }, [appointments]);

  // Parse questionnaire answers safely
  const parsedQuestionnaire = useMemo(() => {
    if (!selectedAppt || !selectedAppt.questionnaire) return null;
    try {
      return JSON.parse(selectedAppt.questionnaire);
    } catch {
      return null;
    }
  }, [selectedAppt]);

  // Smart doctor display name — avoid "Dr. Dr." double prefix
  const doctorDisplayName = useMemo(() => {
    const raw = doctorUser?.name || 'Doctor';
    return raw.toLowerCase().startsWith('dr') ? raw : `Dr. ${raw}`;
  }, [doctorUser?.name]);

  return (
    <div className="portal-app">
      {/* Toast Feedback */}
      {toast && (
        <div className={`portal-toast portal-toast--${toast.type}`} role="status">
          <div className="portal-toast__icon-wrap">
            {toast.type === 'error' && <AlertCircleIcon size={16} />}
            {toast.type === 'success' && <CheckIcon size={16} />}
            {toast.type === 'info' && <ActivityIcon size={16} />}
          </div>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header — uses same portal-topbar as patient dashboard */}
      <header className="portal-topbar">
        <div className="portal-topbar__left">
          <Logo size="sm" />
          <div className="badge badge--warning" style={{ marginLeft: 'var(--space-3)' }}>
            {t('nav.doctor_portal')}
          </div>
        </div>

        <div className="portal-topbar__right">
          <ThemeToggle />
          <LanguageSwitcher />


          <div className="portal-user-badge" style={{ cursor: 'default' }}>
            <div className="portal-avatar">
              <span>{doctorUser?.name?.charAt(0) || 'D'}</span>
            </div>
            <span className="portal-user-name">{doctorDisplayName}</span>
          </div>

          <div data-tooltip="Sign out of session" data-tooltip-pos="bottom">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              id="btn-doc-logout"
            >
              <LogOutIcon size={14} />
              <span>{t('nav.logout')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="portal-body" style={{ flexDirection: 'column' }}>
        {/* Quick KPI Statistics */}
        <div className="doc-stats-grid">
          <div className="doc-stat-card">
            <div className="doc-stat-icon">
              <CalendarIcon size={22} />
            </div>
            <div>
              <div className="doc-stat-val">{stats.total}</div>
              <div className="doc-stat-label">Total Scheduled</div>
            </div>
          </div>

          <div className="doc-stat-card">
            <div className="doc-stat-icon" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
              <ClockIcon size={22} />
            </div>
            <div>
              <div className="doc-stat-val">{stats.today}</div>
              <div className="doc-stat-label">Today's Visits</div>
            </div>
          </div>

          <div className="doc-stat-card">
            <div className="doc-stat-icon" style={{ background: 'rgba(234, 179, 8, 0.12)', color: '#eab308' }}>
              <AlertCircleIcon size={22} />
            </div>
            <div>
              <div className="doc-stat-val">{stats.pending}</div>
              <div className="doc-stat-label">Pending Confirmation</div>
            </div>
          </div>

          <div className="doc-stat-card">
            <div className="doc-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
              <CheckIcon size={22} />
            </div>
            <div>
              <div className="doc-stat-val">{stats.confirmed}</div>
              <div className="doc-stat-label">Confirmed & Ready</div>
            </div>
          </div>
        </div>

        {/* Section Header & Filters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-4)',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
              Consultation Schedule & Pre-Visit Briefings
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Review AI clinical syntheses and patient records before consultations
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {(['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`btn btn--sm ${statusFilter === st ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setStatusFilter(st)}
              >
                {st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* PRIORITY EMERGENCY TRIAGE QUEUE BANNER */}
        {emergencyAppointments.length > 0 && (
          <div className="emergency-triage-banner animate-fade-in">
            <div className="emergency-banner-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🚨</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ color: '#ef4444', fontWeight: 800, margin: 0, fontSize: '1.05rem', letterSpacing: '0.02em' }}>
                      PRIORITY EMERGENCY TRIAGE QUEUE
                    </h3>
                    <span className="badge badge--emergency badge--pill" style={{ fontSize: '10px' }}>
                      {emergencyAppointments.length} PATIENT(S) REQUIRING IMMEDIATE ATTENTION
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    AI detected acute life-threatening emergency symptoms (acute chest pain, dyspnoea, FAST stroke, respiratory distress). Routine waiting queue has been bypassed.
                  </p>
                </div>
              </div>
            </div>

            <div className="emergency-cards-grid">
              {emergencyAppointments.map((eAppt) => {
                const isSelected = selectedAppt?.id === eAppt.id;
                let redFlagsList: string[] = [];
                if (eAppt.red_flags) {
                  try {
                    const parsed = JSON.parse(eAppt.red_flags);
                    redFlagsList = Array.isArray(parsed) ? parsed : [String(parsed)];
                  } catch {
                    redFlagsList = [eAppt.red_flags];
                  }
                }
                return (
                  <div
                    key={eAppt.id}
                    className={`emergency-queue-card ${isSelected ? 'emergency-queue-card--active' : ''}`}
                    onClick={() => handleSelectAppointment(eAppt)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: '#ef4444' }}>
                        🚨 {eAppt.patient_name}
                      </span>
                      <span className="badge badge--error badge--pill" style={{ fontSize: '10px' }}>
                        {eAppt.triage_level || 'RED_FLAG'}
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                      <strong>Symptoms:</strong> {eAppt.reason || 'Acute emergency symptoms'}
                    </div>

                    {redFlagsList.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {redFlagsList.map((rf, idx) => (
                          <span key={idx} className="badge badge--error" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            ⚠ {rf}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      <span>ID: {eAppt.patient_unique_id}</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                        {isSelected ? '● Active in Console' : 'Open Triage Console →'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Appointments Workspace Split View */}
        {loading ? (
          <SkeletonLoader variant="appointments" count={3} />
        ) : filteredAppointments.length === 0 ? (
          <div className="empty-state">
            <CalendarIcon size={44} className="empty-state__icon" />
            <h3 className="empty-state__title">No appointments found</h3>
            <p className="empty-state__desc">
              {statusFilter === 'ALL'
                ? 'You have no scheduled consultations at this time.'
                : `No consultations with status '${statusFilter}'.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 'var(--space-6)' }}>
            {/* Left Column: Appointments List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {filteredAppointments.map((appt) => {
                const isSelected = selectedAppt?.id === appt.id;
                const isEmergency = Boolean(appt.is_emergency || appt.triage_level === 'RED_FLAG');
                const d = new Date(appt.appointment_date);
                const formattedDate = d.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                const formattedTime = d.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                let cardRedFlags: string[] = [];
                if (isEmergency && appt.red_flags) {
                  try {
                    const parsed = JSON.parse(appt.red_flags);
                    cardRedFlags = Array.isArray(parsed) ? parsed : [String(parsed)];
                  } catch {
                    cardRedFlags = [appt.red_flags];
                  }
                }

                return (
                  <div
                    key={appt.id}
                    className={`doc-appt-card ${isSelected ? 'doc-appt-card--selected' : ''} ${isEmergency ? 'doc-appt-card--emergency' : ''}`}
                    onClick={() => handleSelectAppointment(appt)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="doc-appt-header">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isEmergency && <span title="Red-flag emergency">🚨</span>}
                          <span>{appt.patient_name}</span>
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          ID: <span className="font-mono text-accent">{appt.patient_unique_id}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span
                          className={`badge ${
                            appt.status === 'CONFIRMED'
                              ? 'badge--success'
                              : appt.status === 'PENDING'
                              ? 'badge--warning'
                              : appt.status === 'COMPLETED'
                              ? 'badge--info'
                              : 'badge--error'
                          }`}
                        >
                          {appt.status}
                        </span>
                        {isEmergency && (
                          <span className="badge badge--emergency badge--pill" style={{ fontSize: '9px', padding: '1px 6px' }}>
                            🚨 RED FLAG
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                      <span>📅 {formattedDate}</span>
                      <span>⏰ {formattedTime} ({appt.duration_minutes}m)</span>
                    </div>

                    {isEmergency && cardRedFlags.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                        {cardRedFlags.slice(0, 2).map((rf, idx) => (
                          <span key={idx} className="badge badge--error" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            ⚠ {rf}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span className={`badge ${appt.department === 'AYUSH' ? 'badge--ayush' : 'badge--info'} badge--pill`}>
                        {appt.department === 'AYUSH' ? '🌿 AYUSH' : (appt.department || 'General')}
                      </span>
                      {appt.ai_summary && (
                        <span className={`ai-badge ${appt.department === 'AYUSH' ? 'ai-badge--ayush' : ''} ai-badge--pill`}>
                          <SparklesIcon size={12} /> {appt.department === 'AYUSH' ? 'AYUSH Briefing' : 'AI Briefing'}
                        </span>
                      )}
                      {appt.abdm_consent_granted && (
                        <span className="badge badge--abdm badge--pill" style={{ fontSize: '10px' }}>
                          🇮🇳 ABHA
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Selected Appointment Detail View */}
            {selectedAppt && (
              <div className="glass-card" style={{ padding: 'var(--space-6)', height: 'fit-content' }}>
                {/* Patient & Booking Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--color-border)',
                    paddingBottom: 'var(--space-4)',
                    marginBottom: 'var(--space-5)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
                        {selectedAppt.patient_name}
                      </h2>
                      <span className={`badge ${selectedAppt.department === 'AYUSH' ? 'badge--ayush' : 'badge--info'}`}>
                        {selectedAppt.department === 'AYUSH' ? '🌿 AYUSH' : (selectedAppt.department || 'General')}
                      </span>
                      <span
                        className={`badge ${
                          selectedAppt.status === 'CONFIRMED'
                            ? 'badge--success'
                            : selectedAppt.status === 'PENDING'
                            ? 'badge--warning'
                            : selectedAppt.status === 'COMPLETED'
                            ? 'badge--info'
                            : 'badge--error'
                        }`}
                      >
                        {selectedAppt.status}
                      </span>
                      {selectedAppt.department === 'AYUSH' && (
                        <span className="badge badge--ayush badge--pill" style={{ fontSize: 'var(--font-size-xs)' }}>
                          🌿 Ayurvedic Clinical Triage
                        </span>
                      )}
                      {historyData?.patient?.abha_number && (
                        <span className="badge badge--abdm-success badge--pill" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <span>🇮🇳</span> ABHA: <strong className="font-mono">{historyData.patient.abha_number}</strong>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>Patient ID: <span className="font-mono text-accent">{selectedAppt.patient_unique_id}</span></span>
                      {historyData?.patient?.abha_address && (
                        <span className="badge badge--abdm badge--pill" style={{ fontSize: '11px' }}>
                          PHR: {historyData.patient.abha_address}
                        </span>
                      )}
                      <span>• Scheduled for {new Date(selectedAppt.appointment_date).toLocaleString()}</span>
                    </div>
                    {selectedAppt.abdm_consent_granted && (
                      <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: 'rgba(255, 153, 51, 0.1)', color: '#d97706', border: '1px solid rgba(255, 153, 51, 0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                        <span>🇮🇳</span> Patient authorized ABDM FHIR R4 OPConsultRecord filing to personal health locker.
                      </div>
                    )}
                  </div>

                  {/* Status Action Buttons */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {selectedAppt.status === 'PENDING' && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={updatingId === selectedAppt.id}
                        onClick={() => handleUpdateStatus(selectedAppt.id, 'CONFIRMED')}
                        id="btn-confirm-appt"
                      >
                        <CheckIcon size={16} />
                        <span>Confirm Appointment</span>
                      </Button>
                    )}

                    {selectedAppt.status === 'CONFIRMED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={updatingId === selectedAppt.id}
                        onClick={() => handleUpdateStatus(selectedAppt.id, 'COMPLETED')}
                        id="btn-complete-appt"
                      >
                        <CheckIcon size={16} />
                        <span>Complete Visit</span>
                      </Button>
                    )}

                    {selectedAppt.status !== 'CANCELLED' && selectedAppt.status !== 'COMPLETED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={updatingId === selectedAppt.id}
                        onClick={() => handleUpdateStatus(selectedAppt.id, 'CANCELLED')}
                        id="btn-cancel-appt"
                      >
                        <XIcon size={16} />
                        <span>Cancel</span>
                      </Button>
                    )}
                  </div>

                </div>

                {/* EMERGENCY TRIAGE CALLOUT BOX FOR SELECTED APPOINTMENT */}
                {Boolean(selectedAppt.is_emergency || selectedAppt.triage_level === 'RED_FLAG') && (
                  <div className="emergency-callout-box animate-fade-in">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '24px' }}>🚨</span>
                        <div>
                          <div style={{ fontWeight: 800, color: '#ef4444', fontSize: 'var(--font-size-base)', letterSpacing: '0.03em' }}>
                            PRIORITY EMERGENCY RED-FLAG DISPATCH
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                            Immediate medical attention required • High-priority triage routing active
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        {selectedAppt.status === 'PENDING' && (
                          <Button
                            variant="danger"
                            size="sm"
                            loading={updatingId === selectedAppt.id}
                            onClick={() => handleUpdateStatus(selectedAppt.id, 'CONFIRMED')}
                            id="btn-doc-accept-emergency"
                          >
                            <CheckIcon size={14} />
                            <span>Accept Emergency Triage</span>
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => showToast('On-duty nursing & emergency response team alerted to Consult Room.', 'info')}
                        >
                          <span>Dispatch Team</span>
                        </Button>
                      </div>
                    </div>

                    {/* Red flags list */}
                    {(() => {
                      let redFlagsList: string[] = [];
                      if (selectedAppt.red_flags) {
                        try {
                          const parsed = JSON.parse(selectedAppt.red_flags);
                          redFlagsList = Array.isArray(parsed) ? parsed : [String(parsed)];
                        } catch {
                          redFlagsList = [selectedAppt.red_flags];
                        }
                      }
                      return redFlagsList.length > 0 ? (
                        <div style={{ marginTop: 'var(--space-2)' }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: '#ef4444', display: 'block', marginBottom: '4px' }}>
                            IDENTIFIED RED-FLAG CLINICAL SYMPTOMS:
                          </span>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {redFlagsList.map((rf, idx) => (
                              <span key={idx} className="badge badge--error" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                ⚠ {rf}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* 1. PROMINENT AI PRE-CONSULTATION SUMMARY (Delivers core pitch) */}
                {(() => {
                  const isAyush = selectedAppt.department === 'AYUSH' || Boolean(parsedQuestionnaire?.ayush_assessment);
                  return (
                    <div className={`ai-summary-card ${isAyush ? 'ai-summary-card--ayush' : ''}`}>
                      <div className="ai-summary-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className={`ai-badge ${isAyush ? 'ai-badge--ayush' : ''}`}>
                            <SparklesIcon size={14} /> {isAyush ? '🌿 AYUSH Clinical Pre-Visit Assessment' : 'AI Clinical Pre-Visit Briefing'}
                          </span>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: isAyush ? '#a7f3d0' : 'var(--color-text-muted)' }}>
                            {isAyush ? '(Ayurvedic Constitution & Lifestyle Triage • < 180 words)' : '(10-second skim • < 150 words)'}
                          </span>
                        </div>

                        {selectedAppt.ai_summary_confirmed && (
                          <span className="badge badge--success badge--pill">
                            ✓ Confirmed by Patient
                          </span>
                        )}
                      </div>

                      {selectedAppt.ai_summary ? (
                        <>
                          <div className="ai-summary-content">
                            {selectedAppt.ai_summary}
                          </div>

                          <div className="ai-summary-meta">
                            <span className="ai-meta-tag">
                              🤖 Model: Gemini 2.5 Flash
                            </span>
                            <span className="ai-meta-tag">
                              📋 Target Specialty: {isAyush ? 'AYUSH / Ayurvedic Medicine' : (selectedAppt.department || 'General')}
                            </span>
                            <span className="ai-meta-tag">
                              {isAyush ? '🌿 Panchamahabhuta & Dosha Triage' : '⚡ Triage Ready'}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                          No AI summary recorded for this appointment.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Questionnaire Answers (Chief Complaint & Patient Inputs) */}
                {parsedQuestionnaire && (
                  <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: parsedQuestionnaire.ayush_assessment ? '#34d399' : 'var(--color-accent)' }}>
                        {parsedQuestionnaire.ayush_assessment ? '🌿 Patient AYUSH Clinical Intake Questionnaire' : 'Patient Pre-Consultation Questionnaire'}
                      </div>
                      {parsedQuestionnaire.ayush_assessment && (
                        <span className="badge badge--ayush badge--pill" style={{ fontSize: '10px' }}>
                          5-Track Holistic Intake
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Chief Complaint {parsedQuestionnaire.ayush_assessment ? '(Pradhana Vedana)' : ''}</span>
                        <span style={{ fontWeight: 600 }}>{safeStr(parsedQuestionnaire.main_problem)}</span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Symptom Duration {parsedQuestionnaire.ayush_assessment ? '(Kala)' : ''}</span>
                        <span style={{ fontWeight: 600 }}>{safeStr(parsedQuestionnaire.duration)}</span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Current Medications {parsedQuestionnaire.ayush_assessment ? '(Aushadhi)' : ''}</span>
                        <span style={{ fontWeight: 600 }}>{safeStr(parsedQuestionnaire.current_medication) || 'None reported'}</span>
                      </div>
                    </div>

                    {/* Distinct AYUSH 5-Dimension Grid */}
                    {parsedQuestionnaire.ayush_assessment && (() => {
                      const ayush = parsedQuestionnaire.ayush_assessment;
                      const prakriti = typeof ayush.prakriti === 'object' && ayush.prakriti !== null ? ayush.prakriti : {};
                      const vikriti = typeof ayush.vikriti === 'object' && ayush.vikriti !== null ? ayush.vikriti : {};
                      const agni = typeof ayush.agni === 'object' && ayush.agni !== null ? ayush.agni : {};
                      const bowel = typeof ayush.bowel_habits === 'object' && ayush.bowel_habits !== null ? ayush.bowel_habits : null;
                      const ahara = typeof ayush.ahara_vihara === 'object' && ayush.ahara_vihara !== null ? ayush.ahara_vihara : {};

                      const frame = safeStr(prakriti.body_frame || ayush.prakriti_body_frame) || 'Not specified';
                      const skin = safeStr(prakriti.skin_hair || ayush.prakriti_skin_type) || 'Not specified';
                      const weather = safeStr(prakriti.weather_sensitivity || ayush.prakriti_temperature_tolerance) || 'Not specified';
                      const temperament = safeStr(prakriti.temperament);

                      const imbalance = safeStr(vikriti.energy_mood || ayush.vikriti_primary_imbalance) || 'Not specified';
                      const symptoms = safeStr(vikriti.chief_disturbance || ayush.vikriti_symptoms) || 'None reported';

                      const agniType = safeStr(agni.appetite || ayush.agni_type) || 'Not specified';
                      const postMeal = safeStr(agni.post_meal);
                      const thirst = safeStr(agni.thirst);

                      const bowelPattern = bowel
                        ? [bowel.frequency, bowel.consistency, bowel.discomfort ? `(${bowel.discomfort})` : ''].filter(Boolean).map(safeStr).join(' • ')
                        : safeStr(ayush.bowel_habits) || 'Not specified';

                      const diet = safeStr(ahara.diet_cravings || ayush.diet_preferences) || 'Not specified';
                      const routine = ahara.meal_routine
                        ? [ahara.meal_routine, ahara.sleep_cycle, ahara.activity_stress].filter(Boolean).map(safeStr).join(' • ')
                        : safeStr(ayush.daily_routine_vihara) || 'Not specified';

                      return (
                        <div className="ayush-doctor-grid">
                          <div className="ayush-doctor-card">
                            <div className="ayush-doctor-card__title">
                              🧬 Prakriti (Baseline Constitution)
                            </div>
                            <div className="ayush-doctor-card__body">
                              <div><strong>Frame:</strong> {frame}</div>
                              <div><strong>Skin & Hair:</strong> {skin}</div>
                              <div><strong>Climate/Weather:</strong> {weather}</div>
                              {temperament && <div><strong>Temperament:</strong> {temperament}</div>}
                            </div>
                          </div>

                          <div className="ayush-doctor-card">
                            <div className="ayush-doctor-card__title">
                              ⚖️ Vikriti (Active Aggravation)
                            </div>
                            <div className="ayush-doctor-card__body">
                              <div><strong>Imbalance:</strong> {imbalance}</div>
                              <div><strong>Chief Disturbance:</strong> {symptoms}</div>
                            </div>
                          </div>

                          <div className="ayush-doctor-card">
                            <div className="ayush-doctor-card__title">
                              🔥 Agni (Digestive Fire)
                            </div>
                            <div className="ayush-doctor-card__body">
                              <div><strong>Appetite/State:</strong> {agniType}</div>
                              {postMeal && <div><strong>Post-Meal:</strong> {postMeal}</div>}
                              {thirst && <div><strong>Thirst:</strong> {thirst}</div>}
                            </div>
                          </div>

                          <div className="ayush-doctor-card">
                            <div className="ayush-doctor-card__title">
                              🌊 Koshtha & Bowels
                            </div>
                            <div className="ayush-doctor-card__body">
                              <div><strong>Pattern:</strong> {bowelPattern}</div>
                            </div>
                          </div>

                          <div className="ayush-doctor-card">
                            <div className="ayush-doctor-card__title">
                              🥗 Ahara & Vihara (Diet & Lifestyle)
                            </div>
                            <div className="ayush-doctor-card__body">
                              <div><strong>Diet/Cravings:</strong> {diet}</div>
                              <div><strong>Routine & Activity:</strong> {routine}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Standard Allopathic Specialty Follow-ups */}
                    {!parsedQuestionnaire.ayush_assessment && parsedQuestionnaire.follow_ups && Object.keys(parsedQuestionnaire.follow_ups).length > 0 && (
                      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)', marginBottom: '4px' }}>
                          Specialty Follow-ups
                        </span>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          {Object.entries(parsedQuestionnaire.follow_ups).map(([k, v]) => (
                            <span key={k} className="badge badge--info badge--pill">
                              {k.replace('_', ' ')}: {String(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. "View Full Raw Records & Uploaded Scans" Accordion */}
                <div className="records-accordion">
                  <button
                    type="button"
                    className="records-accordion__header"
                    onClick={handleToggleRecords}
                    id="btn-toggle-raw-records"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <FileTextIcon size={18} />
                      <span>Expand Full Raw Records & Uploaded Scans</span>
                    </div>
                    <ChevronDownIcon
                      size={18}
                      style={{
                        transform: isRecordsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>

                  {isRecordsOpen && (
                    <div className="records-accordion__body">
                      {historyLoading ? (
                        <SkeletonLoader variant="records" count={2} />
                      ) : historyData ? (
                        <div>
                          {/* Patient Baseline Vitals & Allergies */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-4)',
                              padding: 'var(--space-3)',
                              background: 'rgba(255, 255, 255, 0.02)',
                              borderRadius: 'var(--radius-md)',
                              marginBottom: 'var(--space-4)',
                              fontSize: 'var(--font-size-xs)',
                            }}
                          >
                            <span><strong>Age:</strong> {historyData.patient.age || '—'}</span>
                            <span><strong>Blood Group:</strong> {historyData.patient.blood_group || '—'}</span>
                            <span style={{ color: historyData.patient.allergies ? 'var(--color-error)' : 'inherit' }}>
                              <strong>Allergies:</strong> {historyData.patient.allergies || 'NKDA'}
                            </span>
                          </div>

                          {/* Records */}
                          <div style={{ marginBottom: 'var(--space-4)' }}>
                            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                              Clinical Records ({historyData.records.length})
                            </div>
                            {historyData.records.length === 0 ? (
                              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                No previous clinical notes on file for this patient.
                              </p>
                            ) : (
                              <div className="raw-records-grid">
                                {historyData.records.map((rec) => (
                                  <div key={rec.id} className="raw-record-item">
                                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                                      {rec.title}
                                    </div>
                                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0' }}>
                                      {rec.record_type} &bull; Dr. {rec.doctor_name || 'Clinician'}
                                    </div>
                                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                                      {rec.description}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Scans and Files */}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                              Uploaded Files & Diagnostic Scans ({historyData.files.length})
                            </div>
                            {historyData.files.length === 0 ? (
                              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                No imaging or lab reports uploaded by this patient.
                              </p>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-2)' }}>
                                {historyData.files.map((file) => (
                                  <div
                                    key={file.file_id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: 'var(--space-2) var(--space-3)',
                                      background: 'var(--color-bg-secondary)',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: 'var(--radius-md)',
                                    }}
                                  >
                                    <div style={{ overflow: 'hidden' }}>
                                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {file.filename}
                                      </div>
                                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                                        {file.department} &bull; {file.file_category}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        className="btn btn--secondary btn--sm"
                                        style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.3)' }}
                                        onClick={() => setIsDigitizeModalOpen(true)}
                                        data-tooltip="View extracted clinical entities and raw OCR"
                                        id={`btn-doc-ocr-${file.file_id}`}
                                      >
                                        <SparklesIcon size={12} />
                                        <span>AI Entities</span>
                                      </button>
                                      <a
                                        href={apiClient.getFileDownloadUrl(file.file_id)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn btn--secondary btn--sm"
                                        style={{ padding: '4px 8px' }}
                                        data-tooltip="View or download scan"
                                      >
                                        <DownloadIcon size={14} />
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          Click to load historical records and scans.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== MODAL: DOCUMENT INTELLIGENCE VIEWER (Module B) ==================== */}
      <Modal
        isOpen={isDigitizeModalOpen}
        onClose={() => setIsDigitizeModalOpen(false)}
        title="✨ Medical Document Digitization & Clinical Intelligence (Module B)"
      >
        {selectedAppt && historyData ? (
          <DocumentIntelligenceViewer
            patientUniqueId={selectedAppt.patient_unique_id}
            files={historyData.files}
            onFileUploaded={(newFile) => {
              setHistoryData((prev) => prev ? { ...prev, files: [newFile, ...prev.files] } : prev);
            }}
          />
        ) : (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <p>Please expand the raw records and files section to load the patient documents first.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DoctorDashboard;
