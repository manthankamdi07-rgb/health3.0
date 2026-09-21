/**
 * API client for communicating with the FastAPI backend.
 * Handles JWT authentication, file uploads, and full CRUD endpoints for the Patient Portal.
 */

const API_BASE = '/api';

export interface ApiError {
  message: string;
  detail?: string;
}

export interface UserData {
  userId: number;
  name: string;
  role: string;
  patientId: string;
  email?: string;
  profilePhotoUrl?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: string;
  patient_id: string;
  user_id: number;
  name: string;
  email?: string;
  profile_photo_url?: string | null;
}

export interface PatientProfile {
  patient_id: string;
  name: string;
  age?: number | null;
  blood_group?: string | null;
  allergies?: string | null;
  profile_photo_url?: string | null;
  email: string;
  phone: string;
  abha_number?: string | null;
  abha_address?: string | null;
  abha_status?: string | null;
  created_at?: string;
}

export interface PatientProfileUpdate {
  name?: string;
  age?: number | null;
  blood_group?: string | null;
  allergies?: string | null;
  phone?: string;
  profile_photo_url?: string | null;
}

export interface DoctorPublic {
  id: number;
  user_id: number;
  name: string;
  specialty?: string | null;
  license_number: string;
  profile_photo_url?: string | null;
}

export type AppointmentStatusType = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface PreConsultationQuestionnaire {
  main_problem: string;
  department: string;
  duration: string;
  current_medication?: string;
  follow_ups?: Record<string, string>;
  ayush_assessment?: Record<string, any>;
}

export interface TriageCheckRequest {
  main_problem: string;
  department?: string;
  duration?: string;
  additional_notes?: string;
}

export interface TriageCheckResponse {
  is_emergency: boolean;
  triage_level: 'RED_FLAG' | 'URGENT' | 'ROUTINE';
  primary_concern: string;
  matched_triggers: string[];
  immediate_action: string;
  patient_warning: string;
  recommended_queue: string;
  red_flags?: string[];
  rationale?: string;
  recommended_action?: string;
}

export interface AISummaryResponse {
  summary: string;
  department: string;
  records_count: number;
  files_count: number;
  provider: string;
  is_emergency?: boolean;
  triage_level?: 'RED_FLAG' | 'URGENT' | 'ROUTINE';
  triage_warning?: string | null;
  matched_triggers?: string[];
  red_flags?: string[];
  recommended_action?: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  patient_unique_id: string;
  patient_name: string;
  doctor_id: number;
  doctor_name: string;
  appointment_date: string;
  duration_minutes: number;
  status: AppointmentStatusType;
  department?: string;
  reason?: string | null;
  questionnaire?: string | null;
  ai_summary?: string | null;
  ai_summary_confirmed?: boolean;
  is_emergency?: boolean;
  triage_level?: 'RED_FLAG' | 'URGENT' | 'ROUTINE';
  red_flags?: string | null;
  abdm_consent_granted?: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentBookData {
  doctor_id: number;
  appointment_date: string;
  duration_minutes?: number;
  department?: string;
  reason?: string;
  questionnaire?: string;
  ai_summary?: string;
  ai_summary_confirmed?: boolean;
  is_emergency?: boolean;
  triage_level?: string;
  red_flags?: string;
  abdm_consent_granted?: boolean;
  abdm_scopes?: string[];
}

export interface AbhaAuthInitResponse {
  txn_id: string;
  auth_mode: string;
  masked_identifier: string;
  mock_mode: boolean;
  message: string;
}

export interface AbdmPatientStatus {
  is_linked: boolean;
  abha_number: string | null;
  abha_address: string | null;
  abha_status: string;
  has_active_consent: boolean;
  consent?: {
    id: number;
    granted_at?: string;
    scopes: string;
  } | null;
}


export interface FileAttachment {
  file_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export interface MedicationEntity {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface LabResultEntity {
  test_name: string;
  value: string;
  unit?: string;
  reference_range?: string;
  is_abnormal?: boolean;
}

export interface DiagnosisEntity {
  condition: string;
  status?: string;
  notes?: string;
}

export interface StructuredClinicalEntities {
  document_type?: string;
  document_date?: string;
  healthcare_provider?: string;
  medications?: MedicationEntity[];
  lab_results?: LabResultEntity[];
  diagnoses?: DiagnosisEntity[];
  clinical_advice?: string[];
}

export interface DocumentDigitizeResponse {
  file_id: string;
  filename: string;
  ocr_status: string;
  extracted_text: string;
  entities: StructuredClinicalEntities;
}

export interface MedicalRecord {
  id: string;
  patient_unique_id: string;
  doctor_id: number;
  doctor_name?: string;
  title: string;
  record_type: string;
  description: string;
  attachments?: FileAttachment[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

export type FileCategoryType =
  | 'LAB_REPORT'
  | 'PRESCRIPTION'
  | 'DISCHARGE_SUMMARY'
  | 'SCAN_XRAY'
  | 'MRI'
  | 'OTHER';

export interface MedicalFile {
  id?: number;
  file_id: string;
  patient_unique_id: string;
  uploader_id: number;
  filename: string;
  file_category: string;
  department: string;
  content_type: string;
  size_bytes: number;
  download_url?: string;
  created_at: string;
  extracted_text?: string | null;
  structured_entities?: StructuredClinicalEntities | null;
  ocr_status?: string;
}



export type AccessRequestStatusType = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';

export interface AccessRequest {
  id: number;
  doctor_id: number;
  patient_id: number;
  patient_unique_id: string;
  status: AccessRequestStatusType;
  reason?: string | null;
  requested_at: string;
  responded_at?: string | null;
  expires_at?: string | null;
}

export interface InAppNotification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  link?: string | null;
  created_at: string;
}

export interface NotificationSummary {
  unread_count: number;
  total_count: number;
  notifications: InAppNotification[];
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('health_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('health_token', token);
    } else {
      localStorage.removeItem('health_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('health_token');
    }
    return this.token;
  }

  logout() {
    this.setToken(null);
    localStorage.removeItem('health_user');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        const rawDetail = errorData.detail ?? errorData.message;
        if (typeof rawDetail === 'string') {
          errorMessage = rawDetail;
        } else if (Array.isArray(rawDetail)) {
          errorMessage = rawDetail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        } else if (rawDetail && typeof rawDetail === 'object') {
          errorMessage = JSON.stringify(rawDetail);
        } else if (rawDetail) {
          errorMessage = String(rawDetail);
        }
      } catch {
        // Fallback to generic message
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // --- Auth Endpoints ---

  async login(email: string, password: string): Promise<TokenResponse> {
    const res = await this.request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.access_token);
    return res;
  }

  async sendOtp(email: string) {
    return this.request<{ message: string; detail?: string }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyOtp(email: string, otpCode: string) {
    return this.request<{ verified: boolean; message: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp_code: otpCode }),
    });
  }

  async registerPatient(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    otp_code: string;
    age?: number;
    blood_group?: string;
    allergies?: string;
  }): Promise<TokenResponse> {
    const res = await this.request<TokenResponse>('/auth/register/patient', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.access_token);
    return res;
  }

  // --- Profile Endpoints ---

  async getProfile(): Promise<PatientProfile> {
    return this.request<PatientProfile>('/profile/me');
  }

  async updateProfile(data: PatientProfileUpdate): Promise<PatientProfile> {
    return this.request<PatientProfile>('/profile/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadProfilePhoto(file: File): Promise<{ profile_photo_url: string }> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(`${API_BASE}/profile/photo`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      let errDetail = `Upload failed with status ${res.status}`;
      try {
        const json = await res.json();
        errDetail = json.detail || json.message || errDetail;
      } catch {
        // use fallback
      }
      throw new Error(errDetail);
    }

    return res.json();
  }

  // --- Doctor Directory ---

  async getApprovedDoctors(): Promise<DoctorPublic[]> {
    return this.request<DoctorPublic[]>('/doctors');
  }

  // --- Appointments Endpoints ---

  async getMyAppointments(): Promise<Appointment[]> {
    return this.request<Appointment[]>('/appointments/patient/my-appointments');
  }

  async generatePreConsultationSummary(
    questionnaire: PreConsultationQuestionnaire,
    doctorId?: number
  ): Promise<AISummaryResponse> {
    return this.request<AISummaryResponse>('/appointments/ai-summary/generate', {
      method: 'POST',
      body: JSON.stringify({
        doctor_id: doctorId,
        questionnaire,
      }),
    });
  }

  async bookAppointment(data: AppointmentBookData): Promise<Appointment> {
    return this.request<Appointment>('/appointments/book', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelAppointment(appointmentId: number, notes?: string): Promise<Appointment> {
    return this.request<Appointment>(`/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'CANCELLED',
        notes: notes || 'Cancelled by patient',
      }),
    });
  }

  async getDoctorAppointments(
    startDate?: string,
    endDate?: string,
    statusFilter?: string
  ): Promise<Appointment[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (statusFilter && statusFilter !== 'ALL') params.append('status', statusFilter);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<Appointment[]>(`/appointments/doctor/calendar${query}`);
  }

  async updateAppointmentStatus(
    appointmentId: number,
    status: AppointmentStatusType,
    notes?: string
  ): Promise<Appointment> {
    return this.request<Appointment>(`/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        notes,
      }),
    });
  }

  async getDoctorPatientHistory(
    patientUniqueId: string
  ): Promise<{
    patient: PatientProfile;
    records: MedicalRecord[];
    files: MedicalFile[];
  }> {
    return this.request<{
      patient: PatientProfile;
      records: MedicalRecord[];
      files: MedicalFile[];
    }>(`/appointments/doctor/patient-history/${patientUniqueId}`);
  }


  // --- Medical Records Endpoints (MongoDB) ---

  async getPatientRecords(patientUniqueId: string): Promise<MedicalRecord[]> {
    return this.request<MedicalRecord[]>(`/records/${patientUniqueId}`);
  }

  // --- Files & Scans Endpoints ---
 
  async getPatientFiles(
    patientUniqueId: string,
    category?: string,
    department?: string
  ): Promise<MedicalFile[]> {
    const params = new URLSearchParams();
    if (category && category !== 'ALL') {
      params.append('file_category', category.toLowerCase());
    }
    if (department && department !== 'ALL') {
      params.append('department', department);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<MedicalFile[]>(`/files/patient/${patientUniqueId}${query}`);
  }

  async uploadFile(
    patientUniqueId: string,
    file: File,
    category: string,
    department: string = 'General'
  ): Promise<MedicalFile> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_category', category.toLowerCase());
    formData.append('department', department);

    const headers: HeadersInit = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(`${API_BASE}/files/upload/${patientUniqueId}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `Upload failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        // Fallback
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // --- Triage Red-Flag Detection ---

  async checkTriageRedFlags(
    dataOrProblem: TriageCheckRequest | string,
    additionalNotes?: string
  ): Promise<TriageCheckResponse> {
    const payload = typeof dataOrProblem === 'string'
      ? { main_problem: dataOrProblem, additional_notes: additionalNotes }
      : dataOrProblem;
    const res = await this.request<TriageCheckResponse>('/appointments/triage-check', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.red_flags && res.matched_triggers) {
      res.red_flags = res.matched_triggers;
    }
    if (!res.rationale && res.patient_warning) {
      res.rationale = res.patient_warning;
    }
    return res;
  }

  // --- Document Digitization & Intelligence (Module B) ---

  async digitizeAndUploadFile(
    patientUniqueId: string,
    file: File,
    category: string = 'OTHER',
    department: string = 'General'
  ): Promise<MedicalFile> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_category', category.toLowerCase());
    formData.append('department', department);

    const headers: HeadersInit = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(`${API_BASE}/files/digitize-and-upload/${patientUniqueId}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `Digitization upload failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        // Fallback
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async digitizeFile(fileId: string): Promise<DocumentDigitizeResponse> {
    return this.request<DocumentDigitizeResponse>(`/files/${fileId}/digitize`, {
      method: 'POST',
    });
  }

  async getFileEntities(fileId: string): Promise<StructuredClinicalEntities> {
    return this.request<StructuredClinicalEntities>(`/files/${fileId}/entities`);
  }

  async updateFileEntities(fileId: string, entities: StructuredClinicalEntities): Promise<StructuredClinicalEntities> {
    return this.request<StructuredClinicalEntities>(`/files/${fileId}/entities`, {
      method: 'PUT',
      body: JSON.stringify(entities),
    });
  }

  getFileDownloadUrl(fileId: string): string {
    return `${API_BASE}/files/${fileId}`;
  }

  async deleteFile(fileId: string): Promise<{ message: string; file_id: string }> {
    return this.request<{ message: string; file_id: string }>(`/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  // --- Doctor Access Requests ---

  async getPendingAccessRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('/access/pending');
  }

  async respondAccessRequest(requestId: number, approve: boolean): Promise<AccessRequest> {
    return this.request<AccessRequest>(`/access/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    });
  }

  // --- Notifications Endpoints ---

  async getNotifications(unreadOnly = false): Promise<NotificationSummary> {
    const query = unreadOnly ? '?unread_only=true' : '';
    return this.request<NotificationSummary>(`/notifications${query}`);
  }

  async markNotificationRead(notificationId: number): Promise<InAppNotification> {
    return this.request<InAppNotification>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  }

  async markAllNotificationsRead(): Promise<{ message: string; updated_count: number }> {
    return this.request<{ message: string; updated_count: number }>('/notifications/mark-all-read', {
      method: 'POST',
    });
  }

  // --- ABDM / ABHA Endpoints (Health 4.0 Part A) ---

  async initAbhaAuth(auth_mode: string, identifier: string): Promise<AbhaAuthInitResponse> {
    return this.request<AbhaAuthInitResponse>('/abdm/auth/init', {
      method: 'POST',
      body: JSON.stringify({ auth_mode, identifier }),
    });
  }

  async verifyAbhaAuth(txn_id: string, otp: string): Promise<{ status: string; message: string; abha_number: string; abha_address: string; abha_status: string }> {
    return this.request('/abdm/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ txn_id, otp }),
    });
  }

  async loginWithAbha(txn_id: string, otp: string): Promise<TokenResponse & { abha_number: string; abha_address: string }> {
    const res = await this.request<TokenResponse & { abha_number: string; abha_address: string }>('/abdm/auth/login', {
      method: 'POST',
      body: JSON.stringify({ txn_id, otp }),
    });
    this.setToken(res.access_token);
    return res;
  }

  async submitAbdmConsent(appointment_id?: number, scopes?: string[], is_granted = true): Promise<{ status: string; consent_id: number; is_granted: boolean; scopes: string[] }> {
    return this.request('/abdm/consent', {
      method: 'POST',
      body: JSON.stringify({ appointment_id, scopes, is_granted }),
    });
  }

  async getAbdmStatus(appointment_id?: number): Promise<AbdmPatientStatus> {
    const query = appointment_id ? `?appointment_id=${appointment_id}` : '';
    return this.request<AbdmPatientStatus>(`/abdm/status${query}`);
  }

  async unlinkAbha(): Promise<{ status: string; message: string; abha_status: string }> {
    return this.request('/abdm/unlink', {
      method: 'POST',
    });
  }

  // --- System Health ---

  async healthCheck() {
    return this.request<{ status: string }>('/health');
  }
}

export const apiClient = new ApiClient();
export default apiClient;
