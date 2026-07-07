import SwiftUI

/// Sheet to create a point of interest (POST /pois).
/// Coordinates come from the backend geocoder (GET /geocode): the user fills
/// name/address/city, runs the search and picks one of the candidates.
struct AddPoiView: View {
    let onCreated: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var kind: PoiKind = .hotel
    @State private var address = ""
    @State private var city: String
    @State private var notes = ""
    @State private var candidates: [GeocodeCandidate] = []
    @State private var selectedCandidate: GeocodeCandidate?
    @State private var hasSearched = false
    @State private var isSearching = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(defaultCity: String? = nil, onCreated: @escaping () -> Void) {
        self.onCreated = onCreated
        _city = State(initialValue: defaultCity ?? "")
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedAddress: String {
        address.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedCity: String {
        city.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSearch: Bool {
        !(trimmedName.isEmpty && trimmedAddress.isEmpty && trimmedCity.isEmpty)
    }

    private var canSave: Bool {
        !trimmedName.isEmpty
            && selectedCandidate?.lat != nil
            && selectedCandidate?.lon != nil
    }

    var body: some View {
        Form {
            Section("Punto di interesse") {
                TextField("Nome (es. Hotel Belvedere)", text: $name)
                Picker("Tipo", selection: $kind) {
                    ForEach(PoiKind.allCases, id: \.self) { kind in
                        Label(kind.label, systemImage: kind.systemImage)
                            .tag(kind)
                    }
                }
                TextField("Note (opzionale)", text: $notes)
            }

            Section("Indirizzo") {
                TextField("Indirizzo", text: $address)
                TextField("Città", text: $city)
                Button {
                    Task { await search() }
                } label: {
                    if isSearching {
                        HStack {
                            ProgressView()
                            Text("Cerco le coordinate…")
                        }
                    } else {
                        Label("Cerca coordinate", systemImage: "magnifyingglass")
                    }
                }
                .disabled(!canSearch || isSearching)
            }

            if hasSearched {
                Section("Risultati") {
                    ForEach(candidates) { candidate in
                        Button {
                            selectedCandidate = candidate
                        } label: {
                            HStack {
                                Text(candidate.displayName)
                                    .font(.caption)
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                if selectedCandidate == candidate {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.accentColor)
                                }
                            }
                        }
                    }
                    if candidates.isEmpty && !isSearching {
                        Text("Nessun risultato: prova a modificare indirizzo o città.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Nuovo POI")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annulla") { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                if isSaving {
                    ProgressView()
                } else {
                    Button("Salva") {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private func search() async {
        isSearching = true
        defer { isSearching = false }
        hasSearched = true
        do {
            candidates = try await APIClient.shared.geocode(
                name: trimmedName.isEmpty ? nil : trimmedName,
                address: trimmedAddress.isEmpty ? nil : trimmedAddress,
                city: trimmedCity.isEmpty ? nil : trimmedCity
            )
            // Pre-select when the geocoder is unambiguous.
            selectedCandidate = candidates.count == 1 ? candidates.first : nil
            errorMessage = nil
        } catch {
            candidates = []
            selectedCandidate = nil
            errorMessage = error.localizedDescription
        }
    }

    private func save() async {
        guard let candidate = selectedCandidate,
              let lat = candidate.lat,
              let lon = candidate.lon else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await APIClient.shared.createPoi(CreatePoiRequest(
                name: trimmedName,
                kind: kind,
                lat: lat,
                lng: lon,
                address: trimmedAddress.isEmpty ? nil : trimmedAddress,
                city: trimmedCity.isEmpty ? nil : trimmedCity,
                notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? nil
                    : notes.trimmingCharacters(in: .whitespacesAndNewlines)
            ))
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        AddPoiView(defaultCity: "Firenze") {}
    }
}
