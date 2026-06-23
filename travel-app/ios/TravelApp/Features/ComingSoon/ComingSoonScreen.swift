import SwiftUI

/// Placeholder destination for a registered-but-unbuilt feature.
///
/// Rendered entirely from `FeatureMetadata` using existing premium primitives,
/// so future features have a real, on-brand home the moment they are added to
/// `FeatureRegistry` — with no networking, persistence or backend work.
struct ComingSoonScreen: View {
    let feature: FeatureMetadata

    var body: some View {
        PremiumScrollView {
            ScreenHero(
                eyebrow: "Coming soon",
                title: feature.title,
                subtitle: feature.summary,
                symbol: feature.symbol,
                endpoint: nil
            )

            PremiumSection(
                title: "Planned surface",
                subtitle: "A registered placeholder, ready to bind in a future phase."
            ) {
                PlaceholderCard(
                    title: feature.title,
                    subtitle: feature.summary,
                    symbol: feature.symbol
                )
                PlaceholderCard(
                    title: "Deterministic by design",
                    subtitle: "This feature will follow the same offline-first, presentation-only rules as the rest of the app.",
                    symbol: "checkmark.seal.fill"
                )
            }
        }
        .navigationTitle(feature.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
