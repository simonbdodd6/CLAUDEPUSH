import Foundation

/// The root traveller profile contract: identity plus a headline summary of
/// recorded travel. This is the anchor DTO other feature contracts hang from.
struct TravellerDTO: TravelDTO, DTOPreviewProviding {
    let id: String
    let displayName: String
    let homeCity: String?
    let memberSince: String
    let summary: Summary

    /// Aggregate counts describing the traveller's recorded reach.
    struct Summary: TravelDTO {
        let countries: Int
        let cities: Int
        let journeys: Int
        let memories: Int
    }

    static let preview = TravellerDTO(
        id: "traveller-preview",
        displayName: "Atlas traveller",
        homeCity: "London",
        memberSince: "2018",
        summary: Summary(countries: 18, cities: 64, journeys: 27, memories: 82)
    )

    static let mock = preview
}
