import Foundation

/// The insights contract: fixed reason-code insight cards.
///
/// Each card carries a stable `reasonCode` rather than generated prose, keeping
/// the surface deterministic and backend-aligned.
struct InsightsDTO: TravelDTO, DTOPreviewProviding {
    let meta: DTOMeta
    let cards: [Card]

    /// A single reason-code insight card.
    struct Card: TravelDTO, Identifiable {
        let id: String
        let title: String
        let detail: String
        let reasonCode: ReasonCode

        /// The stable, typed reason a card was surfaced.
        enum ReasonCode: String, TravelDTO {
            case strongestTravelStyle = "strongest_travel_style"
            case mostRepeatedDestination = "most_repeated_destination"
            case mostActiveYear = "most_active_year"
            case companionBasedInsight = "companion_based_insight"
        }
    }

    static let preview = InsightsDTO(
        meta: .preview,
        cards: [
            Card(id: "style", title: "Strongest travel style", detail: "Coastal city breaks lead the traveller history.", reasonCode: .strongestTravelStyle)
        ]
    )

    static let mock = InsightsDTO(
        meta: .preview,
        cards: [
            Card(id: "style", title: "Strongest travel style", detail: "Coastal city breaks lead the traveller history.", reasonCode: .strongestTravelStyle),
            Card(id: "repeat", title: "Most repeated destination", detail: "Italy is the most revisited place on record.", reasonCode: .mostRepeatedDestination),
            Card(id: "year", title: "Most active year", detail: "2024 holds the highest density of journeys.", reasonCode: .mostActiveYear),
            Card(id: "companion", title: "Companion signal", detail: "Shared journeys recur as a meaningful pattern.", reasonCode: .companionBasedInsight)
        ]
    )
}
