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
        FeatureHeroScaffold(
            eyebrow: "Traveller insights",
            symbol: "sparkles",
            title: insight.title,
            subtitle: insight.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.moss,
                TravelTheme.current.sky.opacity(0.76)
            ],
            metrics: [
                HeroMetric(value: insight.patterns, label: "Patterns"),
                HeroMetric(value: insight.trends, label: "Trends"),
                HeroMetric(value: insight.habits, label: "Habits")
            ]
        ) {
            InsightGraphTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.56)
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
        PremiumGradientTile(
            gradient: trend.gradient,
            symbol: trend.symbol,
            title: trend.destination,
            metadata: trend.trend,
            detail: trend.detail,
            bannerHeight: 116
        )
    }
}

struct SeasonalityCard: View {
    let seasonality: SeasonalityPreview

    var body: some View {
        PremiumPillRow(
            symbol: seasonality.symbol,
            accent: TravelTheme.current.sun,
            title: seasonality.season,
            subtitle: seasonality.detail,
            trailing: seasonality.label
        )
    }
}

struct JourneyInsightCard: View {
    let insight: JourneyInsightPreview

    var body: some View {
        PremiumReasonCard(
            symbol: insight.symbol,
            reasonCode: insight.reasonCode,
            title: insight.title,
            detail: insight.detail
        )
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
                        .font(TravelTypography.eyebrow)
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
        FeatureEmptyState(
            symbol: "sparkles",
            title: "Your insights are ready",
            message: "Completed journeys can reveal travel patterns, trends and habits here.",
            pill: "Ready for patterns"
        )
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
