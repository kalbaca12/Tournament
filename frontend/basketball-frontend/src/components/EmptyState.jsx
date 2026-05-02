export default function EmptyState({ title, description, action = null }) {
  return (
    <div className="empty-state">
      <div>
        <div className="empty-state__title">{title}</div>
        {description ? <p className="empty-state__copy">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
