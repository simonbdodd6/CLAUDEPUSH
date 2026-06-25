import SwiftUI

// MARK: - Premium metric components (Phase 32)
//
// Reusable, presentation-only metric/stat building blocks shared across feature
// surfaces. They use the existing design system only (TravelTheme / TravelSpacing
// / TravelRadius / TravelTypography / GlassCard) — no new colours, typography,
// spacing tokens or themes. Each reproduces a pattern that was previously
// duplicated per feature, so adopting them preserves the current appearance.

/// A single stat / metric display card: an accent symbol above a large value,
/// a label and a secondary caption, on a `GlassCard`.
///
/// Previously duplicated as `CinematicStatisticCard`, `StoryStatisticCard`,
/// `CollectionStatisticCard`, `OnThisDayStatisticCard` and `SearchStatisticCard`,
/// which differed only by accent colour.
struct PremiumStatCard: View {
    let symbol: String
    let value: String
    let label: String
    let caption: String
    var accent: Color = TravelTheme.current.tint

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: symbol)
                    .font(.title3)
                    .foregroundStyle(accent)
                Text(value)
                    .font(TravelTypography.title)
                Text(label)
                    .font(TravelTypography.cardTitle)
                Text(caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// A compact metric tile: a value over a secondary label on a thin-material
/// rounded background, expanding to fill its column.
///
/// Previously duplicated as `MetricPill` (value uses `cardTitle`) and
/// `ArchiveMetric` (value uses `section`); the value font is configurable so
/// both are reproduced exactly.
struct PremiumMetricTile: View {
    let value: String
    let label: String
    var valueFont: Font = TravelTypography.cardTitle

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text(value)
                .font(valueFont)
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}

/// An adaptive grid grouping for metric / stat cards.
///
/// Encapsulates the `LazyVGrid(columns: [GridItem(.adaptive(minimum:), spacing:)])`
/// layout repeated across feature screens, keeping spacing consistent.
struct PremiumMetricGrid<Content: View>: View {
    var minimumWidth: CGFloat = 156
    @ViewBuilder var content: Content

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: minimumWidth), spacing: TravelSpacing.md)],
            spacing: TravelSpacing.md
        ) {
            content
        }
    }
}
