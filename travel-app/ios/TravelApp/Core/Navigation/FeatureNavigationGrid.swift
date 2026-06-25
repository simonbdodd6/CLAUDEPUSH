import SwiftUI

/// A registry-driven grid of feature cards for the Explore hub.
///
/// Replaces the previous hard-coded `FeatureLinkGrid([TravelTab])`: it renders
/// whatever `FeatureMetadata` it is given, routing built screens to their
/// destination and future placeholders to `ComingSoonScreen`.
struct FeatureNavigationGrid: View {
    let features: [FeatureMetadata]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
            ForEach(features) { feature in
                NavigationLink {
                    destination(for: feature)
                } label: {
                    FeatureCard(feature: feature)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func destination(for feature: FeatureMetadata) -> some View {
        if feature.availability == .available {
            FeatureDestinationView(route: feature.route)
        } else {
            ComingSoonScreen(feature: feature)
        }
    }
}

/// A single feature tile in the Explore hub.
struct FeatureCard: View {
    let feature: FeatureMetadata

    private var isComingSoon: Bool { feature.availability == .comingSoon }

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    Image(systemName: feature.symbol)
                        .font(.title2)
                        .foregroundStyle(isComingSoon ? Color.secondary : TravelTheme.current.tint)
                    Spacer()
                    if isComingSoon {
                        Text("Soon")
                            .font(.system(.caption2, design: .rounded, weight: .semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(.thinMaterial, in: Capsule())
                    }
                }
                Text(feature.title)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.primary)
                Text(feature.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .opacity(isComingSoon ? 0.78 : 1)
    }
}
