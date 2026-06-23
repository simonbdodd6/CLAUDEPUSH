import Foundation

// MARK: - DTO Foundation
//
// This file defines the shared foundation for the Travel Intelligence DTO
// contract layer. Concrete contracts live in sibling files (`PassportDTO`,
// `TimelineDTO`, …). DTOs are pure, inert value types: they describe the shape
// of data exchanged with existing backend endpoints but perform no I/O. There
// is no networking, persistence, auth or AI in this layer.
//
// JSON convention: decode with
// `JSONDecoder().keyDecodingStrategy = .convertFromSnakeCase`, so snake_case
// payload keys (e.g. `reason_code`) map onto the camelCase properties below.

/// Base contract for every data-transfer object in the app.
///
/// - `Codable`: round-trips to and from backend JSON.
/// - `Equatable`: enables cheap diffing and SwiftUI change detection.
/// - `Sendable`: safe to hand across concurrency domains. Every DTO is an
///   immutable value composed only of `Sendable` members, so this is free.
protocol TravelDTO: Codable, Equatable, Sendable {}

/// A DTO that can vend deterministic, offline sample values.
///
/// - `preview`: a single, minimal representative value for SwiftUI previews.
/// - `mock`: a fuller, list-bearing value for realistic visual surfaces and
///   tests. Both are fixed and reproducible — no randomness, dates or I/O.
protocol DTOPreviewProviding {
    static var preview: Self { get }
    static var mock: Self { get }
}

/// Shared envelope metadata carried by top-level feature contracts.
///
/// `generatedAt` is an ISO-8601 *string*: it is transport metadata only and is
/// never parsed into a `Date` in this layer, keeping DTOs inert and
/// deterministic.
struct DTOMeta: TravelDTO {
    let version: String
    let generatedAt: String
    var schema: String?

    init(version: String = "1.0", generatedAt: String = "2024-01-01T00:00:00Z", schema: String? = nil) {
        self.version = version
        self.generatedAt = generatedAt
        self.schema = schema
    }

    /// A fixed, deterministic envelope for previews and mocks.
    static let preview = DTOMeta(schema: "preview")
}
