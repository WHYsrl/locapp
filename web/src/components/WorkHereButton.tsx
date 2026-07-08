"use client";

// Pill "Lavora su questo": fissa il progetto/evento corrente come contesto di
// lavoro (chip in topbar, preselezione in "Aggiungi a evento"). Toggle: se il
// contesto è già questo, un secondo click lo rimuove.

export default function WorkHereButton({
  active,
  onActivate,
  onDeactivate,
  disabled = false,
}: {
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={active ? onDeactivate : onActivate}
      title={active ? "Contesto di lavoro attivo — clicca per uscire" : "Imposta come contesto di lavoro"}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition duration-150 active:scale-[0.98] disabled:opacity-50 ${
        active
          ? "bg-berry text-white hover:bg-berry-dark"
          : "border border-berry/25 bg-white text-berry hover:bg-berry/5"
      }`}
    >
      {active ? "✓ In lavorazione" : "◉ Lavora su questo"}
    </button>
  );
}
