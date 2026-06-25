import SwiftUI

// MARK: - Premium passport components (Phase 38)
//
// Deterministic, presentation-only passport and stamp primitives. These use
// the existing design system and carry no feature or data-layer behaviour.

/// The circular visual badge used by completed and ready passport stamps.
struct PremiumStampBadge: View {
    let glyph: String
    let symbol: String
    let gradient: [Color]
    let isStamped: Bool
    var size: CGFloat = 72

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    isStamped
                        ? AnyShapeStyle(
                            LinearGradient(
                                colors: gradient,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        : AnyShapeStyle(Color.clear)
                )
                .background(
                    isStamped ? AnyShapeStyle(Color.clear) : AnyShapeStyle(.ultraThinMaterial),
                    in: Circle()
                )
            Circle()
                .strokeBorder(
                    isStamped ? .white.opacity(0.55) : Color.secondary.opacity(0.35),
                    style: StrokeStyle(
                        lineWidth: isStamped ? 2 : 1.5,
                        dash: isStamped ? [] : [4, 4]
                    )
                )
            if isStamped {
                VStack(spacing: 2) {
                    Text(glyph)
                        .font(.title3)
                    Image(systemName: symbol)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.9))
                }
            } else {
                Image(systemName: symbol)
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
    }
}

/// A labelled passport stamp, including its completed or ready state.
struct PremiumPassportStamp: View {
    let title: String
    let metadata: String
    let glyph: String
    let symbol: String
    let gradient: [Color]
    let isStamped: Bool

    var body: some View {
        VStack(spacing: TravelSpacing.xs) {
            PremiumStampBadge(
                glyph: glyph,
                symbol: symbol,
                gradient: gradient,
                isStamped: isStamped
            )
            .rotationEffect(.degrees(isStamped ? -6 : 0))
            .shadow(
                color: .black.opacity(isStamped ? 0.12 : 0),
                radius: 6,
                x: 0,
                y: 4
            )

            Text(title)
                .font(TravelTypography.caption)
                .foregroundStyle(isStamped ? .primary : .secondary)
                .lineLimit(1)
            Text(metadata)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

/// An adaptive glass-backed grid for passport stamps and similar badges.
struct PremiumStampGrid<Content: View>: View {
    var minimumWidth: CGFloat = 88
    @ViewBuilder var content: Content

    var body: some View {
        GlassCard {
            LazyVGrid(
                columns: [
                    GridItem(
                        .adaptive(minimum: minimumWidth),
                        spacing: TravelSpacing.md
                    )
                ],
                spacing: TravelSpacing.lg
            ) {
                content
            }
            .padding(.vertical, TravelSpacing.xs)
        }
    }
}

/// A compact passport progress row for premium hero surfaces.
struct PremiumPassportProgressSummary<Progress: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var progress: Progress

    var body: some View {
        HStack(alignment: .center, spacing: TravelSpacing.lg) {
            progress
            .frame(width: 64, height: 64)

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(title)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
    }
}
