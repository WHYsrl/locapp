import Foundation
import Observation
import UIKit

/// View model for the sopralluogo capture screen (tab "Inserisci").
@MainActor
@Observable
final class CaptureViewModel {
    let speech = SpeechService()

    var notes: String = ""
    var urlString: String = ""
    var photos: [UIImage] = []

    var isSubmitting = false
    var infoMessage: String?
    var job: IngestionJob?
    var showDraftReview = false

    // Submit failure state: specific error + next actions (Riprova / offline / Chiudi).
    var submitError: String?
    var showOfflineReview = false
    private var failedRequest: IngestRequest?
    private var outboxItemId: UUID?

    // Success state after a draft is applied: no dead end, offer next steps.
    var didApplyDraft = false
    var lastAppliedLocationId: String?

    // On-device pre-extraction (Foundation Models), optional preview.
    var localDraft: LocalLocationDraft?
    var isExtractingLocally = false
    var localDraftMessage: String?

    var localModelAvailable: Bool {
        LocalDraftExtractor.isAvailable
    }

    var combinedText: String {
        var parts: [String] = []
        let transcript = speech.fullTranscript
        if !transcript.isEmpty {
            parts.append("Trascrizione sopralluogo:\n" + transcript)
        }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedNotes.isEmpty {
            parts.append("Note:\n" + trimmedNotes)
        }
        return parts.joined(separator: "\n\n")
    }

    var canSubmit: Bool {
        !combinedText.isEmpty || !trimmedURL.isEmpty
    }

    private var trimmedURL: String {
        urlString.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Local preview extraction

    func runLocalExtraction() {
        let text = combinedText
        guard !text.isEmpty else {
            localDraftMessage = "Registra o scrivi qualcosa prima dell'anteprima."
            return
        }
        guard LocalDraftExtractor.isAvailable else {
            localDraftMessage = LocalDraftExtractor.unavailabilityReason
            return
        }
        isExtractingLocally = true
        localDraftMessage = nil
        Task {
            do {
                let draft = try await LocalDraftExtractor.extract(from: text)
                self.localDraft = draft
            } catch {
                self.localDraftMessage = "Anteprima locale non riuscita: \(error.localizedDescription)"
            }
            self.isExtractingLocally = false
        }
    }

    // MARK: Submission (POST /ingest → poll → draft review)

    func submit() async {
        if speech.isRecording {
            await speech.stop()
        }
        let text = combinedText
        let url = trimmedURL

        let sourceType: IngestionSourceType
        if !speech.fullTranscript.isEmpty {
            sourceType = .audio
        } else if !text.isEmpty {
            sourceType = .testo
        } else if !url.isEmpty {
            sourceType = .url
        } else {
            infoMessage = "Niente da inviare: registra, scrivi o incolla un link."
            return
        }

        let request = IngestRequest(
            locationId: nil,
            sourceType: sourceType,
            url: url.isEmpty ? nil : url,
            text: text.isEmpty ? nil : text,
            mediaId: nil // TODO: upload photos via /locations/:id/media (presigned URL)
        )

        isSubmitting = true
        infoMessage = nil
        submitError = nil
        defer { isSubmitting = false }

        do {
            let created = try await APIClient.shared.createIngestion(request)
            job = created
            failedRequest = nil
            do {
                try await pollJob(id: created.id)
            } catch {
                // The job exists server-side: do NOT re-queue (would duplicate it).
                infoMessage = "Invio riuscito, ma lo stato del job non è leggibile: \(error.localizedDescription)"
            }
        } catch {
            await handleSubmitFailure(request: request, error: error)
        }
    }

    /// POST /ingest failed: persist to the outbox (with the local draft, if any)
    /// and surface the specific error plus next actions in the UI.
    private func handleSubmitFailure(request: IngestRequest, error: Error) async {
        failedRequest = request
        submitError = error.localizedDescription
        do {
            let item = try await OutboxStore.shared.add(
                request,
                localDraft: localDraft,
                lastError: error.localizedDescription
            )
            outboxItemId = item.id
        } catch let saveError {
            submitError = "\(error.localizedDescription)\nSalvataggio offline fallito: \(saveError.localizedDescription). La bozza resta in memoria finché non riprovi."
        }
    }

    /// "Riprova": re-sends the failed request; on success drops the outbox copy.
    func retrySubmit() async {
        guard let request = failedRequest else { return }
        isSubmitting = true
        submitError = nil
        infoMessage = nil
        defer { isSubmitting = false }
        do {
            let created = try await APIClient.shared.createIngestion(request)
            if let id = outboxItemId {
                await OutboxStore.shared.remove(id)
            }
            outboxItemId = nil
            failedRequest = nil
            job = created
            do {
                try await pollJob(id: created.id)
            } catch {
                infoMessage = "Invio riuscito, ma lo stato del job non è leggibile: \(error.localizedDescription)"
            }
        } catch {
            submitError = error.localizedDescription
            if let id = outboxItemId {
                await OutboxStore.shared.recordError(id: id, message: error.localizedDescription)
            }
        }
    }

    /// "Continua offline": persists the reviewed local draft into the outbox entry.
    func saveOfflineReview(accepted: [String: Bool]) async {
        if let id = outboxItemId {
            await OutboxStore.shared.updateReview(id: id, draft: localDraft, accepted: accepted)
        }
        infoMessage = "Bozza rivista salvata: verrà reinviata dal riquadro Bozze offline in Impostazioni."
    }

    /// "Chiudi": resets the form for a new capture, keeping the outbox entry.
    func dismissFailure() {
        speech.reset()
        notes = ""
        urlString = ""
        photos = []
        localDraft = nil
        localDraftMessage = nil
        job = nil
        submitError = nil
        failedRequest = nil
        outboxItemId = nil
        infoMessage = "Bozza in coda offline: la trovi in Impostazioni → Bozze offline."
    }

    private func pollJob(id: String) async throws {
        for _ in 0..<90 {
            let current = try await APIClient.shared.getIngestion(id: id)
            job = current
            switch current.status {
            case .ready:
                showDraftReview = current.extracted != nil
                if current.extracted == nil {
                    infoMessage = "Il server non ha prodotto una bozza."
                }
                return
            case .applied:
                infoMessage = "Bozza già applicata."
                return
            case .failed:
                infoMessage = "Estrazione fallita: \(current.error ?? "errore sconosciuto")"
                return
            case .pending, .processing:
                try await Task.sleep(for: .seconds(2))
            }
        }
        infoMessage = "Il job è ancora in elaborazione: riprova più tardi da questa schermata."
    }

    func clearAfterApply(locationId: String?) {
        speech.reset()
        notes = ""
        urlString = ""
        photos = []
        localDraft = nil
        localDraftMessage = nil
        job = nil
        submitError = nil
        failedRequest = nil
        outboxItemId = nil
        infoMessage = nil
        didApplyDraft = true
        lastAppliedLocationId = locationId
    }

    /// "Nuova acquisizione": dismisses the success step, form is already clean.
    func startNewCapture() {
        didApplyDraft = false
        lastAppliedLocationId = nil
        infoMessage = nil
    }
}
