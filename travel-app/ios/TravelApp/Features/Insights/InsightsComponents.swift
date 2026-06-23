import SwiftUI

struct InsightsHeroPreview {
    let title: String
    let subtitle: String
    let patterns: String
    let trends: String
    let habits: String
}

struct TravelPatternPreview: Identifiable {
    let id: String
    let title: String
    let value: String
    let caption: String
    let symbol: String
    let accent: Color
}

struct DestinationTrendPreview: Identifiable {
    let id: String
    let destination: String
    let trend: String
    let detail: String
    let symbol: String
    let gradient: [Color]
}

struct SeasonalityPreview: Identifiable {
    let id: String
    let season: String
    let label: String
    let detail: String
    let symbol: String
}

struct JourneyInsightPreview: Identifiable {
    let id: String
    let title: String
    let detail: String
    let reasonCode: String
    let symbol: String
}

struct InsightRecommendationPreview: Identifiable {
    let id: String
    let title: String
    let caption: String
    let reasonCode: String
    let symbol: String
}

struct InsightsHeroCard: View {
    let insight: InsightsHeroPreview

    var body: some View {
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                TravelTheme.current.ink,
                                TravelTheme.current.moss,
                                TravelTheme.current.sky.opacity(0.76)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                InsightGraphTexture()
                    .padding(TravelSpacing.lg)
                    .opacity(0.56)

                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Label("Traveller insights", systemImage: "sparkles")
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.76))

                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(insight.title)
                            .font(TravelTypography.display)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(insight.subtitle)
                            .font(TravelTypography.body)
                            .foregroundStyle(.white.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: TravelSpacing.sm) {
                        InsightsHeroMetric(value: insight.patterns, label: "Patterns")
                        InsightsHeroMetric(value: insight.trends, label: "Trends")
                        InsightsHeroMetric(value: insight.habits, label: "Habits")
                    }
                }
                .padding(TravelSpacing.lg)
            }
            .frame(minHeight: 318)
        }
    }
}

struct TravelPatternCard: View {
    let pattern: TravelPatternPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: pattern.symbol)
                    .font(.title2)
                    .foregroundStyle(pattern.accent)
                Text(pattern.value)
                    .font(TravelTypography.title)
                Text(pattern.title)
                    .font(TravelTypography.cardTitle)
                Text(pattern.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct DestinationTrendCard: View {
    let trend: DestinationTrendPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: trend.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: trend.symbol)
                            .font(.title2)
                            .foregroundStyle(.white.opacity(0.86))
                            .padding(TravelSpacing.md)
                    }
                    .frame(height: 116)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(trend.destination)
                        .font(TravelTypography.cardTitle)
                    Text(trend.trend)
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(trend.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct SeasonalityCard: View {
    let seasonality: SeasonalityPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: seasonality.symbol)
                .font(.headline)
                .foregroundStyle(TravelTheme.current.sun)
                .frame(width: 46, height: 46)
                .background(.thinMaterial, in: Circle())
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(seasonality.season)
                    .font(TravelTypography.cardTitle)
                Text(seasonality.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: TravelSpacing.sm)
            Text(seasonality.label)
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

struct JourneyInsightCard: View {
    let insight: JourneyInsightPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    Image(systemName: insight.symbol)
                        .font(.title3)
                        .foregroundStyle(TravelTheme.current.tint)
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

struct InsightRecommendationCard: View {
    let recommendation: InsightRecommendationPreview

    var body: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: recommendation.symbol)
                    .font(.headline)
                    .foregroundStyle(TravelTheme.current.coral)
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(recommendation.title)
                        .font(TravelTypography.cardTitle)
                    Text(recommendation.caption)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(recommendation.reasonCode)
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: TravelSpacing.sm)
            }
        }
    }
}

struct InsightsEmptyState: View {
    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: "sparkles")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(TravelTheme.current.tint)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text("Your insights are ready")
                    .font(TravelTypography.section)
                Text("Completed journeys can reveal travel patterns, trends and habits here.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Ready for patterns")
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

private struct InsightsHeroMetric: View {
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

private struct InsightGraphTexture: View {
    var body: some View {
        HStack(alignment: .bottom, spacing: TravelSpacing.xs) {
            ForEach(0..<6, id: \.self) { index in
                Capsule()
                    .fill(.white.opacity(index == 3 ? 0.26 : 0.15))
                    .frame(width: 12, height: 34 + CGFloat((index * 13) % 58))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
