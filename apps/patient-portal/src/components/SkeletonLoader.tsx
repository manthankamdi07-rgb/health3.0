import React from 'react';

export type SkeletonVariant = 'appointments' | 'records' | 'files' | 'stats' | 'ai-summary' | 'card';

interface SkeletonLoaderProps {
  variant: SkeletonVariant;
  count?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ variant, count = 3 }) => {
  const items = Array.from({ length: count });

  if (variant === 'stats') {
    return (
      <div className="skeleton-stats-grid" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-card skeleton-stat-card">
            <div className="skeleton-box skeleton-stat-icon" />
            <div className="skeleton-stat-lines">
              <div className="skeleton-line skeleton-line--title" style={{ width: '40%' }} />
              <div className="skeleton-line skeleton-line--sub" style={{ width: '70%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'appointments') {
    return (
      <div className="skeleton-list" aria-hidden="true">
        {items.map((_, i) => (
          <div key={i} className="skeleton-card skeleton-appointment-card">
            <div className="skeleton-card-top">
              <div style={{ flex: 1 }}>
                <div className="skeleton-line skeleton-line--title" style={{ width: '35%' }} />
                <div className="skeleton-line skeleton-line--sub" style={{ width: '55%' }} />
              </div>
              <div className="skeleton-pill" style={{ width: '80px', height: '24px' }} />
            </div>
            <div className="skeleton-line skeleton-line--sub" style={{ width: '65%', marginTop: '12px' }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'records') {
    return (
      <div className="skeleton-list" aria-hidden="true">
        {items.map((_, i) => (
          <div key={i} className="skeleton-card skeleton-record-card">
            <div className="skeleton-card-top">
              <div className="skeleton-pill" style={{ width: '90px', height: '22px' }} />
              <div className="skeleton-line skeleton-line--sub" style={{ width: '100px' }} />
            </div>
            <div className="skeleton-line skeleton-line--title" style={{ width: '50%', marginTop: '12px' }} />
            <div className="skeleton-line skeleton-line--sub" style={{ width: '90%', marginTop: '8px' }} />
            <div className="skeleton-line skeleton-line--sub" style={{ width: '75%', marginTop: '6px' }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'files') {
    return (
      <div className="skeleton-files-grid" aria-hidden="true">
        {items.map((_, i) => (
          <div key={i} className="skeleton-card skeleton-file-card">
            <div className="skeleton-box skeleton-file-thumb" />
            <div className="skeleton-file-info">
              <div className="skeleton-line skeleton-line--title" style={{ width: '70%' }} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <div className="skeleton-pill" style={{ width: '70px', height: '20px' }} />
                <div className="skeleton-pill" style={{ width: '60px', height: '20px' }} />
              </div>
              <div className="skeleton-line skeleton-line--sub" style={{ width: '45%', marginTop: '12px' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'ai-summary') {
    return (
      <div className="skeleton-card skeleton-ai-card" aria-hidden="true">
        <div className="skeleton-card-top" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="skeleton-box" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
            <div className="skeleton-line skeleton-line--title" style={{ width: '140px' }} />
          </div>
          <div className="skeleton-pill" style={{ width: '90px', height: '20px' }} />
        </div>
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="skeleton-line" style={{ width: '95%' }} />
          <div className="skeleton-line" style={{ width: '88%' }} />
          <div className="skeleton-line" style={{ width: '92%' }} />
          <div className="skeleton-line" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="skeleton-list" aria-hidden="true">
      {items.map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-line skeleton-line--title" style={{ width: '40%' }} />
          <div className="skeleton-line skeleton-line--sub" style={{ width: '80%', marginTop: '8px' }} />
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
