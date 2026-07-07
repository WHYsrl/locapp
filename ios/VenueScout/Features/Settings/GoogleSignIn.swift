import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// Errors of the native Google sign-in flow (messages in Italian, shown as-is).
enum GoogleSignInError: Error, LocalizedError {
    case missingClientID
    case invalidClientID
    case cancelled
    case invalidCallback
    case stateMismatch
    case tokenExchangeFailed(String?)
    case missingIDToken

    var errorDescription: String? {
        switch self {
        case .missingClientID:
            return "Client ID Google mancante: impostalo in Impostazioni."
        case .invalidClientID:
            return "Client ID Google non valido (atteso: xxxx.apps.googleusercontent.com)."
        case .cancelled:
            return "Accesso con Google annullato."
        case .invalidCallback:
            return "Risposta di Google non valida."
        case .stateMismatch:
            return "Verifica di sicurezza fallita (state non corrispondente): riprova."
        case .tokenExchangeFailed(let detail):
            if let detail, !detail.isEmpty {
                return "Scambio del codice fallito: \(detail)"
            }
            return "Scambio del codice con Google fallito."
        case .missingIDToken:
            return "Google non ha restituito un id_token."
        }
    }

    var isCancellation: Bool {
        if case .cancelled = self { return true }
        return false
    }
}

/// Native "Sign in with Google" without the Google SDK:
/// OAuth 2.0 authorization-code flow with PKCE (S256) for an iOS client.
///
/// 1. `ASWebAuthenticationSession` → `https://accounts.google.com/o/oauth2/v2/auth`
///    (redirect_uri = reversed-client-id scheme + `:/oauth2redirect`).
/// 2. Code exchange at `https://oauth2.googleapis.com/token` (iOS clients
///    have no client secret).
/// 3. The returned `id_token` is then posted to the VenueScout backend
///    (`POST /api/v1/auth/google`) by the caller.
@MainActor
final class GoogleSignInCoordinator: NSObject, ASWebAuthenticationSessionPresentationContextProviding {
    /// Keeps the session alive for the duration of the flow.
    private var activeSession: ASWebAuthenticationSession?
    /// Anchor captured on the main actor before `start()`; read by the
    /// nonisolated protocol witness (which the system calls on the main
    /// thread). Non-optional so the witness never has to build a UIWindow
    /// (whose init is MainActor-isolated) from a nonisolated context.
    private nonisolated(unsafe) var anchor: ASPresentationAnchor = ASPresentationAnchor()

    /// Runs the full OAuth flow and returns the Google `id_token`.
    func signIn() async throws -> String {
        let clientID = Config.googleIOSClientID
        guard !clientID.isEmpty else { throw GoogleSignInError.missingClientID }
        guard let scheme = Self.reversedClientID(from: clientID) else {
            throw GoogleSignInError.invalidClientID
        }
        let redirectURI = scheme + ":/oauth2redirect"
        let codeVerifier = Self.randomURLSafeString(byteCount: 64)
        let codeChallenge = Self.codeChallenge(for: codeVerifier)
        let state = Self.randomURLSafeString(byteCount: 16)

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state)
        ]
        guard let authURL = components?.url else {
            throw GoogleSignInError.invalidClientID
        }

        let callbackURL = try await authenticate(url: authURL, callbackScheme: scheme)

        guard let callback = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
              let items = callback.queryItems else {
            throw GoogleSignInError.invalidCallback
        }
        if let errorValue = items.first(where: { $0.name == "error" })?.value {
            if errorValue == "access_denied" { throw GoogleSignInError.cancelled }
            throw GoogleSignInError.tokenExchangeFailed(errorValue)
        }
        guard items.first(where: { $0.name == "state" })?.value == state else {
            throw GoogleSignInError.stateMismatch
        }
        guard let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw GoogleSignInError.invalidCallback
        }

        return try await exchangeCode(
            code,
            clientID: clientID,
            redirectURI: redirectURI,
            codeVerifier: codeVerifier
        )
    }

    // MARK: ASWebAuthenticationSession

    private func authenticate(url: URL, callbackScheme: String) async throws -> URL {
        anchor = Self.keyWindow() ?? anchor
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin {
                    continuation.resume(throwing: GoogleSignInError.cancelled)
                } else {
                    continuation.resume(throwing: error ?? GoogleSignInError.invalidCallback)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            if !session.start() {
                // start() returning false means the session never ran, so the
                // completion handler will not fire: fail the continuation here.
                activeSession = nil
                continuation.resume(throwing: GoogleSignInError.invalidCallback)
            }
        }
    }

    /// Called by the system on the main thread; declared nonisolated so it
    /// satisfies the protocol regardless of the SDK's isolation annotations.
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor
    }

    private static func keyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
    }

    // MARK: Token exchange (no client secret for iOS clients)

    private struct TokenResponse: Decodable {
        var idToken: String?

        enum CodingKeys: String, CodingKey {
            case idToken = "id_token"
        }
    }

    private struct TokenErrorResponse: Decodable {
        var error: String?
        var errorDescription: String?

        enum CodingKeys: String, CodingKey {
            case error
            case errorDescription = "error_description"
        }
    }

    private func exchangeCode(
        _ code: String,
        clientID: String,
        redirectURI: String,
        codeVerifier: String
    ) async throws -> String {
        guard let tokenURL = URL(string: "https://oauth2.googleapis.com/token") else {
            throw GoogleSignInError.tokenExchangeFailed(nil)
        }
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code_verifier", value: codeVerifier)
        ]
        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data((form.percentEncodedQuery ?? "").utf8)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw GoogleSignInError.tokenExchangeFailed(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw GoogleSignInError.tokenExchangeFailed(nil)
        }
        guard (200..<300).contains(http.statusCode) else {
            let detail = try? JSONDecoder().decode(TokenErrorResponse.self, from: data)
            let text = [detail?.error, detail?.errorDescription]
                .compactMap { $0 }
                .joined(separator: ": ")
            throw GoogleSignInError.tokenExchangeFailed(text.isEmpty ? "HTTP \(http.statusCode)" : text)
        }
        guard let token = try? JSONDecoder().decode(TokenResponse.self, from: data),
              let idToken = token.idToken, !idToken.isEmpty else {
            throw GoogleSignInError.missingIDToken
        }
        return idToken
    }

    // MARK: PKCE helpers

    /// `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`
    /// (the custom URL scheme Google expects for iOS clients).
    static func reversedClientID(from clientID: String) -> String? {
        let parts = clientID.split(separator: ".").map(String.init)
        guard parts.count >= 2, clientID.hasSuffix(".apps.googleusercontent.com") else {
            return nil
        }
        return parts.reversed().joined(separator: ".")
    }

    private static func randomURLSafeString(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        if status != errSecSuccess {
            // Extremely unlikely; fall back to the system generator.
            bytes = (0..<byteCount).map { _ in UInt8.random(in: .min ... .max) }
        }
        return base64URLEncode(Data(bytes))
    }

    private static func codeChallenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return base64URLEncode(Data(digest))
    }

    private static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
