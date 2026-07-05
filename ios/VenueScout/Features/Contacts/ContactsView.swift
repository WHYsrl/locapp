import Observation
import SwiftUI

/// View model for the shared registry (contacts + companies, SPEC §2 req.
/// "insert once, reuse").
@MainActor
@Observable
final class ContactsViewModel {
    var contacts: [Contact] = []
    var companies: [Company] = []
    var isLoading = false
    var errorMessage: String?

    init(previewContacts: [Contact]? = nil, previewCompanies: [Company]? = nil) {
        if let previewContacts { contacts = previewContacts }
        if let previewCompanies { companies = previewCompanies }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let contactsCall = APIClient.shared.listContacts()
            async let companiesCall = APIClient.shared.listCompanies()
            let (contactsPage, companiesPage) = try await (contactsCall, companiesCall)
            contacts = contactsPage.data
            companies = companiesPage.data
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// "Contatti" tab — registry of people and companies.
struct ContactsView: View {
    @State private var viewModel: ContactsViewModel
    @State private var segment: Segment = .people

    enum Segment: String, CaseIterable {
        case people = "Persone"
        case companies = "Aziende"
    }

    init(viewModel: ContactsViewModel = ContactsViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        List {
            Section {
                Picker("Sezione", selection: $segment) {
                    ForEach(Segment.allCases, id: \.self) { segment in
                        Text(segment.rawValue).tag(segment)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
            }

            if let errorMessage = viewModel.errorMessage {
                Section {
                    Label(errorMessage, systemImage: "wifi.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            switch segment {
            case .people:
                Section {
                    ForEach(viewModel.contacts) { contact in
                        NavigationLink(value: contact) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(contact.fullName.isEmpty ? "Senza nome" : contact.fullName)
                                    .font(.subheadline.weight(.medium))
                                if let email = contact.email {
                                    Text(email)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            case .companies:
                Section {
                    ForEach(viewModel.companies) { company in
                        NavigationLink(value: company) {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(company.name)
                                        .font(.subheadline.weight(.medium))
                                    Spacer()
                                    if let kind = company.kind {
                                        StatusBadge(text: kind.label, color: .indigo)
                                    }
                                }
                                if let categories = company.supplierCategories, !categories.isEmpty {
                                    Text(categories.joined(separator: ", "))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Contatti")
        .navigationDestination(for: Contact.self) { contact in
            ContactDetailView(contact: contact)
        }
        .navigationDestination(for: Company.self) { company in
            CompanyDetailView(company: company)
        }
        .task {
            if viewModel.contacts.isEmpty && viewModel.companies.isEmpty {
                await viewModel.load()
            }
        }
        .refreshable {
            await viewModel.load()
        }
    }
}

struct ContactDetailView: View {
    let contact: Contact

    var body: some View {
        List {
            Section("Contatto") {
                if let phone = contact.phone {
                    InfoRow(label: "Telefono", value: phone)
                }
                if let email = contact.email {
                    InfoRow(label: "Email", value: email)
                }
            }
            if let notes = contact.notes {
                Section("Note") {
                    Text(notes)
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle(contact.fullName.isEmpty ? "Contatto" : contact.fullName)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct CompanyDetailView: View {
    let company: Company

    var body: some View {
        List {
            Section("Azienda") {
                if let kind = company.kind {
                    InfoRow(label: "Tipo", value: kind.label)
                }
                if let categories = company.supplierCategories, !categories.isEmpty {
                    InfoRow(label: "Categorie", value: categories.joined(separator: ", "))
                }
                if let vat = company.vatNumber {
                    InfoRow(label: "P. IVA", value: vat)
                }
                if let email = company.email {
                    InfoRow(label: "Email", value: email)
                }
                if let phone = company.phone {
                    InfoRow(label: "Telefono", value: phone)
                }
                if let website = company.website {
                    InfoRow(label: "Sito", value: website)
                }
            }
            if let notes = company.notes {
                Section("Note") {
                    Text(notes)
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle(company.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        ContactsView(viewModel: ContactsViewModel(
            previewContacts: Mocks.contacts,
            previewCompanies: Mocks.companies
        ))
    }
}
