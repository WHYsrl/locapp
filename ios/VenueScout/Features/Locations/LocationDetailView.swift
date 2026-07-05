import MapKit
import SwiftUI

/// Full base card of a location (SPEC §2.2): overview, spazi, logistica
/// (con badge "ereditata"), tecnica, party, fornitori, referenti, utilizzo,
/// cronologia and nested child locations.
/// Every major section is collapsible; expansion state persists per section.
struct LocationDetailView: View {
    let locationId: String

    @State private var location: Location?
    @State private var usage: [UsageEntry] = []
    @State private var history: [HistoryEntry] = []
    @State private var errorMessage: String?
    @State private var showTagEditor = false

    init(locationId: String, preloaded: Location? = nil) {
        self.locationId = locationId
        _location = State(initialValue: preloaded)
    }

    var body: some View {
        Group {
            if let location {
                content(for: location)
            } else if let errorMessage {
                ContentUnavailableView(
                    "Errore di caricamento",
                    systemImage: "wifi.exclamationmark",
                    description: Text(errorMessage)
                )
            } else {
                ProgressView("Carico la scheda…")
            }
        }
        .navigationTitle(location?.name ?? "Location")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showTagEditor) {
            if let location {
                NavigationStack {
                    TagEditorView(
                        locationId: location.id,
                        initialTags: location.smartTags ?? []
                    ) { newTags in
                        self.location?.smartTags = newTags
                    }
                }
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        do {
            async let detailCall = APIClient.shared.getLocation(id: locationId)
            async let usageCall = APIClient.shared.locationUsage(id: locationId)
            async let historyCall = APIClient.shared.locationHistory(id: locationId)
            location = try await detailCall
            usage = (try? await usageCall) ?? usage
            history = (try? await historyCall) ?? history
        } catch {
            if location == nil {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: Content

    private func content(for location: Location) -> some View {
        List {
            overviewSection(location)
            mapSection(location)
            spacesSection(location)
            logisticsSection(location)
            technicalSection(location)
            partySection(location)
            suppliersSection(location)
            contactsSection(location)
            childrenSection(location)
            usageSection
            historySection
        }
    }

    private func overviewSection(_ location: Location) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                if let summary = location.summary {
                    Text(summary)
                        .font(.subheadline)
                }
                if !location.shortAddress.isEmpty {
                    Label(location.shortAddress, systemImage: "mappin.and.ellipse")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                HStack {
                    if let status = location.visitStatus {
                        StatusBadge(text: status.label, color: status.tintColor)
                    }
                    if let rating = location.accessibilityRating {
                        HStack(spacing: 4) {
                            Text("Accessibilità")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            StarRatingView(rating: rating)
                        }
                    }
                }
                if let notes = location.accessibilityNotes {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let rules = location.availabilityRules {
                    Label(rules, systemImage: "calendar.badge.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                tagsRow(location)
                if let impressions = location.impressions {
                    Text("Impressioni: \(impressions)")
                        .font(.caption)
                        .italic()
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 2)
        }
    }

    /// Smart-tag chips plus the pencil button opening the tag editor sheet.
    private func tagsRow(_ location: Location) -> some View {
        HStack(spacing: 8) {
            if let tags = location.smartTags, !tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(tags, id: \.self) { TagChip(text: $0) }
                    }
                }
            } else {
                Text("Nessun tag")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer()
            }
            Button {
                showTagEditor = true
            } label: {
                Image(systemName: "pencil.circle")
                    .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Modifica tag")
        }
    }

    @ViewBuilder
    private func mapSection(_ location: Location) -> some View {
        if let latitude = location.latitude, let longitude = location.longitude {
            let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            Section("Mappa") {
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                ))) {
                    Marker(location.name, coordinate: coordinate)
                }
                .frame(height: 200)
                .listRowInsets(EdgeInsets())
            }
        }
    }

    @ViewBuilder
    private func spacesSection(_ location: Location) -> some View {
        if let spaces = location.spaces, !spaces.isEmpty {
            CollapsibleSection("Spazi e capienze", key: "spazi", defaultExpanded: true) {
                ForEach(spaces) { space in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(space.name)
                                .font(.subheadline.weight(.semibold))
                            if let kind = space.kind {
                                StatusBadge(text: kind.label, color: kind == .interno ? .blue : .green)
                            }
                            if let covered = space.covered {
                                StatusBadge(text: covered.label, color: .teal)
                            }
                            Spacer()
                            if let area = space.areaSqm {
                                Text("\(Int(area)) m²")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if let capacities = space.capacities, !capacities.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(capacities, id: \.configuration) { capacity in
                                        TagChip(
                                            text: "\(capacity.configuration.label): \(capacity.capacity)",
                                            tint: .indigo
                                        )
                                    }
                                }
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    @ViewBuilder
    private func logisticsSection(_ location: Location) -> some View {
        if let logistics = location.displayLogistics {
            CollapsibleSection(key: "logistica", defaultExpanded: true) {
                if let auto = logistics.auto {
                    InfoRow(label: "Accesso auto", value: auto)
                }
                if let pullman = logistics.pullman {
                    InfoRow(label: "Accesso pullman", value: pullman)
                }
                if let ztl = logistics.ztl, ztl.present == true {
                    InfoRow(label: "ZTL", value: ztl.hours ?? "presente")
                    if let permits = ztl.permits {
                        InfoRow(label: "Permessi ZTL", value: permits)
                    }
                }
                if let difficulty = logistics.stopDifficulty {
                    InfoRow(label: "Difficoltà sosta", value: difficulty)
                }
                if let parking = logistics.privateParking, let spots = parking.spots {
                    InfoRow(label: "Parcheggio privato", value: "\(spots) posti")
                }
                ForEach(logistics.nearbyParking ?? [], id: \.self) { parking in
                    InfoRow(
                        label: parking.name ?? "Parcheggio vicino",
                        value: parking.distanceM.map { "\(Int($0)) m" } ?? "—"
                    )
                }
                if let notes = logistics.notes {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } header: {
                HStack {
                    Text("Logistica")
                        .font(.headline)
                    if location.logisticsAreInherited {
                        StatusBadge(text: "Ereditata", color: .purple)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func technicalSection(_ location: Location) -> some View {
        if let technical = location.technical {
            CollapsibleSection("Tecnica", key: "tecnica") {
                if let maxKw = technical.maxKw {
                    InfoRow(label: "Potenza massima", value: "\(Int(maxKw)) kW")
                }
                if let generators = technical.generators {
                    InfoRow(label: "Generatori", value: generators ? "sì" : "no")
                }
                if let ladder = technical.aerialLadder {
                    InfoRow(label: "Autoscala", value: ladder ? "sì" : "no")
                }
                if let cooking = technical.cooking {
                    InfoRow(label: "Cucina", value: cooking)
                }
                if let heavy = technical.heavyVehicleAccess {
                    InfoRow(label: "Accesso mezzi pesanti", value: heavy ? "sì" : "no")
                }
                if let notes = technical.notes {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func partySection(_ location: Location) -> some View {
        if let party = location.party {
            CollapsibleSection("Party", key: "party") {
                if let indoor = party.indoor {
                    InfoRow(
                        label: "Interno",
                        value: partyRuleText(indoor)
                    )
                }
                if let outdoor = party.outdoor {
                    InfoRow(
                        label: "Esterno",
                        value: partyRuleText(outdoor)
                    )
                }
                if let limit = party.dbLimit {
                    InfoRow(label: "Limite dB", value: "\(Int(limit)) dB")
                }
                ForEach(party.structuralConstraints ?? [], id: \.self) { constraint in
                    Label(constraint, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    private func partyRuleText(_ rules: PartyRules) -> String {
        guard rules.allowed == true else { return "non consentito" }
        if let until = rules.musicUntil {
            return "musica fino alle \(until)"
        }
        return "consentito"
    }

    @ViewBuilder
    private func suppliersSection(_ location: Location) -> some View {
        if let suppliers = location.suppliers, !suppliers.isEmpty {
            CollapsibleSection("Fornitori", key: "fornitori") {
                ForEach(suppliers) { supplier in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(supplier.companyName ?? "Fornitore")
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            if let requirement = supplier.requirement {
                                StatusBadge(
                                    text: requirement,
                                    color: requirement == "obbligatorio" ? .red : .blue
                                )
                            }
                        }
                        HStack(spacing: 8) {
                            if let category = supplier.category {
                                TagChip(text: category, tint: .indigo)
                            }
                            if let rating = supplier.rating {
                                StarRatingView(rating: Int(rating.rounded()))
                            }
                        }
                        if let conditions = supplier.conditions {
                            Text(conditions)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    @ViewBuilder
    private func contactsSection(_ location: Location) -> some View {
        if let contacts = location.contacts, !contacts.isEmpty {
            CollapsibleSection("Referenti", key: "referenti") {
                ForEach(contacts) { contact in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(contact.fullName)
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            if let role = contact.role {
                                Text(role)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if let phone = contact.phone {
                            Label(phone, systemImage: "phone")
                                .font(.caption)
                        }
                        if let email = contact.email {
                            Label(email, systemImage: "envelope")
                                .font(.caption)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    @ViewBuilder
    private func childrenSection(_ location: Location) -> some View {
        if let children = location.children, !children.isEmpty {
            CollapsibleSection("Location collegate", key: "location_collegate") {
                ForEach(children) { child in
                    NavigationLink {
                        LocationDetailView(locationId: child.id, preloaded: child)
                    } label: {
                        LocationRow(location: child)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var usageSection: some View {
        if !usage.isEmpty {
            CollapsibleSection("Utilizzo (progetti ed eventi)", key: "utilizzo") {
                ForEach(usage) { entry in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(entry.project?.name ?? "Progetto")
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            if let status = entry.status {
                                StatusBadge(text: status.label, color: status.tintColor)
                            }
                        }
                        if let eventName = entry.event?.name {
                            Text(eventName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if let dates = entry.dates {
                            Label(dates.displayString, systemImage: "calendar")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    @ViewBuilder
    private var historySection: some View {
        if !history.isEmpty {
            CollapsibleSection("Cronologia", key: "cronologia") {
                ForEach(history) { entry in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(entry.title ?? entry.kind ?? "Evento")
                                .font(.subheadline)
                            Spacer()
                            if let date = entry.date {
                                Text(date)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if let details = entry.details {
                            Text(details)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Collapsible section

/// List section whose content sits in a DisclosureGroup with a styled header.
/// Expansion state persists per section key (shared across locations).
private struct CollapsibleSection<Header: View, Content: View>: View {
    @AppStorage private var isExpanded: Bool
    private let header: Header
    private let content: Content

    init(
        key: String,
        defaultExpanded: Bool = false,
        @ViewBuilder content: () -> Content,
        @ViewBuilder header: () -> Header
    ) {
        self.header = header()
        self.content = content()
        _isExpanded = AppStorage(wrappedValue: defaultExpanded, "locationSectionExpanded.\(key)")
    }

    var body: some View {
        Section {
            DisclosureGroup(isExpanded: $isExpanded) {
                content
            } label: {
                header
            }
        }
    }
}

extension CollapsibleSection where Header == Text {
    /// Convenience for plain-title headers.
    init(
        _ title: String,
        key: String,
        defaultExpanded: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
        self.init(key: key, defaultExpanded: defaultExpanded, content: content) {
            Text(title)
                .font(.headline)
        }
    }
}

// MARK: - Tag editor

/// Sheet to toggle registry smart tags on a location and add new ones.
/// Salva sends a PATCH with the full tag list; unknown names are
/// auto-registered by the backend.
private struct TagEditorView: View {
    let locationId: String
    let initialTags: [String]
    let onSave: ([String]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var registryTags: [Tag] = []
    @State private var selected: Set<String>
    @State private var newTagName = ""
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(locationId: String, initialTags: [String], onSave: @escaping ([String]) -> Void) {
        self.locationId = locationId
        self.initialTags = initialTags
        self.onSave = onSave
        _selected = State(initialValue: Set(initialTags))
    }

    /// Registry names plus any selected names missing from the registry,
    /// so tags already on the location can always be toggled off. Deduplicated.
    private var allNames: [String] {
        var names: [String] = []
        var seen = Set<String>()
        for tag in registryTags where seen.insert(tag.name).inserted {
            names.append(tag.name)
        }
        for name in selected.sorted() where seen.insert(name).inserted {
            names.append(name)
        }
        return names
    }

    private var trimmedNewName: String {
        newTagName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        List {
            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "wifi.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            Section("Tag disponibili") {
                if isLoading && registryTags.isEmpty {
                    ProgressView()
                }
                ForEach(allNames, id: \.self) { name in
                    Button {
                        toggle(name)
                    } label: {
                        HStack(spacing: 8) {
                            if let color = tagColor(for: name) {
                                Circle()
                                    .fill(color)
                                    .frame(width: 10, height: 10)
                            }
                            Text(name)
                                .foregroundStyle(.primary)
                            Spacer()
                            if selected.contains(name) {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                }
                if !isLoading && allNames.isEmpty {
                    Text("Nessun tag nel registro.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Section("Nuovo tag") {
                HStack {
                    TextField("Nuovo tag", text: $newTagName)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { addNewTag() }
                    Button {
                        addNewTag()
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .buttonStyle(.borderless)
                    .disabled(trimmedNewName.isEmpty)
                    .accessibilityLabel("Aggiungi tag")
                }
            }
        }
        .navigationTitle("Modifica tag")
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
                }
            }
        }
        .task { await loadTags() }
    }

    private func toggle(_ name: String) {
        if selected.contains(name) {
            selected.remove(name)
        } else {
            selected.insert(name)
        }
    }

    private func addNewTag() {
        let name = trimmedNewName
        guard !name.isEmpty else { return }
        selected.insert(name)
        if !registryTags.contains(where: { $0.name == name }) {
            registryTags.append(Tag(id: "local-\(name)", name: name, color: nil))
        }
        newTagName = ""
        // Best-effort registry insert; the PATCH also auto-registers unknown names.
        Task { _ = try? await APIClient.shared.createTag(name: name) }
    }

    /// Hex color (`#RRGGBB`) of a registry tag, if present and parseable.
    private func tagColor(for name: String) -> Color? {
        guard var hex = registryTags.first(where: { $0.name == name })?.color else { return nil }
        hex = hex.trimmingCharacters(in: .whitespaces)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255
        return Color(red: red, green: green, blue: blue)
    }

    private func loadTags() async {
        do {
            registryTags = try await APIClient.shared.fetchTags()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        // Keep the original ordering for tags already on the location,
        // then append newly selected ones in list order.
        var result = initialTags.filter { selected.contains($0) }
        for name in allNames where selected.contains(name) && !result.contains(name) {
            result.append(name)
        }
        do {
            try await APIClient.shared.updateLocationTags(id: locationId, tags: result)
            onSave(result)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        LocationDetailView(locationId: Mocks.location.id, preloaded: Mocks.location)
    }
}
