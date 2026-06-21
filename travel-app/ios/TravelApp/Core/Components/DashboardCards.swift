import SwiftUI

struct TripMemoryPreview: Identifiable {
    let id: String
    let title: String
    let place: String
    let dateLabel: String
    let category: String
    let symbol: String
    let gradient: [Color]
}

struct PassportProgressPreview {
    let countriesLabel: String
    let citiesLabel: String
    let completionLabel: String
    let progress: Double
}

struct TimelinePreviewItem: Identifiable {
    let id: String
    let title: String
    let meta: String
    let symbol: String
}

struct HighlightPreview: Identifiable {
    let id: String
    let title: String
    let value: String
    let reasonCode: String
    let symbol: String
}

struct InsightPreview: Identifiable {
    let id: String
    let title: String
    let detail: String
    let reasonCode: String
    let symbol: String
}

struct CinematicPreview {
    let title: String
    let subtitle: String
    let actionLabel: String
}

struct TripMemoryCard: View {
    let memory: TripMemoryPreview

    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                ZStack(alignment: .bottomLeading) {
                    RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                        .fill(LinearGradient(colors: memory.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    Image(systemName: memory.symbol)
                        .font(.system(size: 54, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.86))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(TravelSpacing.lg)
                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(memory.category)
                            .font(TravelTypography.caption)
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.78))
                        Text(memory.title)
                            .font(TravelTypography.title)
                            .foregroundStyle(.white)
                            .lineLimit(2)
                    }
                    .padding(TravelSpacing.lg)
                }
                .frame(height: 248)

                HStack {
                    Label(memory.place, systemImage: "mappin.and.ellipse")
                    Spacer(minLength: TravelSpacing.sm)
                    Text(memory.dateLabel)
                }
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
            }
        }
    }
}

struct PassportProgressCard: View {
    let progress: PassportProgressPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text("Passport")
                            .font(TravelTypography.cardTitle)
                        Text(progress.completionLabel)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "person.text.rectangle.fill")
                        .font(.title2)
                        .foregroundStyle(TravelTheme.current.tint)
                }

                ProgressView(value: progress.progress)
                    .tint(TravelTheme.current.tint)

                HStack {
                    MetricPill(value: progress.countriesLabel, label: "Countries")
                    MetricPill(value: progress.citiesLabel, label: "Cities")
                }
            }
        }
    }
}

struct TimelinePreviewRow: View {
    let item: TimelinePreviewItem

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: item.symbol)
                .font(.headline)
                .foregroundStyle(TravelTheme.current.tint)
                .frame(width: 42, height: 42)
                .background(.thinMaterial, in: Circle())
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(item.title)
                    .font(TravelTypography.cardTitle)
                Text(item.meta)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

struct HighlightCard: View {
    let highlight: HighlightPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: highlight.symbol)
                    .font(.title2)
                    .foregroundStyle(TravelTheme.current.coral)
                Text(highlight.title)
                    .font(TravelTypography.cardTitle)
                Text(highlight.value)
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                Text(highlight.reasonCode)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, TravelSpacing.sm)
                    .padding(.vertical, TravelSpacing.xs)
                    .background(.thinMaterial, in: Capsule())
            }
        }
    }
}

struct InsightCard: View {
    let insight: InsightPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    Image(systemName: insight.symbol)
                        .font(.title3)
                        .foregroundStyle(TravelTheme.current.moss)
                    Spacer()
                    Text(insight.reasonCode)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Text(insight.title)
                    .font(TravelTypography.cardTitle)
                Text(insight.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct CinematicCTACard: View {
    let preview: CinematicPreview

    var body: some View {
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [TravelTheme.current.ink, TravelTheme.current.ocean, TravelTheme.current.coral.opacity(0.76)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                    Label(preview.actionLabel, systemImage: "play.circle.fill")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white.opacity(0.78))
                    Text(preview.title)
                        .font(TravelTypography.title)
                        .foregroundStyle(.white)
                    Text(preview.subtitle)
                        .font(TravelTypography.body)
                        .foregroundStyle(.white.opacity(0.74))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(TravelSpacing.lg)
            }
            .frame(height: 184)
        }
    }
}

private struct MetricPill: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text(value)
                .font(TravelTypography.cardTitle)
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}
