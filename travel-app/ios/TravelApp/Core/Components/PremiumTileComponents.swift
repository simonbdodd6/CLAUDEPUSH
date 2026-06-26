import SwiftUI

// MARK: - Premium tile components (Phase 35)
//
// Reusable, presentation-only tiles for collections, memories and other
// compact archive surfaces. These components use the existing design system
// only and intentionally carry no interaction or feature logic.

/// A vertical collection tile with optional symbol, title, subtitle and badge.
struct PremiumCollectionTile: View {
    let title: String?
    let subtitle: String?
    let badge: String?
    let symbol: String?
    var accent: Color = TravelTheme.current.tint

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                if symbol != nil || badge != nil {
                    HStack {
                        if let symbol {
                            Image(systemName: symbol)
                                .font(.title2)
                                .foregroundStyle(accent)
                        }
                        Spacer(minLength: 0)
                        if let badge {
                            Text(badge)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if let title {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                }
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

/// A compact row tile with optional leading symbol, badge and metadata.
struct PremiumCompactTile: View {
    let title: String?
    let subtitle: String?
    let badge: String?
    let metadata: String?
    let symbol: String?
    var accent: Color = TravelTheme.current.tint

    var body: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.headline)
                        .foregroundStyle(accent)
                        .frame(width: 46, height: 46)
                        .background(
                            .thinMaterial,
                            in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                        )
                }

                if badge != nil || title != nil || subtitle != nil {
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        if let badge {
                            Text(badge)
                                .font(.system(.caption2, design: .rounded, weight: .semibold))
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                        }
                        if let title {
                            Text(title)
                                .font(TravelTypography.cardTitle)
                        }
                        if let subtitle {
                            Text(subtitle)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                if let metadata {
                    Spacer(minLength: TravelSpacing.sm)
                    Text(metadata)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
    }
}

/// A thumbnail-led tile with a deterministic gradient visual placeholder.
struct PremiumThumbnailTile: View {
    let gradient: [Color]
    let title: String?
    let subtitle: String?
    let badge: String?
    let metadata: String?
    let symbol: String?
    var thumbnailHeight: CGFloat = 132

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ZStack(alignment: .bottomLeading) {
                    RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: gradient,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    if let symbol {
                        Image(systemName: symbol)
                            .font(.system(size: 38, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.86))
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                            .padding(TravelSpacing.md)
                    }
                    if let badge {
                        Text(badge)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.white.opacity(0.78))
                            .padding(TravelSpacing.md)
                    }
                }
                .frame(height: thumbnailHeight)

                if title != nil || metadata != nil || subtitle != nil {
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        if let title {
                            Text(title)
                                .font(TravelTypography.cardTitle)
                        }
                        if let metadata {
                            Text(metadata)
                                .font(TravelTypography.caption)
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                        }
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
}

/// A gradient banner tile: a gradient header with a top-trailing symbol overlay,
/// above a title, an uppercase metadata line and a detail line.
///
/// Consolidates the repeated overlay-style gradient cards previously duplicated
/// as `DestinationTrendCard`, `HighlightMomentCard` and `DestinationMoodCard`.
struct PremiumGradientTile: View {
    let gradient: [Color]
    let symbol: String
    let title: String
    let metadata: String
    let detail: String
    var bannerHeight: CGFloat = 132

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: symbol)
                            .font(.title2)
                            .foregroundStyle(.white.opacity(0.86))
                            .padding(TravelSpacing.md)
                    }
                    .frame(height: bannerHeight)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                    Text(metadata)
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}
