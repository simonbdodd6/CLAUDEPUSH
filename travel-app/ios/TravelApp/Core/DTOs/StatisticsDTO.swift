import Foundation

/// The statistics contract: a flat set of keyed, presentable travel metrics.
struct StatisticsDTO: TravelDTO, DTOPreviewProviding {
    let meta: DTOMeta
    let metrics: [Metric]

    /// A single keyed metric with a display value and supporting copy.
    struct Metric: TravelDTO, Identifiable {
        let id: String
        let key: String
        let value: String
        let label: String
        let caption: String
    }

    static let preview = StatisticsDTO(
        meta: .preview,
        metrics: [
            Metric(id: "countries", key: "countries", value: "18", label: "Countries", caption: "Distinct nations visited")
        ]
    )

    static let mock = StatisticsDTO(
        meta: .preview,
        metrics: [
            Metric(id: "countries", key: "countries", value: "18", label: "Countries", caption: "Distinct nations visited"),
            Metric(id: "journeys", key: "journeys", value: "27", label: "Journeys", caption: "Completed trips on record"),
            Metric(id: "memories", key: "memories", value: "82", label: "Memories", caption: "Captured travel moments"),
            Metric(id: "years", key: "active_years", value: "8", label: "Active years", caption: "Years with at least one trip")
        ]
    )
}
