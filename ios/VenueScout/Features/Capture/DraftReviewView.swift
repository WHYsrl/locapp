import SwiftUI

/// One reviewable field of the extracted draft, keyed by its accept path
/// (SPEC §4: POST /ingest/:jobId/apply {accept: {fieldPath: bool}}).
struct DraftFieldRow: Identifiable {
    let id: String // fieldPath
    let title: String
    let value: String
    let source: String?
}

/// Per-field review of an ExtractedLocationDraft (SPEC §5) with accept toggles.
struct DraftReviewView: View {
    let jobId: String
    let draft: ExtractedLocationDraft
    var onApplied: () -> Void = {}

    @State private var accepted: [String: Bool] = [:]
    @State private var isApplying = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    init(jobId: String, draft: ExtractedLocationDraft, onApplied: @escaping () -> Void = {}) {
        self.jobId = jobId
        self.draft = draft
        self.onApplied = onApplied
    }

    var body: some View {
        List {
            confidenceSection
            fieldSection(title: "Scheda location", rows: locationRows)
            fieldSection(title: "Spazi", rows: spaceRows)
            fieldSection(title: "Referenti", rows: contactRows)
            fieldSection(title: "Fornitori", rows: supplierRows)
            fieldSection(title: "Voci di listino", rows: priceRows)
            openQuestionsSection
            applySection
        }
        .navigationTitle("Rivedi bozza")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Chiudi") { dismiss() }
            }
        }
    }

    // MARK: Rows built from the draft

    private var locationRows: [DraftFieldRow] {
        guard let fields = draft.location else { return [] }
        return fields.keys.sorted().map { key in
            DraftFieldRow(
                id: "location.\(key)",
                title: key.replacingOccurrences(of: "_", with: " ").capitalized,
                value: fields[key]?.displayString ?? "—",
                source: draft.fieldSources?["locations.\(key)"]
            )
        }
    }

    private var spaceRows: [DraftFieldRow] {
        (draft.spaces ?? []).enumerated().map { index, space in
            let capacities = (space.capacities ?? [:])
                .sorted { $0.key < $1.key }
                .map { "\($0.key): \($0.value)" }
                .joined(separator: ", ")
            var parts: [String] = []
            if let kind = space.kind { parts.append(kind) }
            if let area = space.areaSqm { parts.append("\(Int(area)) m²") }
            if !capacities.isEmpty { parts.append(capacities) }
            return DraftFieldRow(
                id: "spaces[\(index)]",
                title: space.name ?? "Spazio \(index + 1)",
                value: parts.joined(separator: " · "),
                source: nil
            )
        }
    }

    private var contactRows: [DraftFieldRow] {
        (draft.contacts ?? []).enumerated().map { index, contact in
            let name = [contact.firstName, contact.lastName].compactMap { $0 }.joined(separator: " ")
            var parts: [String] = []
            if let role = contact.role, !role.isEmpty { parts.append(role) }
            if let phone = contact.phone, !phone.isEmpty { parts.append(phone) }
            if let email = contact.email, !email.isEmpty { parts.append(email) }
            return DraftFieldRow(
                id: "contacts[\(index)]",
                title: name.isEmpty ? "Contatto \(index + 1)" : name,
                value: parts.joined(separator: " · "),
                source: nil
            )
        }
    }

    private var supplierRows: [DraftFieldRow] {
        (draft.suppliers ?? []).enumerated().map { index, supplier in
            var parts: [String] = []
            if let category = supplier.category { parts.append(category) }
            if let requirement = supplier.requirement { parts.append(requirement) }
            return DraftFieldRow(
                id: "suppliers[\(index)]",
                title: supplier.companyName ?? "Fornitore \(index + 1)",
                value: parts.joined(separator: " · "),
                source: nil
            )
        }
    }

    private var priceRows: [DraftFieldRow] {
        (draft.priceItems ?? []).enumerated().map { index, item in
            var parts: [String] = []
            if let price = item.prezzo { parts.append(String(format: "%.2f €", price)) }
            if let unit = item.unita, !unit.isEmpty { parts.append(unit) }
            return DraftFieldRow(
                id: "price_items[\(index)]",
                title: item.voce ?? "Voce \(index + 1)",
                value: parts.joined(separator: " / "),
                source: nil
            )
        }
    }

    private var allRows: [DraftFieldRow] {
        locationRows + spaceRows + contactRows + supplierRows + priceRows
    }

    // MARK: Sections

    @ViewBuilder
    private var confidenceSection: some View {
        if let confidence = draft.confidence {
            Section {
                HStack {
                    Text("Affidabilità estrazione")
                    Spacer()
                    ScoreBadge(score: confidence * 100)
                }
            }
        }
    }

    @ViewBuilder
    private func fieldSection(title: String, rows: [DraftFieldRow]) -> some View {
        if !rows.isEmpty {
            Section(title) {
                ForEach(rows) { row in
                    Toggle(isOn: binding(for: row.id)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title)
                                .font(.subheadline.weight(.medium))
                            if !row.value.isEmpty {
                                Text(row.value)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let source = row.source {
                                Text("Fonte: \(source)")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var openQuestionsSection: some View {
        if let questions = draft.openQuestions, !questions.isEmpty {
            Section("Domande aperte") {
                ForEach(questions, id: \.self) { question in
                    Label(question, systemImage: "questionmark.circle")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    private var applySection: some View {
        Section {
            Button {
                Task { await apply() }
            } label: {
                if isApplying {
                    HStack {
                        ProgressView()
                        Text("Applico…")
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Text("Applica campi selezionati")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isApplying || allRows.isEmpty)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    // MARK: Logic

    private func binding(for fieldPath: String) -> Binding<Bool> {
        Binding(
            get: { accepted[fieldPath, default: true] },
            set: { accepted[fieldPath] = $0 }
        )
    }

    private func apply() async {
        var accept: [String: Bool] = [:]
        for row in allRows {
            accept[row.id] = accepted[row.id, default: true]
        }
        isApplying = true
        errorMessage = nil
        do {
            _ = try await APIClient.shared.applyIngestion(id: jobId, accept: accept)
            isApplying = false
            onApplied()
            dismiss()
        } catch {
            isApplying = false
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        DraftReviewView(jobId: "job-1", draft: Mocks.draft)
    }
}
