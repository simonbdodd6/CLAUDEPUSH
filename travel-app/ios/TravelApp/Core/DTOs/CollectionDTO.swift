import Foundation

/// A single memory-collection contract.
///
/// Distinct from `StoryDTO.Collection` (a story-shelf summary): `CollectionDTO`
/// is the standalone, addressable collection resource — a themed set of
/// memories grouped by activity, place, companion or transport.
struct CollectionDTO: TravelDTO, DTOPreviewProviding, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let kind: Kind
    let memoryCount: Int

    /// How a collection is grouped.
    enum Kind: String, TravelDTO {
        case activity
        case place
        case companion
        case transport
    }

    static let preview = CollectionDTO(
        id: "coast",
        title: "Coastal chapters",
        subtitle: "Sea views, island days and city harbours",
        kind: .place,
        memoryCount: 12
    )

    static let mock = CollectionDTO(
        id: "companions",
        title: "Journeys together",
        subtitle: "Shared trips and the people in them",
        kind: .companion,
        memoryCount: 9
    )

    /// A fuller set of collections for grid surfaces.
    static let mockList: [CollectionDTO] = [
        CollectionDTO(id: "coast", title: "Coastal chapters", subtitle: "Sea views and harbours", kind: .place, memoryCount: 12),
        CollectionDTO(id: "slow", title: "Slow mornings", subtitle: "Cafes and unhurried days", kind: .activity, memoryCount: 7),
        CollectionDTO(id: "companions", title: "Journeys together", subtitle: "Shared trips", kind: .companion, memoryCount: 9),
        CollectionDTO(id: "rail", title: "Rail days", subtitle: "Train windows and routes", kind: .transport, memoryCount: 5)
    ]
}
