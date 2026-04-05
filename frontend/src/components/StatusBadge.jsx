import { useI18n } from "../context/I18nContext";

function StatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`status-badge ${status}`}>{t(`status.${status}`, {}, status)}</span>;
}

export default StatusBadge;
