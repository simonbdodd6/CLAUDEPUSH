import SwiftUI

// MARK: - Premium card components (Phase 34)
//
// A reusable card family that standardises card presentation on top of the
// existing `GlassCard`, using the existing design system only (TravelTheme /
// TravelTypography / TravelSpacing / TravelRadius). No new colours, typography,
// spacing tokens or themes. Presentation-only.
//
// Members:
//   * PremiumCard      — a standard / compact content card: optional leading
//                        symbol badge, title, optional subtitle and optional
//                        trailing accessory.
//   * PremiumMediaCard — a media / visual card: a gradient visual area with an
//                        optional symbol and caption overlay, above a title and
//                        optional subtitle.

/// Leading symbol badge styles for `PremiumCard`.
enum PremiumCardSymbolBadge {
    /// 42pt circular badge with a `title2` glyph (standard content cards).
    case circle
    /// 44pt rounded-rectangle badge with a `headline` glyph (compact cards).
    case roundedRect
}

/// A standard / compact content card built on `GlassCard`.
///
/// Reproduces the shared "symbol + title + subtitle" card shape — previously
/// duplicated as `PlaceholderCard`, `AppInformationCard` and similar — with an
/// optional leading symbol badge and an optional trailing accessory.
struct PremiumCard<Accessory: View>: View {
    let symbol: String?
    let badge: PremiumCardSymbolBadge
    let accent: Color
    let title: String
    let subtitle: String?
    let subtitleFixedSize: Bool
    let contentSpacing: CGFloat
    let hasAccessory: Bool
    let accessory: Accessory

    init(
        symbol: String? = nil,
        badge: PremiumCardSymbolBadge = .circle,
        accent: Color = TravelTheme.current.tint,
        title: String,
        subtitle: String? = nil,
        subtitleFixedSize: Bool = false,
        contentSpacing: CGFloat = TravelSpacing.xs,
        @ViewBuilder accessory: () -> Accessory
    ) {
        self.symbol = symbol
        self.badge = badge
        self.accent = accent
        self.title = title
        self.subtitle = subtitle
        self.subtitleFixedSize = subtitleFixedSize
        self.contentSpacing = contentSpacing
        self.hasAccessory = true
        self.accessory = accessory()
    }

    fileprivate init(
        symbol: String?,
        badge: PremiumCardSymbolBadge,
        accent: Color,
        title: String,
        subtitle: String?,
        subtitleFixedSize: Bool,
        contentSpacing: CGFloat,
        hasAccessory: Bool,
        accessory: Accessory
    ) {
        self.symbol = symbol
        self.badge = badge
        self.accent = accent
        self.title = title
        self.subtitle = subtitle
        self.subtitleFixedSize = subtitleFixedSize
        self.contentSpacing = contentSpacing
        self.hasAccessory = hasAccessory
        self.accessory = accessory
    }

    var body: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                if let symbol {
                    PremiumCardBadgeView(symbol: symbol, badge: badge, accent: accent)
                }
                VStack(alignment: .leading, spacing: contentSpacing) {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                    if let subtitle {
                        if subtitleFixedSize {
                            Text(subtitle)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            Text(subtitle)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if hasAccessory {
                    Spacer(minLength: TravelSpacing.sm)
                    accessory
                }
            }
        }
    }
}

extension PremiumCard where Accessory == EmptyView {
    /// A content card with no trailing accessory.
    init(
        symbol: String? = nil,
        badge: PremiumCardSymbolBadge = .circle,
        accent: Color = TravelTheme.current.tint,
        title: String,
        subtitle: String? = nil,
        subtitleFixedSize: Bool = false,
        contentSpacing: CGFloat = TravelSpacing.xs
    ) {
        self.init(
            symbol: symbol,
            badge: badge,
            accent: accent,
            title: title,
            subtitle: subtitle,
            subtitleFixedSize: subtitleFixedSize,
            contentSpacing: contentSpacing,
            hasAccessory: false,
            accessory: EmptyView()
        )
    }
}

/// The leading symbol badge used by `PremiumCard`.
private struct PremiumCardBadgeView: View {
    let symbol: String
    let badge: PremiumCardSymbolBadge
    let accent: Color

    var body: some View {
        switch badge {
        case .circle:
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(accent)
                .frame(width: 42, height: 42)
                .background(.thinMaterial, in: Circle())
        case .roundedRect:
            Image(systemName: symbol)
                .font(.headline)
                .foregroundStyle(accent)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
        }
    }
}

/// A media / visual card: a gradient visual area with an optional symbol and
/// caption overlay, above a title and optional subtitle.
///
/// Reproduces the shared media-card shape previously duplicated as
/// `FilmReelCard` and similar gradient-led cards.
struct PremiumMediaCard: View {
    let gradient: [Color]
    let symbol: String?
    let caption: String?
    let title: String
    let subtitle: String?
    var mediaHeight: CGFloat = 148

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ZStack(alignment: .bottomLeading) {
                    RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                        .fill(LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    if let symbol {
                        Image(systemName: symbol)
                            .font(.system(size: 42, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.86))
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                            .padding(TravelSpacing.md)
                    }
                    if let caption {
                        Text(caption)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.white.opacity(0.78))
                            .padding(TravelSpacing.md)
                    }
                }
                .frame(height: mediaHeight)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                    if let subtitle {
                        Text(subtitle)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }
}

/// A reason-code card: an accent symbol with a trailing reason code, above a
/// title and a detail line.
///
/// Consolidates the repeated cards previously duplicated as `TravelMemoryCard`,
/// `JourneyInsightCard` and `InsightCard`, which differed only by accent colour.
struct PremiumReasonCard: View {
    let symbol: String
    let reasonCode: String
    let title: String
    let detail: String
    var accent: Color = TravelTheme.current.tint

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    Image(systemName: symbol)
                        .font(.title3)
                        .foregroundStyle(accent)
                    Spacer()
                    Text(reasonCode)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Text(title)
                    .font(TravelTypography.cardTitle)
                Text(detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
