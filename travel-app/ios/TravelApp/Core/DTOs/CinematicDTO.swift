import Foundation

/// The cinematic contract: film reels and the memory scenes that fill them.
struct CinematicDTO: TravelDTO, DTOPreviewProviding {
    let meta: DTOMeta
    let reels: [Reel]
    let scenes: [Scene]

    /// A grouped reel of scenes sharing an atmosphere.
    struct Reel: TravelDTO, Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let sceneCount: Int
    }

    /// A single memory scene within the reel.
    struct Scene: TravelDTO, Identifiable {
        let id: String
        let title: String
        let place: String
        let marker: String
    }

    static let preview = CinematicDTO(
        meta: .preview,
        reels: [
            Reel(id: "coast", title: "Coastal light", subtitle: "Sea cliffs and golden hour", sceneCount: 6)
        ],
        scenes: [
            Scene(id: "amalfi", title: "Blue hour above the coast", place: "Positano, Italy", marker: "01:42")
        ]
    )

    static let mock = CinematicDTO(
        meta: .preview,
        reels: [
            Reel(id: "coast", title: "Coastal light", subtitle: "Sea cliffs and golden hour", sceneCount: 6),
            Reel(id: "city", title: "City nights", subtitle: "Late walks and quiet streets", sceneCount: 5),
            Reel(id: "milestone", title: "Milestone reel", subtitle: "First trips and big arrivals", sceneCount: 7)
        ],
        scenes: [
            Scene(id: "opening", title: "Opening frame", place: "Lisbon, Portugal", marker: "00:00"),
            Scene(id: "amalfi", title: "Blue hour above the coast", place: "Positano, Italy", marker: "01:42"),
            Scene(id: "closing", title: "Closing scene", place: "Kyoto, Japan", marker: "03:08")
        ]
    )
}
