import PhotosUI
import SwiftUI

/// "Inserisci" tab — capture a sopralluogo: dictation, photos, notes, URL,
/// then send to POST /ingest and review the extracted draft.
struct CaptureView: View {
    @State private var viewModel = CaptureViewModel()
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false

    var body: some View {
        Form {
            successSection
            recordingSection
            transcriptSection
            notesSection
            photoSection
            localPreviewSection
            submitSection
            failureSection
        }
        .navigationTitle("Inserisci location")
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in
                viewModel.photos.append(image)
            }
        }
        .sheet(isPresented: $viewModel.showDraftReview) {
            if let job = viewModel.job, let draft = job.extracted {
                NavigationStack {
                    DraftReviewView(jobId: job.id, draft: draft) { locationId in
                        viewModel.clearAfterApply(locationId: locationId)
                    }
                }
            }
        }
        .sheet(isPresented: $viewModel.showOfflineReview) {
            if let draft = viewModel.localDraft {
                NavigationStack {
                    OfflineDraftReviewView(draft: draft) { accepted in
                        Task { await viewModel.saveOfflineReview(accepted: accepted) }
                    }
                }
            }
        }
        .onChange(of: pickerItems) { _, newItems in
            Task {
                for item in newItems {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        viewModel.photos.append(image)
                    }
                }
                pickerItems = []
            }
        }
    }

    // MARK: Sections

    private var recordingSection: some View {
        Section("Dettatura sopralluogo") {
            VStack(spacing: 12) {
                Button {
                    viewModel.speech.toggleRecording()
                } label: {
                    ZStack {
                        Circle()
                            .fill(viewModel.speech.isRecording ? Color.red : Color.accentColor)
                            .frame(width: 84, height: 84)
                        Image(systemName: viewModel.speech.isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(.white)
                    }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)

                Text(viewModel.speech.isRecording ? "Registrazione in corso… tocca per fermare" : "Tocca per registrare")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let status = viewModel.speech.statusMessage {
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var transcriptSection: some View {
        if !viewModel.speech.fullTranscript.isEmpty {
            Section("Trascrizione") {
                ScrollView {
                    (Text(viewModel.speech.finalizedTranscript)
                        + Text(viewModel.speech.volatileTranscript).foregroundStyle(.secondary))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 80, maxHeight: 200)
            }
        }
    }

    private var notesSection: some View {
        Section("Note e link") {
            TextField("Incolla link sito location", text: $viewModel.urlString)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextEditor(text: $viewModel.notes)
                .frame(minHeight: 90)
                .overlay(alignment: .topLeading) {
                    if viewModel.notes.isEmpty {
                        Text("Note libere sul sopralluogo…")
                            .foregroundStyle(.secondary)
                            .padding(.top, 8)
                            .padding(.leading, 4)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    private var photoSection: some View {
        Section("Foto (\(viewModel.photos.count))") {
            HStack {
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 10, matching: .images) {
                    Label("Libreria", systemImage: "photo.on.rectangle")
                }
                Spacer()
                Button {
                    showCamera = true
                } label: {
                    Label("Fotocamera", systemImage: "camera")
                }
            }
            .buttonStyle(.borderless)

            if !viewModel.photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(viewModel.photos.enumerated()), id: \.offset) { _, image in
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 72, height: 72)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
                Text("Il caricamento foto verso il server arriverà con la scheda media.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var localPreviewSection: some View {
        Section("Anteprima on-device (Apple Intelligence)") {
            if viewModel.localModelAvailable {
                Button {
                    viewModel.runLocalExtraction()
                } label: {
                    if viewModel.isExtractingLocally {
                        HStack {
                            ProgressView()
                            Text("Estrazione locale…")
                        }
                    } else {
                        Label("Genera anteprima locale", systemImage: "sparkles")
                    }
                }
                .disabled(viewModel.isExtractingLocally || viewModel.combinedText.isEmpty)
            } else {
                Text(LocalDraftExtractor.unavailabilityReason ?? "Modello on-device non disponibile.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let message = viewModel.localDraftMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            if let draft = viewModel.localDraft {
                VStack(alignment: .leading, spacing: 6) {
                    if !draft.name.isEmpty { InfoRow(label: "Nome", value: draft.name) }
                    if !draft.city.isEmpty { InfoRow(label: "Città", value: draft.city) }
                    if !draft.summary.isEmpty {
                        Text(draft.summary).font(.subheadline)
                    }
                    if draft.maxCapacity > 0 {
                        InfoRow(label: "Capienza max", value: String(draft.maxCapacity))
                    }
                    if !draft.smartTags.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(draft.smartTags, id: \.self) { TagChip(text: $0) }
                            }
                        }
                    }
                    if !draft.openQuestions.isEmpty {
                        ForEach(draft.openQuestions, id: \.self) { question in
                            Label(question, systemImage: "questionmark.circle")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
        }
    }

    private var submitSection: some View {
        Section {
            Button {
                Task { await viewModel.submit() }
            } label: {
                if viewModel.isSubmitting {
                    HStack {
                        ProgressView()
                        Text(viewModel.job?.status.label ?? "Invio in corso…")
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Text("Invia per estrazione AI")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!viewModel.canSubmit || viewModel.isSubmitting)

            if let message = viewModel.infoMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Shown when POST /ingest failed: specific error + clear next actions.
    @ViewBuilder
    private var failureSection: some View {
        if let error = viewModel.submitError {
            Section("Invio non riuscito") {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)

                Button {
                    Task { await viewModel.retrySubmit() }
                } label: {
                    Label("Riprova", systemImage: "arrow.clockwise")
                }
                .disabled(viewModel.isSubmitting)

                if viewModel.localDraft != nil {
                    Button {
                        viewModel.showOfflineReview = true
                    } label: {
                        Label("Continua offline", systemImage: "wifi.slash")
                    }
                    .disabled(viewModel.isSubmitting)
                }

                Button {
                    viewModel.dismissFailure()
                } label: {
                    Label("Chiudi (bozza resta in coda)", systemImage: "xmark.circle")
                }
                .disabled(viewModel.isSubmitting)
            }
        }
    }

    /// Shown after a draft is applied: confirmation and next steps, no dead end.
    @ViewBuilder
    private var successSection: some View {
        if viewModel.didApplyDraft {
            Section {
                Label("Scheda applicata con successo.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)

                if let locationId = viewModel.lastAppliedLocationId {
                    NavigationLink("Apri scheda location") {
                        LocationDetailView(locationId: locationId)
                    }
                }

                Button("Nuova acquisizione") {
                    viewModel.startNewCapture()
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        CaptureView()
    }
}
