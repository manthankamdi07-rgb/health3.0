import React from 'react';
import { useTranslation } from 'react-i18next';
import { InAppNotification } from '../api/client';
import { BellIcon, CheckIcon, ClockIcon, XIcon } from './Icons';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: InAppNotification[];
  unreadCount: number;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const formatTimestamp = (dateStr: string) => {
    try {
      const dt = new Date(dateStr);
      return dt.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="notif-drawer-backdrop" onClick={onClose}>
      <div
        className="notif-drawer"
        onClick={(e) => e.stopPropagation()}
        role="region"
        aria-label="Notification center"
      >
        <div className="notif-drawer-header">
          <div className="notif-drawer-title">
            <BellIcon size={18} className="text-accent" />
            <span>{t('notifications.title', 'Notifications')}</span>
            {unreadCount > 0 && (
              <span className="notif-badge-pill">{unreadCount} {t('notifications.new', 'new')}</span>
            )}
          </div>
          <div className="notif-drawer-actions">
            {unreadCount > 0 && (
              <button
                className="notif-mark-all-btn"
                onClick={onMarkAllRead}
                id="btn-notif-mark-all"
              >
                {t('notifications.mark_all_read', 'Mark all read')}
              </button>
            )}
            <button
              className="notif-close-btn"
              onClick={onClose}
              id="btn-notif-close"
              aria-label="Close notifications"
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        <div className="notif-list">
          {notifications.length === 0 ? (
            <div className="notif-empty">
              <BellIcon size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>{t('notifications.no_notifications', 'No notifications yet')}</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`notif-item ${!notif.is_read ? 'notif-item--unread' : ''}`}
                onClick={() => !notif.is_read && onMarkRead(notif.id)}
              >
                <div className="notif-item-header">
                  <span className="notif-item-title">{notif.title}</span>
                  <span className="notif-item-time">
                    <ClockIcon size={12} style={{ marginRight: '4px' }} />
                    {formatTimestamp(notif.created_at)}
                  </span>
                </div>
                <p className="notif-item-message">{notif.message}</p>
                <div className="notif-item-footer">
                  <span className="notif-type-tag">{notif.notification_type}</span>
                  {!notif.is_read ? (
                    <button
                      className="notif-mark-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkRead(notif.id);
                      }}
                      title={t('notifications.mark_read', 'Mark read')}
                    >
                      <CheckIcon size={14} />
                      {t('notifications.mark_read', 'Mark read')}
                    </button>
                  ) : (
                    <span className="notif-read-status">{t('notifications.read', 'Read')}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationDrawer;
