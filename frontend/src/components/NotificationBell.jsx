import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";

function NotificationBell() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Polling interval for real-time feel (check every 5 seconds)
  const pollInterval = 5000;

  useEffect(() => {
    loadNotifications();
    
    // Set up polling
    const interval = setInterval(() => {
      checkUnreadCount();
    }, pollInterval);

    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  };

  const checkUnreadCount = async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error("Failed to check notifications:", error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAsUnread = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/unread`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, read: false } : n))
      );
      setUnreadCount(unreadCount + 1);
    } catch (error) {
      console.error("Failed to mark notification as unread:", error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      const wasUnread = !notifications.find((n) => n._id === notificationId)?.read;
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
      if (wasUnread) {
        setUnreadCount(Math.max(0, unreadCount - 1));
      }
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put("/notifications/mark-all/read");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const getIconEmoji = (icon) => {
    const icons = {
      bell: "🔔",
      briefcase: "💼",
      check: "✓",
      star: "⭐",
      alert: "⚠️",
      info: "ℹ️"
    };
    return icons[icon] || "🔔";
  };

  const getBackgroundClass = (type, color) => {
    const colorMap = {
      accent: "notification-accent",
      ok: "notification-ok",
      bad: "notification-bad",
      warn: "notification-warn",
      muted: "notification-muted"
    };
    return colorMap[color] || "notification-accent";
  };

  return (
    <div className="notification-container">
      <button
        className={`notification-bell ${expanded ? "expanded" : ""}`}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) {
            loadNotifications();
          }
        }}
        title={
          unreadCount > 0
            ? t("notifications.newNotifications", { count: unreadCount })
            : t("notifications.title")
        }
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {expanded && (
        <div className="notification-dropdown">
          {notifications && notifications.length > 0 ? (
            <>
              <div className="notification-header">
                <h4>{t("notifications.title")}</h4>
                {unreadCount > 0 && (
                  <button
                    className="mark-all-read-btn"
                    onClick={markAllAsRead}
                    title={t("notifications.markAllRead")}
                  >
                    ✓ {t("notifications.markAllRead")}
                  </button>
                )}
              </div>

              <div className="notification-list">
                {notifications.map((notification) => (
                  <div
                    key={notification._id}
                    className={`notification-item ${!notification.read ? "unread" : ""}`}
                  >
                    <div
                      className={`notification-content ${getBackgroundClass(
                        notification.type,
                        notification.color
                      )}`}
                    >
                      <div className="notification-icon">
                        {getIconEmoji(notification.icon)}
                      </div>

                      <div className="notification-body">
                        <div className="notification-title">{notification.title}</div>
                        <div className="notification-message">{notification.message}</div>
                        <div className="notification-time">
                          {new Date(notification.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit"
                          })}
                        </div>
                      </div>

                      <div className="notification-actions">
                        {notification.actionUrl && (
                          <a
                            href={notification.actionUrl}
                            className="notification-link"
                            onClick={() => setExpanded(false)}
                            title={t("notifications.goToItem")}
                          >
                            →
                          </a>
                        )}

                        {!notification.read ? (
                          <button
                            className="notification-action-btn"
                            onClick={() => markAsRead(notification._id)}
                            title={t("notifications.markAsRead")}
                          >
                            ○
                          </button>
                        ) : (
                          <button
                            className="notification-action-btn"
                            onClick={() => markAsUnread(notification._id)}
                            title={t("notifications.markAsUnread")}
                          >
                            ◉
                          </button>
                        )}

                        <button
                          className="notification-delete-btn"
                          onClick={() => deleteNotification(notification._id)}
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="notification-footer">
                <small className="muted">{t("notifications.totalCount", { count: notifications.length })}</small>
              </div>
            </>
          ) : (
            <div className="notification-empty">
              <p className="muted">{t("notifications.noNotifications")}</p>
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                {t("notifications.noNotificationsSub")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
