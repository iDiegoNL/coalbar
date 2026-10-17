import Foundation
import Security

struct AppFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

enum TokenStore {
    private static let service = "local.coalbar.homeassistant"
    static func read() -> String {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "token",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
    static func save(_ token: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "token"]
        let values = [kSecValueData as String: Data(token.utf8)]
        var status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            var item = query.merging(values) { _, new in new }
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw AppFailure(message: "Could not save the token to Keychain (\(status)).") }
    }
}

// Refuse redirects so a proxy cannot forward the bearer token to another host.
final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

final class HAClient {
    private let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
    static func baseURL(_ text: String) throws -> URL {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme, ["http", "https"].contains(scheme),
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil else {
            throw AppFailure(message: "Enter a Home Assistant URL, such as http://homeassistant.local:8123 or https://ha.example.com.")
        }
        return url
    }
    func automation(configuration: Configuration, token: String, id: String) async throws -> Data {
        let base = try Self.baseURL(configuration.url)
        var request = URLRequest(url: base.appendingPathComponent("api/config/automation/config").appendingPathComponent(id))
        request.timeoutInterval = 10
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw AppFailure(message: "No response while reading the automation.")
        }
        guard response.statusCode == 200 else {
            throw AppFailure(message: response.statusCode == 401 || response.statusCode == 403
                ? "Home Assistant denied access to the automation configuration. Check this user’s permissions."
                : "Could not read this automation’s configuration. It must have an ID and be stored in Home Assistant’s automations file.")
        }
        return data
    }
    func states(configuration: Configuration, token: String) async throws -> [HAState] {
        let base = try Self.baseURL(configuration.url)
        guard !token.isEmpty else { throw AppFailure(message: "Enter a Home Assistant long-lived access token.") }
        var request = URLRequest(url: base.appendingPathComponent("api/states"))
        request.timeoutInterval = 10
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw AppFailure(message: "No HTTP response from Home Assistant.") }
        switch response.statusCode {
        case 200: break
        case 401: throw AppFailure(message: "Home Assistant rejected the token. Check or replace it in Settings.")
        case 300...399, 403: throw AppFailure(message: "Access was blocked or redirected. Check the URL and any Cloudflare Access policy.")
        default: throw AppFailure(message: "Home Assistant returned HTTP \(response.statusCode).")
        }
        do { return try JSONDecoder().decode([HAState].self, from: data) }
        catch { throw AppFailure(message: "The URL did not return Home Assistant states. Check the URL and tunnel configuration.") }
    }
}
