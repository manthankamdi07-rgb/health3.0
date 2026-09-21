import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  apiClient,
  MedicalFile,
  StructuredClinicalEntities,
  DocumentDigitizeResponse,
} from '../api/client';
import {
  SparklesIcon,
  CheckIcon,
  DownloadIcon,
} from './Icons';
import Button from './Button';

interface DocumentIntelligenceViewerProps {
  patientUniqueId: string;
  files: MedicalFile[];
  onFileUploaded: (newFile: MedicalFile) => void;
  isDoctorView?: boolean;
}

export const DocumentIntelligenceViewer: React.FC<DocumentIntelligenceViewerProps> = ({
  patientUniqueId,
  files,
  onFileUploaded,
  isDoctorView = false,
}) => {
  const { t } = useTranslation();

  // Upload & Digitize state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docCategory, setDocCategory] = useState<string>('prescription');
  const [docDepartment, setDocDepartment] = useState<string>('General');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStage, setProcessingStage] = useState<string>('');

  // Active inspected document state
  const [activeFileId, setActiveFileId] = useState<string | null>(files[0]?.file_id || null);
  const [activeEntities, setActiveEntities] = useState<StructuredClinicalEntities | null>(
    files[0]?.structured_entities || null
  );
  const [activeOcrText, setActiveOcrText] = useState<string>(files[0]?.extracted_text || '');
  const [activeTab, setActiveTab] = useState<'entities' | 'ocr'>('entities');
  const [isRedigitizing, setIsRedigitizing] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setSelectedFile(f);
      // Auto-detect category from filename
      const fn = f.name.toLowerCase();
      if (fn.includes('lab') || fn.includes('blood') || fn.includes('report') || fn.includes('test')) {
        setDocCategory('lab_report');
      } else if (fn.includes('presc') || fn.includes('rx') || fn.includes('med')) {
        setDocCategory('prescription');
      } else if (fn.includes('discharge') || fn.includes('summary')) {
        setDocCategory('discharge_summary');
      }
    }
  };

  const handleUploadAndDigitize = async () => {
    if (!selectedFile) return;

    try {
      setIsProcessing(true);
      setProcessingStage('Uploading document to secure storage...');

      setTimeout(() => {
        setProcessingStage('Running Multilingual Document OCR (English, Hindi, Marathi)...');
      }, 700);

      setTimeout(() => {
        setProcessingStage('Extracting structured clinical entities (Medications, Labs, Diagnoses)...');
      }, 1500);

      const uploaded = await apiClient.digitizeAndUploadFile(
        patientUniqueId,
        selectedFile,
        docCategory,
        docDepartment
      );

      onFileUploaded(uploaded);
      setActiveFileId(uploaded.file_id);
      setActiveEntities(uploaded.structured_entities || null);
      setActiveOcrText(uploaded.extracted_text || '');
      setSelectedFile(null);
      showToast('Document successfully digitized and structured!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Digitization failed', 'error');
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const handleSelectExistingFile = (file: MedicalFile) => {
    setActiveFileId(file.file_id);
    setActiveEntities(file.structured_entities || null);
    setActiveOcrText(file.extracted_text || '');
  };

  const handleRedigitize = async (fileId: string) => {
    try {
      setIsRedigitizing(true);
      const res: DocumentDigitizeResponse = await apiClient.digitizeFile(fileId);
      setActiveEntities(res.entities);
      setActiveOcrText(res.extracted_text);
      showToast('Document re-digitized successfully!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Re-digitization failed', 'error');
    } finally {
      setIsRedigitizing(false);
    }
  };

  const currentFile = files.find((f) => f.file_id === activeFileId) || files[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '10px',
            background: toast.type === 'success' ? '#16a34a' : '#dc2626',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.88rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Module B Header & Description */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(13, 148, 136, 0.08) 100%)',
          border: '1px solid rgba(2, 132, 199, 0.25)',
          borderRadius: '14px',
          padding: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
            }}
          >
            <SparklesIcon size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
              {t('digitization.title', 'Module B — Medical Document Digitization & Intelligence')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--color-text-secondary, #475569)' }}>
              {t(
                'digitization.subtitle',
                'Upload prior prescriptions, lab reports, and discharge summaries. AI extracts and structures clinical entities automatically.'
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isDoctorView && (
            <span
              style={{
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#6366f1',
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '999px',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              Doctor Review Mode
            </span>
          )}
          <span
            style={{
              background: 'rgba(2, 132, 199, 0.12)',
              color: '#0284c7',
              fontSize: '0.74rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Multilingual OCR & Clinical AI
          </span>
        </div>
      </div>

      {/* Upload & Scanning Input Section (if Patient or Doctor uploading) */}
      <div
        style={{
          background: 'var(--color-bg-card, #ffffff)',
          border: '1px solid var(--color-border, rgba(148, 163, 184, 0.3))',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
        }}
      >
        <h4 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>
          {t('digitization.upload_new', 'Scan or Upload Document for AI Digitization')}
        </h4>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 250px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '6px' }}>
              Select Document (PDF, PNG, JPG, Scanned Image)
            </label>
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleFileSelect}
              id="input-document-digitize-file"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'var(--color-bg-secondary, #f8fafc)',
                fontSize: '0.85rem',
                color: 'var(--color-text-primary, #0f172a)',
              }}
            />
          </div>

          <div style={{ flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '6px' }}>
              Document Type
            </label>
            <select
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value)}
              id="select-document-digitize-type"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'var(--color-bg-secondary, #f8fafc)',
                fontSize: '0.85rem',
                color: 'var(--color-text-primary, #0f172a)',
              }}
            >
              <option value="prescription">Prescription</option>
              <option value="lab_report">Lab Report</option>
              <option value="discharge_summary">Discharge Summary</option>
              <option value="scan">Diagnostic Scan / X-Ray</option>
              <option value="other">Other Medical Record</option>
            </select>
          </div>

          <div style={{ flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary, #475569)', marginBottom: '6px' }}>
              Department
            </label>
            <select
              value={docDepartment}
              onChange={(e) => setDocDepartment(e.target.value)}
              id="select-document-digitize-dept"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'var(--color-bg-secondary, #f8fafc)',
                fontSize: '0.85rem',
                color: 'var(--color-text-primary, #0f172a)',
              }}
            >
              <option value="General">General</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Orthopedics">Orthopedics</option>
              <option value="Neurology">Neurology</option>
              <option value="Dermatology">Dermatology</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="AYUSH">AYUSH (Ayurveda)</option>
            </select>
          </div>

          <div>
            <Button
              variant="primary"
              onClick={handleUploadAndDigitize}
              disabled={!selectedFile || isProcessing}
              id="btn-trigger-document-digitization"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
              }}
            >
              <SparklesIcon size={16} />
              {isProcessing ? t('digitization.processing', 'Digitizing...') : t('digitization.digitize_btn', 'AI Digitize & Extract')}
            </Button>
          </div>
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'rgba(2, 132, 199, 0.08)',
              border: '1px dashed #0284c7',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                border: '3px solid rgba(2, 132, 199, 0.2)',
                borderTopColor: '#0284c7',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0284c7' }}>
              {processingStage}
            </span>
          </div>
        )}
      </div>

      {/* Main Split Interface: Left File Picker, Right Digitized Intelligence Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: '20px' }}>
        {/* Left: Document List */}
        <div
          style={{
            background: 'var(--color-bg-card, #ffffff)',
            border: '1px solid var(--color-border, rgba(148, 163, 184, 0.3))',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '680px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)', paddingBottom: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}>
            Patient Documents ({files.length})
          </div>

          {files.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)', fontSize: '0.82rem' }}>
              No documents uploaded yet. Upload a prescription or report above to start.
            </div>
          ) : (
            files.map((f) => {
              const isSelected = f.file_id === activeFileId;
              const hasEntities = Boolean(f.structured_entities);
              return (
                <div
                  key={f.file_id}
                  onClick={() => handleSelectExistingFile(f)}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid #0284c7' : '1px solid rgba(148, 163, 184, 0.25)',
                    background: isSelected ? 'rgba(2, 132, 199, 0.08)' : 'var(--color-bg-secondary, #f8fafc)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: f.file_category.includes('presc') ? '#0d9488' : f.file_category.includes('lab') ? '#0284c7' : '#d97706',
                      }}
                    >
                      {f.file_category.replace('_', ' ')}
                    </span>
                    {hasEntities && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <CheckIcon size={12} /> Digitized
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: isSelected ? 700 : 600,
                      color: 'var(--color-text-primary, #0f172a)',
                      margin: '4px 0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {f.filename}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--color-text-muted, #64748b)' }}>
                    <span>{f.department || 'General'}</span>
                    <span>{new Date(f.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Structured Clinical Entities Viewer */}
        <div
          style={{
            background: 'var(--color-bg-card, #ffffff)',
            border: '1px solid var(--color-border, rgba(148, 163, 184, 0.3))',
            borderRadius: '14px',
            padding: '20px',
            minHeight: '480px',
          }}
        >
          {currentFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Header with Document Metadata & Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  paddingBottom: '14px',
                  borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
                      {currentFile.filename}
                    </h3>
                    <span
                      style={{
                        background: 'rgba(2, 132, 199, 0.12)',
                        color: '#0284c7',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {currentFile.file_category.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
                    Department: {currentFile.department || 'General'} • Uploaded:{' '}
                    {new Date(currentFile.created_at).toLocaleString()}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a
                    href={apiClient.getFileDownloadUrl(currentFile.file_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      background: 'transparent',
                      color: 'var(--color-text-primary, #0f172a)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <DownloadIcon size={14} /> View Raw File
                  </a>

                  <button
                    type="button"
                    onClick={() => handleRedigitize(currentFile.file_id)}
                    disabled={isRedigitizing}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <SparklesIcon size={14} />
                    {isRedigitizing ? 'Processing...' : 'Re-Run AI OCR'}
                  </button>
                </div>
              </div>

              {/* View Switcher: Structured Entities vs Full OCR Transcription */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('entities')}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: activeTab === 'entities' ? '2px solid #0284c7' : '2px solid transparent',
                    color: activeTab === 'entities' ? '#0284c7' : 'var(--color-text-muted, #64748b)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  ✨ Structured Clinical Entities
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ocr')}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: activeTab === 'ocr' ? '2px solid #0284c7' : '2px solid transparent',
                    color: activeTab === 'ocr' ? '#0284c7' : 'var(--color-text-muted, #64748b)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  📄 Full OCR Transcription
                </button>
              </div>

              {/* TAB 1: Structured Entities */}
              {activeTab === 'entities' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Entity Metadata Badges */}
                  {activeEntities && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {activeEntities.document_date && (
                        <div style={{ background: 'rgba(2, 132, 199, 0.08)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#0284c7', fontWeight: 600 }}>
                          📅 Date: {activeEntities.document_date}
                        </div>
                      )}
                      {activeEntities.healthcare_provider && (
                        <div style={{ background: 'rgba(13, 148, 136, 0.08)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#0d9488', fontWeight: 600 }}>
                          🏥 Provider: {activeEntities.healthcare_provider}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 1. Medications Section */}
                  {activeEntities?.medications && activeEntities.medications.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        💊 Prescribed Medications ({activeEntities.medications.length})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {activeEntities.medications.map((med, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: 'var(--color-bg-secondary, #f8fafc)',
                              border: '1px solid rgba(148, 163, 184, 0.3)',
                              borderRadius: '10px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text-primary, #0f172a)' }}>
                                {med.name}
                              </span>
                              {med.dosage && (
                                <span style={{ background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                                  {med.dosage}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                              {med.frequency && <span>Frequency: <strong>{med.frequency}</strong></span>}
                              {med.duration && <span>• Duration: <strong>{med.duration}</strong></span>}
                            </div>

                            {med.instructions && (
                              <div style={{ fontSize: '0.75rem', color: '#0d9488', background: 'rgba(13, 148, 136, 0.08)', padding: '4px 8px', borderRadius: '6px' }}>
                                ℹ️ {med.instructions}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Lab Results Section */}
                  {activeEntities?.lab_results && activeEntities.lab_results.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🧪 Lab Test Parameters ({activeEntities.lab_results.length})
                      </div>
                      <div style={{ overflowX: 'auto', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ background: 'var(--color-bg-secondary, #f1f5f9)', textAlign: 'left' }}>
                              <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>Test Name</th>
                              <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>Observed Value</th>
                              <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>Unit</th>
                              <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>Reference Range</th>
                              <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeEntities.lab_results.map((lab, idx) => (
                              <tr key={idx} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>{lab.test_name}</td>
                                <td style={{ padding: '10px 14px', fontWeight: 700, color: lab.is_abnormal ? '#dc2626' : 'inherit' }}>{lab.value}</td>
                                <td style={{ padding: '10px 14px', color: 'var(--color-text-muted, #64748b)' }}>{lab.unit || '-'}</td>
                                <td style={{ padding: '10px 14px', color: 'var(--color-text-muted, #64748b)' }}>{lab.reference_range || '-'}</td>
                                <td style={{ padding: '10px 14px' }}>
                                  <span
                                    style={{
                                      background: lab.is_abnormal ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                      color: lab.is_abnormal ? '#dc2626' : '#16a34a',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    {lab.is_abnormal ? 'ABNORMAL' : 'NORMAL'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 3. Diagnoses Section */}
                  {activeEntities?.diagnoses && activeEntities.diagnoses.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)', marginBottom: '8px' }}>
                        📋 Diagnoses & Findings
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {activeEntities.diagnoses.map((diag, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: 'rgba(2, 132, 199, 0.08)',
                              border: '1px solid rgba(2, 132, 199, 0.25)',
                              color: 'var(--color-text-primary, #0f172a)',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                            }}
                          >
                            🏷️ {diag.condition}
                            {diag.status && <span style={{ opacity: 0.7, fontSize: '0.72rem', marginLeft: '6px' }}>({diag.status})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Clinical Advice Section */}
                  {activeEntities?.clinical_advice && activeEntities.clinical_advice.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary, #0f172a)', marginBottom: '8px' }}>
                        💡 Clinical Advice & Directives
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--color-text-secondary, #334155)', lineHeight: 1.6 }}>
                        {activeEntities.clinical_advice.map((adv, idx) => (
                          <li key={idx}>{adv}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!activeEntities?.medications?.length &&
                    !activeEntities?.lab_results?.length &&
                    !activeEntities?.diagnoses?.length && (
                      <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>
                          No clinical entities extracted yet. Click <strong>"Re-Run AI OCR"</strong> above to extract entities from this document.
                        </p>
                      </div>
                    )}
                </div>
              )}

              {/* TAB 2: Full OCR Transcription */}
              {activeTab === 'ocr' && (
                <div>
                  <pre
                    style={{
                      background: 'var(--color-bg-secondary, #f8fafc)',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      borderRadius: '10px',
                      padding: '16px',
                      fontSize: '0.82rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'var(--color-text-primary, #0f172a)',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    {activeOcrText || 'No OCR transcript available. Click "Re-Run AI OCR" to transcribe.'}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
              Select a document from the left list or upload a new scan to view AI-extracted clinical intelligence.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentIntelligenceViewer;
