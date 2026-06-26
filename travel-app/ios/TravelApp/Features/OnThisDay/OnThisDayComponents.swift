import SwiftUI

// MARK: - Presentation models

/// Hero summary values for the On This Day surface.
struct OnThisDayHeroPreview {
    let title: String
    let subtitle: String
    let memories: String
    let years: String
    let earliest: String
}

/// A single "today's memory" anniversary moment, mapped from an
/// `OnThisDayDTO.Entry` in the view layer.
struct AnniversaryMomentPreview: Identifiable {
    let id: String
    let year: String
    let yearsAgoLabel: String
    let title: String
    let place: String
    let symbol: String
    let accent: Color
}

/// A historical journey highlight with a gradient cover.
struct HistoricalMemoryPreview: Identifiable {
    let id: String
    let year: String
    let title: String
    let place: String
    let detail: String
    let symbol: String
    let gradient: [Color]
}

/// A milestone travel anniversary (first trip, hundredth memory, …).
struct TravelAnniversaryPreview: Identifiable {
    let id: String
    let title: String
    let milestone: String
    let detail: String
    let symbol: String
    let accent: Color
}

/// A compact year-in-review card.
struct YearInReviewPreview: Identifiable {
    let id: String
    let year: String
    let headline: String
    let detail: String
    let highlights: [String]
    let accent: Color
}

/// A compact statistic tile for the On This Day surface.
struct OnThisDayStatisticPreview: Identifiable {
    let id: String
    let value: String
    let label: String
    let caption: String
    let symbol: String
    let accent: Color
}

// MARK: - Hero

struct OnThisDayHeroCard: View {
    let preview: OnThisDayHeroPreview

    var body: some View {
        FeatureHeroScaffold(
            eyebrow: "On this day",
            symbol: "calendar.badge.clock",
            title: preview.title,
            subtitle: preview.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.tint.opacity(0.9),
                TravelTheme.current.sun.opacity(0.72)
            ],
            metrics: [
                HeroMetric(value: preview.memories, label: "Memories"),
                HeroMetric(value: preview.years, label: "Years"),
                HeroMetric(value: preview.earliest, label: "Earliest")
            ]
        ) {
            OnThisDayCalendarTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.5)
        }
    }
}

// MARK: - Today's memories

struct AnniversaryMomentCard: View {
    let moment: AnniversaryMomentPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: moment.symbol)
                .font(.headline)
                .foregroundStyle(moment.accent)
                .frame(width: 46, height: 46)
                .background(.thinMaterial, in: Circle())
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(moment.title)
                    .font(TravelTypography.cardTitle)
                Label(moment.place, systemImage: "mappin.and.ellipse")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: TravelSpacing.sm)
            VStack(alignment: .trailing, spacing: TravelSpacing.xxs) {
                Text(moment.year)
                    .font(TravelTypography.cardTitle)
                Text(moment.yearsAgoLabel)
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, TravelSpacing.sm)
                    .padding(.vertical, TravelSpacing.xxs)
                    .background(.thinMaterial, in: Capsule())
            }
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

// MARK: - Historical highlights

struct HistoricalMemoryCard: View {
    let memory: HistoricalMemoryPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ZStack(alignment: .bottomLeading) {
                    RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                        .fill(LinearGradient(colors: memory.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    Image(systemName: memory.symbol)
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.86))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(TravelSpacing.md)
                    Text(memory.year)
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.white)
                        .padding(TravelSpacing.md)
                }
                .frame(height: 124)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(memory.title)
                        .font(TravelTypography.cardTitle)
                    Text(memory.place)
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(memory.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - Travel anniversaries

struct TravelAnniversaryCard: View {
    let anniversary: TravelAnniversaryPreview

    var body: some View {
        PremiumTimelineItem(
            title: anniversary.title,
            subtitle: anniversary.milestone,
            subtitleSymbol: nil,
            subtitleUppercase: true,
            eyebrow: nil,
            detail: anniversary.detail,
            detailPlacement: .inline,
            symbol: anniversary.symbol,
            dateLabel: nil,
            accent: anniversary.accent,
            showsConnector: false,
            symbolSize: 46,
            symbolFont: .title3
        )
    }
}

// MARK: - Year in review

struct YearInReviewCard: View {
    let review: YearInReviewPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .firstTextBaseline) {
                    Text(review.year)
                        .font(TravelTypography.title)
                        .foregroundStyle(review.accent)
                    Spacer()
                    Text(review.headline)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Text(review.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(spacing: TravelSpacing.xs) {
                    ForEach(review.highlights, id: \.self) { highlight in
                        HStack(spacing: TravelSpacing.sm) {
                            Image(systemName: "circle.fill")
                                .font(.system(size: 6))
                                .foregroundStyle(review.accent)
                            Text(highlight)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Statistic

struct OnThisDayStatisticCard: View {
    let statistic: OnThisDayStatisticPreview

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

struct OnThisDayEmptyState: View {
    var body: some View {
        FeatureEmptyState(
            symbol: "calendar.badge.clock",
            title: "No memories on this day yet",
            message: "As journeys are recorded, anniversaries and past moments from this date will appear here.",
            pill: "Ready for memories"
        )
    }
}

// MARK: - Decorative texture

private struct OnThisDayCalendarTexture: View {
    var body: some View {
        VStack(spacing: TravelSpacing.xs) {
            ForEach(0..<3, id: \.self) { row in
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(0..<4, id: \.self) { column in
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(.white.opacity(row == 1 && column == 2 ? 0.30 : 0.13))
                            .frame(width: 26, height: 26)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
