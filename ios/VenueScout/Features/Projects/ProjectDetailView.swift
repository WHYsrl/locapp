import SwiftUI

/// Project detail: info + events with per-status shortlist counts (SPEC §4).
struct ProjectDetailView: View {
    let projectId: String

    @State private var project: Project?
    @State private var errorMessage: String?

    init(projectId: String, preloaded: Project? = nil) {
        self.projectId = projectId
        _project = State(initialValue: preloaded)
    }

    var body: some View {
        Group {
            if let project {
                List {
                    infoSection(project)
                    eventsSection(project)
                }
            } else if let errorMessage {
                ContentUnavailableView(
                    "Errore di caricamento",
                    systemImage: "wifi.exclamationmark",
                    description: Text(errorMessage)
                )
            } else {
                ProgressView("Carico il progetto…")
            }
        }
        .navigationTitle(project?.name ?? "Progetto")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Event.self) { event in
            EventDetailView(event: event)
        }
        .task {
            do {
                project = try await APIClient.shared.getProject(id: projectId)
            } catch {
                if project == nil {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func infoSection(_ project: Project) -> some View {
        Section {
            if let client = project.clientName {
                InfoRow(label: "Cliente", value: client)
            }
            if let status = project.status {
                HStack {
                    Text("Stato").foregroundStyle(.secondary)
                    Spacer()
                    StatusBadge(text: status.label, color: status == .attivo ? .green : .gray)
                }
                .font(.subheadline)
            }
            if let notes = project.notes {
                Text(notes)
                    .font(.subheadline)
            }
        }
    }

    private func eventsSection(_ project: Project) -> some View {
        Section("Eventi (\((project.events ?? []).count))") {
            ForEach(project.events ?? []) { event in
                NavigationLink(value: event) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(event.name)
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            if let pax = event.pax {
                                Label("\(pax)", systemImage: "person.2")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if let dateStart = event.dateStart {
                            Label(dateStart, systemImage: "calendar")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if let counts = event.locationCounts, !counts.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(counts.sorted(by: { $0.key < $1.key }), id: \.key) { key, value in
                                        let status = EventLocationStatus(rawValue: key)
                                        TagChip(
                                            text: "\(status?.label ?? key): \(value)",
                                            tint: status?.tintColor ?? .gray
                                        )
                                    }
                                }
                            }
                        } else {
                            Text("Nessuna location in shortlist")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
            if (project.events ?? []).isEmpty {
                Text("Nessun evento in questo progetto.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    NavigationStack {
        ProjectDetailView(projectId: Mocks.project.id, preloaded: Mocks.project)
    }
}
