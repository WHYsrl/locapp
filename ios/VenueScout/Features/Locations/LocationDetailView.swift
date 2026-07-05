import MapKit
import SwiftUI

/// Full base card of a location (SPEC §2.2): overview, spazi, logistica
/// (con badge "ereditata"), tecnica, party, fornitori, referenti, utilizzo,
/// cronologia and nested child locations.
struct LocationDetailView: View {
    let locationId: String

    @State private var location: Location?
    @State private var usage: [UsageEntry] = []
    @State private var history: [HistoryEntry] = []
    @State private var errorMessage: String?

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
                if let tags = location.smartTags, !tags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(tags, id: \.self) { TagChip(text: $0) }
                        }
                    }
                }
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
            Section("Spazi e capienze") {
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
            Section {
                if let auto = logistics.auto {
                    InfoRow(label: "Accesso auto", value: auto ? "sì" : "no")
                }
                if let pullman = logistics.pullman {
                    InfoRow(label: "Accesso pullman", value: pullman ? "sì" : "no")
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
            Section("Tecnica") {
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
            Section("Party") {
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
            Section("Fornitori") {
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
            Section("Referenti") {
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
            Section("Location collegate") {
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
            Section("Utilizzo (progetti ed eventi)") {
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
            Section("Cronologia") {
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

#Preview {
    NavigationStack {
        LocationDetailView(locationId: Mocks.location.id, preloaded: Mocks.location)
    }
}
