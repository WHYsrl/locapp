import Foundation

// MARK: - Wire types

/// Paginated list envelope: `{data:[...], meta:{page,per_page,total}}` (SPEC §4).
/// Items are decoded individually (lossy) so one malformed record cannot blank the list.
struct Paginated<T: Decodable & Sendable>: Decodable, Sendable {
    struct Meta: Decodable, Sendable {
        var page: Int?
        var perPage: Int?
        var total: Int?

        enum CodingKeys: String, CodingKey {
            case page
            case perPage = "per_page"
            case total
        }
    }

    var data: [T]
    var meta: Meta?

    enum CodingKeys: String, CodingKey {
        case data
        case meta
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        data = try container.decode(LossyArray<T>.self, forKey: .data).elements
        meta = try? container.decodeIfPresent(Meta.self, forKey: .meta)
    }
}

/// Plain list envelope `{data:[...]}` used by non-paginated endpoints
/// (usage, history, event shortlist, brief search). Extra sibling keys
/// (`proposta`, `utilizzata`, `criteria`, ...) are ignored. Lossy per item.
struct DataEnvelope<T: Decodable & Sendable>: Decodable, Sendable {
    var data: [T]

    enum CodingKeys: String, CodingKey {
        case data
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        data = try container.decode(LossyArray<T>.self, forKey: .data).elements
    }
}

struct ServerErrorEnvelope: Decodable, Sendable {
    struct Detail: Decodable, Sendable {
        var code: String?
        var message: String?
    }
    var error: Detail
}

enum APIError: Error, LocalizedError {
    case invalidResponse
    case http(status: Int, code: String?, message: String?)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Risposta del server non valida."
        case .http(let status, let code, let message):
            // Auth failures get an actionable hint instead of a bare status code.
            if status == 401 || status == 403 {
                return "Non autenticato: fai login in Impostazioni."
            }
            var text = "Errore server \(status)"
            if let code { text += " [\(code)]" }
            if let message { text += ": \(message)" }
            return text
        case .decoding(let error):
            return "Errore di lettura dati: \(error.localizedDescription)"
        case .transport(let error):
            if let urlError = error as? URLError {
                switch urlError.code {
                case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
                    return "Rete non disponibile: controlla la connessione."
                case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed, .badURL, .unsupportedURL:
                    return "Server non raggiungibile: verifica l'URL API in Impostazioni."
                case .timedOut:
                    return "Il server non risponde (timeout): riprova più tardi."
                default:
                    break
                }
            }
            return "Errore di rete: \(error.localizedDescription)"
        }
    }

    /// True for auth failures (401/403) so the UI can point to Impostazioni.
    var isAuthenticationError: Bool {
        if case .http(let status, _, _) = self {
            return status == 401 || status == 403
        }
        return false
    }
}

// MARK: - Request bodies (Codable so the outbox can persist them)

struct LoginRequest: Codable, Sendable {
    var email: String
    var password: String
}

struct LoginResponse: Codable, Sendable {
    var token: String
    var user: User
}

struct IngestRequest: Codable, Hashable, Sendable {
    var locationId: String?
    var sourceType: IngestionSourceType
    var url: String?
    var text: String?
    var mediaId: String?

    enum CodingKeys: String, CodingKey {
        case locationId = "location_id"
        case sourceType = "source_type"
        case url
        case text
        case mediaId = "media_id"
    }
}

struct ApplyIngestRequest: Codable, Sendable {
    /// fieldPath → accepted (SPEC §4: POST /ingest/:jobId/apply).
    var accept: [String: Bool]
}

struct BriefSearchRequest: Codable, Sendable {
    var brief: String
    var eventId: String?
    var limit: Int

    enum CodingKeys: String, CodingKey {
        case brief
        case eventId = "event_id"
        case limit
    }
}

struct AddShortlistRequest: Codable, Sendable {
    var locationId: String

    enum CodingKeys: String, CodingKey {
        case locationId = "location_id"
    }
}

struct PatchEventLocationRequest: Codable, Sendable {
    var status: EventLocationStatus?
    var clientFeedback: String?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case status
        case clientFeedback = "client_feedback"
        case notes
    }
}

struct CreateProjectRequest: Codable, Sendable {
    var name: String
    var clientName: String?

    enum CodingKeys: String, CodingKey {
        case name
        case clientName = "client_name"
    }
}

struct CreateTagRequest: Codable, Sendable {
    var name: String
    var color: String?

    enum CodingKeys: String, CodingKey {
        case name
        case color
    }
}

struct UpdateLocationTagsRequest: Codable, Sendable {
    var smartTags: [String]

    enum CodingKeys: String, CodingKey {
        case smartTags = "smart_tags"
    }
}

struct FeedbackItem: Codable, Sendable {
    var subjectType: String // location | company | contact
    var subjectId: String?
    var ratings: [String: Int]
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case subjectType = "subject_type"
        case subjectId = "subject_id"
        case ratings
        case notes
    }
}

struct FeedbackBatchRequest: Codable, Sendable {
    var items: [FeedbackItem]
}

struct LocationFilters: Sendable {
    var q: String?
    var tags: [String]?
    var city: String?
    var visitStatus: VisitStatus?
    var minCapacity: Int?
    var configuration: CapacityConfiguration?
    var accessibilityMin: Int?
    var parentId: String?
    var rootOnly: Bool = false
    var page: Int = 1
    var perPage: Int = 50

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "per_page", value: String(perPage))
        ]
        if let q, !q.isEmpty { items.append(URLQueryItem(name: "q", value: q)) }
        if let tags, !tags.isEmpty { items.append(URLQueryItem(name: "tags", value: tags.joined(separator: ","))) }
        if let city { items.append(URLQueryItem(name: "city", value: city)) }
        if let visitStatus { items.append(URLQueryItem(name: "visit_status", value: visitStatus.rawValue)) }
        if let minCapacity { items.append(URLQueryItem(name: "min_capacity", value: String(minCapacity))) }
        if let configuration { items.append(URLQueryItem(name: "configuration", value: configuration.rawValue)) }
        if let accessibilityMin { items.append(URLQueryItem(name: "accessibility_min", value: String(accessibilityMin))) }
        if let parentId { items.append(URLQueryItem(name: "parent_id", value: parentId)) }
        if rootOnly { items.append(URLQueryItem(name: "root_only", value: "true")) }
        return items
    }
}

/// Placeholder decodable for endpoints whose response body we ignore.
struct EmptyResponse: Decodable, Sendable {
    init() {}
    init(from decoder: Decoder) throws {}
}

// MARK: - Client

/// Async/await HTTP client for the VenueScout REST API (SPEC §4).
/// JWT is read from the Keychain on every request.
actor APIClient {
    static let shared = APIClient()

    private let urlSession: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    // MARK: Transport

    private func makeRequest(
        method: String,
        path: String,
        query: [URLQueryItem],
        bodyData: Data?
    ) throws -> URLRequest {
        let url = Config.apiBaseURL.appending(path: path)
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw APIError.invalidResponse
        }
        if !query.isEmpty {
            components.queryItems = query
        }
        guard let finalURL = components.url else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: finalURL)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if bodyData != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        request.httpBody = bodyData
        if let token = AuthTokenStore.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func send<R: Decodable & Sendable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        bodyData: Data? = nil
    ) async throws -> R {
        let request = try makeRequest(method: method, path: path, query: query, bodyData: bodyData)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? decoder.decode(ServerErrorEnvelope.self, from: data)
            throw APIError.http(
                status: http.statusCode,
                code: envelope?.error.code,
                message: envelope?.error.message
            )
        }
        if data.isEmpty, let empty = EmptyResponse() as? R {
            return empty
        }
        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func send<R: Decodable & Sendable, B: Encodable & Sendable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: B
    ) async throws -> R {
        let data = try encoder.encode(body)
        return try await send(method, path, query: query, bodyData: data)
    }

    // MARK: Auth

    /// Logs in and stores the JWT in the Keychain.
    func login(email: String, password: String) async throws -> LoginResponse {
        let response: LoginResponse = try await send(
            "POST", "auth/login",
            body: LoginRequest(email: email, password: password)
        )
        AuthTokenStore.save(response.token)
        return response
    }

    func logout() {
        AuthTokenStore.clear()
    }

    // MARK: Locations

    func listLocations(filters: LocationFilters = LocationFilters()) async throws -> Paginated<Location> {
        try await send("GET", "locations", query: filters.queryItems)
    }

    func getLocation(id: String) async throws -> Location {
        try await send("GET", "locations/\(id)")
    }

    func locationUsage(id: String) async throws -> [UsageEntry] {
        // Response is `{data:[...], proposta, utilizzata}`, not a bare array.
        let envelope: DataEnvelope<UsageEntry> = try await send("GET", "locations/\(id)/usage")
        return envelope.data
    }

    func locationHistory(id: String) async throws -> [HistoryEntry] {
        // Response is `{data:[{type,at,data}]}`, not a bare array.
        let envelope: DataEnvelope<HistoryEntry> = try await send("GET", "locations/\(id)/history")
        return envelope.data
    }

    // MARK: Tags

    func fetchTags() async throws -> [Tag] {
        // Response is a bare array `[{id,name,color?}]`; items decoded lossily.
        let list: LossyArray<Tag> = try await send("GET", "tags")
        return list.elements
    }

    func createTag(name: String, color: String? = nil) async throws -> Tag {
        try await send("POST", "tags", body: CreateTagRequest(name: name, color: color))
    }

    /// PATCH /locations/:id with `{smart_tags:[...]}`. Unknown names are
    /// auto-registered server-side. The response body is intentionally ignored
    /// (callers update local state), so any response shape is tolerated.
    func updateLocationTags(id: String, tags: [String]) async throws {
        let _: EmptyResponse = try await send(
            "PATCH", "locations/\(id)",
            body: UpdateLocationTagsRequest(smartTags: tags)
        )
    }

    // MARK: Ingestion

    func createIngestion(_ request: IngestRequest) async throws -> IngestionJob {
        try await send("POST", "ingest", body: request)
    }

    func getIngestion(id: String) async throws -> IngestionJob {
        try await send("GET", "ingest/\(id)")
    }

    func applyIngestion(id: String, accept: [String: Bool]) async throws -> IngestionJob {
        try await send("POST", "ingest/\(id)/apply", body: ApplyIngestRequest(accept: accept))
    }

    // MARK: Search

    func searchBrief(_ request: BriefSearchRequest) async throws -> [SearchResult] {
        // Response is `{data:[...], criteria:{...}}`, not a bare array.
        let envelope: DataEnvelope<SearchResult> = try await send("POST", "search/brief", body: request)
        return envelope.data
    }

    // MARK: Projects & events

    func listProjects(page: Int = 1, perPage: Int = 50) async throws -> Paginated<Project> {
        try await send("GET", "projects", query: [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "per_page", value: String(perPage))
        ])
    }

    func getProject(id: String) async throws -> Project {
        try await send("GET", "projects/\(id)")
    }

    func createProject(_ request: CreateProjectRequest) async throws -> Project {
        try await send("POST", "projects", body: request)
    }

    func getEvent(id: String) async throws -> Event {
        try await send("GET", "events/\(id)")
    }

    func eventLocations(eventId: String) async throws -> [EventLocation] {
        // Response is `{data:[...]}` with the joined location flattened per row.
        let envelope: DataEnvelope<EventLocation> = try await send("GET", "events/\(eventId)/locations")
        return envelope.data
    }

    func addEventLocation(eventId: String, locationId: String) async throws -> EventLocation {
        try await send(
            "POST", "events/\(eventId)/locations",
            body: AddShortlistRequest(locationId: locationId)
        )
    }

    func updateEventLocation(id: String, patch: PatchEventLocationRequest) async throws -> EventLocation {
        try await send("PATCH", "event-locations/\(id)", body: patch)
    }

    func removeEventLocation(id: String) async throws {
        let _: EmptyResponse = try await send("DELETE", "event-locations/\(id)")
    }

    func eventMap(eventId: String) async throws -> GeoFeatureCollection {
        try await send("GET", "events/\(eventId)/map")
    }

    func projectMap(projectId: String) async throws -> GeoFeatureCollection {
        try await send("GET", "projects/\(projectId)/map")
    }

    // MARK: Feedback & registry

    func postEventFeedback(eventId: String, items: [FeedbackItem]) async throws {
        let _: EmptyResponse = try await send(
            "POST", "events/\(eventId)/feedback",
            body: FeedbackBatchRequest(items: items)
        )
    }

    func listCompanies(kind: CompanyKind? = nil, category: String? = nil) async throws -> Paginated<Company> {
        var query: [URLQueryItem] = [URLQueryItem(name: "per_page", value: "100")]
        if let kind { query.append(URLQueryItem(name: "kind", value: kind.rawValue)) }
        if let category { query.append(URLQueryItem(name: "category", value: category)) }
        return try await send("GET", "companies", query: query)
    }

    func listContacts() async throws -> Paginated<Contact> {
        try await send("GET", "contacts", query: [URLQueryItem(name: "per_page", value: "100")])
    }
}
