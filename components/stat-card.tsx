import { Icon, type IconName } from "./icons";

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "blue",
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
  tone?: "blue" | "green" | "amber" | "violet";
  trend?: string;
}) {
  return (
    <article className="stat-card">
      <div className={`stat-card__icon stat-card__icon--${tone}`}><Icon name={icon} /></div>
      <div className="stat-card__top">
        <span>{label}</span>
        {trend && <small className="positive-trend">{trend}</small>}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
