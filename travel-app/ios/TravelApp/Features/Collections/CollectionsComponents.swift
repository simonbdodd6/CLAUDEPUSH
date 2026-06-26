import SwiftUI

// MARK: - Presentation models

/// Hero summary values for the Collections surface.
struct CollectionsHeroPreview {
    let title: String
    let subtitle: String
    let collections: String
    let memories: String
    let themes: String
}

/// A visual theme grouping (presentation-only; not part of `CollectionDTO`).
struct CollectionThemePreview: Identifiable {
    let id: String
    let title: String
    let caption: String
    let symbol: String
    let accent: Color
}

/// A featured-collection detail preview with a few sample memory labels.
struct CollectionDetailPreview: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let kindLabel: String
    let memoryCount: Int
    let symbol: String
    let accent: Color
    let items: [String]
}

/// A compact statistic tile for the Collections surface.
struct CollectionStatisticPreview: Identifiable {
    let id: String
    let value: String
    let label: String
    let caption: String
    let symbol: String
    let accent: Color
}

/// Presentation mapping for a collection's grouping kind. Kept in the view
/// layer so `CollectionDTO` stays an inert, Foundation-only contract.
extension CollectionDTO.Kind {
    var displayName: String {
        switch self {
        case .activity: "Activity"
        case .place: "Place"
        case .companion: "Companion"
        case .transport: "Transport"
        }
    }

    var accent: Color {
        switch self {
        case .activity: TravelTheme.current.moss
        case .place: TravelTheme.current.ocean
        case .companion: TravelTheme.current.coral
        case .transport: TravelTheme.current.sun
        }
    }

    var gradient: [Color] {
        switch self {
        case .activity: [TravelTheme.current.moss, TravelTheme.current.sky]
        case .place: [TravelTheme.current.ocean, TravelTheme.current.sky]
        case .companion: [TravelTheme.current.coral, TravelTheme.current.sun]
        case .transport: [TravelTheme.current.sun, TravelTheme.current.coral]
        }
    }
}

// MARK: - Hero

struct CollectionHeroCard: View {
    let preview: CollectionsHeroPreview

    var body: some View {
        FeatureHeroScaffold(
            eyebrow: "Travel collections",
            symbol: "rectangle.stack.fill",
            title: preview.title,
            subtitle: preview.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.ocean.opacity(0.9),
                TravelTheme.current.moss.opacity(0.72)
            ],
            metrics: [
                HeroMetric(value: preview.collections, label: "Collections"),
                HeroMetric(value: preview.memories, label: "Memories"),
                HeroMetric(value: preview.themes, label: "Themes")
            ]
        ) {
            CollectionGridTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.55)
        }
    }
}

// MARK: - Gallery

/// A gallery cover card rendered directly from a `CollectionDTO`.
struct CollectionGalleryCard: View {
    let collection: CollectionDTO

    var body: some View {
        PremiumThumbnailTile(
            gradient: collection.kind.gradient,
            title: collection.title,
            subtitle: collection.subtitle,
            badge: "\(collection.memoryCount) memories",
            metadata: collection.kind.displayName,
            symbol: collection.coverSymbol
        )
    }
}

// MARK: - Theme

struct CollectionThemeCard: View {
    let theme: CollectionThemePreview

    var body: some View {
        PremiumCollectionTile(
            title: theme.title,
            subtitle: theme.caption,
            badge: nil,
            symbol: theme.symbol,
            accent: theme.accent
        )
    }
}

// MARK: - Featured detail

struct CollectionDetailPreviewCard: View {
    let detail: CollectionDetailPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    Image(systemName: detail.symbol)
                        .font(.headline)
                        .foregroundStyle(detail.accent)
                        .frame(width: 44, height: 44)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(detail.kindLabel)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Text(detail.title)
                            .font(TravelTypography.cardTitle)
                        Text("\(detail.memoryCount) memories")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: TravelSpacing.sm)
                }

                Text(detail.subtitle)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: TravelSpacing.xs) {
                    ForEach(detail.items, id: \.self) { item in
                        HStack(spacing: TravelSpacing.sm) {
                            Image(systemName: "photo.fill")
                                .font(.caption)
                                .foregroundStyle(detail.accent)
                            Text(item)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, TravelSpacing.sm)
                        .padding(.vertical, TravelSpacing.xs)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                    }
                }
            }
        }
    }
}

// MARK: - Statistic

struct CollectionStatisticCard: View {
    let statistic: CollectionStatisticPreview

    var body: some View {
        PremiumStatCard(
            symbol: statistic.symbol,
            value: statistic.value,
            label: statistic.label,
            caption: statistic.caption,
            accent: statistic.accent
        )
    }
}

// MARK: - Empty state

struct CollectionsEmptyState: View {
    var body: some View {
        FeatureEmptyState(
            symbol: "rectangle.stack.fill",
            title: "Your collections are ready",
            message: "Completed journeys can group into themed memory collections here.",
            pill: "Ready for memories"
        )
    }
}

// MARK: - Decorative texture

private struct CollectionGridTexture: View {
    var body: some View {
        VStack(spacing: TravelSpacing.xs) {
            ForEach(0..<3, id: \.self) { row in
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(0..<3, id: \.self) { column in
                        RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                            .fill(.white.opacity((row + column) % 2 == 0 ? 0.20 : 0.12))
                            .frame(width: 34, height: 34)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
