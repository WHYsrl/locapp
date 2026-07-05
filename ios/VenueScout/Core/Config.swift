import Foundation

/// App-wide configuration. The API base URL is user-editable in Impostazioni
/// and stored in UserDefaults; `apiBaseURL` always points at the `/api/v1` root.
enum Config {
    /// UserDefaults key, also used by `@AppStorage` in SettingsView (SPEC §7).
    static let apiBaseURLDefaultsKey = "APIBaseURL"
    static let defaultBaseURLString = "https://venuescout-api.onrender.com"

    static var baseURLString: String {
        let stored = UserDefaults.standard.string(forKey: apiBaseURLDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let stored, !stored.isEmpty {
            return stored
        }
        return defaultBaseURLString
    }

    /// Base URL including the API prefix, e.g. `https://host/api/v1`.
    static var apiBaseURL: URL {
        var raw = baseURLString
        while raw.hasSuffix("/") {
            raw.removeLast()
        }
        if let url = URL(string: raw + "/api/v1") {
            return url
        }
        // Fallback: the default is a known-valid URL.
        return URL(string: defaultBaseURLString + "/api/v1")!
    }
}
