import Foundation
import Security

/// Minimal Keychain wrapper for small string secrets (the JWT).
enum KeychainHelper {
    private static let service = "it.justwhy.venuescout"

    @discardableResult
    static func save(_ value: String, forKey key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        delete(forKey: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func read(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(forKey key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// Convenience accessors for the JWT issued by `POST /auth/login`.
enum AuthTokenStore {
    private static let tokenKey = "jwt"

    static var token: String? {
        KeychainHelper.read(forKey: tokenKey)
    }

    static var isLoggedIn: Bool {
        token != nil
    }

    static func save(_ token: String) {
        KeychainHelper.save(token, forKey: tokenKey)
    }

    static func clear() {
        KeychainHelper.delete(forKey: tokenKey)
    }
}
