import SwiftUI

struct StoryHeroPreview {
    let title: String
    let subtitle: String
    let collections: String
    let drafts: String
    let memories: String
}

struct StoryCollectionPreview: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let count: String
    let symbol: String
    let gradient: [Color]
}

struct StoryDraftPreview: Identifiable {
    let id: String
    let title: String
    let trip: String
    let status: String
    let detail: String
    let symbol: String
}

struct StoryThemePreview: Identifiable {
    let id: String
    let title: String
    let caption: String
    let symbol: String
    let accent: Color
}

struct MemoryClusterPreview: Identifiable {
    let id: String
    let title: String
    let place: String
    let count: String
    let symbol: String
}

struct StoryStatisticPreview: Identifiable {
    let id: String
    let value: String
    let label: String
    let caption: String
    let symbol: String
}

struct StoryHeroCard: View {
    let story: StoryHeroPreview

    var body: some View {
        FeatureHeroScaffold(
            eyebrow: "Story composer",
            symbol: "book.pages.fill",
            title: story.title,
            subtitle: story.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.coral.opacity(0.82),
                TravelTheme.current.sun.opacity(0.68)
            ],
            metrics: [
                HeroMetric(value: story.collections, label: "Collections"),
                HeroMetric(value: story.drafts, label: "Drafts"),
                HeroMetric(value: story.memories, label: "Memories")
            ]
        ) {
            StoryPageTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.56)
        }
    }
}

struct StoryCollectionCard: View {
    let collection: StoryCollectionPreview

    var body: some View {
        PremiumThumbnailTile(
            gradient: collection.gradient,
            title: collection.title,
            subtitle: collection.subtitle,
            badge: collection.count,
            metadata: nil,
            symbol: collection.symbol
        )
    }
}

struct StoryDraftCard: View {
    let draft: StoryDraftPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    Image(systemName: draft.symbol)
                        .font(.headline)
                        .foregroundStyle(TravelTheme.current.tint)
                        .frame(width: 44, height: 44)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(draft.status)
                            .font(.system(.caption2, design: .rounded, weight: .semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Text(draft.title)
                            .font(TravelTypography.cardTitle)
                        Text(draft.trip)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: TravelSpacing.sm)
                }

                Text(draft.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct StoryThemeCard: View {
    let theme: StoryThemePreview

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

struct MemoryClusterCard: View {
    let cluster: MemoryClusterPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: cluster.symbol)
                .font(.headline)
                .foregroundStyle(TravelTheme.current.coral)
                .frame(width: 46, height: 46)
                .background(.thinMaterial, in: Circle())
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(cluster.title)
                    .font(TravelTypography.cardTitle)
                Label(cluster.place, systemImage: "mappin.and.ellipse")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: TravelSpacing.sm)
            Text(cluster.count)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xs)
                .background(.thinMaterial, in: Capsule())
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

struct StoryStatisticCard: View {
    let statistic: StoryStatisticPreview

    var body: some View {
        PremiumStatCard(
            symbol: statistic.symbol,
            value: statistic.value,
            label: statistic.label,
            caption: statistic.caption,
            accent: TravelTheme.current.moss
        )
    }
}

struct StoryEmptyState: View {
    var body: some View {
        FeatureEmptyState(
            symbol: "book.closed.fill",
            title: "Your story shelf is ready",
            message: "Completed trips and memory clusters can become story cards here.",
            pill: "Ready for memories"
        )
    }
}

private struct StoryPageTexture: View {
    var body: some View {
        VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
            ForEach(0..<5, id: \.self) { index in
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .fill(.white.opacity(0.15))
                    .frame(width: 98 + CGFloat(index * 22), height: 10)
                    .rotationEffect(.degrees(Double(index * 4 - 8)))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
