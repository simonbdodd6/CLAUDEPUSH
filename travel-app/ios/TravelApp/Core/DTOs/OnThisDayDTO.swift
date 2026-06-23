import Foundation

/// The "On this day" contract: memories that share a calendar day across years.
///
/// `dateLabel` is a display string (e.g. "May 14"); no `Date` parsing happens
/// in this layer, keeping the DTO inert and deterministic.
struct OnThisDayDTO: TravelDTO, DTOPreviewProviding {
    let id: String
    let dateLabel: String
    let entries: [Entry]

    /// A single past memory tied to this calendar day.
    struct Entry: TravelDTO, Identifiable {
        let id: String
        let year: String
        let title: String
        let place: String
    }

    static let preview = OnThisDayDTO(
        id: "on-this-day-05-14",
        dateLabel: "May 14",
        entries: [
            Entry(id: "amalfi-2024", year: "2024", title: "Blue hour on the coast", place: "Positano, Italy")
        ]
    )

    static let mock = OnThisDayDTO(
        id: "on-this-day-05-14",
        dateLabel: "May 14",
        entries: [
            Entry(id: "amalfi-2024", year: "2024", title: "Blue hour on the coast", place: "Positano, Italy"),
            Entry(id: "lisbon-2018", year: "2018", title: "First evening walk", place: "Lisbon, Portugal"),
            Entry(id: "athens-2021", year: "2021", title: "Ancient streets", place: "Athens, Greece")
        ]
    )
}
