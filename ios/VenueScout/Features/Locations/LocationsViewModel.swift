import Foundation
import Observation

/// View model for the locations archive (list + filters).
@MainActor
@Observable
final class LocationsViewModel {
    var locations: [Location] = []
    var isLoading = false
    var errorMessage: String?

    // Filters (SPEC §4 GET /locations)
    var searchText: String = ""
    var statusFilter: VisitStatus?
    var tagFilter: String?

    /// Known smart tags (SPEC §3 comment).
    static let knownTags = [
        "conferenze", "gala_dinner", "lunch", "coffee", "feste", "lancio", "shooting", "wedding"
    ]

    init(preview: [Location]? = nil) {
        if let preview {
            locations = preview
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        var filters = LocationFilters()
        filters.q = searchText.isEmpty ? nil : searchText
        filters.visitStatus = statusFilter
        filters.tags = tagFilter.map { [$0] }
        filters.rootOnly = true
        do {
            let page = try await APIClient.shared.listLocations(filters: filters)
            locations = page.data
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteLocation(_ location: Location, force: Bool = false) async -> DeleteResult {
        do {
            try await APIClient.shared.deleteLocation(id: location.id, force: force)
            locations.removeAll { $0.id == location.id }
            return .deleted
        } catch let error as APIError where error.isConflict {
            return .conflict(
                message: error.serverMessage ?? "La location è in uso o ha location collegate."
            )
        } catch {
            errorMessage = error.localizedDescription
            return .failed
        }
    }
}
