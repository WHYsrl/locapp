import Foundation
import Observation

/// View model for the AI brief search (POST /search/brief) and the
/// "Aggiungi a evento" flow (project → event picker → shortlist add).
@MainActor
@Observable
final class SearchViewModel {
    let speech = SpeechService()

    var brief: String = ""
    var results: [SearchResult] = []
    var isSearching = false
    var errorMessage: String?

    // Add-to-event sheet state
    var projects: [Project] = []
    var selectedProject: Project?
    var isLoadingProjects = false
    var addMessage: String?

    init(previewResults: [SearchResult]? = nil) {
        if let previewResults {
            results = previewResults
        }
    }

    func appendDictation() {
        let transcript = speech.fullTranscript
        guard !transcript.isEmpty else { return }
        if brief.isEmpty {
            brief = transcript
        } else {
            brief += "\n" + transcript
        }
        speech.reset()
    }

    func search() async {
        let trimmed = brief.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Scrivi o detta il brief dell'evento."
            return
        }
        isSearching = true
        errorMessage = nil
        defer { isSearching = false }
        do {
            results = try await APIClient.shared.searchBrief(
                BriefSearchRequest(brief: trimmed, eventId: nil, limit: 10)
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Add to event

    func loadProjects() async {
        isLoadingProjects = true
        defer { isLoadingProjects = false }
        do {
            projects = try await APIClient.shared.listProjects().data
        } catch {
            addMessage = error.localizedDescription
        }
    }

    func loadEvents(for project: Project) async {
        do {
            let detailed = try await APIClient.shared.getProject(id: project.id)
            selectedProject = detailed
        } catch {
            addMessage = error.localizedDescription
        }
    }

    func add(location: Location, to event: Event) async -> Bool {
        do {
            _ = try await APIClient.shared.addEventLocation(
                eventId: event.id,
                locationId: location.id
            )
            addMessage = "\(location.name) aggiunta a \(event.name)."
            return true
        } catch {
            addMessage = error.localizedDescription
            return false
        }
    }
}
