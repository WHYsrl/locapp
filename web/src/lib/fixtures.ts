// Demo fixture data (Italian, realistic). Used by the demo store (demo.ts)
// when NEXT_PUBLIC_DEMO=1 or when the API is unreachable.

import type {
  AvailabilitySlot,
  Company,
  Contact,
  EventItem,
  LocationBase,
  Media,
  Poi,
  PriceList,
  Project,
  Quote,
  SiteVisit,
  Space,
  EventLocationStatus,
  MatchReasons,
} from "./types";

export interface FixtureEventLocation {
  id: string;
  event_id: string;
  location_id: string;
  status: EventLocationStatus;
  match_score?: number | null;
  match_reasons?: MatchReasons | null;
  client_feedback?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface FixtureLocationContact {
  location_id: string;
  contact_id: string;
  company_id?: string | null;
  role: string;
}

export interface FixtureSupplier {
  id: string;
  location_id: string;
  company_id: string;
  contact_id?: string | null;
  category: string;
  requirement: "obbligatorio" | "consigliato";
  conditions?: string | null;
  rating?: number | null;
}

export interface FixtureCompanyContact {
  company_id: string;
  contact_id: string;
  role: string;
}

export interface FixtureProjectNote {
  id: string;
  location_id: string;
  project_id: string;
  event_id?: string | null;
  notes: string;
}

export interface DemoDB {
  companies: Company[];
  contacts: Contact[];
  companyContacts: FixtureCompanyContact[];
  locations: LocationBase[];
  spaces: Space[];
  locationContacts: FixtureLocationContact[];
  suppliers: FixtureSupplier[];
  media: (Media & { location_id: string })[];
  priceLists: (PriceList & { location_id: string })[];
  pois: Poi[];
  projects: Project[];
  events: EventItem[];
  eventLocations: FixtureEventLocation[];
  visits: (SiteVisit & { event_location_id: string })[];
  quotes: (Quote & { event_location_id: string })[];
  availability: (AvailabilitySlot & { event_location_id: string })[];
  projectNotes: FixtureProjectNote[];
}

export function buildDemoDB(): DemoDB {
  const companies: Company[] = [
    {
      id: "comp-adriatico",
      name: "Adriatico Hotels S.p.A.",
      kind: "gestione",
      vat_number: "IT01234567890",
      email: "eventi@adriaticohotels.it",
      phone: "+39 055 234 5678",
      website: "https://www.grandhoteladriatico.it",
      notes: "Gestisce il Grand Hotel Adriatico e le sue sale.",
    },
    {
      id: "comp-sanmartino",
      name: "Villa San Martino S.r.l.",
      kind: "gestione",
      email: "info@villasanmartino.it",
      phone: "+39 031 511 223",
      website: "https://www.villasanmartino.it",
    },
    {
      id: "comp-bonton",
      name: "Bon Ton Catering S.r.l.",
      kind: "fornitore",
      supplier_categories: ["catering"],
      email: "commerciale@bontoncatering.it",
      phone: "+39 02 8912 3344",
      notes: "Catering di alta gamma, forte su gala dinner. Esclusivista in alcune location.",
    },
    {
      id: "comp-audioluce",
      name: "AudioLuce Service",
      kind: "fornitore",
      supplier_categories: ["service_avl"],
      email: "produzione@audioluce.it",
      phone: "+39 02 4577 8899",
    },
    {
      id: "comp-fiorami",
      name: "Fiorami Studio",
      kind: "fornitore",
      supplier_categories: ["fiori", "allestimenti"],
      email: "studio@fiorami.it",
      phone: "+39 02 3311 2244",
    },
    {
      id: "comp-vega",
      name: "Vega Sicurezza",
      kind: "fornitore",
      supplier_categories: ["vigilanza"],
      email: "operativo@vegasicurezza.it",
      phone: "+39 02 6600 1122",
    },
  ];

  const contacts: Contact[] = [
    { id: "cont-rossi", first_name: "Elena", last_name: "Rossi", email: "e.rossi@grandhoteladriatico.it", phone: "+39 335 112 2334", notes: "Molto reattiva, preferisce WhatsApp." },
    { id: "cont-bianchi", first_name: "Marco", last_name: "Bianchi", email: "m.bianchi@grandhoteladriatico.it", phone: "+39 338 445 5667" },
    { id: "cont-ferrari", first_name: "Giulia", last_name: "Ferrari", email: "g.ferrari@villasanmartino.it", phone: "+39 347 889 9001" },
    { id: "cont-colombo", first_name: "Andrea", last_name: "Colombo", email: "a.colombo@bontoncatering.it", phone: "+39 340 223 3445" },
    { id: "cont-marino", first_name: "Sara", last_name: "Marino", email: "sara@officine22.it", phone: "+39 349 556 6778", notes: "Responsabile tecnica: passare da lei per i carichi." },
    { id: "cont-deluca", first_name: "Paolo", last_name: "De Luca", email: "custode@palazzoaresevisconti.it", phone: "+39 333 667 7889" },
  ];

  const companyContacts: FixtureCompanyContact[] = [
    { company_id: "comp-adriatico", contact_id: "cont-rossi", role: "Event manager" },
    { company_id: "comp-adriatico", contact_id: "cont-bianchi", role: "Direttore ristorante" },
    { company_id: "comp-sanmartino", contact_id: "cont-ferrari", role: "Responsabile eventi" },
    { company_id: "comp-bonton", contact_id: "cont-colombo", role: "Commerciale" },
  ];

  const locations: LocationBase[] = [
    {
      id: "loc-hotel",
      parent_location_id: null,
      name: "Grand Hotel Adriatico",
      slug: "grand-hotel-adriatico",
      summary:
        "Hotel 5 stelle sul Lungarno con salone delle feste affrescato e terrazza panoramica sull'Arno. Ideale per convention con cena di gala in un'unica sede.",
      address_line: "Lungarno Amerigo Vespucci 50",
      city: "Firenze",
      province: "FI",
      postal_code: "50123",
      country: "IT",
      lng: 11.2402,
      lat: 43.7736,
      google_maps_url: "https://maps.google.com/?q=Lungarno+Amerigo+Vespucci+50+Firenze",
      visit_status: "visitata",
      logistics: {
        auto: "Accesso da Lungarno Vespucci; carico/scarico su prenotazione (max 2 mezzi contemporanei).",
        pullman: "Sosta breve consentita davanti all'ingresso; parcheggio pullman a 800 m.",
        ztl: { present: true, hours: "7:30–20:00 (lun–sab)", permits: "Permessi ZTL richiesti dall'hotel con 48h di anticipo" },
        stop_difficulty: "media",
        private_parking: { spots: 40 },
        nearby_parking: [{ name: "Garage Europa", distance_m: 300 }],
        notes: "Montacarichi verso il salone: 200×150 cm, portata 800 kg.",
      },
      setup: {
        furniture: "Tavoli tondi Ø180 (30 pz) e sedie chiavarine dorate incluse",
        lights: "Impianto architetturale dimmerabile nel salone",
        projections: "2 schermi motorizzati 4×3 m nel salone",
        stage: "Pedana modulare 8×6 m disponibile",
        audio: "Impianto di sala per speech; per band serve service esterno",
        constraints: ["Niente tape sul parquet del salone", "Candele solo con base protetta"],
      },
      party: {
        indoor: { allowed: true, music_until: "01:00" },
        outdoor: { allowed: true, music_until: "23:30" },
        structural_constraints: ["In terrazza max 300 persone per normativa antincendio"],
        db_limit: 95,
      },
      technical: {
        max_kw: 120,
        generators: true,
        aerial_ladder: false,
        cooking: "fiamma",
        heavy_vehicle_access: true,
        notes: "Quadro elettrico dedicato eventi nel retro-salone.",
      },
      accessibility_rating: 4,
      accessibility_notes: "Ascensori a tutti i piani; terrazza raggiungibile con lift dedicato.",
      availability_rules: "Salone non disponibile a dicembre (eventi propri dell'hotel).",
      smart_tags: ["conferenze", "gala_dinner", "lunch", "coffee"],
      impressions: "Referente molto disponibile. Il salone è scenografico, acustica buona. Terrazza è il vero punto di forza al tramonto.",
      created_at: "2025-09-12T10:00:00Z",
      updated_at: "2026-05-02T09:30:00Z",
    },
    {
      id: "loc-ristorante",
      parent_location_id: "loc-hotel",
      name: "Ristorante Le Colonne",
      slug: "ristorante-le-colonne",
      summary:
        "Ristorante gourmet al piano nobile del Grand Hotel Adriatico, sala con colonne in pietra serena e vista Arno. Privatizzabile per cene fino a 90 ospiti a tavoli tondi.",
      address_line: null,
      city: null,
      province: null,
      postal_code: null,
      country: "IT",
      lng: null,
      lat: null,
      visit_status: "visitata",
      logistics: null, // inherited from parent
      setup: { furniture: "Mise en place del ristorante inclusa", constraints: ["Menu solo della cucina interna (chef resident)"] },
      party: { indoor: { allowed: true, music_until: "24:00" }, db_limit: 80 },
      technical: { cooking: "fiamma", notes: "Cucina interna al piano; nessuna cucina di appoggio necessaria." },
      accessibility_rating: 4,
      smart_tags: ["gala_dinner", "lunch"],
      impressions: "Perfetto per cene esclusive; lo chef è flessibile sui menu ma serve chiuderli 3 settimane prima.",
      created_at: "2025-09-12T10:05:00Z",
      updated_at: "2026-04-18T14:00:00Z",
    },
    {
      id: "loc-congressi",
      parent_location_id: "loc-hotel",
      name: "Centro Congressi Brunelleschi",
      slug: "centro-congressi-brunelleschi",
      summary:
        "Ala congressuale del Grand Hotel Adriatico: auditorium a platea fissa da 380 posti, cabina regia, foyer espositivo e boardroom.",
      country: "IT",
      lng: null,
      lat: null,
      visit_status: "visitata",
      logistics: null, // inherited from parent
      setup: { projections: "Proiettore laser 12k lumen, schermo 6×3,4 m", audio: "Impianto conferenza con 8 radiomicrofoni", stage: "Palco fisso 10×4 m" },
      technical: { max_kw: 80, cooking: "no", notes: "Regia audio/video fissa con tecnico interno obbligatorio." },
      accessibility_rating: 5,
      accessibility_notes: "Accesso in piano dal foyer, postazioni riservate in sala.",
      smart_tags: ["conferenze"],
      created_at: "2025-09-12T10:10:00Z",
      updated_at: "2026-04-18T14:05:00Z",
    },
    {
      id: "loc-villa",
      parent_location_id: null,
      name: "Villa San Martino",
      slug: "villa-san-martino",
      summary:
        "Villa settecentesca a Cernobbio con parco di 40.000 mq digradante sul lago di Como, limonaia copribile e salone degli specchi. Location da grandi numeri all'aperto.",
      address_line: "Via Regina 87",
      city: "Cernobbio",
      province: "CO",
      postal_code: "22012",
      country: "IT",
      lng: 9.0753,
      lat: 45.8419,
      google_maps_url: "https://maps.google.com/?q=Via+Regina+87+Cernobbio",
      visit_status: "da_visitare",
      logistics: {
        auto: "Ingresso carrabile dal cancello nord; viale interno percorribile da furgoni.",
        pullman: "Strada di accesso stretta: navette da Como consigliate per gli ospiti.",
        ztl: { present: false },
        stop_difficulty: "alta",
        private_parking: { spots: 60 },
        nearby_parking: [{ name: "Parcheggio lido di Cernobbio", distance_m: 900 }],
        notes: "Scarico allestimenti solo dalle 8:00 alle 11:00 nei giorni feriali.",
      },
      setup: {
        furniture: "Nessun arredo incluso: tutto da allestire",
        lights: "Illuminazione parco di cortesia; per eventi serve piano luci dedicato",
        constraints: ["Vietato fissare strutture al prato all'inglese senza piastre", "Fuochi d'artificio solo silenziosi"],
      },
      party: {
        indoor: { allowed: true, music_until: "01:00" },
        outdoor: { allowed: true, music_until: "24:00" },
        structural_constraints: ["Limite 85 dB in esterno dopo le 22:00 (ordinanza comunale)"],
        db_limit: 85,
      },
      technical: {
        max_kw: 40,
        generators: true,
        aerial_ladder: true,
        cooking: "rigenerazione",
        heavy_vehicle_access: false,
        notes: "Potenza limitata: generatori quasi sempre necessari per eventi serali.",
      },
      accessibility_rating: 3,
      accessibility_notes: "Parco con ghiaia; percorso accessibile fino alla limonaia, salone al piano nobile con servoscala.",
      availability_rules: "Eventi serali solo da aprile a ottobre; chiusa a gennaio.",
      smart_tags: ["wedding", "gala_dinner", "feste", "shooting"],
      impressions: "Segnalata dal cliente ACME: da vedere assolutamente prima dell'estate. Foto molto promettenti.",
      created_at: "2026-02-20T16:40:00Z",
      updated_at: "2026-06-11T08:15:00Z",
    },
    {
      id: "loc-palazzo",
      parent_location_id: null,
      name: "Palazzo Arese Visconti",
      slug: "palazzo-arese-visconti",
      summary:
        "Palazzo nobiliare seicentesco nel cuore di Milano: galleria degli arazzi affrescata e cortile d'onore porticato. Cornice istituzionale per gala e lanci di prodotto.",
      address_line: "Via Borgonuovo 14",
      city: "Milano",
      province: "MI",
      postal_code: "20121",
      country: "IT",
      lng: 9.1897,
      lat: 45.4708,
      google_maps_url: "https://maps.google.com/?q=Via+Borgonuovo+14+Milano",
      visit_status: "visitata",
      logistics: {
        auto: "Accesso solo da Via Borgonuovo; androne carrabile max 3,5 t.",
        pullman: "Nessuna sosta pullman nelle vicinanze: drop-off in Via Fatebenefratelli.",
        ztl: { present: true, hours: "7:30–19:30 (Area C)", permits: "Deroga Area C a carico dell'organizzatore" },
        stop_difficulty: "alta",
        private_parking: { spots: 0 },
        nearby_parking: [{ name: "Autosilo Brera", distance_m: 400 }],
      },
      setup: {
        furniture: "Nessun arredo: allestimento completo necessario",
        lights: "Solo luce architetturale nel cortile",
        constraints: ["Vietato appendere ai soffitti affrescati", "Carico massimo pavimento galleria 400 kg/mq"],
      },
      party: {
        indoor: { allowed: true, music_until: "23:30" },
        outdoor: { allowed: true, music_until: "23:00" },
        structural_constraints: ["Cortile: no tacchi a spillo sul cotto originale (passatoie obbligatorie)"],
        db_limit: 80,
      },
      technical: {
        max_kw: 60,
        generators: false,
        aerial_ladder: false,
        cooking: "rigenerazione",
        heavy_vehicle_access: false,
        notes: "Cucina di appoggio in androne; solo rigenerazione, nessuna fiamma libera.",
      },
      accessibility_rating: 2,
      accessibility_notes: "Scalone monumentale per la galleria; montascale disponibile su richiesta, tempi lunghi.",
      availability_rules: "Non disponibile durante la fashion week.",
      smart_tags: ["gala_dinner", "conferenze", "lancio", "shooting"],
      impressions: "Impatto scenografico altissimo, ma logistica complessa: preventivare service e cucina esterni.",
      created_at: "2025-11-05T11:20:00Z",
      updated_at: "2026-05-28T17:45:00Z",
    },
    {
      id: "loc-officine",
      parent_location_id: null,
      name: "Officine 22",
      slug: "officine-22",
      summary:
        "Ex fabbrica meccanica riconvertita a Lambrate: navata centrale di 1.200 mq con carroponte originale, accesso carrabile diretto e 200 kW di potenza. Tela bianca per lanci e feste.",
      address_line: "Via Ventura 22",
      city: "Milano",
      province: "MI",
      postal_code: "20134",
      country: "IT",
      lng: 9.2374,
      lat: 45.4791,
      google_maps_url: "https://maps.google.com/?q=Via+Ventura+22+Milano",
      visit_status: "visitata",
      logistics: {
        auto: "Accesso carrabile diretto in navata (portone 4×4 m).",
        pullman: "Sosta pullman in Via Ventura senza limitazioni.",
        ztl: { present: false },
        stop_difficulty: "bassa",
        private_parking: { spots: 80 },
        notes: "Bilico può entrare in navata: scarico al coperto.",
      },
      setup: {
        furniture: "Spazio nudo: nessun arredo incluso",
        lights: "Americane motorizzate su tutta la navata",
        projections: "Pareti idonee a videomapping",
        stage: "Nessun palco fisso",
        audio: "Nessun impianto: service libero",
        constraints: ["Rigging solo su punti certificati (mappa disponibile)"],
      },
      party: {
        indoor: { allowed: true, music_until: "03:00" },
        outdoor: { allowed: false },
        db_limit: 103,
      },
      technical: {
        max_kw: 200,
        generators: true,
        aerial_ladder: true,
        cooking: "induzione",
        heavy_vehicle_access: true,
        notes: "Potenza abbondante; ricarica mezzi elettrici in cortile.",
      },
      accessibility_rating: 5,
      accessibility_notes: "Tutto in piano al livello strada; servizi accessibili.",
      availability_rules: "Solo su richiesta durante il Salone del Mobile.",
      smart_tags: ["lancio", "feste", "shooting", "conferenze"],
      impressions: "Il gestore è pragmatico e veloce. Spazio molto flessibile, acustica riverberante da trattare.",
      created_at: "2025-08-01T09:00:00Z",
      updated_at: "2026-06-20T10:10:00Z",
    },
  ];

  const spaces: Space[] = [
    {
      id: "sp-salone", location_id: "loc-hotel", kind: "interno", name: "Salone delle Feste",
      area_sqm: 420, height_m: 6, covered: "coperto",
      features: { foyer: true, guardaroba: true, bagni: { count: 6, accessible: true }, ascensore: true, arredi: ["tavoli tondi", "chiavarine"] },
      capacities: { platea: 400, tavoli_tondi: 260, in_piedi: 500, classroom: 220, ferro_di_cavallo: 60 },
      sort: 1,
    },
    {
      id: "sp-terrazza", location_id: "loc-hotel", kind: "esterno", name: "Terrazza Panoramica",
      area_sqm: 300, covered: "copribile",
      features: { bagni: { count: 2, accessible: true }, ascensore: true },
      capacities: { cocktail: 250, in_piedi: 300, tavoli_tondi: 140 },
      sort: 2,
    },
    {
      id: "sp-colonne", location_id: "loc-ristorante", kind: "interno", name: "Sala delle Colonne",
      area_sqm: 180, height_m: 4.2, covered: "coperto",
      features: { guardaroba: true, bagni: { count: 3, accessible: true }, cucina: true, ascensore: true },
      capacities: { tavoli_tondi: 90, tavolo_imperiale: 60, in_piedi: 120 },
      sort: 1,
    },
    {
      id: "sp-auditorium", location_id: "loc-congressi", kind: "interno", name: "Auditorium",
      area_sqm: 450, height_m: 7, covered: "coperto",
      features: { foyer: true, guardaroba: true, bagni: { count: 8, accessible: true }, ascensore: true },
      capacities: { platea: 380, classroom: 200 },
      sort: 1,
    },
    {
      id: "sp-boardroom", location_id: "loc-congressi", kind: "interno", name: "Sala Boardroom",
      area_sqm: 60, height_m: 3.2, covered: "coperto",
      features: { arredi: ["tavolo a ferro di cavallo fisso"] },
      capacities: { ferro_di_cavallo: 28, classroom: 36 },
      sort: 2,
    },
    {
      id: "sp-specchi", location_id: "loc-villa", kind: "interno", name: "Salone degli Specchi",
      area_sqm: 260, height_m: 5.5, covered: "coperto",
      features: { guardaroba: true, bagni: { count: 4, accessible: false }, scale: true },
      capacities: { tavoli_tondi: 150, in_piedi: 220, platea: 180 },
      sort: 1,
    },
    {
      id: "sp-parco", location_id: "loc-villa", kind: "esterno", name: "Parco sul Lago",
      area_sqm: 4000, covered: "scoperto",
      features: {},
      capacities: { in_piedi: 600, tavoli_tondi: 350, cocktail: 500 },
      sort: 2,
    },
    {
      id: "sp-limonaia", location_id: "loc-villa", kind: "esterno", name: "Limonaia",
      area_sqm: 200, covered: "copribile",
      features: { cucina: true },
      capacities: { tavoli_tondi: 110, in_piedi: 160 },
      sort: 3,
    },
    {
      id: "sp-galleria", location_id: "loc-palazzo", kind: "interno", name: "Galleria degli Arazzi",
      area_sqm: 300, height_m: 6.5, covered: "coperto",
      features: { guardaroba: true, bagni: { count: 4, accessible: false }, scale: true },
      capacities: { tavoli_tondi: 160, platea: 200, in_piedi: 280, tavolo_imperiale: 80 },
      sort: 1,
    },
    {
      id: "sp-cortile", location_id: "loc-palazzo", kind: "esterno", name: "Cortile d'Onore",
      area_sqm: 500, covered: "scoperto",
      features: {},
      capacities: { cocktail: 300, in_piedi: 350, tavoli_tondi: 180 },
      sort: 2,
    },
    {
      id: "sp-navata", location_id: "loc-officine", kind: "interno", name: "Navata Centrale",
      area_sqm: 1200, height_m: 9, covered: "coperto",
      features: { bagni: { count: 10, accessible: true }, cucina: false },
      capacities: { in_piedi: 1000, platea: 600, tavoli_tondi: 450, classroom: 350, cocktail: 800 },
      sort: 1,
    },
    {
      id: "sp-galleria-sud", location_id: "loc-officine", kind: "interno", name: "Galleria Sud",
      area_sqm: 400, height_m: 5, covered: "coperto",
      features: { foyer: true },
      capacities: { in_piedi: 300, tavoli_tondi: 150, classroom: 120 },
      sort: 2,
    },
  ];

  const locationContacts: FixtureLocationContact[] = [
    { location_id: "loc-hotel", contact_id: "cont-rossi", company_id: "comp-adriatico", role: "Referente eventi" },
    { location_id: "loc-ristorante", contact_id: "cont-bianchi", company_id: "comp-adriatico", role: "Direttore ristorante" },
    { location_id: "loc-congressi", contact_id: "cont-rossi", company_id: "comp-adriatico", role: "Referente eventi" },
    { location_id: "loc-villa", contact_id: "cont-ferrari", company_id: "comp-sanmartino", role: "Responsabile eventi" },
    { location_id: "loc-palazzo", contact_id: "cont-deluca", role: "Custode / aperture" },
    { location_id: "loc-officine", contact_id: "cont-marino", role: "Responsabile tecnica" },
  ];

  const suppliers: FixtureSupplier[] = [
    { id: "sup-1", location_id: "loc-hotel", company_id: "comp-bonton", contact_id: "cont-colombo", category: "catering", requirement: "obbligatorio", conditions: "Esclusiva per eventi oltre 100 pax nel Salone", rating: 4.5 },
    { id: "sup-2", location_id: "loc-hotel", company_id: "comp-audioluce", category: "service_avl", requirement: "consigliato", conditions: "Conosce già gli attacchi del salone", rating: 4 },
    { id: "sup-3", location_id: "loc-villa", company_id: "comp-bonton", category: "catering", requirement: "consigliato", rating: 4.5 },
    { id: "sup-4", location_id: "loc-villa", company_id: "comp-fiorami", category: "allestimenti", requirement: "consigliato", conditions: "Ha realizzato gli allestimenti del parco nel 2025" },
    { id: "sup-5", location_id: "loc-palazzo", company_id: "comp-vega", category: "vigilanza", requirement: "obbligatorio", conditions: "Vigilanza obbligatoria per vincolo Belle Arti" },
    { id: "sup-6", location_id: "loc-palazzo", company_id: "comp-bonton", category: "catering", requirement: "consigliato", conditions: "Solo rigenerazione in loco" },
    { id: "sup-7", location_id: "loc-officine", company_id: "comp-audioluce", category: "service_avl", requirement: "consigliato", rating: 4 },
  ];

  const media: (Media & { location_id: string })[] = [
    { id: "med-1", location_id: "loc-hotel", kind: "foto", category: "esterni", filename: "facciata-lungarno.jpg" },
    { id: "med-2", location_id: "loc-hotel", kind: "foto", category: "sala", filename: "salone-feste-gala.jpg" },
    { id: "med-3", location_id: "loc-hotel", kind: "foto", category: "esterni", filename: "terrazza-tramonto.jpg" },
    { id: "med-4", location_id: "loc-hotel", kind: "planimetria", category: "sala", filename: "planimetria-salone.pdf" },
    { id: "med-5", location_id: "loc-hotel", kind: "listino", category: "servizi", filename: "listino-eventi-2026.pdf" },
    { id: "med-6", location_id: "loc-villa", kind: "foto", category: "esterni", filename: "parco-lago.jpg" },
    { id: "med-7", location_id: "loc-villa", kind: "foto", category: "interni", filename: "salone-specchi.jpg" },
    { id: "med-8", location_id: "loc-villa", kind: "video", category: "esterni", filename: "drone-villa.mp4" },
    { id: "med-9", location_id: "loc-palazzo", kind: "foto", category: "interni", filename: "galleria-arazzi.jpg" },
    { id: "med-10", location_id: "loc-palazzo", kind: "foto", category: "esterni", filename: "cortile-onore.jpg" },
    { id: "med-11", location_id: "loc-officine", kind: "foto", category: "sala", filename: "navata-vuota.jpg" },
    { id: "med-12", location_id: "loc-officine", kind: "planimetria", category: "sala", filename: "planimetria-rigging.pdf" },
    { id: "med-13", location_id: "loc-ristorante", kind: "foto", category: "sala", filename: "sala-colonne.jpg" },
    { id: "med-14", location_id: "loc-congressi", kind: "foto", category: "sala", filename: "auditorium.jpg" },
  ];

  const priceLists: (PriceList & { location_id: string })[] = [
    {
      id: "pl-1",
      location_id: "loc-hotel",
      name: "Listino Eventi 2026",
      valid_from: "2026-01-01",
      valid_to: "2026-12-31",
      items: [
        { voce: "Affitto Salone delle Feste (giornata)", prezzo: 9500, unita: "a corpo", stagionalita: "alta stagione +20%" },
        { voce: "Affitto Terrazza Panoramica (serata)", prezzo: 6000, unita: "a corpo" },
        { voce: "Cena di gala (menu 4 portate)", prezzo: 145, unita: "a persona", note: "Bevande incluse, vini in upgrade" },
        { voce: "Coffee break", prezzo: 18, unita: "a persona" },
        { voce: "Diritto di tappo", prezzo: 15, unita: "a bottiglia" },
      ],
      payment_terms: { acconto_pct: 30, saldo: "Saldo a 30 giorni data evento", metodi: ["bonifico"] },
      extracted_by_ai: true,
    },
    {
      id: "pl-2",
      location_id: "loc-villa",
      name: "Tariffe location 2026",
      valid_from: "2026-04-01",
      valid_to: "2026-10-31",
      items: [
        { voce: "Esclusiva villa e parco (weekend)", prezzo: 14000, unita: "a corpo", stagionalita: "giugno–settembre" },
        { voce: "Esclusiva villa e parco (feriale)", prezzo: 9000, unita: "a corpo" },
        { voce: "Supplemento limonaia coperta", prezzo: 2500, unita: "a corpo" },
      ],
      payment_terms: { acconto_pct: 40, saldo: "Saldo 15 giorni prima dell'evento", metodi: ["bonifico"] },
      extracted_by_ai: false,
    },
    {
      id: "pl-3",
      location_id: "loc-officine",
      name: "Rate card 2026",
      valid_from: "2026-01-01",
      valid_to: "2026-12-31",
      items: [
        { voce: "Navata centrale (giornata evento)", prezzo: 7500, unita: "a corpo" },
        { voce: "Giornata di allestimento", prezzo: 2800, unita: "a corpo" },
        { voce: "Energia oltre 100 kW", prezzo: 450, unita: "a giornata" },
      ],
      extracted_by_ai: false,
    },
  ];

  const pois: Poi[] = [
    { id: "poi-duomo", name: "Duomo di Milano", kind: "monumento", lng: 9.1916, lat: 45.4642 },
    { id: "poi-centrale", name: "Stazione Milano Centrale", kind: "stazione", lng: 9.2049, lat: 45.4862 },
    { id: "poi-linate", name: "Aeroporto di Milano Linate", kind: "aeroporto", lng: 9.2783, lat: 45.4494 },
    { id: "poi-smn", name: "Stazione Firenze S.M.N.", kind: "stazione", lng: 11.2481, lat: 43.7764 },
    { id: "poi-comolago", name: "Como — lungolago", kind: "altro", lng: 9.0832, lat: 45.8121 },
  ];

  const projects: Project[] = [
    {
      id: "proj-acme",
      name: "Convention ACME 2026",
      client_name: "ACME S.p.A.",
      status: "attivo",
      notes: "Convention aziendale di due giorni a ottobre: plenaria, cena di gala e party di chiusura. Budget location ~90k.",
      created_at: "2026-03-01T09:00:00Z",
    },
    {
      id: "proj-nova",
      name: "Lancio Nova — Stampa & Influencer",
      client_name: "Nova Beauty",
      status: "chiuso",
      notes: "Evento di lancio prodotto concluso a maggio 2026. Ottimo riscontro stampa.",
      created_at: "2026-01-15T10:00:00Z",
    },
  ];

  const events: EventItem[] = [
    {
      id: "ev-plenaria", project_id: "proj-acme", name: "Sessione Plenaria", event_type: "conferenza",
      date_start: "2026-10-15", date_end: "2026-10-15", pax: 350,
      brief: "Plenaria per 350 persone a platea, regia completa, streaming, 4 breakout da 40 pax nel pomeriggio.",
      sort: 1,
    },
    {
      id: "ev-gala", project_id: "proj-acme", name: "Cena di Gala", event_type: "gala_dinner",
      date_start: "2026-10-15", date_end: "2026-10-15", pax: 320,
      brief: "Cena placée per 320 ospiti a tavoli tondi, ambiente elegante, intrattenimento live fino a mezzanotte.",
      sort: 2,
    },
    {
      id: "ev-party", project_id: "proj-acme", name: "Party di Chiusura", event_type: "festa",
      date_start: "2026-10-16", date_end: "2026-10-16", pax: 400,
      brief: "Party informale per 400 persone con dj set fino a tardi, food station, dress code casual.",
      sort: 3,
    },
    {
      id: "ev-lancio", project_id: "proj-nova", name: "Evento Lancio Stampa", event_type: "lancio",
      date_start: "2026-05-21", date_end: "2026-05-21", pax: 180,
      brief: "Lancio prodotto per 180 tra stampa e influencer: spazio scenografico, videomapping, cocktail.",
      sort: 1,
    },
  ];

  const eventLocations: FixtureEventLocation[] = [
    // Plenaria
    {
      id: "el-1", event_id: "ev-plenaria", location_id: "loc-congressi", status: "confermata",
      match_score: 93,
      match_reasons: { matched: ["Platea da 380 posti ≥ 350 pax", "Regia fissa con tecnico interno", "Stesso edificio della cena di gala"], unmatched: [], to_verify: ["Banda per streaming"] },
      client_feedback: "Il cliente apprezza la platea fissa e la regia. Confermato.",
      created_at: "2026-03-10T09:00:00Z",
    },
    {
      id: "el-2", event_id: "ev-plenaria", location_id: "loc-palazzo", status: "scartata",
      match_score: 61,
      match_reasons: { matched: ["Cornice istituzionale"], unmatched: ["Platea max 200 < 350 pax"], to_verify: [] },
      client_feedback: "Scartata: capienza a platea insufficiente e timori sull'acustica.",
      created_at: "2026-03-10T09:05:00Z",
    },
    {
      id: "el-3", event_id: "ev-plenaria", location_id: "loc-officine", status: "in_valutazione",
      match_score: 82,
      match_reasons: { matched: ["Platea fino a 600", "200 kW disponibili", "Accesso carrabile per regia"], unmatched: [], to_verify: ["Trattamento acustico della navata", "Costo allestimento platea"] },
      notes: "Piano B se il cliente vuole un look meno classico.",
      created_at: "2026-03-12T15:00:00Z",
    },
    // Gala
    {
      id: "el-4", event_id: "ev-gala", location_id: "loc-hotel", status: "preferita",
      match_score: 90,
      match_reasons: { matched: ["Tavoli tondi fino a 260 + terrazza per aperitivo", "Catering interno di livello", "Stessa sede della plenaria"], unmatched: ["320 pax oltre la capienza del solo salone (260)"], to_verify: ["Split aperitivo in terrazza + cena su due sale"] },
      client_feedback: "Piace molto la terrazza per l'aperitivo. Da risolvere la capienza a tavoli.",
      created_at: "2026-03-10T09:10:00Z",
    },
    {
      id: "el-5", event_id: "ev-gala", location_id: "loc-villa", status: "sopralluogo_fissato",
      match_score: 84,
      match_reasons: { matched: ["Parco fino a 350 a tavoli", "Scenografia lago"], unmatched: ["45 min da Milano"], to_verify: ["Piano maltempo (limonaia max 110)", "Potenza elettrica per band"] },
      notes: "Sopralluogo con il cliente il 18/7.",
      created_at: "2026-03-15T10:00:00Z",
    },
    {
      id: "el-6", event_id: "ev-gala", location_id: "loc-palazzo", status: "proposta",
      match_score: 78,
      match_reasons: { matched: ["Galleria a tavoli 160 + cortile 180", "Prestigio della sede"], unmatched: ["Cucina solo rigenerazione"], to_verify: ["Disponibilità 15 ottobre"] },
      created_at: "2026-03-15T10:05:00Z",
    },
    // Party
    {
      id: "el-7", event_id: "ev-party", location_id: "loc-officine", status: "preselezionata",
      match_score: 88,
      match_reasons: { matched: ["1.000 pax in piedi", "Musica fino alle 3:00", "103 dB"], unmatched: [], to_verify: ["Guardaroba per 400 persone"] },
      created_at: "2026-04-02T11:00:00Z",
    },
    {
      id: "el-8", event_id: "ev-party", location_id: "loc-hotel", status: "in_valutazione",
      match_score: 65,
      match_reasons: { matched: ["Terrazza scenografica"], unmatched: ["Musica in terrazza solo fino alle 23:30", "Capienza terrazza 300 < 400"], to_verify: [] },
      client_feedback: "Il cliente teme i limiti di orario per il party.",
      created_at: "2026-04-02T11:05:00Z",
    },
    // Lancio Nova (chiuso)
    {
      id: "el-9", event_id: "ev-lancio", location_id: "loc-officine", status: "utilizzata",
      match_score: 91,
      match_reasons: { matched: ["Pareti da videomapping", "Accesso carrabile", "Look industriale richiesto"], unmatched: [], to_verify: [] },
      client_feedback: "Evento riuscitissimo: cliente entusiasta dello spazio.",
      created_at: "2026-01-20T09:00:00Z",
    },
    {
      id: "el-10", event_id: "ev-lancio", location_id: "loc-palazzo", status: "scartata",
      match_score: 55,
      match_reasons: { matched: ["Prestigio"], unmatched: ["Vincoli Belle Arti incompatibili con videomapping"], to_verify: [] },
      created_at: "2026-01-20T09:05:00Z",
    },
  ];

  const visits: (SiteVisit & { event_location_id: string })[] = [
    {
      id: "sv-1", event_location_id: "el-1", scheduled_at: "2026-04-09T10:30:00Z", duration_min: 90,
      attendees: "F. Bonifati, E. Rossi", with_client: false,
      outcome: "Auditorium adeguato; verificare oscuramento foyer per lo streaming.",
    },
    {
      id: "sv-2", event_location_id: "el-4", scheduled_at: "2026-04-09T14:00:00Z", duration_min: 60,
      attendees: "F. Bonifati, E. Rossi", with_client: false,
      outcome: "Terrazza perfetta per aperitivo; chiesta proposta per cena su salone + ristorante.",
    },
    {
      id: "sv-3", event_location_id: "el-5", scheduled_at: "2026-07-18T10:30:00Z", duration_min: 120,
      attendees: "F. Bonifati, G. Ferrari + cliente ACME", with_client: true,
      outcome: null,
    },
    {
      id: "sv-4", event_location_id: "el-9", scheduled_at: "2026-02-06T11:00:00Z", duration_min: 90,
      attendees: "F. Bonifati, S. Marino", with_client: true,
      outcome: "Confermata idoneità per videomapping; misure prese per la regia.",
    },
  ];

  const quotes: (Quote & { event_location_id: string })[] = [
    {
      id: "q-1", event_location_id: "el-1", amount: 18500, currency: "EUR", status: "accettato",
      received_at: "2026-04-20", valid_until: "2026-09-30", notes: "Include regia, tecnico e pulizie.",
    },
    {
      id: "q-2", event_location_id: "el-4", amount: 52400, currency: "EUR", status: "ricevuto",
      received_at: "2026-05-05", valid_until: "2026-08-31", notes: "145 €/pax menu gala + affitto terrazza.",
    },
    {
      id: "q-3", event_location_id: "el-5", amount: 0, currency: "EUR", status: "richiesto",
      notes: "Richiesto preventivo esclusiva villa + generatori.",
    },
    {
      id: "q-4", event_location_id: "el-9", amount: 22000, currency: "EUR", status: "accettato",
      received_at: "2026-03-02", valid_until: "2026-05-01", notes: "Navata + 2 giorni allestimento + energia.",
    },
  ];

  const availability: (AvailabilitySlot & { event_location_id: string })[] = [
    { id: "av-1", event_location_id: "el-1", date: "2026-10-15", status: "opzionata", option_expires_at: "2026-07-31", notes: "Opzione firmata con l'hotel." },
    { id: "av-2", event_location_id: "el-4", date: "2026-10-15", time_from: "19:00", time_to: "01:00", status: "opzionata", option_expires_at: "2026-07-31" },
    { id: "av-3", event_location_id: "el-5", date: "2026-10-15", status: "disponibile", notes: "Da opzionare dopo il sopralluogo." },
    { id: "av-4", event_location_id: "el-6", date: "2026-10-15", status: "non_disponibile", notes: "Già impegnato per evento privato." },
    { id: "av-5", event_location_id: "el-7", date: "2026-10-16", status: "disponibile" },
  ];

  const projectNotes: FixtureProjectNote[] = [
    {
      id: "pn-1", location_id: "loc-hotel", project_id: "proj-acme", event_id: "ev-gala",
      notes: "Per ACME: tariffa salone scontata a 8.000 € se confermata anche la plenaria al centro congressi.",
    },
    {
      id: "pn-2", location_id: "loc-villa", project_id: "proj-acme", event_id: "ev-gala",
      notes: "La villa chiede minimo garantito 250 pax per la data del 15/10.",
    },
    {
      id: "pn-3", location_id: "loc-officine", project_id: "proj-nova", event_id: "ev-lancio",
      notes: "Nova Beauty: ottenuto upgrade energia incluso nel prezzo.",
    },
  ];

  return {
    companies,
    contacts,
    companyContacts,
    locations,
    spaces,
    locationContacts,
    suppliers,
    media,
    priceLists,
    pois,
    projects,
    events,
    eventLocations,
    visits,
    quotes,
    availability,
    projectNotes,
  };
}
