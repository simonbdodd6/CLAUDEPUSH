import Foundation

/// Registered-but-unbuilt features. These are intentionally metadata-only
/// placeholders so the navigation architecture, the Explore hub and deep links
/// can already address them, while their screens land in a later phase.
///
/// Adding a future feature here surfaces a "coming soon" card in Explore and a
/// deep-link route — without any networking, persistence or backend work.
enum FutureFeature: String, CaseIterable, Identifiable, Hashable {
    case companions
    case packing
    case budget
    case offlineVault = "offline-vault"
    case sharedAlbums = "shared-albums"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .companions: "Companions"
        case .packing: "Packing Lists"
        case .budget: "Trip Budget"
        case .offlineVault: "Offline Vault"
        case .sharedAlbums: "Shared Albums"
        }
    }

    var symbol: String {
        switch self {
        case .companions: "person.2.fill"
        case .packing: "suitcase.fill"
        case .budget: "creditcard.fill"
        case .offlineVault: "lock.rectangle.stack.fill"
        case .sharedAlbums: "photo.stack.fill"
        }
    }

    var summary: String {
        switch self {
        case .companions: "People you travel with, surfaced from completed journeys."
        case .packing: "Reusable, trip-aware checklists prepared for upcoming travel."
        case .budget: "A calm, deterministic view of trip spending and totals."
        case .offlineVault: "A private, on-device home for documents and memories."
        case .sharedAlbums: "Collaborative travel albums built from shared moments."
        }
    }
}
