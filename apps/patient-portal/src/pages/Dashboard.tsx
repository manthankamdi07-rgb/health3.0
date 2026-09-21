import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';
import Button from '../components/Button';
import InputField from '../components/InputField';
import Modal from '../components/Modal';
import NotificationDrawer from '../components/NotificationDrawer';
import SkeletonLoader from '../components/SkeletonLoader';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeToggle from '../components/ThemeToggle';

import VoiceInputButton from '../components/VoiceInputButton';
import {
  CalendarIcon,
  FileTextIcon,
  UploadCloudIcon,
  ShieldCheckIcon,
  BellIcon,
  UserIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
  DownloadIcon,
  CopyIcon,
  LogOutIcon,
  PlusIcon,
  ActivityIcon,
  AlertCircleIcon,
  SparklesIcon,
  TrashIcon,
} from '../components/Icons';
import EmergencyAlertModal from '../components/EmergencyAlertModal';
import DocumentIntelligenceViewer from '../components/DocumentIntelligenceViewer';
import apiClient, {
  UserData,
  PatientProfile,
  DoctorPublic,
  Appointment,
  MedicalRecord,
  MedicalFile,
  AccessRequest,
  InAppNotification,
  TriageCheckResponse,
} from '../api/client';


type TabType = 'overview' | 'appointments' | 'records' | 'files' | 'access' | 'profile';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

const DEPARTMENTS = [
  { label: 'All Departments', value: 'ALL' },
  { label: 'Orthopedics', value: 'Orthopedics' },
  { label: 'Cardiology', value: 'Cardiology' },
  { label: 'Dermatology', value: 'Dermatology' },
  { label: 'General', value: 'General' },
];

const FILE_CATEGORIES = [
  { label: 'All Types', value: 'ALL' },
  { label: 'Lab Report', value: 'lab_report' },
  { label: 'Prescription', value: 'prescription' },
  { label: 'X-Ray / Scan', value: 'x_ray' },
  { label: 'MRI / CT', value: 'scan' },
  { label: 'Discharge Summary', value: 'discharge_summary' },
  { label: 'Other Document', value: 'other' },
];

const UPLOAD_CATEGORIES = [
  { label: 'Lab Report', value: 'lab_report' },
  { label: 'Prescription', value: 'prescription' },
  { label: 'X-Ray / Scan', value: 'x_ray' },
  { label: 'MRI / CT Scan', value: 'scan' },
  { label: 'Discharge Summary', value: 'discharge_summary' },
  { label: 'Other Document', value: 'other' },
];


export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Navigation state
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Core Data States
  const [user, setUser] = useState<UserData | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [doctors, setDoctors] = useState<DoctorPublic[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [files, setFiles] = useState<MedicalFile[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // UI States
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Filter States (Two-Axis: Department + File Category)
  const [fileDepartmentFilter, setFileDepartmentFilter] = useState<string>('ALL');
  const [fileCategoryFilter, setFileCategoryFilter] = useState<string>('ALL');
  const [previewFile, setPreviewFile] = useState<MedicalFile | null>(null);

  // Modal States
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [fileToDelete, setFileToDelete] = useState<MedicalFile | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);

  // Red-Flag Triage & Emergency Alert State (Module A)
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [triageData, setTriageData] = useState<TriageCheckResponse | null>(null);

  // Files Tab View Mode (Module B: Document Intelligence)
  const [filesTabMode, setFilesTabMode] = useState<'gallery' | 'intelligence'>('gallery');

  // Booking Form & Wizard State (Item 2)
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [bookDoctorId, setBookDoctorId] = useState<number | ''>('');
  const [bookDepartment, setBookDepartment] = useState('General');
  const [bookDate, setBookDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [bookTime, setBookTime] = useState('10:00');
  const [bookDuration, setBookDuration] = useState(30);
  const [bookReason, setBookReason] = useState('');
  const [bookDurationText, setBookDurationText] = useState('3 days');
  const [bookMedications, setBookMedications] = useState('');
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [generatedSummary, setGeneratedSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryConfirmed, setSummaryConfirmed] = useState(true);
  const [summaryMeta, setSummaryMeta] = useState<{ records: number; files: number; provider: string }>({
    records: 0,
    files: 0,
    provider: 'gemini',
  });
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState('');

  // AYUSH History Mode State (Health 4.0 Part B)
  const [ayushSubStep, setAyushSubStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [ayushAssessment, setAyushAssessment] = useState({
    prakriti: {
      body_frame: 'Medium / athletic build (Pitta)',
      skin_hair: 'Warm, sensitive / redness-prone (Pitta)',
      weather_sensitivity: 'Sensitive to heat / sun, craves coolness (Pitta)',
      temperament: 'Sharp, ambitious, focused, easily irritated (Pitta)',
    },
    vikriti: {
      chief_disturbance: '',
      duration: '1 to 2 weeks',
      energy_mood: 'Variable energy with afternoon fatigue / anxiety (Vata/Pitta)',
    },
    agni: {
      appetite: 'Tikshna Agni: Intense hunger, cannot skip meals without discomfort',
      post_meal: 'Acid reflux, heartburn, or burning sensations',
      thirst: 'High thirst, prefers cool drinks',
    },
    bowel_habits: {
      frequency: 'Once daily regular',
      consistency: 'Madhyama Koshta: Normal, well-formed, easy evacuation',
      discomfort: 'Complete relief after evacuation',
    },
    ahara_vihara: {
      diet_cravings: 'Craves spicy, pungent, warm savory foods',
      meal_routine: 'Fixed regular meal hours',
      sleep_cycle: 'Moderate 6 to 7 hours, sound sleep',
      activity_stress: 'Moderate daily activity and light walking / yoga',
    },
  });

  // ABDM / ABHA State (Health 4.0 Part A)
  const [abdmConsent, setAbdmConsent] = useState(false);
  const [isAbhaModalOpen, setIsAbhaModalOpen] = useState(false);
  const [abhaAuthStep, setAbhaAuthStep] = useState<'ID' | 'OTP'>('ID');
  const [abhaMode, setAbhaMode] = useState<'AADHAAR' | 'ABHA_NUMBER' | 'MOBILE'>('AADHAAR');
  const [abhaIdentifier, setAbhaIdentifier] = useState('9999-1234-5678');
  const [abhaTxnId, setAbhaTxnId] = useState('');
  const [abhaOtp, setAbhaOtp] = useState('123456');
  const [abhaLoading, setAbhaLoading] = useState(false);
  const [abhaError, setAbhaError] = useState('');

  // File Upload Form State
  const [uploadCategory, setUploadCategory] = useState<string>('lab_report');
  const [uploadDepartment, setUploadDepartment] = useState<string>('General');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');


  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    age: '',
    blood_group: '',
    allergies: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  // Helper to open booking wizard with smart defaults
  const handleOpenBookModal = useCallback(() => {
    setIsBookModalOpen(true);
    setBookingStep(1);
    setBookError('');
    if (!bookDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setBookDate(tomorrow.toISOString().split('T')[0]);
    }
    if (!bookDoctorId && doctors.length > 0) {
      setBookDoctorId(doctors[0].user_id);
      if (doctors[0].specialty) {
        setBookDepartment(doctors[0].specialty);
      }
    }
  }, [bookDate, bookDoctorId, doctors]);

  // Show Toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Fetch all user & platform data
  const loadDashboardData = useCallback(async (patientUniqueId: string) => {
    try {
      const [
        profileRes,
        docsRes,
        apptsRes,
        recordsRes,
        filesRes,
        accessRes,
        notifsRes,
      ] = await Promise.allSettled([
        apiClient.getProfile(),
        apiClient.getApprovedDoctors(),
        apiClient.getMyAppointments(),
        apiClient.getPatientRecords(patientUniqueId),
        apiClient.getPatientFiles(patientUniqueId),
        apiClient.getPendingAccessRequests(),
        apiClient.getNotifications(),
      ]);

      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value);
        if (profileRes.value.profile_photo_url) {
          setUser((prev) => {
            if (!prev) return prev;
            const updated = { ...prev, profilePhotoUrl: profileRes.value.profile_photo_url };
            localStorage.setItem('health_user', JSON.stringify(updated));
            return updated;
          });
        }
        setProfileForm({
          name: profileRes.value.name || '',
          phone: profileRes.value.phone || '',
          age: profileRes.value.age ? String(profileRes.value.age) : '',
          blood_group: profileRes.value.blood_group || '',
          allergies: profileRes.value.allergies || '',
        });
      }

      if (docsRes.status === 'fulfilled') {
        setDoctors(docsRes.value);
        if (docsRes.value && docsRes.value.length > 0) {
          setBookDoctorId((prev) => (prev ? prev : docsRes.value[0].user_id));
          if (docsRes.value[0].specialty) {
            setBookDepartment((prev) => (prev === 'General' ? docsRes.value[0].specialty! : prev));
          }
        }
      }

      if (apptsRes.status === 'fulfilled') {
        setAppointments(apptsRes.value);
      }

      if (recordsRes.status === 'fulfilled') {
        setRecords(recordsRes.value);
      }

      if (filesRes.status === 'fulfilled') {
        setFiles(filesRes.value);
      }

      if (accessRes.status === 'fulfilled') {
        setAccessRequests(accessRes.value);
      }

      if (notifsRes.status === 'fulfilled') {
        setNotifications(notifsRes.value.notifications);
        setUnreadCount(notifsRes.value.unread_count);
      }
    } catch {
      showToast('Could not load all dashboard components. Please refresh.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const stored = localStorage.getItem('health_user');
    const token = localStorage.getItem('health_token');
    if (!stored || !token) {
      navigate('/login');
      return;
    }
    try {
      const parsedUser = JSON.parse(stored);
      setUser(parsedUser);
      if (parsedUser.role === 'PATIENT' && parsedUser.patientId) {
        loadDashboardData(parsedUser.patientId);
      } else {
        setLoading(false);
      }
    } catch {
      navigate('/login');
    }
  }, [navigate, loadDashboardData]);

  // Handle Logout
  const handleLogout = () => {
    apiClient.logout();
    navigate('/login');
  };

  // Copy Patient ID
  const handleCopyId = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.patientId);
      setCopied(true);
      showToast('Patient ID copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // Notifications Actions
  const handleMarkNotifRead = async (id: number) => {
    try {
      await apiClient.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignored
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      showToast('All notifications marked as read', 'info');
    } catch {
      // Ignored
    }
  };

  // Step 1 -> Step 2 validation
  const handleProceedToQuestionnaire = () => {
    if (!bookDoctorId || !bookDate || !bookTime) {
      setBookError('Please choose a doctor, appointment date, and time.');
      return;
    }
    const dateTimeObj = new Date(`${bookDate}T${bookTime}`);
    if (isNaN(dateTimeObj.getTime()) || dateTimeObj <= new Date()) {
      setBookError('Appointment date and time must be in the future.');
      return;
    }
    setBookError('');
    setBookingStep(2);
  };

  // Step 2 -> Step 3: Trigger AI Pre-Consultation Summary Generation & Red-Flag Triage
  const handleGenerateAISummary = async () => {
    const isAyush = bookDepartment === 'AYUSH';
    const effectiveChiefComplaint = (isAyush
      ? (ayushAssessment.vikriti.chief_disturbance || bookReason)
      : bookReason
    ).trim();

    if (!effectiveChiefComplaint || effectiveChiefComplaint.length < 3) {
      if (isAyush) {
        setBookError('Please describe your chief disturbance or symptoms in Section 2 (Vikriti).');
        setAyushSubStep(2);
      } else {
        setBookError('Please enter your chief medical complaint (at least 3 characters).');
      }
      return;
    }

    setBookingStep(3);
    setSummaryLoading(true);
    setBookError('');

    // Pre-emptively perform red-flag triage check
    try {
      const triageRes = await apiClient.checkTriageRedFlags(
        effectiveChiefComplaint,
        bookMedications.trim() || undefined
      );
      if (triageRes && triageRes.is_emergency) {
        setTriageData(triageRes);
        setIsEmergencyModalOpen(true);
      }
    } catch {
      // Non-blocking fallback
    }

    try {
      const res = await apiClient.generatePreConsultationSummary(
        {
          main_problem: effectiveChiefComplaint,
          department: bookDepartment || 'General',
          duration: isAyush ? ayushAssessment.vikriti.duration : (bookDurationText || '3 days'),
          current_medication: bookMedications.trim() || undefined,
          follow_ups: Object.keys(followUpAnswers).length > 0 ? followUpAnswers : undefined,
          ayush_assessment: isAyush ? ayushAssessment : undefined,
        },
        bookDoctorId ? Number(bookDoctorId) : undefined
      );

      setGeneratedSummary(res.summary);
      setSummaryMeta({
        records: res.records_count,
        files: res.files_count,
        provider: res.provider,
      });
      setSummaryConfirmed(true);

      // If backend pre-consultation detected red-flags as well
      if (res.is_emergency) {
        setTriageData((prev) => prev || {
          is_emergency: true,
          triage_level: res.triage_level || 'RED_FLAG',
          primary_concern: res.triage_warning || 'Acute emergency symptoms detected',
          matched_triggers: res.matched_triggers || res.red_flags || [],
          immediate_action: res.recommended_action || 'Seek immediate emergency medical care',
          patient_warning: res.triage_warning || 'Acute life-threatening emergency symptoms flagged',
          recommended_queue: 'EMERGENCY_TRIAGE_PRIORITY',
          red_flags: res.matched_triggers || res.red_flags || [],
          rationale: res.summary,
          recommended_action: res.recommended_action || 'Seek immediate emergency medical care',
        });
        setIsEmergencyModalOpen(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI summary generation failed';
      setBookError(msg);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Final Step: Book Appointment with confirmed AI summary and questionnaire
  const handleBookAppointment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!bookDoctorId || !bookDate || !bookTime) {
      setBookError('Please choose a doctor, appointment date, and time.');
      setBookingStep(1);
      return;
    }

    setBookLoading(true);
    setBookError('');

    try {
      const dateTimeObj = new Date(`${bookDate}T${bookTime}`);
      if (isNaN(dateTimeObj.getTime()) || dateTimeObj <= new Date()) {
        setBookError('Appointment date and time must be in the future.');
        setBookingStep(1);
        setBookLoading(false);
        return;
      }

      const isAyush = bookDepartment === 'AYUSH';
      const effectiveChiefComplaint = (isAyush
        ? (ayushAssessment.vikriti.chief_disturbance || bookReason)
        : bookReason
      ).trim();
      const effectiveDuration = isAyush ? ayushAssessment.vikriti.duration : bookDurationText;

      const isEmergencyAppt = Boolean(triageData?.is_emergency);
      const isoDate = dateTimeObj.toISOString();
      const newAppt = await apiClient.bookAppointment({
        doctor_id: Number(bookDoctorId),
        appointment_date: isoDate,
        duration_minutes: Number(bookDuration),
        department: bookDepartment || 'General',
        reason: effectiveChiefComplaint || undefined,
        questionnaire: JSON.stringify({
          main_problem: effectiveChiefComplaint,
          department: bookDepartment,
          duration: effectiveDuration,
          current_medication: bookMedications.trim() || undefined,
          follow_ups: followUpAnswers,
          ayush_assessment: isAyush ? ayushAssessment : undefined,
          triage_evaluation: triageData,
        }),
        ai_summary: generatedSummary || undefined,
        ai_summary_confirmed: summaryConfirmed,
        abdm_consent_granted: abdmConsent,
        abdm_scopes: abdmConsent ? ['op_consult_record', 'diagnostic_report', 'prescription'] : undefined,
        is_emergency: isEmergencyAppt,
        triage_level: triageData?.triage_level || (isEmergencyAppt ? 'RED_FLAG' : 'ROUTINE'),
        red_flags: triageData ? JSON.stringify(triageData.matched_triggers || triageData.red_flags || []) : undefined,
      });

      setAppointments((prev) => [newAppt, ...prev]);
      setIsBookModalOpen(false);

      // Reset wizard
      setBookingStep(1);
      setAyushSubStep(1);
      setBookDoctorId('');
      setBookDepartment('General');
      setBookDate('');
      setBookTime('10:00');
      setBookReason('');
      setBookDurationText('3 days');
      setBookMedications('');
      setFollowUpAnswers({});
      setGeneratedSummary('');
      setAbdmConsent(false);
      setTriageData(null);

      if (isEmergencyAppt) {
        showToast(
          '🚨 Priority Emergency Alert dispatched! On-duty triage staff & attending doctor notified immediately.',
          'error'
        );
      } else {
        showToast(
          abdmConsent
            ? 'Appointment booked! Consultation summary queued for ABDM FHIR filing.'
            : 'Appointment booked successfully! AI briefing attached for doctor.',
          'success'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Booking failed';
      setBookError(msg);
      setBookingStep(1);
    } finally {
      setBookLoading(false);
    }
  };


  // Cancel Appointment
  const handleCancelAppointment = async (appointmentId: number) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      const updated = await apiClient.cancelAppointment(appointmentId);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? updated : a))
      );
      showToast('Appointment cancelled.', 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not cancel appointment';
      showToast(msg, 'error');
    }
  };

  // File Upload
  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !user) {
      setUploadError('Please select a file to upload.');
      return;
    }

    setUploadLoading(true);
    setUploadError('');

    try {
      const newFile = await apiClient.uploadFile(
        user.patientId,
        selectedFile,
        uploadCategory,
        uploadDepartment
      );
      setFiles((prev) => [newFile, ...prev]);
      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setUploadDepartment('General');
      setUploadCategory('lab_report');
      showToast('Medical file uploaded successfully!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'File upload failed';
      setUploadError(msg);
    } finally {
      setUploadLoading(false);
    }
  };


  // File Deletion (Task A1)
  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    try {
      await apiClient.deleteFile(fileToDelete.file_id);
      setFiles((prev) => prev.filter((f) => f.file_id !== fileToDelete.file_id));
      showToast('File deleted successfully!', 'success');
      setFileToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete file';
      showToast(msg, 'error');
    } finally {
      setIsDeletingFile(false);
    }
  };


  // Access Request Response (Approve / Deny)
  const handleRespondAccess = async (requestId: number, approve: boolean) => {
    try {
      await apiClient.respondAccessRequest(requestId, approve);
      setAccessRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast(
        approve
          ? 'Access approved! The doctor can view your records for 30 days.'
          : 'Access denied.',
        approve ? 'success' : 'info'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      showToast(msg, 'error');
    }
  };

  // Save Profile Changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const updated = await apiClient.updateProfile({
        name: profileForm.name.trim() || undefined,
        phone: profileForm.phone.trim() || undefined,
        age: profileForm.age ? parseInt(profileForm.age, 10) : null,
        blood_group: profileForm.blood_group.trim() || null,
        allergies: profileForm.allergies.trim() || null,
      });
      setProfile(updated);
      setIsEditingProfile(false);
      // Update local storage name if changed
      if (user && updated.name) {
        const nextUser = { ...user, name: updated.name };
        setUser(nextUser);
        localStorage.setItem('health_user', JSON.stringify(nextUser));
      }
      showToast('Profile updated successfully!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save profile';
      showToast(msg, 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  // Upload Profile Photo
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file (JPG, PNG, WebP).', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Photo size must be under 5MB.', 'error');
      return;
    }

    setPhotoUploading(true);
    try {
      const res = await apiClient.uploadProfilePhoto(file);
      setProfile((prev) => (prev ? { ...prev, profile_photo_url: res.profile_photo_url } : prev));
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, profilePhotoUrl: res.profile_photo_url };
        localStorage.setItem('health_user', JSON.stringify(updated));
        return updated;
      });
      showToast('Profile photo updated successfully!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload photo';
      showToast(msg, 'error');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  // ABDM / ABHA Linking Handlers (Health 4.0 Part A)
  const handleInitAbhaLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setAbhaLoading(true);
    setAbhaError('');
    try {
      const res = await apiClient.initAbhaAuth(abhaMode, abhaIdentifier.trim());
      setAbhaTxnId(res.txn_id);
      setAbhaAuthStep('OTP');
      showToast(res.message || 'OTP dispatched to registered mobile.', 'info');
    } catch (err: unknown) {
      setAbhaError(err instanceof Error ? err.message : 'Failed to request OTP');
    } finally {
      setAbhaLoading(false);
    }
  };

  const handleVerifyAbhaLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setAbhaLoading(true);
    setAbhaError('');
    try {
      const res = await apiClient.verifyAbhaAuth(abhaTxnId, abhaOtp.trim());
      // Refresh profile to reflect linked ABHA
      const updatedProfile = await apiClient.getProfile();
      setProfile(updatedProfile);
      setIsAbhaModalOpen(false);
      setAbhaAuthStep('ID');
      setAbhaOtp('123456');
      showToast(`ABHA ${res.abha_number || res.abha_address} linked successfully!`, 'success');
    } catch (err: unknown) {
      setAbhaError(err instanceof Error ? err.message : 'OTP verification failed');
    } finally {
      setAbhaLoading(false);
    }
  };

  const handleUnlinkAbha = async () => {
    if (!window.confirm('Are you sure you want to unlink your ABHA identity from Health 4.0?')) {
      return;
    }
    try {
      await apiClient.unlinkAbha();
      const updatedProfile = await apiClient.getProfile();
      setProfile(updatedProfile);
      showToast('ABHA account unlinked.', 'info');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to unlink ABHA', 'error');
    }
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // File helpers & two-axis computation
  const isImageFile = (file: MedicalFile) => {
    const ct = file.content_type?.toLowerCase() || '';
    if (ct.startsWith('image/')) return true;
    const name = file.filename.toLowerCase();
    return (
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.webp') ||
      name.endsWith('.gif')
    );
  };

  const normalizeCategory = (cat: string) => {
    const c = (cat || '').toLowerCase().replace(/_/g, ' ');
    if (c === 'lab report' || c === 'lab_report') return 'Lab Report';
    if (c === 'prescription') return 'Prescription';
    if (c === 'x ray' || c === 'x_ray' || c === 'scan xray') return 'X-Ray / Scan';
    if (c === 'scan' || c === 'mri') return 'MRI / CT';
    if (c === 'discharge summary' || c === 'discharge_summary') return 'Discharge Summary';
    return 'Other Document';
  };

  const normalizeDept = (dept?: string) => {
    if (!dept) return 'General';
    const d = dept.trim();
    if (/^ortho/i.test(d)) return 'Orthopedics';
    if (/^cardio/i.test(d)) return 'Cardiology';
    if (/^derm/i.test(d)) return 'Dermatology';
    if (/^gen/i.test(d)) return 'General';
    return d;
  };

  // Filtered files according to the two axes
  const displayedFiles = useMemo(() => {
    return files
      .filter((f) => {
        // Primary axis: Department
        if (fileDepartmentFilter !== 'ALL') {
          const fDept = normalizeDept(f.department);
          if (fDept.toLowerCase() !== fileDepartmentFilter.toLowerCase()) {
            return false;
          }
        }
        // Secondary axis: File Category
        if (fileCategoryFilter !== 'ALL') {
          const fc = (f.file_category || '').toLowerCase();
          const tc = fileCategoryFilter.toLowerCase();
          if (tc === 'x_ray') {
            if (fc !== 'x_ray' && fc !== 'scan_xray') return false;
          } else if (tc === 'scan') {
            if (fc !== 'scan' && fc !== 'mri') return false;
          } else if (tc === 'discharge_summary') {
            if (fc !== 'discharge_summary') return false;
          } else if (fc !== tc) {
            return false;
          }
        }
        return true;
      })
      // Strictly sorted by date, most recent first
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [files, fileDepartmentFilter, fileCategoryFilter]);

  // Grouped files by department (when viewing All Departments)
  const groupedFilesByDept = useMemo(() => {
    const groups: { [dept: string]: MedicalFile[] } = {};
    for (const f of displayedFiles) {
      const dept = normalizeDept(f.department);
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(f);
    }
    return groups;
  }, [displayedFiles]);

  // Render individual file card with image preview or doc icon
  const renderFileCard = (file: MedicalFile) => {
    const isImage = isImageFile(file);
    const downloadUrl = apiClient.getFileDownloadUrl(file.file_id);
    return (
      <div key={file.file_id} className="file-card">
        <div
          className={`file-card__preview ${isImage ? 'file-card__preview--image' : ''}`}
          onClick={() => {
            if (isImage) setPreviewFile(file);
          }}
          role={isImage ? 'button' : undefined}
          title={isImage ? 'Click to preview scan' : undefined}
        >
          {isImage ? (
            <>
              <img
                src={downloadUrl}
                alt={file.filename}
                className="file-card__thumb"
                loading="lazy"
              />
              <div className="file-card__zoom-badge">
                <span>Preview</span>
              </div>
            </>
          ) : (
            <div className="file-card__doc-icon">
              <FileTextIcon size={30} />
              <span className="file-card__ext">
                {file.filename.split('.').pop()?.toUpperCase() || 'DOC'}
              </span>
            </div>
          )}
        </div>

        <div className="file-card__details">
          <span className="file-card__name" title={file.filename}>
            {file.filename}
          </span>
          <div className="file-card__tags">
            <span className="badge badge--dept">{normalizeDept(file.department)}</span>
            <span className="badge badge--small">{normalizeCategory(file.file_category)}</span>
          </div>
          <div className="file-card__meta">
            <span className="file-card__date">
              <ClockIcon size={12} />
              {formatDate(file.created_at)}
            </span>
            <span className="file-card__size">{formatFileSize(file.size_bytes)}</span>
          </div>
        </div>

        <div className="file-card__actions">
          {file.ocr_status === 'COMPLETED' && (
            <span
              className="badge badge--success badge--pill"
              style={{ fontSize: '10px', padding: '2px 6px' }}
              title="Digitized by AI OCR"
            >
              ✨ Digitized
            </span>
          )}
          <button
            type="button"
            className="file-card__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              setFilesTabMode('intelligence');
            }}
            title="AI Digitize & Extract Entities"
            data-tooltip="Digitize & Extract Entities"
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            id={`btn-ai-digitize-${file.file_id}`}
          >
            <SparklesIcon size={13} />
            <span>AI OCR</span>
          </button>
          {isImage && (
            <button
              type="button"
              className="file-card__action-btn"
              onClick={() => setPreviewFile(file)}
              title="Preview Image"
              data-tooltip="Preview scan"
              id={`btn-preview-${file.file_id}`}
            >
              Preview
            </button>
          )}
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="file-card__download"
            download={file.filename}
            title="Download file"
            data-tooltip="Download document"
            id={`btn-download-${file.file_id}`}
          >
            <DownloadIcon size={16} />
          </a>
          <button
            type="button"
            className="file-card__action-btn file-card__action-btn--delete"
            onClick={(e) => {
              e.stopPropagation();
              setFileToDelete(file);
            }}
            title="Delete file"
            data-tooltip="Delete file"
            id={`btn-delete-${file.file_id}`}
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '6px 8px',
              borderRadius: 'var(--radius-md)',
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
              marginLeft: 'var(--space-2)',
            }}
          >
            <TrashIcon size={15} />
          </button>
        </div>
      </div>
    );
  };


  // Status badge styling helper
  const getStatusBadge = (status: string) => {
    const label = t(`appointments.status_${status.toLowerCase()}`, status);
    switch (status) {
      case 'CONFIRMED':
      case 'APPROVED':
        return <span className="badge badge--success">{label}</span>;
      case 'PENDING':
        return <span className="badge badge--warning">{label}</span>;
      case 'CANCELLED':
      case 'DENIED':
        return <span className="badge badge--error">{label}</span>;
      case 'COMPLETED':
        return <span className="badge badge--info">{label}</span>;
      default:
        return <span className="badge">{label}</span>;
    }
  };

  if (!user || loading) {
    return (
      <div className="portal-app">
        <header className="portal-topbar">
          <div className="portal-topbar__left">
            <Logo size="sm" />
          </div>
        </header>
        <div className="portal-body">
          <nav className="portal-nav-tabs">
            <div className="skeleton-pill" style={{ width: '100%', height: '42px', marginBottom: '8px' }} />
            <div className="skeleton-pill" style={{ width: '100%', height: '42px', marginBottom: '8px' }} />
            <div className="skeleton-pill" style={{ width: '100%', height: '42px', marginBottom: '8px' }} />
            <div className="skeleton-pill" style={{ width: '100%', height: '42px' }} />
          </nav>
          <main className="portal-content">
            <div className="skeleton-line skeleton-line--title" style={{ width: '220px', marginBottom: '10px' }} />
            <div className="skeleton-line skeleton-line--sub" style={{ width: '360px', marginBottom: '28px' }} />
            <SkeletonLoader variant="stats" />
            <div style={{ marginTop: '24px' }}>
              <SkeletonLoader variant="appointments" count={2} />
            </div>
          </main>
        </div>
      </div>
    );
  }

  const upcomingAppts = appointments.filter(
    (a) => a.status === 'CONFIRMED' || a.status === 'PENDING'
  );

  return (
    <div className="portal-app">
      {/* Toast Notification */}
      {toast && (
        <div className={`portal-toast portal-toast--${toast.type}`} role="status">
          <div className="portal-toast__icon-wrap">
            {toast.type === 'success' && <CheckIcon size={16} />}
            {toast.type === 'error' && <AlertCircleIcon size={16} />}
            {toast.type === 'info' && <ActivityIcon size={16} />}
          </div>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Navigation Topbar */}
      <header className="portal-topbar">
        <div className="portal-topbar__left">
          <Logo size="sm" />
          {user.patientId ? (
            <div
              className="portal-patient-pill"
              onClick={handleCopyId}
              data-tooltip="Click to copy Patient ID"
              data-tooltip-pos="bottom"
            >
              <span className="portal-patient-pill__label">ID:</span>
              <span className="portal-patient-pill__id">{user.patientId}</span>
              <CopyIcon size={14} className="portal-patient-pill__icon" />
              {copied && <span className="portal-patient-pill__copied">{t('common.copied', 'Copied!')}</span>}
            </div>
          ) : (
            user.role === 'DOCTOR' && (
              <div className="badge badge--info" style={{ marginLeft: 'var(--space-3)' }}>
                {t('auth.role_doctor', 'Doctor')}
              </div>
            )
          )}
        </div>

        <div className="portal-topbar__right">
          <ThemeToggle />
          <LanguageSwitcher />


          <button
            className="portal-icon-btn"
            onClick={() => setIsNotifOpen(true)}
            id="btn-open-notifications"
            aria-label="View notifications"
            data-tooltip={t('notifications.title', 'Notifications')}
            data-tooltip-pos="bottom"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && <span className="portal-notif-indicator">{unreadCount}</span>}
          </button>

          <button
            className="portal-user-badge"
            onClick={() => setActiveTab('profile')}
            id="btn-nav-profile"
            data-tooltip={t('nav.view_profile', 'View Patient Profile')}
            data-tooltip-pos="bottom"
          >
            <div className="portal-avatar">
              {profile?.profile_photo_url || user.profilePhotoUrl ? (
                <img
                  src={profile?.profile_photo_url || user.profilePhotoUrl || ''}
                  alt={user.name}
                  className="portal-avatar__img"
                />
              ) : (
                <UserIcon size={16} />
              )}
            </div>
            <span className="portal-user-name">{user.name}</span>
          </button>

          <div data-tooltip={t('nav.sign_out_session', 'Sign out of session')} data-tooltip-pos="bottom">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              id="btn-portal-logout"
            >
              <LogOutIcon size={14} />
              <span>{t('nav.logout')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar / Tabs */}
      <div className="portal-body">
        {/* Navigation Tabs Bar */}
        <nav className="portal-nav-tabs">
          <button
            className={`portal-tab ${activeTab === 'overview' ? 'portal-tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
            id="tab-overview"
          >
            <ActivityIcon size={18} />
            <span>{t('nav.overview')}</span>
          </button>

          <button
            className={`portal-tab ${activeTab === 'appointments' ? 'portal-tab--active' : ''}`}
            onClick={() => setActiveTab('appointments')}
            id="tab-appointments"
          >
            <CalendarIcon size={18} />
            <span>{t('nav.appointments')}</span>
            {upcomingAppts.length > 0 && (
              <span className="tab-pill">{upcomingAppts.length}</span>
            )}
          </button>

          <button
            className={`portal-tab ${activeTab === 'records' ? 'portal-tab--active' : ''}`}
            onClick={() => setActiveTab('records')}
            id="tab-records"
          >
            <FileTextIcon size={18} />
            <span>{t('nav.records')}</span>
            {records.length > 0 && <span className="tab-pill">{records.length}</span>}
          </button>

          <button
            className={`portal-tab ${activeTab === 'files' ? 'portal-tab--active' : ''}`}
            onClick={() => setActiveTab('files')}
            id="tab-files"
          >
            <UploadCloudIcon size={18} />
            <span>{t('nav.files')}</span>
            {files.length > 0 && <span className="tab-pill">{files.length}</span>}
          </button>

          <button
            className={`portal-tab ${activeTab === 'access' ? 'portal-tab--active' : ''}`}
            onClick={() => setActiveTab('access')}
            id="tab-access"
          >
            <ShieldCheckIcon size={18} />
            <span>{t('nav.access')}</span>
            {accessRequests.length > 0 && (
              <span className="tab-pill tab-pill--urgent">{accessRequests.length}</span>
            )}
          </button>

          <button
            className={`portal-tab ${activeTab === 'profile' ? 'portal-tab--active' : ''}`}
            onClick={() => setActiveTab('profile')}
            id="tab-profile"
          >
            <UserIcon size={18} />
            <span>{t('nav.profile')}</span>
          </button>
        </nav>

        {/* Content Area */}
        <main className="portal-content">
          {/* ==================== TAB: OVERVIEW ==================== */}
          {activeTab === 'overview' && (
            <div className="overview-view animate-fade-in-up">
              <div className="overview-hero">
                <div>
                  <h1 className="overview-greeting">{t('dashboard.greeting', 'Hello')}, {user.name}</h1>
                  <p className="overview-sub">
                    {t('dashboard.welcome_sub', 'Welcome to your personal health record and appointment center.')}
                  </p>
                </div>
                <div className="overview-hero-actions">
                  <Button
                    variant="primary"
                    onClick={handleOpenBookModal}
                    id="btn-overview-book"
                  >
                    <PlusIcon size={16} />
                    <span>{t('dashboard.book_appointment', 'Book Appointment')}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setIsUploadModalOpen(true)}
                    id="btn-overview-upload"
                  >
                    <UploadCloudIcon size={16} />
                    <span>{t('dashboard.upload_document', 'Upload Document')}</span>
                  </Button>
                </div>
              </div>

              {/* Pending Access Requests Banner */}
              {accessRequests.length > 0 && (
                <div className="urgent-banner">
                  <div className="urgent-banner__icon">
                    <ShieldCheckIcon size={24} />
                  </div>
                  <div className="urgent-banner__text">
                    <strong>{t('dashboard.urgent_access_title', 'Doctor Access Request Pending')}</strong>
                    <p>
                      {t('dashboard.urgent_access_desc', 'A doctor has requested permission to view your medical records. Please review and approve or deny.')}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setActiveTab('access')}
                    id="btn-urgent-review-access"
                  >
                    {t('dashboard.review_now', 'Review Now →')}
                  </Button>
                </div>
              )}

              {/* Stat Cards Grid */}
              <div className="stats-grid">
                <div className="stat-card" onClick={() => setActiveTab('appointments')}>
                  <div className="stat-card__icon stat-card__icon--blue">
                    <CalendarIcon size={24} />
                  </div>
                  <div className="stat-card__content">
                    <div className="stat-card__value">{upcomingAppts.length}</div>
                    <div className="stat-card__label">{t('dashboard.upcoming_appointments', 'Upcoming Appointments')}</div>
                  </div>
                </div>

                <div className="stat-card" onClick={() => setActiveTab('records')}>
                  <div className="stat-card__icon stat-card__icon--teal">
                    <FileTextIcon size={24} />
                  </div>
                  <div className="stat-card__content">
                    <div className="stat-card__value">{records.length}</div>
                    <div className="stat-card__label">{t('dashboard.medical_records', 'Medical Records')}</div>
                  </div>
                </div>

                <div className="stat-card" onClick={() => setActiveTab('files')}>
                  <div className="stat-card__icon stat-card__icon--purple">
                    <UploadCloudIcon size={24} />
                  </div>
                  <div className="stat-card__content">
                    <div className="stat-card__value">{files.length}</div>
                    <div className="stat-card__label">{t('dashboard.files_scans', 'Files & Scans')}</div>
                  </div>
                </div>

                <div className="stat-card" onClick={() => setActiveTab('access')}>
                  <div className="stat-card__icon stat-card__icon--amber">
                    <ShieldCheckIcon size={24} />
                  </div>
                  <div className="stat-card__content">
                    <div className="stat-card__value">{accessRequests.length}</div>
                    <div className="stat-card__label">{t('dashboard.pending_access_requests', 'Pending Access Requests')}</div>
                  </div>
                </div>
              </div>

              {/* Two Column Layout: Upcoming Appointments & Recent Records */}
              <div className="overview-split">
                {/* Left: Next Appointment */}
                <div className="overview-card">
                  <div className="overview-card__header">
                    <h3>{t('dashboard.upcoming_appointment', 'Upcoming Appointment')}</h3>
                    <button
                      className="text-link-btn"
                      onClick={() => setActiveTab('appointments')}
                    >
                      {t('common.view_all', 'View All')}
                    </button>
                  </div>

                  {upcomingAppts.length === 0 ? (
                    <div className="empty-card-state">
                      <CalendarIcon size={32} style={{ opacity: 0.3 }} />
                      <p>{t('dashboard.no_upcoming_appts', 'No upcoming appointments scheduled')}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleOpenBookModal}
                        id="btn-empty-book"
                      >
                        {t('dashboard.book_an_appointment', 'Book an appointment')}
                      </Button>
                    </div>
                  ) : (
                    <div className="next-appt-card">
                      <div className="next-appt-card__header">
                        <div>
                          <div className="next-appt-doctor">{upcomingAppts[0].doctor_name}</div>
                          <div className="next-appt-time">
                            <ClockIcon size={14} />
                            <span>{formatDateTime(upcomingAppts[0].appointment_date)}</span>
                            <span>({upcomingAppts[0].duration_minutes} {t('dashboard.mins', 'mins')})</span>
                          </div>
                        </div>
                        {getStatusBadge(upcomingAppts[0].status)}
                      </div>
                      {upcomingAppts[0].reason && (
                        <p className="next-appt-reason">
                          <strong>{t('dashboard.reason', 'Reason')}:</strong> {upcomingAppts[0].reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: Recent Records */}
                <div className="overview-card">
                  <div className="overview-card__header">
                    <h3>{t('dashboard.recent_medical_records', 'Recent Medical Records')}</h3>
                    <button
                      className="text-link-btn"
                      onClick={() => setActiveTab('records')}
                    >
                      {t('common.view_all', 'View All')}
                    </button>
                  </div>

                  {records.length === 0 ? (
                    <div className="empty-card-state">
                      <FileTextIcon size={32} style={{ opacity: 0.3 }} />
                      <p>{t('dashboard.no_clinical_records', 'No clinical records added yet')}</p>
                    </div>
                  ) : (
                    <div className="recent-records-list">
                      {records.slice(0, 3).map((rec) => (
                        <div
                          key={rec.id}
                          className="recent-record-item"
                          onClick={() => {
                            setSelectedRecord(rec);
                          }}
                        >
                          <div className="recent-record-item__title">{rec.title}</div>
                          <div className="recent-record-item__meta">
                            <span className="badge badge--small">{rec.record_type}</span>
                            <span>{formatDate(rec.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB: APPOINTMENTS ==================== */}
          {activeTab === 'appointments' && (
            <div className="appointments-view animate-fade-in-up">
              <div className="section-header">
                <div>
                  <h2 className="section-title">{t('appointments.title', 'Appointments')}</h2>
                  <p className="section-sub">{t('appointments.subtitle', 'Book consultations and manage your schedule')}</p>
                </div>
                <Button
                  variant="primary"
                  onClick={handleOpenBookModal}
                  id="btn-tab-book-appointment"
                >
                  <PlusIcon size={16} />
                  <span>{t('dashboard.book_appointment', 'Book Appointment')}</span>
                </Button>
              </div>

              {appointments.length === 0 ? (
                <div className="empty-state-box">
                  <CalendarIcon size={48} style={{ opacity: 0.2 }} />
                  <h3>{t('appointments.no_appointments_yet', 'No Appointments Yet')}</h3>
                  <p>{t('appointments.empty_desc', 'Book a consultation with an approved doctor to get started.')}</p>
                  <Button
                    variant="primary"
                    onClick={handleOpenBookModal}
                    id="btn-empty-book-appt"
                  >
                    {t('appointments.schedule_appointment', 'Schedule an Appointment')}
                  </Button>
                </div>
              ) : (
                <div className="appointments-list">
                  {appointments.map((appt) => (
                    <div key={appt.id} className="appointment-card">
                      <div className="appointment-card__main">
                        <div className="appointment-card__top">
                          <div>
                            <span className="appointment-doctor">{appt.doctor_name}</span>
                            <span className="appointment-date">
                              <ClockIcon size={14} />
                              {formatDateTime(appt.appointment_date)} ({appt.duration_minutes} {t('dashboard.mins', 'mins')})
                            </span>
                          </div>
                          {getStatusBadge(appt.status)}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                          <span className="badge badge--info badge--pill">{appt.department ? t(`departments.${appt.department}`, appt.department) : t('departments.General', 'General')}</span>
                          {appt.ai_summary && (
                            <span className="ai-badge ai-badge--pill">
                              <SparklesIcon size={12} /> {t('appointments.ai_briefing_attached', 'AI Briefing Attached')}
                            </span>
                          )}
                          {appt.abdm_consent_granted && (
                            <span className="badge badge--abdm badge--pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <span>🇮🇳</span> {t('appointments.abdm_fhir_filed', 'ABDM FHIR Filed')}
                            </span>
                          )}
                        </div>

                        {appt.reason && (
                          <div className="appointment-detail" style={{ marginTop: 'var(--space-2)' }}>
                            <span className="detail-label">{t('dashboard.reason', 'Reason')}:</span>
                            <span className="detail-value">{appt.reason}</span>
                          </div>
                        )}

                        {appt.ai_summary && (
                          <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgba(20, 184, 166, 0.06)', border: '1px solid rgba(20, 184, 166, 0.2)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <SparklesIcon size={12} /> {t('appointments.pre_consultation_briefing', 'Pre-Consultation Briefing for Doctor')}
                            </div>
                            <div style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-line', lineHeight: 1.4 }}>
                              {appt.ai_summary}
                            </div>
                          </div>
                        )}

                        {appt.notes && (
                          <div className="appointment-detail">
                            <span className="detail-label">{t('appointments.doctor_notes', 'Doctor Notes')}:</span>
                            <span className="detail-value">{appt.notes}</span>
                          </div>
                        )}
                      </div>

                      <div className="appointment-card__actions">
                        {(appt.status === 'PENDING' || appt.status === 'CONFIRMED') && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelAppointment(appt.id)}
                            id={`btn-cancel-appt-${appt.id}`}
                          >
                            <XIcon size={14} />
                            <span>{t('appointments.cancel', 'Cancel')}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB: MEDICAL RECORDS ==================== */}
          {activeTab === 'records' && (
            <div className="records-view animate-fade-in-up">
              <div className="section-header">
                <div>
                  <h2 className="section-title">{t('records.title', 'Medical Records')}</h2>
                  <p className="section-sub">
                    {t('records.subtitle', 'Clinical notes, prescriptions, and diagnoses provided by your authorized doctors')}
                  </p>
                </div>
              </div>

              {records.length === 0 ? (
                <div className="empty-state-box">
                  <FileTextIcon size={48} style={{ opacity: 0.25 }} />
                  <h3>{t('records.no_records_found', 'No Medical Records Found')}</h3>
                  <p>
                    {t('records.empty_desc', 'When an authorized doctor evaluates your consultation, their clinical notes and prescriptions will appear here.')}
                  </p>
                  <Button
                    variant="primary"
                    onClick={handleOpenBookModal}
                    id="btn-empty-records-book"
                  >
                    {t('records.schedule_consultation', 'Schedule a Consultation')}
                  </Button>
                </div>
              ) : (
                <div className="records-timeline">
                  {records.map((record) => (
                    <div
                      key={record.id}
                      className="record-timeline-card"
                      onClick={() => setSelectedRecord(record)}
                    >
                      <div className="record-header">
                        <div>
                          <div className="record-type-badge">{record.record_type}</div>
                          <h3 className="record-title">{record.title}</h3>
                        </div>
                        <span className="record-date">{formatDate(record.created_at)}</span>
                      </div>

                      <p className="record-snippet">{record.description}</p>

                      {record.attachments && record.attachments.length > 0 && (
                        <div className="record-attachments-preview">
                          <span className="attachments-count">
                            <DownloadIcon size={14} />
                            {record.attachments.length} {t('records.attachments_count', 'attachment(s)')}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB: FILES & SCANS ==================== */}
          {activeTab === 'files' && (
            <div className="files-view animate-fade-in-up">
              <div className="section-header">
                <div>
                  <h2 className="section-title">{t('files.title', 'Files & Scans Gallery')}</h2>
                  <p className="section-sub">
                    {t('files.subtitle', 'Organized by clinical department and chronological timeline')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`btn btn--sm ${filesTabMode === 'gallery' ? 'btn--primary' : 'btn--secondary'}`}
                    onClick={() => setFilesTabMode('gallery')}
                    id="btn-switch-file-gallery"
                  >
                    📁 Gallery View
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${filesTabMode === 'intelligence' ? 'btn--primary' : 'btn--secondary'}`}
                    onClick={() => setFilesTabMode('intelligence')}
                    style={filesTabMode === 'intelligence' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderColor: '#818cf8', color: '#fff' } : {}}
                    id="btn-switch-file-intelligence"
                  >
                    <SparklesIcon size={14} />
                    <span>AI Document Intelligence (Module B)</span>
                  </button>
                  <Button
                    variant="primary"
                    onClick={() => setIsUploadModalOpen(true)}
                    id="btn-tab-upload-file"
                  >
                    <UploadCloudIcon size={16} />
                    <span>{t('files.upload_file_btn', 'Upload File')}</span>
                  </Button>
                </div>
              </div>

              {filesTabMode === 'intelligence' ? (
                <DocumentIntelligenceViewer
                  patientUniqueId={profile?.patient_id || user?.patientId || ''}
                  files={files}
                  onFileUploaded={(newFile) => setFiles((prev) => [newFile, ...prev])}
                />
              ) : (
                <>
                  {/* TWO-AXIS FILTER CONTROLS */}
                  <div className="two-axis-filter-container">
                    {/* Primary Axis: Department */}
                    <div className="filter-axis">
                      <div className="filter-axis__label">
                        <span className="filter-axis__badge">{t('files.primary_axis', 'Primary Axis')}</span>
                        {t('files.department_label', 'Department:')}
                      </div>
                      <div className="category-filter-pills">
                        {DEPARTMENTS.map((dept) => {
                          const count =
                            dept.value === 'ALL'
                              ? files.length
                              : files.filter(
                                  (f) =>
                                    normalizeDept(f.department).toLowerCase() ===
                                    dept.value.toLowerCase()
                                ).length;
                          return (
                            <button
                              key={dept.value}
                              className={`filter-pill filter-pill--dept ${
                                fileDepartmentFilter === dept.value ? 'filter-pill--active' : ''
                              }`}
                              onClick={() => setFileDepartmentFilter(dept.value)}
                              id={`filter-dept-${dept.value.toLowerCase()}`}
                            >
                              {t(`departments.${dept.value}`, dept.label)} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Secondary Axis: File Type */}
                    <div className="filter-axis">
                      <div className="filter-axis__label">
                        <span className="filter-axis__badge filter-axis__badge--secondary">
                          {t('files.secondary_axis', 'Secondary Axis')}
                        </span>
                        {t('files.category_label', 'Document Type:')}
                      </div>
                      <div className="category-filter-pills">
                        {FILE_CATEGORIES.map((cat) => {
                          const count =
                            cat.value === 'ALL'
                              ? files.length
                              : files.filter((f) => f.file_category === cat.value).length;
                          return (
                            <button
                              key={cat.value}
                              className={`filter-pill filter-pill--cat ${
                                fileCategoryFilter === cat.value ? 'filter-pill--active' : ''
                              }`}
                              onClick={() => setFileCategoryFilter(cat.value)}
                              id={`filter-cat-${cat.value}`}
                            >
                              {t(`categories.${cat.value}`, cat.label)} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* FILES CONTENT: GROUPED BY DEPARTMENT */}
                  {displayedFiles.length === 0 ? (
                    <div className="empty-state-box">
                      <FileTextIcon size={48} style={{ opacity: 0.25 }} />
                      <h3>{t('files.no_files_title', 'No Medical Files Found')}</h3>
                      <p>
                        {files.length === 0
                          ? t('files.empty_desc', 'Upload prior lab reports, prescriptions, and radiology scans to keep them organized.')
                          : t('files.no_filter_match', 'No files match your current department and type filter.')}
                      </p>
                      <Button
                        variant="primary"
                        onClick={() => setIsUploadModalOpen(true)}
                        id="btn-empty-upload-file"
                      >
                        <UploadCloudIcon size={16} />
                        <span>{t('files.upload_first_file', 'Upload First File')}</span>
                      </Button>
                    </div>
                  ) : fileDepartmentFilter === 'ALL' ? (
                    <div className="dept-grouped-view">
                      {Object.entries(groupedFilesByDept).map(([deptName, deptFiles]) => (
                        <div key={deptName} className="dept-group-section">
                          <div className="dept-group-header">
                            <div className="dept-group-title">
                              <span className="dept-indicator-dot" />
                              <h3>{deptName}</h3>
                              <span className="badge badge--dept">
                                {deptFiles.length} {t('files.files_count', 'file(s)')}
                              </span>
                            </div>
                            <span className="dept-timeline-hint">{t('files.sorted_latest', 'Sorted by latest date')}</span>
                          </div>

                          <div className="files-grid">
                            {deptFiles.map((file) => renderFileCard(file))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dept-single-view">
                      <div className="dept-single-header">
                        <h3>
                          {fileDepartmentFilter}
                          <span className="badge badge--dept" style={{ marginLeft: 'var(--space-2)' }}>
                            {displayedFiles.length} {t('files.files_count', 'file(s)')}
                          </span>
                        </h3>
                        <span className="dept-timeline-hint">{t('files.sorted_newest', 'Sorted newest first')}</span>
                      </div>
                      <div className="files-grid">
                        {displayedFiles.map((file) => renderFileCard(file))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}


          {/* ==================== TAB: DOCTOR ACCESS ==================== */}
          {activeTab === 'access' && (
            <div className="access-view animate-fade-in-up">
              <div className="section-header">
                <div>
                  <h2 className="section-title">{t('access.title', 'Doctor Access & Privacy')}</h2>
                  <p className="section-sub">
                    {t('access.subtitle', 'Grant or deny doctors permission to review your medical history')}
                  </p>
                </div>
              </div>

              <div className="access-info-banner">
                <ShieldCheckIcon size={20} className="text-accent" />
                <p>
                  {t('access.banner_text', "When you approve a doctor's request, they are granted access to your medical records and uploaded scans for 30 days. You can deny requests at any time.")}
                </p>
              </div>

              {accessRequests.length === 0 ? (
                <div className="empty-state-box">
                  <ShieldCheckIcon size={48} style={{ opacity: 0.25 }} />
                  <h3>{t('access.no_pending_requests', 'No Pending Requests')}</h3>
                  <p>
                    {t('access.empty_desc', 'When a doctor searches your Patient ID and requests access, their request will appear here for your approval.')}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={handleCopyId}
                    id="btn-empty-access-copy"
                  >
                    <CopyIcon size={14} />
                    <span>{t('access.copy_patient_id', 'Copy Patient ID for Doctor')}</span>
                  </Button>
                </div>
              ) : (
                <div className="access-requests-list">
                  {accessRequests.map((req) => (
                    <div key={req.id} className="access-request-card">
                      <div className="access-request-card__info">
                        <div className="access-doctor-title">
                          {t('access.requested_access', `Doctor ID #${req.doctor_id} has requested access`, { id: req.doctor_id })}
                        </div>
                        {req.reason && (
                          <p className="access-reason">
                            <strong>{t('access.reason', 'Reason')}:</strong> {req.reason}
                          </p>
                        )}
                        <span className="access-requested-time">
                          {t('access.requested_on', 'Requested on')} {formatDateTime(req.requested_at)}
                        </span>
                      </div>

                      <div className="access-request-card__actions">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleRespondAccess(req.id, true)}
                          id={`btn-approve-access-${req.id}`}
                        >
                          <CheckIcon size={16} />
                          <span>{t('access.approve_access', 'Approve Access')}</span>
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleRespondAccess(req.id, false)}
                          id={`btn-deny-access-${req.id}`}
                        >
                          <XIcon size={16} />
                          <span>{t('access.deny', 'Deny')}</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB: PROFILE ==================== */}
          {activeTab === 'profile' && (
            <div className="profile-view animate-fade-in-up">
              <div className="section-header">
                <div>
                  <h2 className="section-title">{t('profile.title', 'Personal Health Profile')}</h2>
                  <p className="section-sub">{t('profile.subtitle', 'Manage your personal demographics and contact info')}</p>
                </div>
                {!isEditingProfile && (
                  <Button
                    variant="secondary"
                    onClick={() => setIsEditingProfile(true)}
                    id="btn-edit-profile"
                  >
                    {t('profile.edit_profile', 'Edit Profile')}
                  </Button>
                )}
              </div>

              {/* Profile Photo Card */}
              <div className="profile-photo-card">
                <div className="profile-photo-preview">
                  {profile?.profile_photo_url || user.profilePhotoUrl ? (
                    <img
                      src={profile?.profile_photo_url || user.profilePhotoUrl || ''}
                      alt={profile?.name || user.name}
                      className="profile-photo-preview__img"
                    />
                  ) : (
                    <UserIcon size={36} />
                  )}
                </div>
                <div className="profile-photo-info">
                  <div className="profile-photo-title">{t('profile.photo_title', 'Profile Photo')}</div>
                  <div className="profile-photo-desc">
                    {t('profile.photo_desc', 'Upload a high-resolution JPG, PNG, or WebP photo (max 5MB). This image appears in the top navigation bar and on your profile.')}
                  </div>
                  <div className="profile-photo-actions">
                    <label
                      className={`btn btn--primary btn--sm ${photoUploading ? 'btn--disabled' : ''}`}
                      style={{ cursor: photoUploading ? 'wait' : 'pointer' }}
                    >
                      {photoUploading ? t('common.uploading', 'Uploading...') : t('profile.upload_photo_btn', 'Upload Photo')}
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        style={{ display: 'none' }}
                        onChange={handlePhotoUpload}
                        disabled={photoUploading}
                        id="input-profile-photo"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="profile-card">
                {isEditingProfile ? (
                  <form onSubmit={handleSaveProfile}>
                    <div className="profile-form-grid">
                      <InputField
                        id="profile-name"
                        label={t('profile.full_name', 'Full Name')}
                        value={profileForm.name}
                        isValid={profileForm.name.trim().length >= 2}
                        helperText="Your legal or preferred name"
                        onChange={(e) =>
                          setProfileForm((p) => ({ ...p, name: e.target.value }))
                        }
                        required
                      />

                      <InputField
                        id="profile-phone"
                        label={t('profile.phone', 'Phone Number')}
                        value={profileForm.phone}
                        isValid={profileForm.phone.trim().length >= 8}
                        helperText="Used for consultation SMS notifications"
                        onChange={(e) =>
                          setProfileForm((p) => ({ ...p, phone: e.target.value }))
                        }
                        required
                      />

                      <InputField
                        id="profile-age"
                        label={t('profile.age', 'Age')}
                        type="number"
                        min={0}
                        max={150}
                        value={profileForm.age}
                        isValid={Boolean(profileForm.age && Number(profileForm.age) > 0)}
                        helperText="Age in years"
                        onChange={(e) =>
                          setProfileForm((p) => ({ ...p, age: e.target.value }))
                        }
                      />

                      <div className="input-field">
                        <label className="input-field__label" htmlFor="profile-blood">
                          {t('profile.blood_group', 'Blood Group')}
                        </label>
                        <select
                          id="profile-blood"
                          className="input-field__input"
                          value={profileForm.blood_group}
                          onChange={(e) =>
                            setProfileForm((p) => ({ ...p, blood_group: e.target.value }))
                          }
                        >
                          <option value="">{t('profile.blood_group', 'Blood Group')}</option>
                          <option value="A+">A+</option>
                          <option value="A-">A-</option>
                          <option value="B+">B+</option>
                          <option value="B-">B-</option>
                          <option value="AB+">AB+</option>
                          <option value="AB-">AB-</option>
                          <option value="O+">O+</option>
                          <option value="O-">O-</option>
                        </select>
                      </div>
                    </div>

                    <InputField
                      id="profile-allergies"
                      label={t('profile.allergies_notes', 'Allergies / Chronic Conditions')}
                      placeholder="e.g. Penicillin, Peanuts, Asthma"
                      value={profileForm.allergies}
                      onVoiceInput={(text) =>
                        setProfileForm((p) => ({
                          ...p,
                          allergies: p.allergies ? `${p.allergies}, ${text}` : text,
                        }))
                      }
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, allergies: e.target.value }))
                      }
                    />

                    <div className="profile-form-actions">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={profileSaving}
                        id="btn-save-profile"
                      >
                        {t('profile.save_changes', 'Save Changes')}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setIsEditingProfile(false)}
                      >
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="profile-details-grid">
                    <div className="profile-detail-item">
                      <span className="profile-label">{t('profile.patient_id', 'Patient ID')}</span>
                      <span className="profile-value text-accent font-mono">{user.patientId}</span>
                    </div>

                    <div className="profile-detail-item">
                      <span className="profile-label">{t('profile.full_name', 'Full Name')}</span>
                      <span className="profile-value">{profile?.name || user.name}</span>
                    </div>

                    <div className="profile-detail-item">
                      <span className="profile-label">{t('profile.email', 'Email')}</span>
                      <span className="profile-value">{profile?.email || '—'}</span>
                    </div>

                    <div className="profile-detail-item">
                      <span className="profile-label">{t('profile.phone', 'Phone')}</span>
                      <span className="profile-value">{profile?.phone || '—'}</span>
                    </div>

                    <div className="profile-detail-item">
                      <span className="profile-label">{t('profile.age', 'Age')}</span>
                      <span className="profile-value">{profile?.age ? `${profile.age} ${t('profile.years', 'years')}` : t('common.not_specified', 'Not specified')}</span>
                    </div>

                    <div className="profile-detail-item">
                      <span className="profile-label">{t('profile.blood_group', 'Blood Group')}</span>
                      <span className="profile-value">
                        {profile?.blood_group ? (
                          <span className="badge badge--info">{profile.blood_group}</span>
                        ) : (
                          t('common.not_specified', 'Not specified')
                        )}
                      </span>
                    </div>

                    <div className="profile-detail-item profile-detail-item--full">
                      <span className="profile-label">{t('profile.allergies_notes', 'Allergies & Medical Notes')}</span>
                      <span className="profile-value">
                        {profile?.allergies || t('profile.no_allergies', 'No known allergies reported')}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ABDM / ABHA Card (Health 4.0 Part A) */}
              <div className="abha-profile-card" style={{ marginTop: 'var(--space-5)' }}>
                <div className="abha-profile-card__header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: '20px' }}>🇮🇳</span>
                    <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
                      {t('abha.title', 'Ayushman Bharat Health Account (ABHA)')}
                    </span>
                  </div>
                  {profile?.abha_number || profile?.abha_address ? (
                    <span className="badge badge--abdm-success">{t('abha.linked', 'Linked • ABDM Sandbox')}</span>
                  ) : (
                    <span className="badge badge--abdm">{t('abha.not_linked', 'Not Linked')}</span>
                  )}
                </div>

                <div className="abha-profile-card__content">
                  {profile?.abha_number || profile?.abha_address ? (
                    <div>
                      <div className="abha-field-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                        <div>
                          <div className="abha-field-title" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{t('abha.number', 'ABHA Number')}</div>
                          <div className="abha-field-val" style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-mono)' }}>
                            {profile.abha_number || '—'}
                          </div>
                        </div>
                        <div>
                          <div className="abha-field-title" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{t('abha.address', 'ABHA Address (PHR)')}</div>
                          <div className="abha-field-val" style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: '#ff9933' }}>
                            {profile.abha_address || '—'}
                          </div>
                        </div>
                        <div>
                          <div className="abha-field-title" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{t('abha.hip_status', 'HIP Registry Status')}</div>
                          <div className="abha-field-val" style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-success)' }}>
                            {t('abha.hip_active', 'Active • Ready to push FHIR R4')}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={handleUnlinkAbha}
                          id="btn-unlink-abha"
                        >
                          {t('abha.unlink_btn', 'Unlink ABHA Identity')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                        {t('abha.link_desc', 'Link your 14-digit ABHA Number or ABHA Address to enable seamless national health record exchange under the Ayushman Bharat Digital Mission (ABDM).')}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                        <div className="abha-sandbox-hint">
                          {t('abha.sandbox_hint', '💡 Sandbox mode: Test with Aadhaar 9999-1234-5678 and OTP 123456.')}
                        </div>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => {
                            setAbhaAuthStep('ID');
                            setIsAbhaModalOpen(true);
                          }}
                          id="btn-open-link-abha-modal"
                        >
                          {t('abha.link_btn', 'Link ABHA Account →')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================== MODAL: BOOK APPOINTMENT WIZARD (Item 2) ==================== */}
      <Modal
        isOpen={isBookModalOpen}
        onClose={() => {
          setIsBookModalOpen(false);
          setBookingStep(1);
          setBookError('');
        }}
        title={t('wizard.title', 'Schedule Consultation & AI Briefing')}
      >
        {/* Step Wizard Indicator */}
        <div className="wizard-steps">
          <div className={`wizard-step ${bookingStep === 1 ? 'wizard-step--active' : bookingStep > 1 ? 'wizard-step--completed' : ''}`}>
            <div className="wizard-step__num">1</div>
            <span>{t('wizard.step1', 'Doctor & Time')}</span>
          </div>

          <div className={`wizard-step__divider ${bookingStep > 1 ? 'wizard-step__divider--active' : ''}`} />

          <div className={`wizard-step ${bookingStep === 2 ? 'wizard-step--active' : bookingStep > 2 ? 'wizard-step--completed' : ''}`}>
            <div className="wizard-step__num">2</div>
            <span>{t('wizard.step2', 'Pre-Visit Questions')}</span>
          </div>

          <div className={`wizard-step__divider ${bookingStep > 2 ? 'wizard-step__divider--active' : ''}`} />

          <div className={`wizard-step ${bookingStep === 3 ? 'wizard-step--active' : ''}`}>
            <div className="wizard-step__num">3</div>
            <span>{t('wizard.step3', 'AI Briefing')}</span>
          </div>
        </div>

        {bookError && (
          <div className="alert alert--error" style={{ marginBottom: 'var(--space-4)' }}>
            <AlertCircleIcon size={16} />
            <span>{bookError}</span>
          </div>
        )}

        {/* STEP 1: DOCTOR & SCHEDULE */}
        {bookingStep === 1 && (
          <div>
            <div className="form-group">
              <label className="form-label" htmlFor="book-doctor">
                {t('wizard.doctor_label', 'Select Attending Doctor')}
                <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>*</span>
              </label>
              <select
                id="book-doctor"
                className="form-input"
                value={bookDoctorId}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : '';
                  setBookDoctorId(val);
                  const doc = doctors.find((d) => d.user_id === val);
                  if (doc && doc.specialty) {
                    setBookDepartment(doc.specialty);
                  }
                }}
                required
              >
                <option value="">{t('wizard.doctor_placeholder', 'Choose a doctor...')}</option>
                {doctors.length === 0 && (
                  <option value="" disabled>Loading approved doctors...</option>
                )}
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.user_id}>
                    {doc.name} {doc.specialty ? `(${doc.specialty})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="book-dept">
                {t('wizard.dept_label', 'Clinical Department')}
              </label>
              <select
                id="book-dept"
                className="form-input"
                value={bookDepartment}
                onChange={(e) => {
                  const dept = e.target.value;
                  setBookDepartment(dept);
                  const matchingDoc = doctors.find(
                    (d) => d.specialty && d.specialty.toLowerCase() === dept.toLowerCase()
                  );
                  if (matchingDoc) {
                    setBookDoctorId(matchingDoc.user_id);
                  }
                }}
              >
                <option value="General">General Medicine</option>
                <option value="AYUSH">🌿 AYUSH (Ayurveda & Holistic Medicine)</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Orthopedics">Orthopedics</option>
                <option value="Dermatology">Dermatology</option>
                <option value="Neurology">Neurology</option>
                <option value="ENT">ENT (Ear, Nose & Throat)</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="Psychiatry">Psychiatry</option>
              </select>
            </div>

            <div className="form-row">
              <InputField
                id="book-date"
                label={t('wizard.date_label', 'Appointment Date')}
                type="date"
                value={bookDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setBookDate(e.target.value)}
                required
              />
              <div className="form-group">
                <label className="form-label" htmlFor="book-time">
                  {t('wizard.time_label', 'Appointment Time')}
                  <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>*</span>
                </label>
                <select
                  id="book-time"
                  className="form-input"
                  value={bookTime}
                  onChange={(e) => setBookTime(e.target.value)}
                  required
                >
                  <option value="08:30">08:30 AM</option>
                  <option value="09:00">09:00 AM</option>
                  <option value="09:30">09:30 AM</option>
                  <option value="10:00">10:00 AM</option>
                  <option value="10:30">10:30 AM</option>
                  <option value="11:00">11:00 AM</option>
                  <option value="11:30">11:30 AM</option>
                  <option value="12:00">12:00 PM</option>
                  <option value="12:30">12:30 PM</option>
                  <option value="13:00">01:00 PM</option>
                  <option value="13:30">01:30 PM</option>
                  <option value="14:00">02:00 PM</option>
                  <option value="14:30">02:30 PM</option>
                  <option value="15:00">03:00 PM</option>
                  <option value="15:30">03:30 PM</option>
                  <option value="16:00">04:00 PM</option>
                  <option value="16:30">04:30 PM</option>
                  <option value="17:00">05:00 PM</option>
                  <option value="17:30">05:30 PM</option>
                  <option value="18:00">06:00 PM</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="book-duration">
                {t('wizard.duration_label', 'Consultation Length')}
              </label>
              <select
                id="book-duration"
                className="form-input"
                value={bookDuration}
                onChange={(e) => setBookDuration(Number(e.target.value))}
              >
                <option value={15}>{t('wizard.duration_15', '15 minutes (Quick follow-up)')}</option>
                <option value={30}>{t('wizard.duration_30', '30 minutes (Standard consultation)')}</option>
                <option value={45}>{t('wizard.duration_45', '45 minutes (Detailed evaluation)')}</option>
                <option value={60}>{t('wizard.duration_60', '60 minutes (Comprehensive exam)')}</option>
              </select>
            </div>

            <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsBookModalOpen(false)}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleProceedToQuestionnaire}
                id="btn-proceed-to-questions"
              >
                {t('wizard.next_to_questions', 'Next: Pre-Consultation Questions →')}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: PRE-CONSULTATION QUESTIONNAIRE */}
        {bookingStep === 2 && (
          <div>
            {bookDepartment === 'AYUSH' ? (
              /* --- AYUSH 5-SECTION QUESTIONNAIRE TRACK (Health 4.0 Part B) --- */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span className="badge badge--ayush badge--pill">🌿 AYUSH Intake Mode</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Traditional Constitution & Lifestyle Assessment
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: '#34d399' }}>
                    Section {ayushSubStep} of 5
                  </span>
                </div>

                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                  Your answers will be analyzed by Google Gemini to construct an Ayurvedic Prakriti/Vikriti profile and clinical briefing for Dr. {doctors.find((d) => d.user_id === bookDoctorId)?.name || 'Vaidya'}.
                </p>

                {/* Sub-step tab navigation */}
                <div className="ayush-tabs">
                  <button
                    type="button"
                    className={`ayush-tab ${ayushSubStep === 1 ? 'ayush-tab--active' : ''}`}
                    onClick={() => setAyushSubStep(1)}
                  >
                    <span className="ayush-tab-badge">1</span>
                    <span>Prakriti (Constitution)</span>
                  </button>
                  <button
                    type="button"
                    className={`ayush-tab ${ayushSubStep === 2 ? 'ayush-tab--active' : ''}`}
                    onClick={() => setAyushSubStep(2)}
                  >
                    <span className="ayush-tab-badge">2</span>
                    <span>Vikriti (Imbalance)</span>
                  </button>
                  <button
                    type="button"
                    className={`ayush-tab ${ayushSubStep === 3 ? 'ayush-tab--active' : ''}`}
                    onClick={() => setAyushSubStep(3)}
                  >
                    <span className="ayush-tab-badge">3</span>
                    <span>Agni (Digestion)</span>
                  </button>
                  <button
                    type="button"
                    className={`ayush-tab ${ayushSubStep === 4 ? 'ayush-tab--active' : ''}`}
                    onClick={() => setAyushSubStep(4)}
                  >
                    <span className="ayush-tab-badge">4</span>
                    <span>Bowel Habits</span>
                  </button>
                  <button
                    type="button"
                    className={`ayush-tab ${ayushSubStep === 5 ? 'ayush-tab--active' : ''}`}
                    onClick={() => setAyushSubStep(5)}
                  >
                    <span className="ayush-tab-badge">5</span>
                    <span>Diet & Lifestyle</span>
                  </button>
                </div>

                {/* SUB-STEP 1: PRAKRITI (Baseline Constitution) */}
                {ayushSubStep === 1 && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34d399', marginBottom: 'var(--space-3)' }}>
                      {t('ayush.prakriti_title', '1. Prakriti Assessment (Baseline Body Constitution)')}
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">1.1 Body Frame & Physical Build</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Slender / light frame / difficult to gain weight (Vata)', title: 'Slender / Light Frame', desc: 'Fast metabolism, prominent joints, lean (Vata-dominant)' },
                          { id: 'Medium / athletic build / moderate weight (Pitta)', title: 'Medium / Athletic', desc: 'Moderate muscle tone, balanced frame, easily maintains weight (Pitta-dominant)' },
                          { id: 'Large / solid frame / easily gains weight (Kapha)', title: 'Large / Solid Frame', desc: 'Broad shoulders, heavy bones, holds weight easily (Kapha-dominant)' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.prakriti.body_frame === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() => setAyushAssessment((p) => ({ ...p, prakriti: { ...p.prakriti, body_frame: opt.id } }))}
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">1.2 Skin & Hair Texture</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Dry, rough, thin or brittle hair (Vata)', title: 'Dry / Cool Skin', desc: 'Rough patches, cold extremities, fine or frizzy hair (Vata)' },
                          { id: 'Warm, sensitive / redness-prone (Pitta)', title: 'Warm / Sensitive Skin', desc: 'Prone to freckles/acne, early graying, warm skin (Pitta)' },
                          { id: 'Thick, oily, moist, lustrous hair (Kapha)', title: 'Thick / Moist Skin', desc: 'Supple, radiant, dense lustrous hair, cool skin (Kapha)' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.prakriti.skin_hair === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() => setAyushAssessment((p) => ({ ...p, prakriti: { ...p.prakriti, skin_hair: opt.id } }))}
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">1.3 Weather / Temperature Sensitivity</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Sensitive to cold and dry winds, craves heat / sun (Vata)', title: 'Cold Sensitive', desc: 'Prefers warm climates, dislikes air conditioning and drafts' },
                          { id: 'Sensitive to heat / sun, craves coolness (Pitta)', title: 'Heat Sensitive', desc: 'Easily overheats, sweats easily, prefers cold seasons' },
                          { id: 'Dislikes damp, cloudy, and cold weather (Kapha)', title: 'Dampness Sensitive', desc: 'Feels sluggish in cold rainy weather, prefers dry warmth' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.prakriti.weather_sensitivity === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() => setAyushAssessment((p) => ({ ...p, prakriti: { ...p.prakriti, weather_sensitivity: opt.id } }))}
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">1.4 Natural Baseline Temperament</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Quick, enthusiastic, active mind, easily anxious under stress (Vata)', title: 'Creative & Quick', desc: 'Fast thinker, enthusiastic, tends toward worry when stressed' },
                          { id: 'Sharp, ambitious, focused, easily irritated (Pitta)', title: 'Focused & Purposeful', desc: 'Organized leader, articulate, prone to impatience/irritability' },
                          { id: 'Calm, steady, patient, resistant to change (Kapha)', title: 'Calm & Grounded', desc: 'Peaceful, dependable, supportive, slow to anger' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.prakriti.temperament === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() => setAyushAssessment((p) => ({ ...p, prakriti: { ...p.prakriti, temperament: opt.id } }))}
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
                      <Button type="button" variant="secondary" onClick={() => setBookingStep(1)}>
                        ← Back to Schedule
                      </Button>
                      <Button type="button" variant="primary" onClick={() => setAyushSubStep(2)}>
                        Next: Vikriti (Imbalance) →
                      </Button>
                    </div>
                  </div>
                )}

                {/* SUB-STEP 2: VIKRITI (Current Imbalance) */}
                {ayushSubStep === 2 && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34d399', marginBottom: 'var(--space-3)' }}>
                      {t('ayush.vikriti_title', '2. Vikriti Assessment (Current Imbalance & Symptoms)')}
                    </div>

                    <div className="questionnaire-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                        <label className="questionnaire-label" htmlFor="ayush-chief-complaint" style={{ margin: 0 }}>
                          {t('ayush.chief_disturbance', '2.1 What feels out of balance in your body or mind?')}
                          <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>*</span>
                        </label>
                        <VoiceInputButton
                          onTranscript={(text) =>
                            setAyushAssessment((p) => ({
                              ...p,
                              vikriti: {
                                ...p.vikriti,
                                chief_disturbance: p.vikriti.chief_disturbance ? `${p.vikriti.chief_disturbance} ${text}` : text,
                              },
                            }))
                          }
                          title="Speak symptoms (supports Hindi / Marathi / English)"
                        />
                      </div>
                      <div className="questionnaire-hint">
                        {t('ayush.chief_disturbance_hint', 'Describe your current complaint in your own words (e.g., chronic joint stiffness in the morning, hyperacidity after spicy food). Type or use microphone.')}
                      </div>
                      <textarea
                        id="ayush-chief-complaint"
                        className="form-input"
                        rows={3}
                        placeholder="Describe your current discomfort or symptoms..."
                        value={ayushAssessment.vikriti.chief_disturbance}
                        onChange={(e) =>
                          setAyushAssessment((p) => ({
                            ...p,
                            vikriti: { ...p.vikriti, chief_disturbance: e.target.value },
                          }))
                        }
                        required
                      />
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label" htmlFor="ayush-duration">
                        2.2 How long have you experienced this imbalance?
                      </label>
                      <select
                        id="ayush-duration"
                        className="form-input"
                        value={ayushAssessment.vikriti.duration}
                        onChange={(e) =>
                          setAyushAssessment((p) => ({
                            ...p,
                            vikriti: { ...p.vikriti, duration: e.target.value },
                          }))
                        }
                      >
                        <option value="Less than 1 week">Less than 1 week</option>
                        <option value="1 to 2 weeks">1 to 2 weeks</option>
                        <option value="3 to 4 weeks">3 to 4 weeks</option>
                        <option value="1 to 3 months">1 to 3 months</option>
                        <option value="Over 6 months (chronic)">Over 6 months (chronic)</option>
                      </select>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">2.3 Energy & Mental State Flare-up</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Restless anxiety, fluctuating fatigue, tremors or insomnia (Vata)', title: 'Restless / Nervous Energy', desc: 'Anxious exhaustion, brain overactivity, sleep disruption (Vata flare-up)' },
                          { id: 'Burning sensation, acid irritability, skin heat, exhaustion (Pitta)', title: 'Burning / Irritable Flare', desc: 'Inflammatory heat, irritability, acid sensations, burnout (Pitta flare-up)' },
                          { id: 'Heavy lethargy, slow metabolism, morning stiffness, brain fog (Kapha)', title: 'Sluggish / Heavy Stagnation', desc: 'Lethargy, excess mucus, joint stiffness on waking, heaviness (Kapha flare-up)' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.vikriti.energy_mood === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                vikriti: { ...p.vikriti, energy_mood: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
                      <Button type="button" variant="secondary" onClick={() => setAyushSubStep(1)}>
                        ← Back: Prakriti
                      </Button>
                      <Button type="button" variant="primary" onClick={() => setAyushSubStep(3)}>
                        Next: Agni (Digestion) →
                      </Button>
                    </div>
                  </div>
                )}

                {/* SUB-STEP 3: AGNI (Digestive Fire) */}
                {ayushSubStep === 3 && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34d399', marginBottom: 'var(--space-3)' }}>
                      {t('ayush.agni_title', '3. Agni Assessment (Digestive Fire & Metabolic Health)')}
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">3.1 Appetite Pattern (Agni State)</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Vishama Agni: Irregular / fluctuating hunger (skips meals, variable timing)', title: 'Vishama Agni (Irregular)', desc: 'Hunger fluctuates day to day; sometimes strong, sometimes none (Vata)' },
                          { id: 'Tikshna Agni: Intense / sharp hunger (cannot skip meals, gets burning/hangry)', title: 'Tikshna Agni (Intense)', desc: 'Sharp ravenous appetite; acid sensations if meal delayed (Pitta)' },
                          { id: 'Manda Agni: Sluggish / low appetite (can easily go without eating, slow digestion)', title: 'Manda Agni (Sluggish)', desc: 'Slow dull hunger; can easily skip meals; feels full for long periods (Kapha)' },
                          { id: 'Sama Agni: Balanced, regular, comfortable appetite', title: 'Sama Agni (Balanced)', desc: 'Consistent hunger at regular meal times without distress' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.agni.appetite === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                agni: { ...p.agni, appetite: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">3.2 Post-Meal Sensation</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Bloating, gas, distension, burping after food', title: 'Bloating & Gas', desc: 'Abdominal distension, dry belching, cramping post meal (Vata)' },
                          { id: 'Acid reflux, burning in chest/stomach, sour taste', title: 'Acid & Heartburn', desc: 'Sour regurgitation, burning throat/chest, heat sensations (Pitta)' },
                          { id: 'Heaviness, drowsiness, food sits in stomach for hours', title: 'Prolonged Heaviness', desc: 'Lethargy after meals, slow transit, coating on tongue (Kapha)' },
                          { id: 'Light, energetic, comfortable post meals', title: 'Light & Energetic', desc: 'Comfortable digestion without gas, burning, or dullness' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.agni.post_meal === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                agni: { ...p.agni, post_meal: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">3.3 Thirst Pattern</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Dry mouth, variable thirst, prefers warm sips', title: 'Variable / Warm Drinks', desc: 'Frequent dry throat, dislikes ice cold water' },
                          { id: 'Excessive thirst, dry throat, craves cold drinks', title: 'Excessive / Cold Drinks', desc: 'High fluid requirement, craves chilled or refreshing drinks' },
                          { id: 'Low thirst, rarely feels like drinking water', title: 'Low Thirst', desc: 'Naturally low water intake, little desire for liquids' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.agni.thirst === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                agni: { ...p.agni, thirst: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
                      <Button type="button" variant="secondary" onClick={() => setAyushSubStep(2)}>
                        ← Back: Vikriti
                      </Button>
                      <Button type="button" variant="primary" onClick={() => setAyushSubStep(4)}>
                        Next: Bowel Habits →
                      </Button>
                    </div>
                  </div>
                )}

                {/* SUB-STEP 4: BOWEL HABITS (Koshta Assessment) */}
                {ayushSubStep === 4 && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34d399', marginBottom: 'var(--space-3)' }}>
                      {t('ayush.bowel_title', '4. Bowel Habits & Koshta Assessment')}
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">4.1 Frequency & Regularity</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Once daily regular (morning)', title: 'Once Daily Regular', desc: 'Predictable morning evacuation upon waking' },
                          { id: 'Irregular (skips days, constipated)', title: 'Irregular / Constipated', desc: 'Skips days, difficult or unpredictable transit' },
                          { id: '2 to 3+ times daily (loose, urgent)', title: 'Frequent / Loose', desc: 'Multiple evacuations daily, rapid gastrocolic reflex' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.bowel_habits.frequency === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                bowel_habits: { ...p.bowel_habits, frequency: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">4.2 Stool Consistency (Koshta Type)</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Krura Koshta: Dry, hard, small pellets, difficult to pass', title: 'Krura Koshta (Hard)', desc: 'Dry, pellet-like stool, tendency to strain (Vata Koshta)' },
                          { id: 'Mridu Koshta: Soft, unformed or loose, easily stirred', title: 'Mridu Koshta (Soft / Quick)', desc: 'Soft or semi-liquid, easily loosened by milk/fruit (Pitta Koshta)' },
                          { id: 'Madhyama Koshta: Normal, cylindrical, well-formed, easy transit', title: 'Madhyama Koshta (Balanced)', desc: 'Normal well-formed stool, effortless evacuation' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.bowel_habits.consistency === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                bowel_habits: { ...p.bowel_habits, consistency: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">4.3 Evacuation Sensation</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Complete relief and light feeling', title: 'Complete Evacuation', desc: 'Feeling of lightness and complete emptying' },
                          { id: 'Incomplete evacuation sensation / straining', title: 'Incomplete / Straining', desc: 'Persistent feeling of fullness or heaviness' },
                          { id: 'Burning or gas discomfort during elimination', title: 'Burning / Discomfort', desc: 'Heat or burning irritation during bowel movement' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.bowel_habits.discomfort === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                bowel_habits: { ...p.bowel_habits, discomfort: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
                      <Button type="button" variant="secondary" onClick={() => setAyushSubStep(3)}>
                        ← Back: Agni
                      </Button>
                      <Button type="button" variant="primary" onClick={() => setAyushSubStep(5)}>
                        Next: Diet & Lifestyle →
                      </Button>
                    </div>
                  </div>
                )}

                {/* SUB-STEP 5: AHARA-VIHARA (Diet & Lifestyle) */}
                {ayushSubStep === 5 && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34d399', marginBottom: 'var(--space-3)' }}>
                      {t('ayush.ahara_vihara_title', '5. Ahara-Vihara (Dietary & Daily Routine Patterns)')}
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">5.1 Taste (Rasa) Cravings & Diet Preferences</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Craves warm, moist, sweet, salty, oily comfort food', title: 'Sweet / Salty / Grounding', desc: 'Prefers warm stews, soups, grains, ghee, nuts (Pacifies Vata)' },
                          { id: 'Craves cooling, sweet, bitter, juicy foods and cold drinks', title: 'Cooling / Sweet / Bitter', desc: 'Prefers salads, fresh fruit, cooling drinks, cucumber (Pacifies Pitta)' },
                          { id: 'Craves spicy, pungent, astringent, dry, warm light snacks', title: 'Pungent / Spicy / Light', desc: 'Prefers pepper, ginger, beans, dry roasted foods (Pacifies Kapha)' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.ahara_vihara.diet_cravings === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                ahara_vihara: { ...p.ahara_vihara, diet_cravings: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">5.2 Meal Routine & Chronobiology</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Fixed regular meal hours every day', title: 'Strictly Fixed Timings', desc: 'Eats breakfast, lunch, and dinner at consistent hours' },
                          { id: 'Irregular / skipped meals / late night eating', title: 'Irregular / Late Dinners', desc: 'Frequently eats late, skips breakfast, or eats on the run' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.ahara_vihara.meal_routine === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                ahara_vihara: { ...p.ahara_vihara, meal_routine: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">5.3 Sleep Schedule (Nidra)</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'Light, disturbed, wakes up between 2 AM – 4 AM (Vata)', title: 'Light / Interrupted Sleep', desc: 'Difficulty falling asleep or waking up early hours (Vata)' },
                          { id: 'Moderate 6–7 hrs, vivid dreams, wakes alert (Pitta)', title: 'Sound 6–7 Hours', desc: 'Deep sleeper, vivid dreams, feels alert in morning (Pitta)' },
                          { id: 'Heavy, prolonged 8–10 hrs, groggy and hard to awaken (Kapha)', title: 'Heavy 8+ Hours', desc: 'Long deep sleep, groggy upon waking, craves daytime naps (Kapha)' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.ahara_vihara.sleep_cycle === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                ahara_vihara: { ...p.ahara_vihara, sleep_cycle: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="questionnaire-group">
                      <label className="questionnaire-label">5.4 Physical Activity & Stress (Vihara)</label>
                      <div className="ayush-card-grid">
                        {[
                          { id: 'High stress, sedentary desk job', title: 'High Stress / Sedentary', desc: 'Desk bound, little time for physical relaxation' },
                          { id: 'Moderate routine, light yoga or daily walks', title: 'Moderate / Yoga & Walks', desc: 'Balanced lifestyle with light exercise or meditation' },
                          { id: 'Active / physically demanding routine', title: 'High Physical Activity', desc: 'Vigorous training, sports, or heavy manual activity' },
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            className={`ayush-option-card ${ayushAssessment.ahara_vihara.activity_stress === opt.id ? 'ayush-option-card--selected' : ''}`}
                            onClick={() =>
                              setAyushAssessment((p) => ({
                                ...p,
                                ahara_vihara: { ...p.ahara_vihara, activity_stress: opt.id },
                              }))
                            }
                          >
                            <span className="ayush-option-title">{opt.title}</span>
                            <span className="ayush-option-desc">{opt.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Current Medications in AYUSH */}
                    <div className="questionnaire-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                        <label className="questionnaire-label" htmlFor="ayush-meds" style={{ margin: 0 }}>
                          Current Ayurvedic herbs, allopathic drugs, or supplements:
                        </label>
                        <VoiceInputButton
                          onTranscript={(text) =>
                            setBookMedications((prev) => (prev ? `${prev}, ${text}` : text))
                          }
                          title="Speak medications"
                        />
                      </div>
                      <InputField
                        id="ayush-meds"
                        label=""
                        placeholder="e.g. Ashwagandha, Triphala, Metformin 500mg (or 'None')"
                        value={bookMedications}
                        onChange={(e) => setBookMedications(e.target.value)}
                      />
                    </div>

                    <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
                      <Button type="button" variant="secondary" onClick={() => setAyushSubStep(4)}>
                        ← Back: Bowel Habits
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleGenerateAISummary}
                        id="btn-generate-ayush-summary"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', borderColor: '#34d399' }}
                      >
                        <SparklesIcon size={16} />
                        <span>Generate AYUSH Clinical Briefing ✨</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* --- STANDARD ALLOPATHIC QUESTIONNAIRE TRACK --- */
              <div>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                  Your answers will be analyzed by Google Gemini alongside your medical records & scans to prepare an actionable briefing for Dr. {doctors.find((d) => d.user_id === bookDoctorId)?.name || 'Doctor'}.
                </p>

                {/* Q1: Chief Complaint */}
                <div className="questionnaire-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                    <label className="questionnaire-label" htmlFor="q-chief-complaint" style={{ margin: 0 }}>
                      {t('wizard.chief_complaint_label', '1. What is your chief medical complaint or reason for visit?')}
                      <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>*</span>
                    </label>
                    <VoiceInputButton
                      onTranscript={(text) =>
                        setBookReason((prev) => (prev ? `${prev} ${text}` : text))
                      }
                      title="Speak symptoms / chief complaint"
                    />
                  </div>
                  <div className="questionnaire-hint">{t('wizard.chief_complaint_hint', 'Be as specific as possible (e.g. sharp chest pain, chronic knee swelling). You can type or use the microphone button.')}</div>
                  <textarea
                    id="q-chief-complaint"
                    className="form-input"
                    rows={3}
                    placeholder={t('wizard.chief_complaint_placeholder', 'Describe what you are experiencing...')}
                    value={bookReason}
                    onChange={(e) => setBookReason(e.target.value)}
                    required
                  />
                  {triageData && triageData.is_emergency && (
                    <div
                      style={{
                        marginTop: 'var(--space-2)',
                        padding: 'var(--space-3)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid #ef4444',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-2)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>🚨</span>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: '#ef4444', fontWeight: 600 }}>
                          Emergency red flags detected: {(triageData.matched_triggers || triageData.red_flags || []).join(', ')}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => setIsEmergencyModalOpen(true)}
                      >
                        Review Emergency Alert
                      </Button>
                    </div>
                  )}
                </div>

                {/* Q2: Body Area / Department */}
                <div className="questionnaire-group">
                  <label className="questionnaire-label" htmlFor="q-dept">
                    {t('wizard.body_area_label', '2. Which department or body area does this relate to?')}
                  </label>
                  <select
                    id="q-dept"
                    className="form-input"
                    value={bookDepartment}
                    onChange={(e) => setBookDepartment(e.target.value)}
                  >
                    <option value="General">General / Full Body</option>
                    <option value="AYUSH">🌿 AYUSH (Ayurveda & Holistic Medicine)</option>
                    <option value="Cardiology">Cardiology (Heart, Chest & Pulse)</option>
                    <option value="Orthopedics">Orthopedics (Bones, Joints & Spine)</option>
                    <option value="Dermatology">Dermatology (Skin, Hair & Nails)</option>
                    <option value="Neurology">Neurology (Head, Nerves & Brain)</option>
                    <option value="ENT">ENT (Ear, Nose & Throat)</option>
                    <option value="Pediatrics">Pediatrics</option>
                  </select>
                </div>

                {/* Q3: Duration */}
                <div className="questionnaire-group">
                  <label className="questionnaire-label" htmlFor="q-duration">
                    {t('wizard.symptom_duration_label', '3. How long have you experienced these symptoms?')}
                  </label>
                  <select
                    id="q-duration"
                    className="form-input"
                    value={bookDurationText}
                    onChange={(e) => setBookDurationText(e.target.value)}
                  >
                    <option value="Less than 24 hours">Less than 24 hours</option>
                    <option value="1 to 3 days">1 to 3 days</option>
                    <option value="1 to 2 weeks">1 to 2 weeks</option>
                    <option value="3 to 4 weeks">3 to 4 weeks</option>
                    <option value="1 to 3 months">1 to 3 months</option>
                    <option value="Over 6 months (chronic)">Over 6 months (chronic)</option>
                  </select>
                </div>

                {/* Q4: Current Medications */}
                <div className="questionnaire-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                    <label className="questionnaire-label" htmlFor="q-meds" style={{ margin: 0 }}>
                      {t('wizard.current_meds_label', '4. What medications or supplements are you currently taking?')}
                    </label>
                    <VoiceInputButton
                      onTranscript={(text) =>
                        setBookMedications((prev) => (prev ? `${prev}, ${text}` : text))
                      }
                      title="Speak medications"
                    />
                  </div>
                  <div className="questionnaire-hint">{t('wizard.current_meds_hint', 'Include prescription drugs, over-the-counter pills, or vitamins.')}</div>
                  <InputField
                    id="q-meds"
                    label=""
                    placeholder={t('wizard.current_meds_placeholder', "e.g. Lisinopril 10mg, Multivitamin (or 'None')")}
                    value={bookMedications}
                    onChange={(e) => setBookMedications(e.target.value)}
                  />
                </div>

                {/* Specialty Follow-ups */}
                <div className="follow-up-box">
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                    {bookDepartment} Specific Follow-up
                  </div>

                  {bookDepartment === 'Cardiology' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Exertion trigger?</label>
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={followUpAnswers['exertion'] || 'No'}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, exertion: e.target.value }))}
                        >
                          <option value="No">No trigger</option>
                          <option value="Walking/stairs">Worse with stairs/walking</option>
                          <option value="At rest">Occurs even at rest</option>
                        </select>
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Shortness of breath?</label>
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={followUpAnswers['breathlessness'] || 'None'}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, breathlessness: e.target.value }))}
                        >
                          <option value="None">None</option>
                          <option value="Mild">Mild with activity</option>
                          <option value="Severe">Severe / when lying down</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {bookDepartment === 'Orthopedics' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Specific joint or bone?</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          placeholder="e.g. Right knee, Lumbar"
                          value={followUpAnswers['joint'] || ''}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, joint: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Recent fall or injury?</label>
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={followUpAnswers['injury'] || 'No'}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, injury: e.target.value }))}
                        >
                          <option value="No">No recent trauma</option>
                          <option value="Yes - Fall">Recent fall</option>
                          <option value="Yes - Sports">Sports / strain injury</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {bookDepartment === 'Dermatology' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Rash character?</label>
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={followUpAnswers['rash_type'] || 'Itchy'}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, rash_type: e.target.value }))}
                        >
                          <option value="Itchy">Intensely itchy</option>
                          <option value="Painful">Painful / burning</option>
                          <option value="Painless dry patch">Dry patch / peeling</option>
                        </select>
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Spreading?</label>
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={followUpAnswers['spreading'] || 'Localized'}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, spreading: e.target.value }))}
                        >
                          <option value="Localized">Localized to one area</option>
                          <option value="Spreading rapidly">Spreading rapidly</option>
                          <option value="Comes and goes">Intermittent flare-ups</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {bookDepartment !== 'Cardiology' && bookDepartment !== 'Orthopedics' && bookDepartment !== 'Dermatology' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Fever or chills?</label>
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={followUpAnswers['fever'] || 'No'}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, fever: e.target.value }))}
                        >
                          <option value="No">No fever</option>
                          <option value="Low-grade">Low-grade (&lt;100°F)</option>
                          <option value="High fever">High fever (&gt;101°F)</option>
                        </select>
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Impact on sleep/energy?</label>
                        <select
                          className="form-input"
                          style={{ fontSize: '0.8rem' }}
                          value={followUpAnswers['energy'] || 'Normal'}
                          onChange={(e) => setFollowUpAnswers((p) => ({ ...p, energy: e.target.value }))}
                        >
                          <option value="Normal">Normal activity</option>
                          <option value="Fatigued">Notable fatigue</option>
                          <option value="Severe">Unable to perform routine tasks</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setBookingStep(1)}
                  >
                    {t('wizard.back', '← Back')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleGenerateAISummary}
                    id="btn-generate-ai-summary"
                  >
                    <SparklesIcon size={16} />
                    <span>{t('wizard.generate_ai_summary', 'Generate AI Briefing ✨')}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: AI SUMMARY REVIEW & CONFIRMATION */}
        {bookingStep === 3 && (
          <div>
            {summaryLoading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-accent)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
                  <SparklesIcon size={20} className="animate-spin" />
                  <span>{t('wizard.synthesizing', 'Gemini 2.5 Flash is synthesizing your clinical data...')}</span>
                </div>
                <SkeletonLoader variant="ai-summary" />
              </div>
            ) : (
              <div>
                {triageData && triageData.is_emergency && (
                  <div className="emergency-callout-box">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>🚨</span>
                        <span style={{ fontWeight: 800, color: '#ef4444', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Priority Emergency Red-Flag Triage
                        </span>
                      </div>
                      <span className="badge badge--emergency badge--pill" style={{ fontSize: '11px' }}>
                        BYPASSING ROUTINE QUEUE
                      </span>
                    </div>
                    <p style={{ margin: '0 0 8px 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                      {triageData.patient_warning || triageData.rationale || 'Potential acute life-threatening symptoms detected. This consultation will alert the attending doctor and triage staff immediately.'}
                    </p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(triageData.matched_triggers || triageData.red_flags || []).map((rf: string, idx: number) => (
                        <span key={idx} className="badge badge--error" style={{ fontSize: '11px' }}>
                          ⚠ {rf}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`ai-summary-card ${bookDepartment === 'AYUSH' ? 'ai-summary-card--ayush' : ''}`}>
                  <div className="ai-summary-header">
                    <span className={`ai-badge ${bookDepartment === 'AYUSH' ? 'ai-badge--ayush' : ''}`}>
                      <SparklesIcon size={14} /> {bookDepartment === 'AYUSH' ? t('wizard.ayush_clinical_briefing', '🌿 AYUSH Clinical Briefing') : t('wizard.ai_previsit_briefing', 'AI Clinical Pre-Visit Briefing')}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      {bookDepartment === 'AYUSH' ? t('wizard.prakriti_lifestyle_assessment', 'Prakriti & Lifestyle Assessment') : t('wizard.doctor_skim', '10-Second Doctor Skim (< 150 words)')}
                    </span>
                  </div>

                  <div className="ai-summary-content">
                    {generatedSummary}
                  </div>

                  <div className="ai-summary-meta">
                    <span className="ai-meta-tag">
                      🤖 Model: {summaryMeta.provider === 'gemini' ? 'Gemini 2.5 Flash' : 'Clinical Triage AI'}
                    </span>
                    <span className="ai-meta-tag">
                      📁 Scans Synthesized: {summaryMeta.files}
                    </span>
                    <span className="ai-meta-tag">
                      📄 Past Notes: {summaryMeta.records}
                    </span>
                  </div>
                </div>

                {/* Optional summary tweak textarea */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label" htmlFor="edit-summary" style={{ fontSize: '0.78rem' }}>
                    {t('wizard.edit_summary_label', 'Edit or add any last notes for the doctor:')}
                  </label>
                  <textarea
                    id="edit-summary"
                    className="form-input"
                    rows={3}
                    value={generatedSummary}
                    onChange={(e) => setGeneratedSummary(e.target.value)}
                  />
                </div>

                {/* Patient Confirmation Checkbox */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-5)',
                  }}
                >
                  <input
                    type="checkbox"
                    id="confirm-summary-chk"
                    checked={summaryConfirmed}
                    onChange={(e) => setSummaryConfirmed(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-accent)' }}
                  />
                  <label htmlFor="confirm-summary-chk" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                    {t('wizard.confirm_briefing_chk', 'I have reviewed and confirmed this clinical briefing for my doctor.')}
                  </label>
                </div>

                {/* ABDM Explicit Consent Card (Unchecked by default, Health 4.0 Part A) */}
                <div
                  className={`abdm-consent-card ${abdmConsent ? 'abdm-consent-card--checked' : ''}`}
                  style={{ marginBottom: 'var(--space-5)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    <input
                      type="checkbox"
                      id="chk-abdm-consent"
                      checked={abdmConsent}
                      onChange={(e) => setAbdmConsent(e.target.checked)}
                      style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#ff9933', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <label htmlFor="chk-abdm-consent" style={{ display: 'block', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '16px' }}>🇮🇳</span>
                          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                            {t('wizard.abdm_consent_title', 'File Consultation Record to Ayushman Bharat Digital Mission (ABDM)')}
                          </span>
                          <span className="badge badge--abdm" style={{ fontSize: '10px', padding: '1px 6px' }}>ABHA Sandbox</span>
                        </div>
                        <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                          {t('wizard.abdm_consent_desc', 'Authorize Health 4.0 to generate and push a standardized NRCeS FHIR R4 OPConsultRecord bundle to your linked ABDM Personal Health Record (PHR) app (Aarogya Setu / ABHA SBX).')}
                        </p>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
                          {t('wizard.abdm_data_disclosed', 'Data Disclosed: Clinical chief complaint, vitals & symptoms, AI pre-consultation briefing, and prescription summaries.')}
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setBookingStep(2)}
                  >
                    {t('wizard.adjust_questions', '← Adjust Questions')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    loading={bookLoading}
                    onClick={() => handleBookAppointment()}
                    id="btn-confirm-booking-final"
                  >
                    {t('wizard.confirm_book_btn', 'Confirm & Book Appointment')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ==================== MODAL: RED-FLAG EMERGENCY ALERT (Module A) ==================== */}
      <EmergencyAlertModal
        isOpen={isEmergencyModalOpen}
        triageData={triageData}
        onConfirmTriage={() => {
          setIsEmergencyModalOpen(false);
          setBookingStep(3);
          showToast('Priority emergency route confirmed. Consultation flagged for immediate triage alert.', 'info');
        }}
        onCancel={() => {
          setIsEmergencyModalOpen(false);
        }}
      />

      {/* ==================== MODAL: LINK ABHA (Health 4.0 Part A) ==================== */}
      <Modal
        isOpen={isAbhaModalOpen}
        onClose={() => {
          setIsAbhaModalOpen(false);
          setAbhaAuthStep('ID');
          setAbhaError('');
        }}
        title={t('abha.modal_title', 'Link Ayushman Bharat Health Account (ABHA)')}
      >
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>🇮🇳</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{t('abha.modal_subtitle', 'ABDM Sandbox Authentication')}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                {t('abha.modal_gateway', 'National Health Authority (NHA) Gateway')}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            {t('abha.modal_desc', 'Link your ABHA ID to enable direct health record interoperability. Consultation summaries and prescriptions will seamlessly sync with your personal health records.')}
          </p>
        </div>

        {abhaError && (
          <div className="alert alert--error" style={{ marginBottom: 'var(--space-3)' }}>
            <AlertCircleIcon size={16} />
            <span>{abhaError}</span>
          </div>
        )}

        {abhaAuthStep === 'ID' ? (
          <form onSubmit={handleInitAbhaLink}>
            <div className="auth-segmented-tabs" style={{ marginBottom: 'var(--space-3)' }}>
              <button
                type="button"
                className={`auth-segmented-tab ${abhaMode === 'AADHAAR' ? 'auth-segmented-tab--active' : ''}`}
                onClick={() => {
                  setAbhaMode('AADHAAR');
                  setAbhaIdentifier('9999-1234-5678');
                }}
              >
                Aadhaar OTP
              </button>
              <button
                type="button"
                className={`auth-segmented-tab ${abhaMode === 'ABHA_NUMBER' ? 'auth-segmented-tab--active' : ''}`}
                onClick={() => {
                  setAbhaMode('ABHA_NUMBER');
                  setAbhaIdentifier('99-9999-9999-9999');
                }}
              >
                ABHA Number
              </button>
              <button
                type="button"
                className={`auth-segmented-tab ${abhaMode === 'MOBILE' ? 'auth-segmented-tab--active' : ''}`}
                onClick={() => {
                  setAbhaMode('MOBILE');
                  setAbhaIdentifier('9999999999');
                }}
              >
                Mobile OTP
              </button>
            </div>

            <InputField
              id="input-abha-link-id"
              label={
                abhaMode === 'AADHAAR'
                  ? 'Aadhaar Number (12 digits)'
                  : abhaMode === 'ABHA_NUMBER'
                  ? 'ABHA Number (14 digits) or Address'
                  : 'Registered Mobile Number'
              }
              value={abhaIdentifier}
              onChange={(e) => setAbhaIdentifier(e.target.value)}
              helperText="Sandbox Mock: Use 9999-1234-5678 or any test Aadhaar"
              required
            />

            <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAbhaModalOpen(false)}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={abhaLoading}
                id="btn-request-abha-link-otp"
              >
                {t('abha.request_otp', 'Request OTP →')}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyAbhaLink}>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                {t('abha.target_identity', 'Target ABHA Identity')}: <strong>{abhaIdentifier}</strong>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {t('abha.transaction_id', 'Transaction ID')}: <span className="font-mono">{abhaTxnId.slice(0, 16)}...</span>
              </div>
            </div>

            <InputField
              id="input-abha-link-otp"
              label={t('abha.enter_otp', 'Enter 6-Digit OTP')}
              placeholder="123456"
              value={abhaOtp}
              onChange={(e) => setAbhaOtp(e.target.value)}
              helperText={t('abha.sandbox_helper', 'Sandbox Mode: Deterministic test OTP is 123456')}
              required
            />

            <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAbhaAuthStep('ID')}
              >
                {t('wizard.back', '← Back')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={abhaLoading}
                id="btn-verify-abha-link-otp"
              >
                {t('abha.verify_btn', 'Verify & Link ABHA')}
              </Button>
            </div>
          </form>
        )}
      </Modal>


      {/* ==================== MODAL: UPLOAD FILE ==================== */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title={t('files.upload_modal_title', 'Upload Medical Scan or Report')}
      >
        {uploadError && (
          <div className="alert alert--error">
            <AlertCircleIcon size={16} />
            <span>{uploadError}</span>
          </div>
        )}

        <form onSubmit={handleUploadFile}>
          <div className="form-group">
            <label className="form-label" htmlFor="upload-department">
              {t('wizard.dept_label', 'Clinical Department')}
              <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>*</span>
            </label>
            <select
              id="upload-department"
              className="form-input"
              value={uploadDepartment}
              onChange={(e) => setUploadDepartment(e.target.value)}
              required
            >
              <option value="General">{t('departments.General', 'General')}</option>
              <option value="AYUSH">🌿 AYUSH / Ayurveda</option>
              <option value="Orthopedics">{t('departments.Orthopedics', 'Orthopedics')}</option>
              <option value="Cardiology">{t('departments.Cardiology', 'Cardiology')}</option>
              <option value="Dermatology">{t('departments.Dermatology', 'Dermatology')}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upload-category">
              {t('files.category', 'File Category')}
              <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>*</span>
            </label>
            <select
              id="upload-category"
              className="form-input"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              required
            >
              {UPLOAD_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {t(`file_categories.${cat.value}`, cat.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="file-dropzone">
            <input
              type="file"
              id="file-input-field"
              className="file-dropzone__input"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                }
              }}
            />
            <div className="file-dropzone__content">
              <UploadCloudIcon size={36} className="text-accent" />
              {selectedFile ? (
                <div>
                  <p className="file-selected-name">{selectedFile.name}</p>
                  <span className="file-selected-size">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
              ) : (
                <div>
                  <p className="dropzone-prompt">{t('files.dropzone_prompt', 'Click or drag file to upload')}</p>
                  <span className="dropzone-hint">
                    {t('files.dropzone_hint', 'Supports PDF, PNG, JPG, WebP (Max 15MB)')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsUploadModalOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={uploadLoading}
              id="btn-submit-upload"
              disabled={!selectedFile}
            >
              {t('files.upload_submit', 'Upload Document')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================== MODAL: IMAGE PREVIEW / LIGHTBOX ==================== */}
      {previewFile && (
        <Modal
          isOpen={Boolean(previewFile)}
          onClose={() => setPreviewFile(null)}
          title={previewFile.filename}
          maxWidth="700px"
        >
          <div className="file-lightbox">
            <div className="file-lightbox__header-meta">
              <span className="badge badge--dept">{normalizeDept(previewFile.department)}</span>
              <span className="badge badge--small">{normalizeCategory(previewFile.file_category)}</span>
              <span className="file-card__date">
                <ClockIcon size={12} /> {formatDate(previewFile.created_at)}
              </span>
            </div>
            <div className="file-lightbox__img-wrapper">
              <img
                src={apiClient.getFileDownloadUrl(previewFile.file_id)}
                alt={previewFile.filename}
                className="file-lightbox__img"
              />
            </div>
            <div className="file-lightbox__footer">
              <span className="file-lightbox__size">{formatFileSize(previewFile.size_bytes)}</span>
              <a
                href={apiClient.getFileDownloadUrl(previewFile.file_id)}
                download={previewFile.filename}
                className="btn btn--primary btn--sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <DownloadIcon size={14} />
                <span>{t('files.download_scan', 'Download Scan')}</span>
              </a>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================== MODAL: DELETE FILE CONFIRMATION ==================== */}
      <Modal
        isOpen={Boolean(fileToDelete)}
        onClose={() => {
          if (!isDeletingFile) setFileToDelete(null);
        }}
        title={t('files.delete_modal_title', 'Delete Medical Document')}
        maxWidth="480px"
      >
        <div style={{ padding: 'var(--space-2) 0' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
            {t('files.delete_modal_confirm', 'Are you sure you want to delete {{filename}}? This cannot be undone.', { filename: fileToDelete?.filename })}
          </p>
          {fileToDelete && (
            <div
              style={{
                padding: 'var(--space-3)',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                marginBottom: 'var(--space-5)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div><strong>{t('files.department', 'Department')}:</strong> {normalizeDept(fileToDelete.department)}</div>
              <div><strong>{t('files.category', 'Category')}:</strong> {normalizeCategory(fileToDelete.file_category)}</div>
              <div><strong>{t('files.size', 'Size')}:</strong> {formatFileSize(fileToDelete.size_bytes)}</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFileToDelete(null)}
              disabled={isDeletingFile}
              id="btn-cancel-delete-file"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteFile}
              loading={isDeletingFile}
              id="btn-confirm-delete-file"
            >
              {t('common.delete', 'Delete')}
            </Button>
          </div>
        </div>
      </Modal>


      {/* ==================== MODAL: RECORD DETAILS ==================== */}
      <Modal
        isOpen={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord?.title || t('dashboard.medical_records', 'Medical Record')}
        maxWidth="650px"
      >
        {selectedRecord && (
          <div className="record-details-modal">
            <div className="record-details-header">
              <span className="badge badge--info">{selectedRecord.record_type}</span>
              <span className="record-details-date">{formatDate(selectedRecord.created_at)}</span>
            </div>

            <div className="record-description-box">
              <label className="detail-label">{t('records.clinical_details', 'Clinical Details & Notes')}</label>
              <p className="record-description-text">{selectedRecord.description}</p>
            </div>

            {selectedRecord.attachments && selectedRecord.attachments.length > 0 && (
              <div className="record-attachments-section">
                <label className="detail-label">{t('records.attached_files', 'Attached Files')}</label>
                <div className="record-attachments-list">
                  {selectedRecord.attachments.map((att) => (
                    <a
                      key={att.file_id}
                      href={apiClient.getFileDownloadUrl(att.file_id)}
                      target="_blank"
                      rel="noreferrer"
                      className="record-attachment-link"
                      download={att.filename}
                    >
                      <DownloadIcon size={16} />
                      <span>{att.filename}</span>
                      <span className="att-size">({formatFileSize(att.size_bytes)})</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => setSelectedRecord(null)}
              >
                {t('common.close', 'Close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ==================== NOTIFICATIONS DRAWER ==================== */}
      <NotificationDrawer
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={handleMarkNotifRead}
        onMarkAllRead={handleMarkAllNotifsRead}
      />
    </div>
  );
};

export default Dashboard;
