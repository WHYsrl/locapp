import Foundation

/// Very small offline outbox: ingest requests that failed to reach the server are
/// persisted as JSON files in Application Support and re-sent later (best effort).
actor OutboxStore {
    static let shared = OutboxStore()

    struct PendingItem: Codable, Identifiable, Sendable {
        let id: UUID
        let createdAt: Date
        let request: IngestRequest
        // All optional so previously persisted items keep decoding.
        var localDraft: LocalLocationDraft?
        var acceptedFields: [String: Bool]?
        var lastError: String?
        var lastAttemptAt: Date?
    }

    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    private func directoryURL() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let dir = base.appending(path: "VenueScout/Outbox")
        if !FileManager.default.fileExists(atPath: dir.path()) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private func fileURL(for id: UUID) throws -> URL {
        try directoryURL().appending(path: "\(id.uuidString).json")
    }

    @discardableResult
    func add(
        _ request: IngestRequest,
        localDraft: LocalLocationDraft? = nil,
        lastError: String? = nil
    ) throws -> PendingItem {
        let item = PendingItem(
            id: UUID(),
            createdAt: Date(),
            request: request,
            localDraft: localDraft,
            acceptedFields: nil,
            lastError: lastError,
            lastAttemptAt: lastError == nil ? nil : Date()
        )
        try save(item)
        return item
    }

    private func save(_ item: PendingItem) throws {
        let data = try encoder.encode(item)
        try data.write(to: fileURL(for: item.id), options: .atomic)
    }

    private func item(id: UUID) -> PendingItem? {
        guard let url = try? fileURL(for: id),
              let data = try? Data(contentsOf: url)
        else { return nil }
        return try? decoder.decode(PendingItem.self, from: data)
    }

    /// Stores the reviewed on-device draft (and accept toggles) into the entry
    /// so the reviewed state travels with the payload until it is re-sent.
    func updateReview(id: UUID, draft: LocalLocationDraft?, accepted: [String: Bool]) {
        guard var item = item(id: id) else { return }
        item.localDraft = draft
        item.acceptedFields = accepted
        try? save(item)
    }

    /// Records the outcome of the last (failed) send attempt.
    func recordError(id: UUID, message: String) {
        guard var item = item(id: id) else { return }
        item.lastError = message
        item.lastAttemptAt = Date()
        try? save(item)
    }

    func items() -> [PendingItem] {
        guard let dir = try? directoryURL(),
              let urls = try? FileManager.default.contentsOfDirectory(
                at: dir,
                includingPropertiesForKeys: nil
              )
        else { return [] }
        return urls
            .filter { $0.pathExtension == "json" }
            .compactMap { url -> PendingItem? in
                guard let data = try? Data(contentsOf: url) else { return nil }
                return try? decoder.decode(PendingItem.self, from: data)
            }
            .sorted { $0.createdAt < $1.createdAt }
    }

    func count() -> Int {
        items().count
    }

    func remove(_ id: UUID) {
        guard let url = try? fileURL(for: id) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// Tries to re-send every pending item. Returns (sent, failed).
    func flush(using api: APIClient = .shared) async -> (sent: Int, failed: Int) {
        var sent = 0
        var failed = 0
        for item in items() {
            do {
                _ = try await api.createIngestion(item.request)
                remove(item.id)
                sent += 1
            } catch {
                recordError(id: item.id, message: error.localizedDescription)
                failed += 1
            }
        }
        return (sent, failed)
    }
}
