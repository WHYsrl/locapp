import SwiftUI

/// "Progetti" tab — list of projects with client and status.
struct ProjectListView: View {
    @State private var viewModel: ProjectsViewModel
    @State private var showNewProject = false
    @State private var newName = ""
    @State private var newClient = ""

    init(viewModel: ProjectsViewModel = ProjectsViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        List {
            if let errorMessage = viewModel.errorMessage {
                Section {
                    Label(errorMessage, systemImage: "wifi.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            ForEach(viewModel.projects) { project in
                NavigationLink(value: project) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(project.name)
                                .font(.headline)
                            Spacer()
                            if let status = project.status {
                                StatusBadge(
                                    text: status.label,
                                    color: status == .attivo ? .green : .gray
                                )
                            }
                        }
                        if let client = project.clientName {
                            Text(client)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .navigationTitle("Progetti")
        .navigationDestination(for: Project.self) { project in
            ProjectDetailView(projectId: project.id, preloaded: project)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showNewProject = true
                } label: {
                    Label("Nuovo progetto", systemImage: "plus")
                }
            }
        }
        .alert("Nuovo progetto", isPresented: $showNewProject) {
            TextField("Nome progetto", text: $newName)
            TextField("Cliente", text: $newClient)
            Button("Crea") {
                let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
                let client = newClient.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return }
                Task {
                    await viewModel.createProject(
                        name: name,
                        clientName: client.isEmpty ? nil : client
                    )
                }
                newName = ""
                newClient = ""
            }
            Button("Annulla", role: .cancel) {}
        }
        .overlay {
            if viewModel.isLoading && viewModel.projects.isEmpty {
                ProgressView("Carico i progetti…")
            } else if viewModel.projects.isEmpty && !viewModel.isLoading {
                ContentUnavailableView(
                    "Nessun progetto",
                    systemImage: "folder",
                    description: Text("Crea il primo progetto con il pulsante +.")
                )
            }
        }
        .task {
            if viewModel.projects.isEmpty {
                await viewModel.load()
            }
        }
        .refreshable {
            await viewModel.load()
        }
    }
}

#Preview {
    NavigationStack {
        ProjectListView(viewModel: ProjectsViewModel(preview: Mocks.projects))
    }
}
