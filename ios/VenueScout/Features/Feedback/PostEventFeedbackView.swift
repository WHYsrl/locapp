import SwiftUI

/// Post-event feedback: star ratings for location / referente / fornitori
/// plus dictated notes. Sent as a batch to POST /events/:id/feedback.
struct PostEventFeedbackView: View {
    let event: Event

    @State private var speech = SpeechService()
    @State private var locationRating = 0
    @State private var contactRating = 0
    @State private var suppliersRating = 0
    @State private var notes = ""
    @State private var isSending = false
    @State private var message: String?
    @Environment(\.dismiss) private var dismiss

    init(event: Event) {
        self.event = event
    }

    var body: some View {
        Form {
            Section("Valutazioni — \(event.name)") {
                ratingRow(label: "Location", rating: $locationRating)
                ratingRow(label: "Referente", rating: $contactRating)
                ratingRow(label: "Fornitori", rating: $suppliersRating)
            }

            Section("Note (anche dettate)") {
                TextEditor(text: $notes)
                    .frame(minHeight: 100)
                Button {
                    if speech.isRecording {
                        Task {
                            await speech.stop()
                            let transcript = speech.fullTranscript
                            if !transcript.isEmpty {
                                notes = notes.isEmpty ? transcript : notes + "\n" + transcript
                            }
                            speech.reset()
                        }
                    } else {
                        Task { await speech.start() }
                    }
                } label: {
                    Label(
                        speech.isRecording ? "Ferma dettatura" : "Detta le note",
                        systemImage: speech.isRecording ? "stop.circle.fill" : "mic.fill"
                    )
                    .foregroundStyle(speech.isRecording ? .red : .accentColor)
                }
                if speech.isRecording && !speech.fullTranscript.isEmpty {
                    Text(speech.fullTranscript)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let status = speech.statusMessage {
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            Section {
                Button {
                    Task { await send() }
                } label: {
                    if isSending {
                        HStack {
                            ProgressView()
                            Text("Invio…")
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Text("Invia feedback")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSending || (locationRating == 0 && contactRating == 0 && suppliersRating == 0))

                if let message {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Feedback post-evento")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Chiudi") { dismiss() }
            }
        }
    }

    private func ratingRow(label: String, rating: Binding<Int>) -> some View {
        HStack {
            Text(label)
            Spacer()
            StarRatingView(rating: rating.wrappedValue) { value in
                rating.wrappedValue = value
            }
        }
    }

    private func send() async {
        var items: [FeedbackItem] = []
        if locationRating > 0 {
            items.append(FeedbackItem(
                subjectType: "location",
                subjectId: nil,
                ratings: ["overall": locationRating],
                notes: notes.isEmpty ? nil : notes
            ))
        }
        if contactRating > 0 {
            items.append(FeedbackItem(
                subjectType: "contact",
                subjectId: nil,
                ratings: ["overall": contactRating],
                notes: nil
            ))
        }
        if suppliersRating > 0 {
            items.append(FeedbackItem(
                subjectType: "company",
                subjectId: nil,
                ratings: ["overall": suppliersRating],
                notes: nil
            ))
        }
        isSending = true
        defer { isSending = false }
        do {
            try await APIClient.shared.postEventFeedback(eventId: event.id, items: items)
            message = "Feedback inviato, grazie!"
            dismiss()
        } catch {
            message = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        PostEventFeedbackView(event: Mocks.event)
    }
}
