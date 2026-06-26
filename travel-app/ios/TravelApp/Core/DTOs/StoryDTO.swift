import Foundation

/// The story composer contract: memory collections and composed story drafts.
struct StoryDTO: TravelDTO, DTOPreviewProviding {
    let meta: DTOMeta
    let collections: [Collection]
    let drafts: [Draft]

    /// A shelf of related memories.
    struct Collection: TravelDTO, Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let memoryCount: Int
    }

    /// A composed or draft story card derived from a journey.
    struct Draft: TravelDTO, Identifiable {
        let id: String
        let title: String
        let trip: String
        let status: Status

        /// The stable, typed state of a story draft.
        enum Status: String, TravelDTO {
            case featured
            case tripStory = "trip_story"
            case originStory = "origin_story"
        }
    }

    static let preview = StoryDTO(
        meta: .preview,
        collections: [
            Collection(id: "coast", title: "Coastal chapters", subtitle: "Sea views and harbours", memoryCount: 12)
        ],
        drafts: [
            Draft(id: "amalfi", title: "Blue hour on the coast", trip: "Positano, Italy · May 2024", status: .featured)
        ]
    )

    static let mock = StoryDTO(
        meta: .preview,
        collections: [
            Collection(id: "coast", title: "Coastal chapters", subtitle: "Sea views and harbours", memoryCount: 12),
            Collection(id: "firsts", title: "Firsts and milestones", subtitle: "Opening trips and new stamps", memoryCount: 8),
            Collection(id: "city", title: "City notes", subtitle: "Walkable days and quiet streets", memoryCount: 15)
        ],
        drafts: [
            Draft(id: "amalfi", title: "Blue hour on the coast", trip: "Positano, Italy · May 2024", status: .featured),
            Draft(id: "kyoto", title: "Rail days and temple evenings", trip: "Kyoto, Japan · Apr 2025", status: .tripStory),
            Draft(id: "lisbon", title: "The first recorded trip", trip: "Lisbon, Portugal · Sep 2018", status: .originStory)
        ]
    )
}
