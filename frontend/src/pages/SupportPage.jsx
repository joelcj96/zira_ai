import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

function SupportPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState(null);
  const [deletingRequestId, setDeletingRequestId] = useState("");

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const { data } = await api.get("/support/requests");
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to load support request history.", "danger");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const deleteSupportRequest = async (requestId) => {
    try {
      setDeletingRequestId(requestId);
      await api.delete(`/support/requests/${requestId}`);
      setHistory((previous) => previous.filter((item) => item.id !== requestId));
      showToast(
        t("support.deleteSuccess", {}, "Support request deleted successfully."),
        "success"
      );
      setPendingDeleteRequest(null);
    } catch (error) {
      showToast(
        error.response?.data?.message || t("support.deleteFailed", {}, "Could not delete this support request right now."),
        "danger"
      );
    } finally {
      setDeletingRequestId("");
    }
  };

  const submitSupportRequest = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      await api.post("/support/requests", {
        subject,
        message
      });
      showToast(
        t(
          "support.reportSentSuccess",
          {},
          "Report sent successfully. Your request has been submitted and our team will review it shortly."
        ),
        "success"
      );
      setSubject("");
      setMessage("");
      await loadHistory();
    } catch (error) {
      showToast(error.response?.data?.message || t("support.failed", {}, "Could not submit your request right now. Please try again."), "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="support-page-layout">
      <aside className="panel support-page-sidebar">
        <h3>{t("support.title", {}, "Contact Support")}</h3>
        <p className="muted">
          {t(
            "support.helpText",
            {},
            "Submit issues about jobs, proposals, billing, or account access. We keep all requests in your timeline below."
          )}
        </p>
        <ul className="support-sidebar-list">
          <li>{t("support.tip1", {}, "Use a clear subject")}</li>
          <li>{t("support.tip2", {}, "Add steps to reproduce")}</li>
          <li>{t("support.tip3", {}, "Include expected vs actual result")}</li>
        </ul>
      </aside>

      <section className="panel support-page-main">
        <h3>{t("support.submitIssue", {}, "Submit an Issue")}</h3>
        <form className="support-form" onSubmit={submitSupportRequest}>
          <div>
            <label htmlFor="support-subject">{t("support.subject", {}, "Subject")}</label>
            <input
              id="support-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={160}
              placeholder={t("support.subjectPlaceholder", {}, "Example: Proposal generation fails on selected jobs")}
              required
            />
          </div>

          <div>
            <label htmlFor="support-message">{t("support.message", {}, "Issue Details")}</label>
            <textarea
              id="support-message"
              rows={8}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4000}
              placeholder={t(
                "support.messagePlaceholder",
                {},
                "Describe what you did, what happened, and what you expected to happen."
              )}
              required
            />
          </div>

          <div className="support-form-footer">
            <button type="submit" disabled={submitting}>
              {submitting
                ? t("support.submitting", {}, "Submitting...")
                : t("support.submit", {}, "Submit Issue")}
            </button>
          </div>
        </form>

        <div className="support-history-block">
          <h4>{t("support.yourRequests", {}, "Your Recent Requests")}</h4>
          {loadingHistory && <p className="muted">{t("common.loading", {}, "Loading...")}</p>}
          {!loadingHistory && history.length === 0 && (
            <p className="muted">{t("support.noRequests", {}, "No support requests submitted yet.")}</p>
          )}
          {!loadingHistory && history.length > 0 && (
            <div className="support-history-list">
              {history.map((item) => (
                <article key={item.id} className="support-history-card">
                  <div className="support-history-head">
                    <div className="support-history-title-wrap">
                      <strong>{item.subject}</strong>
                      <span className={`status-badge ${item.status === "closed" ? "accepted" : item.status === "reviewed" ? "pending" : "rejected"}`}>
                        {item.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="support-delete-btn"
                      onClick={() => setPendingDeleteRequest(item)}
                      aria-label={t("support.deleteLabel", {}, "Delete support request")}
                      title={t("support.deleteLabel", {}, "Delete support request")}
                    >
                      ×
                    </button>
                  </div>
                  <p>{item.message}</p>
                  <small className="muted">
                    {new Date(item.createdAt).toLocaleString()}
                  </small>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {pendingDeleteRequest && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content support-delete-modal">
            <h2>{t("support.deleteTitle", {}, "Delete Support Request")}</h2>
            <p className="muted">
              {t("support.deleteConfirm", {}, "Delete this support request from your history?")}
            </p>
            <p className="support-delete-subject">{pendingDeleteRequest.subject}</p>
            <div className="modal-buttons">
              <button
                type="button"
                className="secondary"
                onClick={() => setPendingDeleteRequest(null)}
                disabled={Boolean(deletingRequestId)}
              >
                {t("common.dismiss", {}, "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteSupportRequest(pendingDeleteRequest.id)}
                disabled={deletingRequestId === pendingDeleteRequest.id}
              >
                {deletingRequestId === pendingDeleteRequest.id
                  ? t("common.loading", {}, "Loading...")
                  : t("support.deleteAction", {}, "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SupportPage;
