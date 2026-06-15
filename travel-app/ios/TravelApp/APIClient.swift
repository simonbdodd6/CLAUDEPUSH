import Foundation

// MARK: - DTOs (match travel-app/api responses; the app never re-derives these)

struct Traveller: Codable, Identifiable, Hashable {
    let travellerId: String
    let displayName: String?
    let country: String?
    let verified: Bool?
    var id: String { travellerId }
}

struct Trip: Codable, Identifiable, Hashable {
    let tripId: String
    let tripName: String
    let country: String
    let destination: String
    let area: String
    let startDate: String
    let endDate: String
    let status: String?
    var id: String { tripId }
}

struct TimelineEvent: Codable, Identifiable, Hashable {
    let timelineEventId: String
    let eventType: String
    let sourcePlatform: String
    let timestamp: String
    var id: String { timelineEventId }
}

struct TimelineDay: Codable, Identifiable, Hashable {
    let day: String
    let events: [TimelineEvent]
    var id: String { day }
}

struct AuthResult: Codable {
    let token: String
    let traveller: Traveller
    let expiresAt: String?
}

struct TodayResponse: Codable {
    let traveller: Traveller
    let currentTrip: Trip?
    let recentTimeline: [TimelineEvent]
}

// MARK: - Errors

enum APIError: Error, LocalizedError {
    case http(Int, String)
    case decoding(String)
    case transport(String)
    case unauthenticated

    var errorDescription: String? {
        switch self {
        case .http(let code, let msg): return "Request failed (\(code)): \(msg)"
        case .decoding(let msg): return "Could not read response: \(msg)"
        case .transport(let msg): return "Network problem: \(msg)"
        case .unauthenticated: return "Please sign in again."
        }
    }
}

// MARK: - Client

/// The single integration point with the platform. UI calls these methods; it
/// never touches persistence or platform modules directly.
actor APIClient {
    static let shared = APIClient()

    var baseURL = URL(string: "http://localhost:8787")!
    private var token: String?

    func configure(baseURL: URL) { self.baseURL = baseURL }
    func setToken(_ token: String?) { self.token = token }

    // MARK: requests

    func signInWithApple(identityToken: String, displayName: String?) async throws -> AuthResult {
        let body: [String: Any] = ["identityToken": identityToken, "displayName": displayName as Any]
        let result: AuthResult = try await send("/auth/apple", method: "POST", body: body, authed: false)
        self.token = result.token
        return result
    }

    func today() async throws -> TodayResponse { try await send("/today", method: "GET") }
    func getTrip() async throws -> TripEnvelope { try await send("/trip", method: "GET") }
    func timeline() async throws -> TimelineEnvelope { try await send("/timeline", method: "GET") }

    // MARK: plumbing

    private func send<T: Decodable>(_ path: String, method: String, body: [String: Any]? = nil, authed: Bool = true) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authed {
            guard let token else { throw APIError.unauthenticated }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }

        let (data, response): (Data, URLResponse)
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch { throw APIError.transport(error.localizedDescription) }

        guard let http = response as? HTTPURLResponse else { throw APIError.transport("No HTTP response") }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw APIError.unauthenticated }
            let msg = String(data: data, encoding: .utf8) ?? "error"
            throw APIError.http(http.statusCode, msg)
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(error.localizedDescription) }
    }
}

struct TripEnvelope: Codable { let trip: Trip? }
struct TimelineEnvelope: Codable { let days: [TimelineDay] }
