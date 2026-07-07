import SwiftUI

/// "Progetti" tab — list of projects with client and status.
struct ProjectListView: View {
    @State private var viewModel: ProjectsViewModel
    @State private var showNewProject = false
    @State private var newName = ""
    @State private var newClient = ""
    @State private var projectToDelete: Project?
    @State private var conflictProject: Project?
    @State private var conflictMessage = ""

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
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        projectToDelete = project
                    } label: {
                        Label("Elimina", systemImage: "trash")
                    }
                }
                .contextMenu {
                    Button(role: .destructive) {
                        projectToDelete = project
                    } label: {
                        Label("Elimina progetto", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Progetti")
        .navigationBarTitleDisplayMode(.large)
        .confirmationDialog(
            "Eliminare il progetto?",
            isPresented: Binding(
                get: { projectToDelete != nil },
                set: { if !$0 { projectToDelete = nil } }
            ),
            titleVisibility: .visible,
            presenting: projectToDelete
        ) { project in
            Button("Elimina \"\(project.name)\"", role: .destructive) {
                Task { await delete(project, force: false) }
            }
            Button("Annulla", role: .cancel) {}
        } message: { _ in
            Text("L'operazione non è reversibile.")
        }
        .confirmationDialog(
            "Impossibile eliminare",
            isPresented: Binding(
                get: { conflictProject != nil },
                set: { if !$0 { conflictProject = nil } }
            ),
            titleVisibility: .visible,
            presenting: conflictProject
        ) { project in
            Button("Elimina comunque", role: .destructive) {
                Task { await delete(project, force: true) }
            }
            Button("Annulla", role: .cancel) {}
        } message: { _ in
            Text(conflictMessage)
        }
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

    private func delete(_ project: Project, force: Bool) async {
        if case .conflict(let message) = await viewModel.deleteProject(project, force: force) {
            conflictMessage = message
            conflictProject = project
        }
    }
}

#Preview {
    NavigationStack {
        ProjectListView(viewModel: ProjectsViewModel(preview: Mocks.projects))
    }
}
