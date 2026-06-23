import Foundation

/// The traveller timeline contract: a year-grouped record of travel events.
struct TimelineDTO: TravelDTO, DTOPreviewProviding {
    let meta: DTOMeta
    let years: [Year]

    /// A single year group of events.
    struct Year: TravelDTO, Identifiable {
        let id: String
        let year: String
        let summary: String
        let events: [Event]
    }

    /// A single dated travel event within a year group.
    struct Event: TravelDTO, Identifiable {
        let id: String
        let title: String
        let place: String
        let date: String
        let category: String
    }

    static let preview = TimelineDTO(
        meta: .preview,
        years: [
            Year(
                id: "2025",
                year: "2025",
                summary: "Latest journey and new stamp",
                events: [
                    Event(id: "kyoto", title: "Latest journey", place: "Kyoto, Japan", date: "2025-04", category: "country_visit")
                ]
            )
        ]
    )

    static let mock = TimelineDTO(
        meta: .preview,
        years: [
            Year(
                id: "2025",
                year: "2025",
                summary: "Latest journey and new stamp",
                events: [
                    Event(id: "kyoto", title: "Latest journey", place: "Kyoto, Japan", date: "2025-04", category: "country_visit"),
                    Event(id: "stamp-jp", title: "New passport stamp", place: "Japan", date: "2025-04", category: "achievement")
                ]
            ),
            Year(
                id: "2024",
                year: "2024",
                summary: "Most active travel year",
                events: [
                    Event(id: "amalfi", title: "Blue hour on the coast", place: "Positano, Italy", date: "2024-05", category: "travel_memory"),
                    Event(id: "cape-town", title: "Fifth continent reached", place: "Cape Town, South Africa", date: "2024-11", category: "milestone")
                ]
            ),
            Year(
                id: "2018",
                year: "2018",
                summary: "The timeline begins",
                events: [
                    Event(id: "lisbon", title: "First recorded trip", place: "Lisbon, Portugal", date: "2018-09", category: "first_trip")
                ]
            )
        ]
    )
}
