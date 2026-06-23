import Foundation

/// The highlights contract: standout travel moments and achievements.
struct HighlightsDTO: TravelDTO, DTOPreviewProviding {
    let meta: DTOMeta
    let moments: [Moment]
    let achievements: [Achievement]

    /// A single standout travel moment.
    struct Moment: TravelDTO, Identifiable {
        let id: String
        let title: String
        let place: String
        let detail: String
    }

    /// A single achievement with a display value.
    struct Achievement: TravelDTO, Identifiable {
        let id: String
        let title: String
        let value: String
        let reasonCode: String
    }

    static let preview = HighlightsDTO(
        meta: .preview,
        moments: [
            Moment(id: "amalfi", title: "Sunset over the Amalfi Coast", place: "Italy", detail: "The most-revisited memory on record.")
        ],
        achievements: [
            Achievement(id: "countries", title: "Countries explored", value: "11", reasonCode: "countries_explored")
        ]
    )

    static let mock = HighlightsDTO(
        meta: .preview,
        moments: [
            Moment(id: "amalfi", title: "Sunset over the Amalfi Coast", place: "Italy", detail: "The most-revisited memory on record."),
            Moment(id: "kyoto", title: "First morning in Kyoto", place: "Japan", detail: "The newest journey's standout scene."),
            Moment(id: "lisbon", title: "Where it all began", place: "Portugal", detail: "Lisbon anchors the opening chapter.")
        ],
        achievements: [
            Achievement(id: "countries", title: "Countries explored", value: "11", reasonCode: "countries_explored"),
            Achievement(id: "journeys", title: "Journeys completed", value: "18", reasonCode: "journeys_completed"),
            Achievement(id: "streak", title: "Longest travel streak", value: "3 years", reasonCode: "longest_streak")
        ]
    )
}
