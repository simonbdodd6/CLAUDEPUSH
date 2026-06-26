import SwiftUI

// MARK: - Presentation models

struct StatisticsHeroPreview {
    let title: String
    let subtitle: String
    let countries: String
    let journeys: String
    let years: String
}

struct CountryCountPreview {
    let value: String
    let label: String
    let caption: String
    let secondaryValue: String
    let secondaryLabel: String
}

struct ContinentCoveragePreview {
    let covered: Int
    let total: Int
    let regions: [String]
}

struct TravelVelocityPreview {
    let value: String
    let label: String
    let caption: String
    let activity: [Double]
}

struct JourneyDistancePreview {
    let value: String
    let unit: String
    let caption: String
    let routeLabels: [String]
}

struct MilestoneStatisticPreview: Identifiable {
    let id: String
    let value: String
    let title: String
    let caption: String
    let symbol: String
    let accent: Color
}

// MARK: - Hero

struct StatisticsHeroCard: View {
    let preview: StatisticsHeroPreview

    var body: some View {
        FeatureHeroScaffold(
            eyebrow: "Traveller statistics",
            symbol: "chart.bar.xaxis",
            title: preview.title,
            subtitle: preview.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.ocean.opacity(0.92),
                TravelTheme.current.sun.opacity(0.68)
            ],
            metrics: [
                HeroMetric(value: preview.countries, label: "Countries"),
                HeroMetric(value: preview.journeys, label: "Journeys"),
                HeroMetric(value: preview.years, label: "Active years")
            ]
        ) {
            StatisticsChartTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.48)
        }
    }
}

// MARK: - Footprint

struct CountryCountCard: View {
    let preview: CountryCountPreview

    var body: some View {
        GlassCard {
            HStack(alignment: .center, spacing: TravelSpacing.lg) {
                ZStack {
                    Circle()
                        .stroke(TravelTheme.current.ocean.opacity(0.14), lineWidth: 10)
                    Circle()
                        .trim(from: 0, to: 0.64)
                        .stroke(
                            LinearGradient(
                                colors: [TravelTheme.current.tint, TravelTheme.current.sky],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            style: StrokeStyle(lineWidth: 10, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: TravelSpacing.xxs) {
                        Text(preview.value)
                            .font(TravelTypography.title)
                        Text("countries")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 118, height: 118)

                VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                    Text(preview.label)
                        .font(TravelTypography.cardTitle)
                    Text(preview.caption)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Divider()
                    Text(preview.secondaryValue)
                        .font(TravelTypography.section)
                        .foregroundStyle(TravelTheme.current.tint)
                    Text(preview.secondaryLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - Coverage

struct ContinentCoverageCard: View {
    let preview: ContinentCoveragePreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(preview.covered)")
                        .font(TravelTypography.title)
                        .foregroundStyle(TravelTheme.current.ocean)
                    Text("of \(preview.total) continents")
                        .font(TravelTypography.cardTitle)
                    Spacer()
                    Image(systemName: "globe.europe.africa.fill")
                        .font(.title2)
                        .foregroundStyle(TravelTheme.current.sky)
                }

                HStack(spacing: TravelSpacing.xs) {
                    ForEach(0..<preview.total, id: \.self) { index in
                        Capsule()
                            .fill(index < preview.covered ? TravelTheme.current.tint : Color.secondary.opacity(0.16))
                            .frame(height: 8)
                    }
                }

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 112), spacing: TravelSpacing.sm)], spacing: TravelSpacing.sm) {
                    ForEach(preview.regions, id: \.self) { region in
                        Label(region, systemImage: "checkmark.circle.fill")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

// MARK: - Velocity

struct TravelVelocityCard: View {
    let preview: TravelVelocityPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(preview.value)
                            .font(TravelTypography.title)
                            .foregroundStyle(TravelTheme.current.coral)
                        Text(preview.label)
                            .font(TravelTypography.cardTitle)
                    }
                    Spacer()
                    Image(systemName: "gauge.with.dots.needle.67percent")
                        .font(.title2)
                        .foregroundStyle(TravelTheme.current.coral)
                }

                PremiumBarChart(
                    values: preview.activity,
                    colors: [TravelTheme.current.coral, TravelTheme.current.sun]
                )

                Text(preview.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Distance

struct JourneyDistanceCard: View {
    let preview: JourneyDistancePreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.xs) {
                    Text(preview.value)
                        .font(TravelTypography.title)
                    Text(preview.unit)
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                        .font(.title2)
                        .foregroundStyle(TravelTheme.current.moss)
                }

                HStack(spacing: 0) {
                    ForEach(Array(preview.routeLabels.enumerated()), id: \.offset) { index, label in
                        VStack(spacing: TravelSpacing.xs) {
                            Circle()
                                .fill(index == preview.routeLabels.count - 1 ? TravelTheme.current.coral : TravelTheme.current.moss)
                                .frame(width: 12, height: 12)
                            Text(label)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }

                        if index < preview.routeLabels.count - 1 {
                            Rectangle()
                                .fill(TravelTheme.current.moss.opacity(0.32))
                                .frame(height: 2)
                                .padding(.bottom, 24)
                        }
                    }
                }

                Text(preview.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Milestones and summary

struct MilestoneStatisticCard: View {
    let preview: MilestoneStatisticPreview

    var body: some View {
        PremiumStatCard(
            symbol: preview.symbol,
            value: preview.value,
            label: preview.title,
            caption: preview.caption,
            accent: preview.accent
        )
    }
}

struct StatisticsSummaryCard: View {
    let metric: StatisticsDTO.Metric

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text(metric.value)
                    .font(TravelTypography.title)
                    .foregroundStyle(TravelTheme.current.tint)
                Text(metric.label)
                    .font(TravelTypography.cardTitle)
                Text(metric.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Empty state

struct StatisticsEmptyState: View {
    var body: some View {
        FeatureEmptyState(
            symbol: "chart.bar.xaxis",
            title: "Your statistics will grow here",
            message: "Completed journeys can build a clear picture of reach, rhythm and travel milestones.",
            pill: "Ready for journeys"
        )
    }
}

// MARK: - Decorative texture

private struct StatisticsChartTexture: View {
    private let bars: [CGFloat] = [34, 58, 46, 78, 62, 94]

    var body: some View {
        HStack(alignment: .bottom, spacing: TravelSpacing.xs) {
            ForEach(Array(bars.enumerated()), id: \.offset) { index, height in
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(.white.opacity(index == bars.count - 1 ? 0.30 : 0.14))
                    .frame(width: 22, height: height)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
