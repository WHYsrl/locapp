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
        defer { isSubmitting = false }

        do {
            let created = try await APIClient.shared.createIngestion(request)
            job = created
            try await pollJob(id: created.id)
        } catch {
            // Offline tolerance: persist and retry later (OutboxStore).
            do {
                try await OutboxStore.shared.add(request)
                infoMessage = "Rete non disponibile: bozza salvata offline, verrà reinviata."
            } catch {
                infoMessage = "Invio non riuscito e salvataggio offline fallito."
            }
        }
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

    func clearAfterApply() {
        speech.reset()
        notes = ""
        urlString = ""
        photos = []
        localDraft = nil
        job = nil
        infoMessage = "Scheda applicata con successo."
    }
}
