import SwiftUI

/// "Cerca" tab: AI brief search plus a segmented switch to the plain archive.
struct SearchTabView: View {
    @State private var mode: Mode = .brief

    enum Mode: String, CaseIterable {
        case brief = "Brief AI"
        case archive = "Archivio"
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Modalità", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 4)

            switch mode {
            case .brief:
                BriefSearchView()
            case .archive:
                LocationListView()
            }
        }
    }
}

/// Brief textarea + mic dictation, results with score % and reason chips,
/// "Aggiungi a evento" per result.
struct BriefSearchView: View {
    @State private var viewModel = SearchViewModel()
    @State private var locationToAdd: Location?

    var body: some View {
        List {
            briefSection
            resultsSection
        }
        .navigationTitle("Cerca location")
        .sheet(item: $locationToAdd) { location in
            NavigationStack {
                AddToEventSheet(location: location, viewModel: viewModel)
            }
        }
    }

    private var briefSection: some View {
        Section("Brief dell'evento") {
            TextEditor(text: $viewModel.brief)
                .frame(minHeight: 100)
                .overlay(alignment: .topLeading) {
                    if viewModel.brief.isEmpty {
                        Text("Es. cena di gala per 180 persone a settembre, vista su Firenze, budget medio-alto…")
                            .foregroundStyle(.secondary)
                            .padding(.top, 8)
                            .padding(.leading, 4)
                            .allowsHitTesting(false)
                    }
                }

            HStack {
                Button {
                    if viewModel.speech.isRecording {
                        Task {
                            await viewModel.speech.stop()
                            viewModel.appendDictation()
                        }
                    } else {
                        Task { await viewModel.speech.start() }
                    }
                } label: {
                    Label(
                        viewModel.speech.isRecording ? "Ferma dettatura" : "Detta il brief",
                        systemImage: viewModel.speech.isRecording ? "stop.circle.fill" : "mic.fill"
                    )
                    .foregroundStyle(viewModel.speech.isRecording ? .red : .accentColor)
                }
                .buttonStyle(.borderless)

                Spacer()

                Button {
                    Task { await viewModel.search() }
                } label: {
                    if viewModel.isSearching {
                        ProgressView()
                    } else {
                        Label("Cerca", systemImage: "sparkle.magnifyingglass")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSearching)
            }

            if viewModel.speech.isRecording && !viewModel.speech.fullTranscript.isEmpty {
                Text(viewModel.speech.fullTranscript)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
    }

    @ViewBuilder
    private var resultsSection: some View {
        if !viewModel.results.isEmpty {
            Section("Risultati (\(viewModel.results.count))") {
                ForEach(viewModel.results) { result in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(result.location.name)
                                    .font(.headline)
                                if !result.location.shortAddress.isEmpty {
                                    Text(result.location.shortAddress)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            ScoreBadge(score: result.score)
                        }
                        if let reasons = result.reasons {
                            ReasonChips(reasons: reasons)
                        }
                        ForEach(result.distances ?? [], id: \.self) { distance in
                            if let poi = distance.poi {
                                Label(
                                    distanceText(poi: poi, distance: distance),
                                    systemImage: "car"
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                        }
                        HStack {
                            NavigationLink("Apri scheda") {
                                LocationDetailView(
                                    locationId: result.location.id,
                                    preloaded: result.location
                                )
                            }
                            .font(.caption)
                            Spacer()
                            Button("Aggiungi a evento") {
                                locationToAdd = result.location
                            }
                            .font(.caption.weight(.semibold))
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private func distanceText(poi: String, distance: DistanceInfo) -> String {
        var parts: [String] = [poi]
        if let km = distance.km {
            parts.append(String(format: "%.1f km", km))
        }
        if let minutes = distance.minutesCar {
            parts.append("\(Int(minutes)) min in auto")
        }
        return parts.joined(separator: " · ")
    }
}

/// Project → event picker to add a location to an event shortlist.
struct AddToEventSheet: View {
    let location: Location
    @Bindable var viewModel: SearchViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section {
                Text(location.name)
                    .font(.headline)
            }
            if let project = viewModel.selectedProject {
                Section("Eventi di \(project.name)") {
                    Button("← Cambia progetto") {
                        viewModel.selectedProject = nil
                    }
                    .font(.caption)
                    ForEach(project.events ?? []) { event in
                        Button {
                            Task {
                                if await viewModel.add(location: location, to: event) {
                                    dismiss()
                                }
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(event.name)
                                if let dateStart = event.dateStart {
                                    Text(dateStart)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    if (project.events ?? []).isEmpty {
                        Text("Nessun evento in questo progetto.")
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Section("Scegli il progetto") {
                    if viewModel.isLoadingProjects {
                        ProgressView()
                    }
                    ForEach(viewModel.projects) { project in
                        Button {
                            Task { await viewModel.loadEvents(for: project) }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(project.name)
                                if let client = project.clientName {
                                    Text(client)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            if let message = viewModel.addMessage {
                Section {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Aggiungi a evento")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annulla") { dismiss() }
            }
        }
        .task {
            if viewModel.projects.isEmpty {
                await viewModel.loadProjects()
            }
        }
    }
}

#Preview("Ricerca brief") {
    NavigationStack {
        BriefSearchView(previewResults: Mocks.searchResults)
    }
}

extension BriefSearchView {
    /// Preview convenience initializer.
    init(previewResults: [SearchResult]) {
        _viewModel = State(initialValue: SearchViewModel(previewResults: previewResults))
        _locationToAdd = State(initialValue: nil)
    }
}
