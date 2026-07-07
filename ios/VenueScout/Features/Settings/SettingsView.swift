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
    var outboxItems: [OutboxStore.PendingItem] = []

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

    /// Native Google SSO: OAuth+PKCE via ASWebAuthenticationSession, then
    /// POST /auth/google. 403 (utente non abilitato) and 503 (SSO non
    /// configurato) surface the backend message.
    func loginWithGoogle(coordinator: GoogleSignInCoordinator) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let idToken = try await coordinator.signIn()
            let response = try await APIClient.shared.loginWithGoogle(idToken: idToken)
            currentUser = response.user
            isLoggedIn = true
            message = "Accesso effettuato come \(response.user.email)."
        } catch let error as GoogleSignInError {
            message = error.isCancellation ? nil : error.localizedDescription
        } catch let error as APIError {
            if case .http(let status, _, let serverMessage) = error {
                switch status {
                case 403:
                    message = serverMessage ?? "Questo account Google non è abilitato."
                case 503:
                    message = serverMessage ?? "Accesso Google non configurato sul server."
                default:
                    message = error.localizedDescription
                }
            } else {
                message = error.localizedDescription
            }
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
        outboxItems = await OutboxStore.shared.items()
        outboxCount = outboxItems.count
    }

    func flushOutbox() async {
        isWorking = true
        defer { isWorking = false }
        let result = await OutboxStore.shared.flush()
        await refreshOutbox()
        message = "Reinvio bozze: \(result.sent) inviate, \(result.failed) fallite."
    }
}

/// "Impostazioni" tab — API URL, login/logout, offline outbox.
struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @State private var googleCoordinator = GoogleSignInCoordinator()
    @AppStorage(Config.apiBaseURLDefaultsKey) private var apiBaseURL = Config.defaultBaseURLString
    @AppStorage(Config.googleIOSClientIDDefaultsKey) private var googleClientID = ""

    private var trimmedGoogleClientID: String {
        googleClientID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        Form {
            Section("Server API") {
                TextField("URL base API", text: $apiBaseURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                InfoRow(label: "URL effettivo", value: effectiveAPIURLString)
                Text("Predefinito: \(Config.defaultBaseURLString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Account") {
                Label(
                    viewModel.isLoggedIn ? "Connesso (token salvato)" : "Non autenticato",
                    systemImage: viewModel.isLoggedIn ? "checkmark.circle.fill" : "person.crop.circle.badge.exclamationmark"
                )
                .foregroundStyle(viewModel.isLoggedIn ? .green : .orange)
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
                    if !trimmedGoogleClientID.isEmpty {
                        Button {
                            Task { await viewModel.loginWithGoogle(coordinator: googleCoordinator) }
                        } label: {
                            Label("Accedi con Google", systemImage: "g.circle")
                        }
                        .disabled(viewModel.isWorking)
                    }
                }
            }

            Section("Accesso Google (SSO)") {
                TextField("Client ID iOS (…apps.googleusercontent.com)", text: $googleClientID)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Text("Client ID OAuth di tipo iOS della Google Cloud Console. Lo schema URL (client ID invertito) va registrato in project.yml — vedi ios/README.md.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Bozze offline") {
                InfoRow(label: "In attesa di invio", value: String(viewModel.outboxCount))
                Button("Riprova invio adesso") {
                    Task { await viewModel.flushOutbox() }
                }
                .disabled(viewModel.outboxCount == 0 || viewModel.isWorking)

                ForEach(viewModel.outboxItems) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(item.request.sourceType.rawValue.capitalized) · \(item.createdAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.subheadline)
                        if item.localDraft != nil {
                            Text("Bozza locale rivista allegata")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        if let lastError = item.lastError {
                            Text("Ultimo errore: \(lastError)")
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                }
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
        .navigationBarTitleDisplayMode(.large)
        .task {
            await viewModel.refreshOutbox()
        }
        .refreshable {
            await viewModel.refreshOutbox()
        }
    }

    /// Mirrors Config.apiBaseURL (trailing "/" trimmed + "/api/v1") but reads the
    /// @AppStorage value so it updates live while the user edits the field.
    private var effectiveAPIURLString: String {
        var raw = apiBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { raw = Config.defaultBaseURLString }
        while raw.hasSuffix("/") { raw.removeLast() }
        return raw + "/api/v1"
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
}
