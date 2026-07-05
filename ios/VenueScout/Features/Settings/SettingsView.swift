import Observation
import SwiftUI

@MainActor
@Observable
final class SettingsViewModel {
    var email = ""
    var password = ""
    var currentUser: User?
    var isLoggedIn = AuthTokenStore.isLoggedIn
    var isWorking = false
    var message: String?
    var outboxCount = 0

    func login() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            message = "Inserisci email e password."
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            let response = try await APIClient.shared.login(email: trimmedEmail, password: password)
            currentUser = response.user
            isLoggedIn = true
            password = ""
            message = "Accesso effettuato come \(response.user.email)."
        } catch {
            message = error.localizedDescription
        }
    }

    func logout() async {
        await APIClient.shared.logout()
        currentUser = nil
        isLoggedIn = false
        message = "Sei uscito dall'account."
    }

    func refreshOutbox() async {
        outboxCount = await OutboxStore.shared.count()
    }

    func flushOutbox() async {
        isWorking = true
        defer { isWorking = false }
        let result = await OutboxStore.shared.flush()
        outboxCount = await OutboxStore.shared.count()
        message = "Reinvio bozze: \(result.sent) inviate, \(result.failed) fallite."
    }
}

/// "Impostazioni" tab — API URL, login/logout, offline outbox.
struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @AppStorage(Config.apiBaseURLDefaultsKey) private var apiBaseURL = Config.defaultBaseURLString

    var body: some View {
        Form {
            Section("Server API") {
                TextField("URL base API", text: $apiBaseURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Text("Predefinito: \(Config.defaultBaseURLString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Account") {
                if viewModel.isLoggedIn {
                    if let user = viewModel.currentUser {
                        InfoRow(label: "Utente", value: user.name ?? user.email)
                        if let role = user.role {
                            InfoRow(label: "Ruolo", value: role)
                        }
                    } else {
                        Text("Sessione attiva (token salvato nel portachiavi).")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Button("Esci", role: .destructive) {
                        Task { await viewModel.logout() }
                    }
                } else {
                    TextField("Email", text: $viewModel.email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password", text: $viewModel.password)
                    Button {
                        Task { await viewModel.login() }
                    } label: {
                        if viewModel.isWorking {
                            ProgressView()
                        } else {
                            Text("Accedi")
                        }
                    }
                    .disabled(viewModel.isWorking)
                }
            }

            Section("Bozze offline") {
                InfoRow(label: "In attesa di invio", value: String(viewModel.outboxCount))
                Button("Riprova invio adesso") {
                    Task { await viewModel.flushOutbox() }
                }
                .disabled(viewModel.outboxCount == 0 || viewModel.isWorking)
            }

            if let message = viewModel.message {
                Section {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Info") {
                InfoRow(label: "App", value: "VenueScout")
                InfoRow(label: "Bundle", value: "it.justwhy.venuescout")
            }
        }
        .navigationTitle("Impostazioni")
        .task {
            await viewModel.refreshOutbox()
        }
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
}
