import SwiftUI

struct TimelineSummaryPreview {
    let title: String
    let subtitle: String
    let countries: String
    let journeys: String
    let years: String
}

struct TimelineYearPreview: Identifiable {
    let id: String
    let year: String
    let summary: String
    let events: [TimelineEventPreview]
}

struct TimelineEventPreview: Identifiable {
    let id: String
    let title: String
    let place: String
    let dateLabel: String
    let category: String
    let symbol: String
    let accent: Color
    let detail: String
}

struct JourneyMilestonePreview: Identifiable {
    let id: String
    let title: String
    let value: String
    let caption: String
    let symbol: String
}

struct TravelMomentPreview: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let symbol: String
}

struct TimelineHeroCard: View {
    let summary: TimelineSummaryPreview

    var body: some View {
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                TravelTheme.current.ink,
                                TravelTheme.current.ocean,
                                TravelTheme.current.sky.opacity(0.72)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                RouteLineTexture()
                    .opacity(0.62)
                    .padding(TravelSpacing.lg)

                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Label("Traveller timeline", systemImage: "clock.fill")
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.76))

                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(summary.title)
                            .font(TravelTypography.display)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(summary.subtitle)
                            .font(TravelTypography.body)
                            .foregroundStyle(.white.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: TravelSpacing.sm) {
                        TimelineMetricPill(value: summary.countries, label: "Countries")
                        TimelineMetricPill(value: summary.journeys, label: "Journeys")
                        TimelineMetricPill(value: summary.years, label: "Years")
                    }
                }
                .padding(TravelSpacing.lg)
            }
            .frame(minHeight: 312)
        }
    }
}

struct TimelineYearHeader: View {
    let year: TimelineYearPreview

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(year.year)
                .font(TravelTypography.title)
            Spacer(minLength: TravelSpacing.md)
            Text(year.summary)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
        .padding(.top, TravelSpacing.xs)
    }
}

struct TimelineEventCard: View {
    let event: TimelineEventPreview

    var body: some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            VStack(spacing: 0) {
                Circle()
                    .fill(event.accent)
                    .frame(width: 14, height: 14)
                    .overlay {
                        Circle()
                            .stroke(.white.opacity(0.82), lineWidth: 2)
                    }
                Rectangle()
                    .fill(event.accent.opacity(0.24))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
            }
            .frame(width: 18)

            GlassCard {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        Image(systemName: event.symbol)
                            .font(.headline)
                            .foregroundStyle(event.accent)
                            .frame(width: 42, height: 42)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(event.category)
                                .font(.system(.caption2, design: .rounded, weight: .semibold))
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                            Text(event.title)
                                .font(TravelTypography.cardTitle)
                            Label(event.place, systemImage: "mappin.and.ellipse")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: TravelSpacing.sm)
                        Text(event.dateLabel)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text(event.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct JourneyMilestoneCard: View {
    let milestone: JourneyMilestonePreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: milestone.symbol)
                    .font(.title2)
                    .foregroundStyle(TravelTheme.current.coral)
                Text(milestone.title)
                    .font(TravelTypography.cardTitle)
                Text(milestone.value)
                    .font(TravelTypography.title)
                    .foregroundStyle(.primary)
                Text(milestone.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct TravelMomentRow: View {
    let moment: TravelMomentPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: moment.symbol)
                .font(.headline)
                .foregroundStyle(TravelTheme.current.tint)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: Circle())
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(moment.title)
                    .font(TravelTypography.cardTitle)
                Text(moment.subtitle)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: TravelSpacing.sm)
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

struct TimelineEmptyState: View {
    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(TravelTheme.current.tint)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text("Your timeline is ready")
                    .font(TravelTypography.section)
                Text("Completed journeys will form a calm, year-by-year travel history here.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Ready for journeys")
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

private struct TimelineMetricPill: View {
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

private struct RouteLineTexture: View {
    var body: some View {
        VStack(alignment: .trailing, spacing: TravelSpacing.sm) {
            ForEach(0..<4, id: \.self) { index in
                Capsule()
                    .fill(.white.opacity(0.18))
                    .frame(width: 120 + CGFloat(index * 32), height: 8)
                    .rotationEffect(.degrees(Double(index * 8 - 10)))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
