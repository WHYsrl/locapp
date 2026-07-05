import Foundation

// MARK: - JSONValue
//
// Type-safe arbitrary JSON. Used for open-ended payloads (ExtractedLocationDraft.location,
// GeoJSON properties, usage dates) where the SPEC does not fix a shape.
// NOTE: models use explicit CodingKeys instead of .convertFromSnakeCase on purpose —
// the snake_case strategy would also rewrite the keys of [String: JSONValue] dictionaries,
// corrupting field paths like "locations.technical.max_kw".

enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    /// Human-readable rendering (Italian) for draft review rows and generic fields.
    var displayString: String {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            if value.rounded() == value && abs(value) < 1_000_000_000 {
                return String(Int(value))
            }
            return String(value)
        case .bool(let value):
            return value ? "sì" : "no"
        case .null:
            return "—"
        case .array(let values):
            return values.map(\.displayString).joined(separator: ", ")
        case .object(let dict):
            return dict.sorted { $0.key < $1.key }
                .map { "\($0.key): \($0.value.displayString)" }
                .joined(separator: " · ")
        }
    }
}

// MARK: - Enums (SPEC §3 check constraints)

enum VisitStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case daVisitare = "da_visitare"
    case visitata

    var label: String {
        switch self {
        case .daVisitare: "Da visitare"
        case .visitata: "Visitata"
        }
    }
}

enum EventLocationStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case preselezionata
    case proposta
    case sopralluogoFissato = "sopralluogo_fissato"
    case inValutazione = "in_valutazione"
    case preferita
    case scartata
    case confermata
    case utilizzata

    var label: String {
        switch self {
        case .preselezionata: "Preselezionata"
        case .proposta: "Proposta"
        case .sopralluogoFissato: "Sopralluogo fissato"
        case .inValutazione: "In valutazione"
        case .preferita: "Preferita"
        case .scartata: "Scartata"
        case .confermata: "Confermata"
        case .utilizzata: "Utilizzata"
        }
    }
}

enum SpaceKind: String, Codable, Sendable, CaseIterable, Hashable {
    case interno
    case esterno

    var label: String { rawValue.capitalized }
}

enum CoveredKind: String, Codable, Sendable, CaseIterable, Hashable {
    case coperto
    case scoperto
    case copribile

    var label: String { rawValue.capitalized }
}

enum CapacityConfiguration: String, Codable, Sendable, CaseIterable, Hashable {
    case inPiedi = "in_piedi"
    case tavoliTondi = "tavoli_tondi"
    case tavoloImperiale = "tavolo_imperiale"
    case platea
    case ferroDiCavallo = "ferro_di_cavallo"
    case classroom
    case cocktail

    var label: String {
        switch self {
        case .inPiedi: "In piedi"
        case .tavoliTondi: "Tavoli tondi"
        case .tavoloImperiale: "Tavolo imperiale"
        case .platea: "Platea"
        case .ferroDiCavallo: "Ferro di cavallo"
        case .classroom: "Classroom"
        case .cocktail: "Cocktail"
        }
    }
}

enum CompanyKind: String, Codable, Sendable, CaseIterable, Hashable {
    case gestione
    case fornitore
    case entrambi

    var label: String { rawValue.capitalized }
}

enum ProjectStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case attivo
    case chiuso
    case archiviato

    var label: String { rawValue.capitalized }
}

enum QuoteStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case richiesto
    case ricevuto
    case accettato
    case rifiutato
    case scaduto

    var label: String { rawValue.capitalized }
}

enum AvailabilityStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case disponibile
    case opzionata
    case nonDisponibile = "non_disponibile"

    var label: String {
        switch self {
        case .disponibile: "Disponibile"
        case .opzionata: "Opzionata"
        case .nonDisponibile: "Non disponibile"
        }
    }
}

enum IngestionStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case pending
    case processing
    case ready
    case applied
    case failed

    var label: String {
        switch self {
        case .pending: "In coda"
        case .processing: "In elaborazione"
        case .ready: "Bozza pronta"
        case .applied: "Applicata"
        case .failed: "Fallita"
        }
    }
}

enum IngestionSourceType: String, Codable, Sendable, CaseIterable, Hashable {
    case audio
    case testo
    case url
    case pdf
    case pptx
    case docx
    case immagine
}

// MARK: - JSONB sub-structures (locations.logistics / setup / party / technical)

struct ZTLInfo: Codable, Hashable, Sendable {
    var present: Bool?
    var hours: String?
    var permits: String?

    enum CodingKeys: String, CodingKey {
        case present
        case hours
        case permits
    }
}

struct PrivateParking: Codable, Hashable, Sendable {
    var spots: Int?

    enum CodingKeys: String, CodingKey {
        case spots
    }
}

struct NearbyParking: Codable, Hashable, Sendable {
    var name: String?
    var distanceM: Double?

    enum CodingKeys: String, CodingKey {
        case name
        case distanceM = "distance_m"
    }
}

struct Logistics: Codable, Hashable, Sendable {
    // Free-text on the backend ("accesso facile dal cancello nord"), decoded
    // leniently so legacy boolean payloads still render as "sì"/"no".
    var auto: String?
    var pullman: String?
    var ztl: ZTLInfo?
    var stopDifficulty: String?
    var privateParking: PrivateParking?
    var nearbyParking: [NearbyParking]?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case auto
        case pullman
        case ztl
        case stopDifficulty = "stop_difficulty"
        case privateParking = "private_parking"
        case nearbyParking = "nearby_parking"
        case notes
    }
}

struct SetupInfo: Codable, Hashable, Sendable {
    var furniture: String?
    var lights: String?
    var projections: String?
    var stage: String?
    var audio: String?
    var constraints: [String]?

    enum CodingKeys: String, CodingKey {
        case furniture
        case lights
        case projections
        case stage
        case audio
        case constraints
    }
}

struct PartyRules: Codable, Hashable, Sendable {
    var allowed: Bool?
    var musicUntil: String?

    enum CodingKeys: String, CodingKey {
        case allowed
        case musicUntil = "music_until"
    }
}

struct PartyInfo: Codable, Hashable, Sendable {
    var indoor: PartyRules?
    var outdoor: PartyRules?
    var structuralConstraints: [String]?
    var dbLimit: Double?

    enum CodingKeys: String, CodingKey {
        case indoor
        case outdoor
        case structuralConstraints = "structural_constraints"
        case dbLimit = "db_limit"
    }
}

struct TechnicalInfo: Codable, Hashable, Sendable {
    var maxKw: Double?
    var generators: Bool?
    var aerialLadder: Bool?
    var cooking: String? // fiamma | induzione | rigenerazione | no
    var heavyVehicleAccess: Bool?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case maxKw = "max_kw"
        case generators
        case aerialLadder = "aerial_ladder"
        case cooking
        case heavyVehicleAccess = "heavy_vehicle_access"
        case notes
    }
}

struct BathroomInfo: Codable, Hashable, Sendable {
    var count: Int?
    var accessible: Bool?

    enum CodingKeys: String, CodingKey {
        case count
        case accessible
    }
}

struct SpaceFeatures: Codable, Hashable, Sendable {
    var foyer: Bool?
    var guardaroba: Bool?
    var bagni: BathroomInfo?
    var cucina: Bool?
    var ascensore: Bool?
    var scale: Bool?
    var arredi: [String]?

    enum CodingKeys: String, CodingKey {
        case foyer
        case guardaroba
        case bagni
        case cucina
        case ascensore
        case scale
        case arredi
    }
}

// MARK: - Spaces

struct SpaceCapacity: Codable, Hashable, Sendable {
    var configuration: CapacityConfiguration
    var capacity: Int
}

struct Space: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var locationId: String?
    var kind: SpaceKind?
    var name: String
    var areaSqm: Double?
    var heightM: Double?
    var covered: CoveredKind?
    var features: SpaceFeatures?
    var sort: Int?
    var capacities: [SpaceCapacity]?

    enum CodingKeys: String, CodingKey {
        case id
        case locationId = "location_id"
        case kind
        case name
        case areaSqm = "area_sqm"
        case heightM = "height_m"
        case covered
        case features
        case sort
        case capacities
    }
}

// MARK: - Registry (companies, contacts)

struct Company: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var kind: CompanyKind?
    var supplierCategories: [String]?
    var vatNumber: String?
    var email: String?
    var phone: String?
    var website: String?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case kind
        case supplierCategories = "supplier_categories"
        case vatNumber = "vat_number"
        case email
        case phone
        case website
        case notes
    }
}

struct Contact: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var firstName: String?
    var lastName: String?
    var email: String?
    var phone: String?
    var notes: String?

    var fullName: String {
        [firstName, lastName].compactMap { $0 }.joined(separator: " ")
    }

    enum CodingKeys: String, CodingKey {
        case id
        case firstName = "first_name"
        case lastName = "last_name"
        case email
        case phone
        case notes
    }
}

/// Referente of a location. Shape assumed flat (contact fields + role + company name).
struct LocationContact: Codable, Hashable, Sendable, Identifiable {
    var contactId: String
    var firstName: String?
    var lastName: String?
    var email: String?
    var phone: String?
    var role: String?
    var companyId: String?
    var companyName: String?

    var id: String { contactId + (role ?? "") }

    var fullName: String {
        [firstName, lastName].compactMap { $0 }.joined(separator: " ")
    }

    enum CodingKeys: String, CodingKey {
        case contactId = "contact_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case email
        case phone
        case role
        case companyId = "company_id"
        case companyName = "company_name"
    }
}

struct LocationSupplier: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var companyId: String?
    var companyName: String?
    var contactId: String?
    var category: String? // catering, service_avl, allestimenti, arredi, fiori, vigilanza
    var requirement: String? // obbligatorio | consigliato
    var conditions: String?
    var rating: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case companyId = "company_id"
        case companyName = "company_name"
        case contactId = "contact_id"
        case category
        case requirement
        case conditions
        case rating
    }
}

// MARK: - Media & price lists

struct MediaItem: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var locationId: String?
    var spaceId: String?
    var kind: String? // foto | video | planimetria | documento | listino
    var category: String?
    var url: String?
    var filename: String?
    var mime: String?
    var aiTags: [String]?

    enum CodingKeys: String, CodingKey {
        case id
        case locationId = "location_id"
        case spaceId = "space_id"
        case kind
        case category
        case url
        case filename
        case mime
        case aiTags = "ai_tags"
    }
}

struct PriceItem: Codable, Hashable, Sendable {
    var voce: String?
    var prezzo: Double?
    var unita: String?
    var note: String?
    var stagionalita: String?

    enum CodingKeys: String, CodingKey {
        case voce
        case prezzo
        case unita
        case note
        case stagionalita
    }
}

struct PaymentTerms: Codable, Hashable, Sendable {
    var accontoPct: Double?
    var saldo: String?
    var metodi: [String]?

    enum CodingKeys: String, CodingKey {
        case accontoPct = "acconto_pct"
        case saldo
        case metodi
    }
}

struct PriceList: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String?
    var validFrom: String?
    var validTo: String?
    var items: [PriceItem]?
    var paymentTerms: PaymentTerms?
    var extractedByAi: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case validFrom = "valid_from"
        case validTo = "valid_to"
        case items
        case paymentTerms = "payment_terms"
        case extractedByAi = "extracted_by_ai"
    }
}

// MARK: - Location

/// GET /locations/:id `usage_summary`: `{proposta, utilizzata, entries:[UsageEntry]}` (SPEC §2.4).
struct UsageSummary: Codable, Hashable, Sendable {
    var proposta: Bool?
    var utilizzata: Bool?
    var entries: [UsageEntry]?

    enum CodingKeys: String, CodingKey {
        case proposta
        case utilizzata
        case entries
    }
}

struct Location: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var parentLocationId: String?
    var name: String
    var slug: String?
    var summary: String?
    var addressLine: String?
    var city: String?
    var province: String?
    var postalCode: String?
    var country: String?
    // Geometry assumed exposed by the API as flat lat/lng (SPEC stores PostGIS Point).
    var latitude: Double?
    var longitude: Double?
    var googleMapsUrl: String?
    var thumbnailUrl: String?
    var visitStatus: VisitStatus?
    var logistics: Logistics?
    /// Resolved from parent when own logistics is null (SPEC §2.3).
    var effectiveLogistics: Logistics?
    var setup: SetupInfo?
    var party: PartyInfo?
    var technical: TechnicalInfo?
    var accessibilityRating: Int?
    var accessibilityNotes: String?
    var availabilityRules: String?
    var smartTags: [String]?
    var impressions: String?
    // Detail payload extras (GET /locations/:id)
    var children: [Location]?
    var spaces: [Space]?
    var contacts: [LocationContact]?
    var suppliers: [LocationSupplier]?
    var media: [MediaItem]?
    var priceLists: [PriceList]?
    var usageSummary: UsageSummary?
    var createdAt: String?
    var updatedAt: String?

    var shortAddress: String {
        [addressLine, city].compactMap { $0 }.joined(separator: ", ")
    }

    /// True when logistics shown to the user are inherited from the parent location.
    var logisticsAreInherited: Bool {
        logistics == nil && effectiveLogistics != nil && parentLocationId != nil
    }

    var displayLogistics: Logistics? {
        effectiveLogistics ?? logistics
    }

    enum CodingKeys: String, CodingKey {
        case id
        case parentLocationId = "parent_location_id"
        case name
        case slug
        case summary
        case addressLine = "address_line"
        case city
        case province
        case postalCode = "postal_code"
        case country
        case latitude
        case longitude
        case googleMapsUrl = "google_maps_url"
        case thumbnailUrl = "thumbnail_url"
        case visitStatus = "visit_status"
        case logistics
        case effectiveLogistics = "effective_logistics"
        case setup
        case party
        case technical
        case accessibilityRating = "accessibility_rating"
        case accessibilityNotes = "accessibility_notes"
        case availabilityRules = "availability_rules"
        case smartTags = "smart_tags"
        case impressions
        case children
        case spaces
        case contacts
        case suppliers
        case media
        case priceLists = "price_lists"
        case usageSummary = "usage_summary"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Usage & history (GET /locations/:id/usage, /history)

struct EntityRef: Codable, Hashable, Sendable {
    var id: String?
    var name: String?
}

struct UsageEntry: Codable, Hashable, Sendable, Identifiable {
    var project: EntityRef?
    var event: EntityRef?
    var status: EventLocationStatus?
    /// Backend sends `{start,end}` (nullable dates); kept generic for tolerance.
    var dates: JSONValue?

    var id: String {
        (project?.id ?? "") + "/" + (event?.id ?? "") + "/" + (status?.rawValue ?? "")
    }

    enum CodingKeys: String, CodingKey {
        case project
        case event
        case status
        case dates
    }
}

struct HistoryEntry: Codable, Hashable, Sendable, Identifiable {
    var kind: String? // site_visit | event | quote | feedback (assumed)
    var date: String?
    var title: String?
    var details: String?

    var id: String {
        (kind ?? "") + (date ?? "") + (title ?? "")
    }
}

// MARK: - Projects & events

struct Project: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var clientName: String?
    var status: ProjectStatus?
    var notes: String?
    var events: [Event]?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case clientName = "client_name"
        case status
        case notes
        case events
    }
}

struct Event: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var projectId: String?
    var name: String
    var eventType: String?
    var dateStart: String?
    var dateEnd: String?
    var pax: Int?
    var brief: String?
    var notes: String?
    var sort: Int?
    /// Shortlist counts keyed by EventLocationStatus raw value (GET /projects/:id).
    var locationCounts: [String: Int]?

    var totalShortlisted: Int {
        (locationCounts ?? [:]).values.reduce(0, +)
    }

    enum CodingKeys: String, CodingKey {
        case id
        case projectId = "project_id"
        case name
        case eventType = "event_type"
        case dateStart = "date_start"
        case dateEnd = "date_end"
        case pax
        case brief
        case notes
        case sort
        case locationCounts = "location_counts"
    }
}

struct SiteVisit: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var scheduledAt: String?
    var durationMin: Int?
    var attendees: String?
    var withClient: Bool?
    var outcome: String?

    enum CodingKeys: String, CodingKey {
        case id
        case scheduledAt = "scheduled_at"
        case durationMin = "duration_min"
        case attendees
        case withClient = "with_client"
        case outcome
    }
}

struct Quote: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var amount: Double?
    var currency: String?
    var status: QuoteStatus?
    var receivedAt: String?
    var validUntil: String?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case id
        case amount
        case currency
        case status
        case receivedAt = "received_at"
        case validUntil = "valid_until"
        case notes
    }
}

struct AvailabilitySlot: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var date: String?
    var timeFrom: String?
    var timeTo: String?
    var status: AvailabilityStatus?
    var optionExpiresAt: String?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case id
        case date
        case timeFrom = "time_from"
        case timeTo = "time_to"
        case status
        case optionExpiresAt = "option_expires_at"
        case notes
    }
}

struct MatchReasons: Codable, Hashable, Sendable {
    var matched: [String]?
    var unmatched: [String]?
    var toVerify: [String]?

    enum CodingKeys: String, CodingKey {
        case matched
        case unmatched
        case toVerify = "to_verify"
    }
}

struct EventLocation: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var eventId: String?
    var locationId: String?
    var status: EventLocationStatus?
    var matchScore: Double?
    var matchReasons: MatchReasons?
    var clientFeedback: String?
    var notes: String?
    /// Embedded summary (GET /events/:id/locations).
    var location: Location?
    var visits: [SiteVisit]?
    var quotes: [Quote]?
    var availability: [AvailabilitySlot]?

    enum CodingKeys: String, CodingKey {
        case id
        case eventId = "event_id"
        case locationId = "location_id"
        case status
        case matchScore = "match_score"
        case matchReasons = "match_reasons"
        case clientFeedback = "client_feedback"
        case notes
        case location
        case visits
        case quotes
        case availability
    }
}

// MARK: - Search (POST /search/brief)

struct DistanceInfo: Codable, Hashable, Sendable {
    var poi: String?
    var km: Double?
    var minutesCar: Double?

    enum CodingKeys: String, CodingKey {
        case poi
        case km
        case minutesCar = "minutes_car"
    }
}

struct SearchResult: Codable, Hashable, Sendable, Identifiable {
    var location: Location
    var score: Double
    var reasons: MatchReasons?
    var distances: [DistanceInfo]?

    var id: String { location.id }

    enum CodingKeys: String, CodingKey {
        case location
        case score
        case reasons
        case distances
    }
}

// MARK: - Ingestion (SPEC §5)

struct DraftSpace: Codable, Hashable, Sendable {
    var kind: String?
    var name: String?
    var areaSqm: Double?
    var capacities: [String: Int]?

    enum CodingKeys: String, CodingKey {
        case kind
        case name
        case areaSqm = "area_sqm"
        case capacities
    }
}

struct DraftContact: Codable, Hashable, Sendable {
    var firstName: String?
    var lastName: String?
    var role: String?
    var phone: String?
    var email: String?
    var companyName: String?

    enum CodingKeys: String, CodingKey {
        case firstName = "first_name"
        case lastName = "last_name"
        case role
        case phone
        case email
        case companyName = "company_name"
    }
}

struct DraftSupplier: Codable, Hashable, Sendable {
    var companyName: String?
    var category: String?
    var requirement: String?

    enum CodingKeys: String, CodingKey {
        case companyName = "company_name"
        case category
        case requirement
    }
}

struct ExtractedLocationDraft: Codable, Hashable, Sendable {
    var confidence: Double?
    /// Keys are `locations` column names, values arbitrary JSON (SPEC §5).
    var location: [String: JSONValue]?
    var spaces: [DraftSpace]?
    var contacts: [DraftContact]?
    var suppliers: [DraftSupplier]?
    var priceItems: [PriceItem]?
    var openQuestions: [String]?
    var fieldSources: [String: String]?

    enum CodingKeys: String, CodingKey {
        case confidence
        case location
        case spaces
        case contacts
        case suppliers
        case priceItems = "price_items"
        case openQuestions = "open_questions"
        case fieldSources = "field_sources"
    }
}

struct IngestionJob: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var locationId: String?
    var sourceType: IngestionSourceType?
    var sourceUrl: String?
    var rawText: String?
    var status: IngestionStatus
    var extracted: ExtractedLocationDraft?
    var error: String?
    var createdAt: String?
    var appliedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case locationId = "location_id"
        case sourceType = "source_type"
        case sourceUrl = "source_url"
        case rawText = "raw_text"
        case status
        case extracted
        case error
        case createdAt = "created_at"
        case appliedAt = "applied_at"
    }
}

// MARK: - Auth

struct User: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var email: String
    var name: String?
    var role: String?
}

// MARK: - GeoJSON (GET /events/:id/map, /projects/:id/map)

struct GeoGeometry: Codable, Hashable, Sendable {
    var type: String
    /// Point only: [longitude, latitude].
    var coordinates: [Double]
}

struct GeoFeature: Codable, Hashable, Sendable {
    var type: String?
    var geometry: GeoGeometry?
    var properties: [String: JSONValue]?
}

struct GeoFeatureCollection: Codable, Hashable, Sendable {
    var type: String?
    var features: [GeoFeature]
}

// MARK: - Lenient decoding
//
// The backend serializes Postgres rows almost verbatim: `numeric` columns may
// arrive as strings ("4500" instead of 4500), jsonb blobs (logistics/setup/party/
// technical) are free-form because AI ingestion fills them, and enum-ish text
// columns can grow new values. Everything below decodes "best effort" so that a
// single odd field or malformed record never blanks a whole screen.
//
// All custom `init(from:)` live in extensions on purpose: the compiler keeps the
// memberwise initializers (used by Mocks/previews) and the synthesized
// `encode(to:)` (used by the outbox).

/// Array that decodes elements one by one, dropping the ones that fail.
struct LossyArray<Element: Decodable & Sendable>: Decodable, Sendable {
    var elements: [Element]

    private struct AnyDecodableStub: Decodable {
        init(from decoder: Decoder) throws {}
    }

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var result: [Element] = []
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                result.append(element)
            } else if (try? container.decode(AnyDecodableStub.self)) == nil {
                break // container refuses to advance; bail out instead of spinning
            }
        }
        elements = result
    }
}

extension KeyedDecodingContainer {
    /// Double that may arrive as a JSON number or a numeric string (pg `numeric`).
    func lossyDouble(_ key: Key) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(String.self, forKey: key) {
            return Double(value.replacingOccurrences(of: ",", with: "."))
        }
        return nil
    }

    func lossyInt(_ key: Key) -> Int? {
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value }
        if let value = lossyDouble(key) { return Int(value) }
        return nil
    }

    /// Free-text field that some sources fill with a bool or a number instead.
    func lossyString(_ key: Key) -> String? {
        if let value = try? decodeIfPresent(String.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Bool.self, forKey: key) { return value ? "sì" : "no" }
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return String(value) }
        if let value = try? decodeIfPresent(Double.self, forKey: key) { return String(value) }
        return nil
    }

    func lossyBool(_ key: Key) -> Bool? {
        if let value = try? decodeIfPresent(Bool.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(String.self, forKey: key) {
            switch value.lowercased() {
            case "true", "1", "sì", "si", "yes": return true
            case "false", "0", "no": return false
            default: return nil
            }
        }
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value != 0 }
        return nil
    }

    /// [String] that may arrive as a single string or a comma-separated list.
    func lossyStringArray(_ key: Key) -> [String]? {
        if let value = try? decodeIfPresent([String].self, forKey: key) { return value }
        if let value = try? decodeIfPresent(String.self, forKey: key) {
            let parts = value
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            return parts.isEmpty ? [value] : parts
        }
        return nil
    }

    /// Per-item lossy list: malformed entries are skipped, not fatal.
    func lossyList<T: Decodable & Sendable>(_ type: T.Type, _ key: Key) -> [T]? {
        (try? decodeIfPresent(LossyArray<T>.self, forKey: key))?.elements
    }
}

// MARK: JSONB sub-structures

extension ZTLInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        present = c.lossyBool(.present)
        hours = c.lossyString(.hours)
        permits = c.lossyString(.permits)
    }
}

extension PrivateParking {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        spots = c.lossyInt(.spots)
    }
}

extension NearbyParking {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.lossyString(.name)
        distanceM = c.lossyDouble(.distanceM)
    }
}

extension Logistics {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        auto = c.lossyString(.auto)
        pullman = c.lossyString(.pullman)
        ztl = try? c.decodeIfPresent(ZTLInfo.self, forKey: .ztl)
        stopDifficulty = c.lossyString(.stopDifficulty)
        privateParking = try? c.decodeIfPresent(PrivateParking.self, forKey: .privateParking)
        nearbyParking = c.lossyList(NearbyParking.self, .nearbyParking)
        notes = c.lossyString(.notes)
    }
}

extension SetupInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        furniture = c.lossyString(.furniture)
        lights = c.lossyString(.lights)
        projections = c.lossyString(.projections)
        stage = c.lossyString(.stage)
        audio = c.lossyString(.audio)
        constraints = c.lossyStringArray(.constraints)
    }
}

extension PartyRules {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        allowed = c.lossyBool(.allowed)
        musicUntil = c.lossyString(.musicUntil)
    }
}

extension PartyInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        indoor = try? c.decodeIfPresent(PartyRules.self, forKey: .indoor)
        outdoor = try? c.decodeIfPresent(PartyRules.self, forKey: .outdoor)
        structuralConstraints = c.lossyStringArray(.structuralConstraints)
        dbLimit = c.lossyDouble(.dbLimit)
    }
}

extension TechnicalInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        maxKw = c.lossyDouble(.maxKw)
        generators = c.lossyBool(.generators)
        aerialLadder = c.lossyBool(.aerialLadder)
        cooking = c.lossyString(.cooking)
        heavyVehicleAccess = c.lossyBool(.heavyVehicleAccess)
        notes = c.lossyString(.notes)
    }
}

extension BathroomInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        count = c.lossyInt(.count)
        accessible = c.lossyBool(.accessible)
    }
}

extension SpaceFeatures {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        foyer = c.lossyBool(.foyer)
        guardaroba = c.lossyBool(.guardaroba)
        bagni = try? c.decodeIfPresent(BathroomInfo.self, forKey: .bagni)
        cucina = c.lossyBool(.cucina)
        ascensore = c.lossyBool(.ascensore)
        scale = c.lossyBool(.scale)
        arredi = c.lossyStringArray(.arredi)
    }
}

// MARK: Spaces, suppliers, price lists

extension Space {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Spazio"
        locationId = try? c.decodeIfPresent(String.self, forKey: .locationId)
        kind = try? c.decodeIfPresent(SpaceKind.self, forKey: .kind)
        areaSqm = c.lossyDouble(.areaSqm)
        heightM = c.lossyDouble(.heightM)
        covered = try? c.decodeIfPresent(CoveredKind.self, forKey: .covered)
        features = try? c.decodeIfPresent(SpaceFeatures.self, forKey: .features)
        sort = c.lossyInt(.sort)
        capacities = c.lossyList(SpaceCapacity.self, .capacities)
    }
}

extension LocationSupplier {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        companyId = try? c.decodeIfPresent(String.self, forKey: .companyId)
        companyName = try? c.decodeIfPresent(String.self, forKey: .companyName)
        contactId = try? c.decodeIfPresent(String.self, forKey: .contactId)
        category = c.lossyString(.category)
        requirement = c.lossyString(.requirement)
        conditions = try? c.decodeIfPresent(String.self, forKey: .conditions)
        rating = c.lossyDouble(.rating)
    }
}

extension PriceItem {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        voce = c.lossyString(.voce)
        prezzo = c.lossyDouble(.prezzo)
        unita = c.lossyString(.unita)
        note = c.lossyString(.note)
        stagionalita = c.lossyString(.stagionalita)
    }
}

extension PaymentTerms {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accontoPct = c.lossyDouble(.accontoPct)
        saldo = c.lossyString(.saldo)
        metodi = c.lossyStringArray(.metodi)
    }
}

extension PriceList {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        validFrom = try? c.decodeIfPresent(String.self, forKey: .validFrom)
        validTo = try? c.decodeIfPresent(String.self, forKey: .validTo)
        items = c.lossyList(PriceItem.self, .items)
        paymentTerms = try? c.decodeIfPresent(PaymentTerms.self, forKey: .paymentTerms)
        extractedByAi = c.lossyBool(.extractedByAi)
    }
}

// MARK: Location

extension Location {
    /// The list payload has no coordinates; the detail payload exposes them as
    /// top-level `lon`/`lat` (ST_X/ST_Y of the PostGIS point).
    private enum GeoKeys: String, CodingKey {
        case latitude
        case longitude
        case lat
        case lon
        case lng
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Senza nome"
        parentLocationId = try? c.decodeIfPresent(String.self, forKey: .parentLocationId)
        slug = try? c.decodeIfPresent(String.self, forKey: .slug)
        summary = try? c.decodeIfPresent(String.self, forKey: .summary)
        addressLine = try? c.decodeIfPresent(String.self, forKey: .addressLine)
        city = try? c.decodeIfPresent(String.self, forKey: .city)
        province = try? c.decodeIfPresent(String.self, forKey: .province)
        postalCode = c.lossyString(.postalCode)
        country = try? c.decodeIfPresent(String.self, forKey: .country)
        googleMapsUrl = try? c.decodeIfPresent(String.self, forKey: .googleMapsUrl)
        thumbnailUrl = try? c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        visitStatus = try? c.decodeIfPresent(VisitStatus.self, forKey: .visitStatus)
        logistics = try? c.decodeIfPresent(Logistics.self, forKey: .logistics)
        effectiveLogistics = try? c.decodeIfPresent(Logistics.self, forKey: .effectiveLogistics)
        setup = try? c.decodeIfPresent(SetupInfo.self, forKey: .setup)
        party = try? c.decodeIfPresent(PartyInfo.self, forKey: .party)
        technical = try? c.decodeIfPresent(TechnicalInfo.self, forKey: .technical)
        accessibilityRating = c.lossyInt(.accessibilityRating)
        accessibilityNotes = try? c.decodeIfPresent(String.self, forKey: .accessibilityNotes)
        availabilityRules = try? c.decodeIfPresent(String.self, forKey: .availabilityRules)
        smartTags = c.lossyStringArray(.smartTags)
        impressions = try? c.decodeIfPresent(String.self, forKey: .impressions)
        children = c.lossyList(Location.self, .children)
        spaces = c.lossyList(Space.self, .spaces)
        contacts = c.lossyList(LocationContact.self, .contacts)
        suppliers = c.lossyList(LocationSupplier.self, .suppliers)
        media = c.lossyList(MediaItem.self, .media)
        priceLists = c.lossyList(PriceList.self, .priceLists)
        usageSummary = try? c.decodeIfPresent(UsageSummary.self, forKey: .usageSummary)
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try? c.decodeIfPresent(String.self, forKey: .updatedAt)

        let geo = try decoder.container(keyedBy: GeoKeys.self)
        latitude = geo.lossyDouble(.latitude) ?? geo.lossyDouble(.lat)
        longitude = geo.lossyDouble(.longitude) ?? geo.lossyDouble(.lon) ?? geo.lossyDouble(.lng)
    }

    /// Minimal card built from the flat fields embedded in other payloads
    /// (event shortlist rows, brief search results).
    init(
        id: String,
        name: String,
        city: String? = nil,
        summary: String? = nil,
        thumbnailUrl: String? = nil,
        smartTags: [String]? = nil,
        latitude: Double? = nil,
        longitude: Double? = nil
    ) {
        self.id = id
        self.name = name
        self.city = city
        self.summary = summary
        self.thumbnailUrl = thumbnailUrl
        self.smartTags = smartTags
        self.latitude = latitude
        self.longitude = longitude
        self.parentLocationId = nil
        self.slug = nil
        self.addressLine = nil
        self.province = nil
        self.postalCode = nil
        self.country = nil
        self.googleMapsUrl = nil
        self.visitStatus = nil
        self.logistics = nil
        self.effectiveLogistics = nil
        self.setup = nil
        self.party = nil
        self.technical = nil
        self.accessibilityRating = nil
        self.accessibilityNotes = nil
        self.availabilityRules = nil
        self.impressions = nil
        self.children = nil
        self.spaces = nil
        self.contacts = nil
        self.suppliers = nil
        self.media = nil
        self.priceLists = nil
        self.usageSummary = nil
        self.createdAt = nil
        self.updatedAt = nil
    }
}

// MARK: Usage & history

extension UsageEntry {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        project = try? c.decodeIfPresent(EntityRef.self, forKey: .project)
        event = try? c.decodeIfPresent(EntityRef.self, forKey: .event)
        status = try? c.decodeIfPresent(EventLocationStatus.self, forKey: .status)
        dates = try? c.decodeIfPresent(JSONValue.self, forKey: .dates)
    }
}

extension HistoryEntry {
    /// Wire shape (GET /locations/:id/history): `{type, at, data:{...}}`;
    /// `kind`/`date`/`title`/`details` are also accepted for round-tripping mocks.
    private enum WireKeys: String, CodingKey {
        case type
        case at
        case data
        case kind
        case date
        case title
        case details
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: WireKeys.self)
        let kindValue = (try? c.decodeIfPresent(String.self, forKey: .type))
            ?? (try? c.decodeIfPresent(String.self, forKey: .kind))
        let dateValue = (try? c.decodeIfPresent(String.self, forKey: .at))
            ?? (try? c.decodeIfPresent(String.self, forKey: .date))
        let payload = try? c.decodeIfPresent([String: JSONValue].self, forKey: .data)
        kind = kindValue
        date = dateValue
        title = (try? c.decodeIfPresent(String.self, forKey: .title))
            ?? HistoryEntry.title(for: kindValue, payload: payload)
        details = (try? c.decodeIfPresent(String.self, forKey: .details))
            ?? HistoryEntry.details(payload: payload)
    }

    private static func title(for kind: String?, payload: [String: JSONValue]?) -> String? {
        if let value = payload?["event_name"], case .string(let name) = value {
            return name
        }
        switch kind {
        case "site_visit": return "Sopralluogo"
        case "quote": return "Preventivo"
        case "event_link": return "Collegata a evento"
        case "feedback": return "Feedback"
        default: return kind
        }
    }

    private static func details(payload: [String: JSONValue]?) -> String? {
        guard let payload else { return nil }
        var parts: [String] = []
        for key in ["project_name", "status", "outcome", "amount", "notes"] {
            if let value = payload[key], value != .null {
                parts.append(value.displayString)
            }
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: Projects & events

extension Project {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Progetto"
        clientName = try? c.decodeIfPresent(String.self, forKey: .clientName)
        status = try? c.decodeIfPresent(ProjectStatus.self, forKey: .status)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        events = c.lossyList(Event.self, .events)
    }
}

extension Event {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Evento"
        projectId = try? c.decodeIfPresent(String.self, forKey: .projectId)
        eventType = try? c.decodeIfPresent(String.self, forKey: .eventType)
        dateStart = try? c.decodeIfPresent(String.self, forKey: .dateStart)
        dateEnd = try? c.decodeIfPresent(String.self, forKey: .dateEnd)
        pax = c.lossyInt(.pax)
        brief = try? c.decodeIfPresent(String.self, forKey: .brief)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        sort = c.lossyInt(.sort)
        locationCounts = try? c.decodeIfPresent([String: Int].self, forKey: .locationCounts)
    }
}

extension SiteVisit {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        scheduledAt = try? c.decodeIfPresent(String.self, forKey: .scheduledAt)
        durationMin = c.lossyInt(.durationMin)
        attendees = try? c.decodeIfPresent(String.self, forKey: .attendees)
        withClient = c.lossyBool(.withClient)
        outcome = try? c.decodeIfPresent(String.self, forKey: .outcome)
    }
}

extension Quote {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        amount = c.lossyDouble(.amount)
        currency = try? c.decodeIfPresent(String.self, forKey: .currency)
        status = try? c.decodeIfPresent(QuoteStatus.self, forKey: .status)
        receivedAt = try? c.decodeIfPresent(String.self, forKey: .receivedAt)
        validUntil = try? c.decodeIfPresent(String.self, forKey: .validUntil)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
    }
}

extension AvailabilitySlot {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        date = try? c.decodeIfPresent(String.self, forKey: .date)
        timeFrom = try? c.decodeIfPresent(String.self, forKey: .timeFrom)
        timeTo = try? c.decodeIfPresent(String.self, forKey: .timeTo)
        status = try? c.decodeIfPresent(AvailabilityStatus.self, forKey: .status)
        optionExpiresAt = try? c.decodeIfPresent(String.self, forKey: .optionExpiresAt)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
    }
}

extension EventLocation {
    /// GET /events/:id/locations embeds the joined location as flat columns
    /// (`location_name`, `location_city`, ..., `lon`, `lat`), not a nested object.
    private enum FlatLocationKeys: String, CodingKey {
        case locationName = "location_name"
        case locationCity = "location_city"
        case locationThumbnail = "location_thumbnail"
        case locationTags = "location_tags"
        case lat
        case lon
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        eventId = try? c.decodeIfPresent(String.self, forKey: .eventId)
        locationId = try? c.decodeIfPresent(String.self, forKey: .locationId)
        status = try? c.decodeIfPresent(EventLocationStatus.self, forKey: .status)
        matchScore = c.lossyDouble(.matchScore)
        matchReasons = try? c.decodeIfPresent(MatchReasons.self, forKey: .matchReasons)
        clientFeedback = try? c.decodeIfPresent(String.self, forKey: .clientFeedback)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        visits = c.lossyList(SiteVisit.self, .visits)
        quotes = c.lossyList(Quote.self, .quotes)
        availability = c.lossyList(AvailabilitySlot.self, .availability)

        if let embedded = try? c.decodeIfPresent(Location.self, forKey: .location) {
            location = embedded
        } else {
            let flat = try decoder.container(keyedBy: FlatLocationKeys.self)
            if let name = try? flat.decodeIfPresent(String.self, forKey: .locationName) {
                location = Location(
                    id: (try? c.decodeIfPresent(String.self, forKey: .locationId)) ?? id,
                    name: name,
                    city: try? flat.decodeIfPresent(String.self, forKey: .locationCity),
                    thumbnailUrl: try? flat.decodeIfPresent(String.self, forKey: .locationThumbnail),
                    smartTags: flat.lossyStringArray(.locationTags),
                    latitude: flat.lossyDouble(.lat),
                    longitude: flat.lossyDouble(.lon)
                )
            } else {
                location = nil
            }
        }
    }
}

// MARK: Search

extension DistanceInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        poi = try? c.decodeIfPresent(String.self, forKey: .poi)
        km = c.lossyDouble(.km)
        minutesCar = c.lossyDouble(.minutesCar)
    }
}

extension SearchResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        location = try c.decode(Location.self, forKey: .location)
        score = c.lossyDouble(.score) ?? 0
        reasons = try? c.decodeIfPresent(MatchReasons.self, forKey: .reasons)
        distances = c.lossyList(DistanceInfo.self, .distances)
    }
}

// MARK: Ingestion

extension DraftSpace {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = c.lossyString(.kind)
        name = c.lossyString(.name)
        areaSqm = c.lossyDouble(.areaSqm)
        if let ints = try? c.decodeIfPresent([String: Int].self, forKey: .capacities) {
            capacities = ints
        } else if let doubles = try? c.decodeIfPresent([String: Double].self, forKey: .capacities) {
            capacities = doubles.mapValues { Int($0) }
        } else {
            capacities = nil
        }
    }
}

extension ExtractedLocationDraft {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        confidence = c.lossyDouble(.confidence)
        location = try? c.decodeIfPresent([String: JSONValue].self, forKey: .location)
        spaces = c.lossyList(DraftSpace.self, .spaces)
        contacts = c.lossyList(DraftContact.self, .contacts)
        suppliers = c.lossyList(DraftSupplier.self, .suppliers)
        priceItems = c.lossyList(PriceItem.self, .priceItems)
        openQuestions = c.lossyStringArray(.openQuestions)
        fieldSources = try? c.decodeIfPresent([String: String].self, forKey: .fieldSources)
    }
}

extension IngestionJob {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        locationId = try? c.decodeIfPresent(String.self, forKey: .locationId)
        sourceType = try? c.decodeIfPresent(IngestionSourceType.self, forKey: .sourceType)
        sourceUrl = try? c.decodeIfPresent(String.self, forKey: .sourceUrl)
        rawText = try? c.decodeIfPresent(String.self, forKey: .rawText)
        status = (try? c.decodeIfPresent(IngestionStatus.self, forKey: .status)) ?? .pending
        extracted = try? c.decodeIfPresent(ExtractedLocationDraft.self, forKey: .extracted)
        error = try? c.decodeIfPresent(String.self, forKey: .error)
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
        appliedAt = try? c.decodeIfPresent(String.self, forKey: .appliedAt)
    }
}

// MARK: Registry

extension Company {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Azienda"
        kind = try? c.decodeIfPresent(CompanyKind.self, forKey: .kind)
        supplierCategories = c.lossyStringArray(.supplierCategories)
        vatNumber = try? c.decodeIfPresent(String.self, forKey: .vatNumber)
        email = try? c.decodeIfPresent(String.self, forKey: .email)
        phone = try? c.decodeIfPresent(String.self, forKey: .phone)
        website = try? c.decodeIfPresent(String.self, forKey: .website)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
    }
}
