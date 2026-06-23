import Foundation

/// The passport contract: completion progress, stamp book and headline stats.
struct PassportDTO: TravelDTO, DTOPreviewProviding {
    let meta: DTOMeta
    let holderName: String
    let completion: Double
    let stats: [Stat]
    let stamps: [Stamp]

    /// A single headline statistic tile (countries, continents, …).
    struct Stat: TravelDTO, Identifiable {
        let id: String
        let value: String
        let label: String
        let caption: String
    }

    /// A single passport stamp, stamped or reserved for a future journey.
    struct Stamp: TravelDTO, Identifiable {
        let id: String
        let country: String
        let isoCode: String
        let year: String
        let isStamped: Bool
    }

    static let preview = PassportDTO(
        meta: .preview,
        holderName: "Atlas traveller",
        completion: 0.64,
        stats: [
            Stat(id: "countries", value: "18", label: "Countries visited", caption: "Distinct nations across recorded trips"),
            Stat(id: "continents", value: "5", label: "Continents", caption: "Reach spanning the recorded atlas")
        ],
        stamps: [
            Stamp(id: "it", country: "Italy", isoCode: "IT", year: "2024", isStamped: true),
            Stamp(id: "jp", country: "Japan", isoCode: "JP", year: "2025", isStamped: true)
        ]
    )

    static let mock = PassportDTO(
        meta: .preview,
        holderName: "Atlas traveller",
        completion: 0.64,
        stats: [
            Stat(id: "countries", value: "18", label: "Countries visited", caption: "Distinct nations across recorded trips"),
            Stat(id: "continents", value: "5", label: "Continents", caption: "Reach spanning the recorded atlas"),
            Stat(id: "streak", value: "7 mo", label: "Travel streak", caption: "Recent movement, most recent first"),
            Stat(id: "memories", value: "82", label: "Memories", caption: "Captured moments across completed trips")
        ],
        stamps: [
            Stamp(id: "it", country: "Italy", isoCode: "IT", year: "2024", isStamped: true),
            Stamp(id: "jp", country: "Japan", isoCode: "JP", year: "2025", isStamped: true),
            Stamp(id: "pt", country: "Portugal", isoCode: "PT", year: "2018", isStamped: true),
            Stamp(id: "is", country: "Iceland", isoCode: "IS", year: "2022", isStamped: true),
            Stamp(id: "next", country: "Ready", isoCode: "", year: "", isStamped: false)
        ]
    )
}
