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
}

struct PrivateParking: Codable, Hashable, Sendable {
    var spots: Int?
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
    var auto: Bool?
    var pullman: Bool?
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
}

struct SpaceFeatures: Codable, Hashable, Sendable {
    var foyer: Bool?
    var guardaroba: Bool?
    var bagni: BathroomInfo?
    var cucina: Bool?
    var ascensore: Bool?
    var scale: Bool?
    var arredi: [String]?
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

struct UsageSummary: Codable, Hashable, Sendable {
    var proposedCount: Int?
    var usedCount: Int?

    enum CodingKeys: String, CodingKey {
        case proposedCount = "proposed_count"
        case usedCount = "used_count"
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
    /// Shape not fixed by SPEC (string or {start,end}); kept generic.
    var dates: JSONValue?

    var id: String {
        (project?.id ?? "") + "/" + (event?.id ?? "") + "/" + (status?.rawValue ?? "")
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
