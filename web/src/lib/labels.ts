import type {
  AvailabilityStatus,
  Configuration,
  EffectiveStatus,
  EventLocationStatus,
  MediaCategory,
  MediaKind,
  PoiKind,
  ProjectStatus,
  QuoteStatus,
} from "./types";

export const CONFIGURATIONS: Configuration[] = [
  "in_piedi",
  "tavoli_tondi",
  "tavolo_imperiale",
  "platea",
  "ferro_di_cavallo",
  "classroom",
  "cocktail",
];

export const CONFIG_LABELS: Record<Configuration, string> = {
  in_piedi: "In piedi",
  tavoli_tondi: "Tavoli tondi",
  tavolo_imperiale: "Tavolo imperiale",
  platea: "Platea",
  ferro_di_cavallo: "Ferro di cavallo",
  classroom: "Classroom",
  cocktail: "Cocktail",
};

export const EFFECTIVE_STATUS_LABELS: Record<EffectiveStatus, string> = {
  da_visitare: "Da visitare",
  visitata: "Visitata",
  proposta: "Proposta",
  utilizzata: "Utilizzata",
};

export const EFFECTIVE_STATUS_CLASSES: Record<EffectiveStatus, string> = {
  da_visitare: "bg-amber-100 text-amber-800 border-amber-200",
  visitata: "bg-emerald-100 text-emerald-800 border-emerald-200",
  proposta: "bg-sky-100 text-sky-800 border-sky-200",
  utilizzata: "bg-berry/10 text-berry border-berry/20",
};

export const EL_STATUSES: EventLocationStatus[] = [
  "preselezionata",
  "proposta",
  "sopralluogo_fissato",
  "in_valutazione",
  "preferita",
  "scartata",
  "confermata",
  "utilizzata",
];

export const EL_STATUS_LABELS: Record<EventLocationStatus, string> = {
  preselezionata: "Preselezionata",
  proposta: "Proposta",
  sopralluogo_fissato: "Sopralluogo fissato",
  in_valutazione: "In valutazione",
  preferita: "Preferita",
  scartata: "Scartata",
  confermata: "Confermata",
  utilizzata: "Utilizzata",
};

export const EL_STATUS_CLASSES: Record<EventLocationStatus, string> = {
  preselezionata: "bg-gray-100 text-gray-700 border-gray-200",
  proposta: "bg-sky-100 text-sky-800 border-sky-200",
  sopralluogo_fissato: "bg-violet-100 text-violet-800 border-violet-200",
  in_valutazione: "bg-amber-100 text-amber-800 border-amber-200",
  preferita: "bg-gold/15 text-yellow-800 border-gold/30",
  scartata: "bg-red-100 text-red-700 border-red-200",
  confermata: "bg-emerald-100 text-emerald-800 border-emerald-200",
  utilizzata: "bg-berry/10 text-berry border-berry/20",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  richiesto: "Richiesto",
  ricevuto: "Ricevuto",
  accettato: "Accettato",
  rifiutato: "Rifiutato",
  scaduto: "Scaduto",
};

export const QUOTE_STATUS_CLASSES: Record<QuoteStatus, string> = {
  richiesto: "bg-gray-100 text-gray-700 border-gray-200",
  ricevuto: "bg-sky-100 text-sky-800 border-sky-200",
  accettato: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rifiutato: "bg-red-100 text-red-700 border-red-200",
  scaduto: "bg-amber-100 text-amber-800 border-amber-200",
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  disponibile: "Disponibile",
  opzionata: "Opzionata",
  non_disponibile: "Non disponibile",
};

export const AVAILABILITY_CLASSES: Record<AvailabilityStatus, string> = {
  disponibile: "bg-emerald-100 text-emerald-800 border-emerald-200",
  opzionata: "bg-amber-100 text-amber-800 border-amber-200",
  non_disponibile: "bg-red-100 text-red-700 border-red-200",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  attivo: "Attivo",
  chiuso: "Chiuso",
  archiviato: "Archiviato",
};

export const PROJECT_STATUS_CLASSES: Record<ProjectStatus, string> = {
  attivo: "bg-emerald-100 text-emerald-800 border-emerald-200",
  chiuso: "bg-gray-100 text-gray-700 border-gray-200",
  archiviato: "bg-gray-100 text-gray-500 border-gray-200",
};

export const POI_KINDS: PoiKind[] = ["hotel", "aeroporto", "stazione", "monumento", "altro"];

export const POI_KIND_LABELS: Record<PoiKind, string> = {
  hotel: "Hotel",
  aeroporto: "Aeroporto",
  stazione: "Stazione",
  monumento: "Monumento",
  altro: "Altro",
};

export const POI_KIND_ICONS: Record<PoiKind, string> = {
  hotel: "🏨",
  aeroporto: "✈️",
  stazione: "🚉",
  monumento: "🏛️",
  altro: "📍",
};

export const POI_KIND_CLASSES: Record<PoiKind, string> = {
  hotel: "bg-violet-100 text-violet-800 border-violet-200",
  aeroporto: "bg-sky-100 text-sky-800 border-sky-200",
  stazione: "bg-emerald-100 text-emerald-800 border-emerald-200",
  monumento: "bg-gold/15 text-yellow-800 border-gold/30",
  altro: "bg-gray-100 text-gray-700 border-gray-200",
};

export const MEDIA_KINDS: MediaKind[] = ["foto", "video", "planimetria", "documento", "listino"];

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  foto: "Foto",
  video: "Video",
  planimetria: "Planimetria",
  documento: "Documento",
  listino: "Listino",
};

export const MEDIA_KIND_ICONS: Record<MediaKind, string> = {
  foto: "🖼",
  video: "🎬",
  planimetria: "📐",
  documento: "📄",
  listino: "🧾",
};

export const MEDIA_CATEGORIES: MediaCategory[] = ["esterni", "interni", "sala", "servizi", "setup"];

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  esterni: "Esterni",
  interni: "Interni",
  sala: "Sala",
  servizi: "Servizi",
  setup: "Setup",
};

export const SMART_TAGS = [
  "conferenze",
  "gala_dinner",
  "lunch",
  "coffee",
  "feste",
  "lancio",
  "shooting",
  "wedding",
];

export const SUPPLIER_CATEGORIES = [
  "catering",
  "service_avl",
  "allestimenti",
  "arredi",
  "fiori",
  "vigilanza",
];

/** Fixed palette for smart tag colors (berry-first, on-brand). */
export const TAG_COLORS = [
  "#6D2E46", // berry
  "#A26769", // rose
  "#C9A227", // gold
  "#2F6B4F", // green
  "#3D5A80", // blue
  "#7A5BA6", // violet
  "#B65C33", // terracotta
  "#4A7A8C", // teal
];

export const DEFAULT_TAG_COLOR = "#A26769";

export function tagLabel(tag: string): string {
  return tag.replaceAll("_", " ");
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoney(amount?: number | null, currency = "EUR"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function yesNo(v?: boolean | null): string {
  if (v == null) return "—";
  return v ? "Sì" : "No";
}
