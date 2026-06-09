export default function QuickButton({ icon, label, accent = false, onClick }) {
  return (
    <button
      type="button"
      className="quick-btn text-center"
      onClick={onClick}
      style={accent ? { borderColor: 'rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.10)' } : {}}
    >
      <span className="text-2xl leading-none">{icon}</span>
      <span className={`text-[11px] font-medium leading-tight ${accent ? 'text-accent' : 'text-ink-2'}`}>
        {label}
      </span>
    </button>
  );
}
