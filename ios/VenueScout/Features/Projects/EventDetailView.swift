import SwiftUI

/// Event detail: header + shortlist with status pickers, sopralluoghi,
/// preventivi e disponibilità per ogni location candidata.
struct EventDetailView: View {
    @State private var viewModel: EventShortlistViewModel
    @State private var showFeedback = false

    init(event: Event, previewShortlist: [EventLocation]? = nil) {
        _viewModel = State(initialValue: EventShortlistViewModel(event: event, preview: previewShortlist))
    }

    var body: some View {
        List {
            headerSection
            shortlistSection
        }
        .navigationTitle(viewModel.event.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    EventMapView(event: viewModel.event)
                } label: {
                    Label("Mappa", systemImage: "map")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showFeedback = true
                } label: {
                    Label("Feedback", systemImage: "star.bubble")
                }
            }
        }
        .sheet(isPresented: $showFeedback) {
            NavigationStack {
                PostEventFeedbackView(event: viewModel.event)
            }
        }
        .task {
            if viewModel.items.isEmpty {
                await viewModel.load()
            }
        }
        .refreshable {
            await viewModel.load()
        }
    }

    private var headerSection: some View {
        Section {
            if let type = viewModel.event.eventType {
                InfoRow(label: "Tipo", value: type)
            }
            if let dateStart = viewModel.event.dateStart {
                InfoRow(label: "Data", value: dateRangeText(start: dateStart, end: viewModel.event.dateEnd))
            }
            if let pax = viewModel.event.pax {
                InfoRow(label: "Partecipanti", value: String(pax))
            }
            if let brief = viewModel.event.brief {
                Text(brief)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let errorMessage = viewModel.errorMessage {
                Label(errorMessage, systemImage: "wifi.exclamationmark")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
    }

    private func dateRangeText(start: String, end: String?) -> String {
        if let end, end != start {
            return "\(start) → \(end)"
        }
        return start
    }

    private var shortlistSection: some View {
        Section("Shortlist (\(viewModel.items.count))") {
            if viewModel.isLoading && viewModel.items.isEmpty {
                ProgressView()
            }
            ForEach(viewModel.items) { item in
                ShortlistRow(item: item, viewModel: viewModel)
            }
            if viewModel.items.isEmpty && !viewModel.isLoading {
                Text("Nessuna location: aggiungile dalla ricerca brief.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct ShortlistRow: View {
    let item: EventLocation
    let viewModel: EventShortlistViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                if let location = item.location {
                    NavigationLink {
                        LocationDetailView(locationId: location.id, preloaded: location)
                    } label: {
                        Text(location.name)
                            .font(.subheadline.weight(.semibold))
                    }
                } else {
                    Text(item.locationId ?? "Location")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                if let score = item.matchScore {
                    ScoreBadge(score: score)
                }
            }

            Picker("Stato", selection: statusBinding) {
                ForEach(EventLocationStatus.allCases, id: \.self) { status in
                    Text(status.label).tag(status)
                }
            }
            .pickerStyle(.menu)
            .font(.caption)

            if let reasons = item.matchReasons {
                ReasonChips(reasons: reasons)
            }

            if let feedback = item.clientFeedback {
                Label(feedback, systemImage: "bubble.left")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(item.visits ?? []) { visit in
                Label(visitText(visit), systemImage: "figure.walk")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(item.quotes ?? []) { quote in
                Label(quoteText(quote), systemImage: "eurosign.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(item.availability ?? []) { slot in
                Label(availabilityText(slot), systemImage: "calendar.badge.checkmark")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusBinding: Binding<EventLocationStatus> {
        Binding(
            get: { item.status ?? .preselezionata },
            set: { newValue in
                Task { await viewModel.updateStatus(of: item, to: newValue) }
            }
        )
    }

    private func visitText(_ visit: SiteVisit) -> String {
        var parts: [String] = ["Sopralluogo"]
        if let scheduled = visit.scheduledAt { parts.append(scheduled) }
        if visit.withClient == true { parts.append("con cliente") }
        if let outcome = visit.outcome { parts.append(outcome) }
        return parts.joined(separator: " · ")
    }

    private func quoteText(_ quote: Quote) -> String {
        var parts: [String] = []
        if let amount = quote.amount {
            parts.append(String(format: "%.0f %@", amount, quote.currency ?? "EUR"))
        }
        if let status = quote.status { parts.append(status.label) }
        if let validUntil = quote.validUntil { parts.append("valido fino al \(validUntil)") }
        return parts.isEmpty ? "Preventivo" : parts.joined(separator: " · ")
    }

    private func availabilityText(_ slot: AvailabilitySlot) -> String {
        var parts: [String] = []
        if let date = slot.date { parts.append(date) }
        if let status = slot.status { parts.append(status.label) }
        if let expiry = slot.optionExpiresAt { parts.append("opzione fino al \(expiry)") }
        return parts.isEmpty ? "Disponibilità" : parts.joined(separator: " · ")
    }
}

#Preview {
    NavigationStack {
        EventDetailView(event: Mocks.event, previewShortlist: Mocks.eventLocations)
    }
}
