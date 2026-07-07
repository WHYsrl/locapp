import Foundation
import Observation

/// Outcome of a DELETE that the server may refuse with 409 Conflict
/// (LOCATION_IN_USE / HAS_CHILDREN / PROJECT_HAS_EVENTS): the UI shows the
/// message and offers a destructive "Elimina comunque" retry with force=true.
enum DeleteResult: Sendable, Equatable {
    case deleted
    case conflict(message: String)
    case failed
}

/// View model for projects, project detail and event shortlists.
@MainActor
@Observable
final class ProjectsViewModel {
    var projects: [Project] = []
    var isLoading = false
    var errorMessage: String?

    init(preview: [Project]? = nil) {
        if let preview {
            projects = preview
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            projects = try await APIClient.shared.listProjects().data
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createProject(name: String, clientName: String?) async {
        do {
            let project = try await APIClient.shared.createProject(
                CreateProjectRequest(name: name, clientName: clientName)
            )
            projects.insert(project, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteProject(_ project: Project, force: Bool = false) async -> DeleteResult {
        do {
            try await APIClient.shared.deleteProject(id: project.id, force: force)
            projects.removeAll { $0.id == project.id }
            return .deleted
        } catch let error as APIError where error.isConflict {
            return .conflict(message: error.serverMessage ?? "Il progetto contiene eventi.")
        } catch {
            errorMessage = error.localizedDescription
            return .failed
        }
    }
}

/// View model for a single event's shortlist (GET /events/:id/locations).
@MainActor
@Observable
final class EventShortlistViewModel {
    let event: Event
    var items: [EventLocation] = []
    var isLoading = false
    var errorMessage: String?

    init(event: Event, preview: [EventLocation]? = nil) {
        self.event = event
        if let preview {
            items = preview
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await APIClient.shared.eventLocations(eventId: event.id)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateStatus(of item: EventLocation, to status: EventLocationStatus) async {
        do {
            let updated = try await APIClient.shared.updateEventLocation(
                id: item.id,
                patch: PatchEventLocationRequest(status: status, clientFeedback: nil, notes: nil)
            )
            if let index = items.firstIndex(where: { $0.id == item.id }) {
                // Keep embedded data if the PATCH response is thinner.
                var merged = updated
                if merged.location == nil { merged.location = items[index].location }
                if merged.visits == nil { merged.visits = items[index].visits }
                if merged.quotes == nil { merged.quotes = items[index].quotes }
                if merged.availability == nil { merged.availability = items[index].availability }
                items[index] = merged
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
