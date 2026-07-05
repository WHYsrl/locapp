import SwiftUI

/// Archive of locations with search and filters (stato / tag).
struct LocationListView: View {
    @State private var viewModel: LocationsViewModel

    init(viewModel: LocationsViewModel = LocationsViewModel()) {
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
            ForEach(viewModel.locations) { location in
                NavigationLink(value: location) {
                    LocationRow(location: location)
                }
            }
        }
        .navigationTitle("Location")
        .navigationDestination(for: Location.self) { location in
            LocationDetailView(locationId: location.id, preloaded: location)
        }
        .searchable(text: $viewModel.searchText, prompt: "Cerca per nome o città")
        .onSubmit(of: .search) {
            Task { await viewModel.load() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                filterMenu
            }
        }
        .overlay {
            if viewModel.isLoading && viewModel.locations.isEmpty {
                ProgressView("Carico le location…")
            } else if viewModel.locations.isEmpty && !viewModel.isLoading {
                ContentUnavailableView(
                    "Nessuna location",
                    systemImage: "building.2",
                    description: Text("Aggiungi la prima dal tab Inserisci.")
                )
            }
        }
        .task {
            if viewModel.locations.isEmpty {
                await viewModel.load()
            }
        }
        .refreshable {
            await viewModel.load()
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Stato", selection: $viewModel.statusFilter) {
                Text("Tutte").tag(VisitStatus?.none)
                ForEach(VisitStatus.allCases, id: \.self) { status in
                    Text(status.label).tag(VisitStatus?.some(status))
                }
            }
            Picker("Tag", selection: $viewModel.tagFilter) {
                Text("Tutti i tag").tag(String?.none)
                ForEach(LocationsViewModel.knownTags, id: \.self) { tag in
                    Text(tag).tag(String?.some(tag))
                }
            }
            Button("Applica filtri") {
                Task { await viewModel.load() }
            }
        } label: {
            Label("Filtri", systemImage: "line.3.horizontal.decrease.circle")
        }
    }
}

struct LocationRow: View {
    let location: Location

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(location.name)
                    .font(.headline)
                Spacer()
                if let status = location.visitStatus {
                    StatusBadge(text: status.label, color: status.tintColor)
                }
            }
            if !location.shortAddress.isEmpty {
                Text(location.shortAddress)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 6) {
                if let rating = location.accessibilityRating {
                    StarRatingView(rating: rating)
                }
                ForEach((location.smartTags ?? []).prefix(3), id: \.self) { tag in
                    TagChip(text: tag)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    NavigationStack {
        LocationListView(viewModel: LocationsViewModel(preview: Mocks.locations))
    }
}
