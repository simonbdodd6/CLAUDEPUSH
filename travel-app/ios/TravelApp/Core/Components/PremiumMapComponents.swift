import SwiftUI

// MARK: - Premium map components (Phase 39)
//
// Deterministic, presentation-only map primitives. These components draw
// static travel textures with SwiftUI shapes and do not use MapKit, location
// services, networking or live map data.

enum PremiumLocationBadgeStyle {
    case plain
    case capsule
}

/// A static map surface with an existing-theme gradient and custom overlay.
struct PremiumMapCard<Overlay: View>: View {
    let gradient: [Color]
    var cornerRadius: CGFloat = TravelRadius.lg
    @ViewBuilder var overlay: Overlay

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: gradient,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            overlay
        }
    }
}

/// A deterministic circular location pin for map-like presentation surfaces.
struct PremiumMapPin: View {
    let symbol: String
    var accent: Color = TravelTheme.current.tint
    var size: CGFloat = 48
    var symbolFont: Font = .title2

    var body: some View {
        Image(systemName: symbol)
            .font(symbolFont)
            .foregroundStyle(accent)
            .frame(width: size, height: size)
            .background(.thinMaterial, in: Circle())
    }
}

/// A location label rendered as plain metadata or a material capsule.
struct PremiumLocationBadge: View {
    let label: String
    var symbol = "mappin.and.ellipse"
    var style: PremiumLocationBadgeStyle = .plain

    var body: some View {
        switch style {
        case .plain:
            locationLabel
        case .capsule:
            locationLabel
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xs)
                .background(.thinMaterial, in: Capsule())
        }
    }

    private var locationLabel: some View {
        Label(label, systemImage: symbol)
            .font(TravelTypography.caption)
            .foregroundStyle(.secondary)
    }
}

/// A decorative route overlay for static map cards and hero placeholders.
struct PremiumMapOverlay: View {
    var routeCount = 5
    var symbol = "point.topleft.down.curvedto.point.bottomright.up"

    var body: some View {
        ZStack {
            HStack(spacing: TravelSpacing.sm) {
                ForEach(0..<max(routeCount, 0), id: \.self) { index in
                    Capsule()
                        .fill(.white.opacity(0.22))
                        .frame(width: 34 + CGFloat(index * 8), height: 8)
                        .rotationEffect(.degrees(Double(index * 9 - 18)))
                }
            }
            Image(systemName: symbol)
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
        }
        .accessibilityHidden(true)
    }
}
