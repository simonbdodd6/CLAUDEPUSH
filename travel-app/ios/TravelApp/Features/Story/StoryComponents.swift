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
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                TravelTheme.current.ink,
                                TravelTheme.current.coral.opacity(0.82),
                                TravelTheme.current.sun.opacity(0.68)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                StoryPageTexture()
                    .padding(TravelSpacing.lg)
                    .opacity(0.56)

                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Label("Story composer", systemImage: "book.pages.fill")
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.76))

                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(story.title)
                            .font(TravelTypography.display)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(story.subtitle)
                            .font(TravelTypography.body)
                            .foregroundStyle(.white.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: TravelSpacing.sm) {
                        StoryHeroMetric(value: story.collections, label: "Collections")
                        StoryHeroMetric(value: story.drafts, label: "Drafts")
                        StoryHeroMetric(value: story.memories, label: "Memories")
                    }
                }
                .padding(TravelSpacing.lg)
            }
            .frame(minHeight: 318)
        }
    }
}

struct StoryCollectionCard: View {
    let collection: StoryCollectionPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ZStack(alignment: .bottomLeading) {
                    RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                        .fill(LinearGradient(colors: collection.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    Image(systemName: collection.symbol)
                        .font(.system(size: 38, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.86))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(TravelSpacing.md)
                    Text(collection.count)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white.opacity(0.78))
                        .padding(TravelSpacing.md)
                }
                .frame(height: 132)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(collection.title)
                        .font(TravelTypography.cardTitle)
                    Text(collection.subtitle)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
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
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: theme.symbol)
                    .font(.title2)
                    .foregroundStyle(theme.accent)
                Text(theme.title)
                    .font(TravelTypography.cardTitle)
                Text(theme.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
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
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: statistic.symbol)
                    .font(.title3)
                    .foregroundStyle(TravelTheme.current.moss)
                Text(statistic.value)
                    .font(TravelTypography.title)
                Text(statistic.label)
                    .font(TravelTypography.cardTitle)
                Text(statistic.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct StoryEmptyState: View {
    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: "book.closed.fill")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(TravelTheme.current.tint)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text("Your story shelf is ready")
                    .font(TravelTypography.section)
                Text("Completed trips and memory clusters can become story cards here.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Ready for memories")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, TravelSpacing.sm)
                    .padding(.vertical, TravelSpacing.xs)
                    .background(.thinMaterial, in: Capsule())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.md)
        }
    }
}

private struct StoryHeroMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text(value)
                .font(TravelTypography.cardTitle)
                .foregroundStyle(.white)
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.white.opacity(0.68))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.white.opacity(0.13), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
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
