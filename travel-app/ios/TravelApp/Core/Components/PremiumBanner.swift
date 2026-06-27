import SwiftUI

// MARK: - Premium notification banner (Phase 58)
//
// A reusable, presentation-only inline feedback banner (toast) with semantic
// styling for info / success / warning / error. It completes the feedback family
// alongside the blocking `LoadingStateView` / `EmptyStateView` / `ErrorStateView`
// and `LoadingOverlay`, covering transient inline messaging instead.
//
// It carries no data, networking, persistence or navigation. An optional
// `onDismiss` closure is the only interaction seam — supplied by the caller — so
// the component itself holds no logic and is not wired into any screen.

/// Semantic style for a `PremiumBanner`, mapped onto the existing semantic
/// colour roles (`info` / `success` / `warning` / `danger`).
enum PremiumBannerStyle: CaseIterable {
    case info
    case success
    case warning
    case error

    var accent: Color {
        switch self {
        case .info: TravelTheme.current.info
        case .success: TravelTheme.current.success
        case .warning: TravelTheme.current.warning
        case .error: TravelTheme.current.danger
        }
    }

    /// Default leading glyph; callers may override with `icon`.
    var symbol: String {
        switch self {
        case .info: "info.circle.fill"
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .error: "xmark.octagon.fill"
        }
    }

    /// Spoken prefix so the style's meaning is conveyed without colour.
    var accessibilityPrefix: String {
        switch self {
        case .info: "Information"
        case .success: "Success"
        case .warning: "Warning"
        case .error: "Error"
        }
    }
}

/// A premium, presentation-only notification banner.
///
/// Designed to be shown/hidden by a caller (e.g. wrapped in a `.transition`);
/// the banner does not manage its own presentation state.
struct PremiumBanner: View {
    var style: PremiumBannerStyle = .info
    var title: String
    var message: String? = nil
    /// Overrides the style's default glyph when supplied.
    var icon: String? = nil
    /// When supplied, a dismiss control is shown that invokes this closure.
    var onDismiss: (() -> Void)? = nil

    var body: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    Image(systemName: icon ?? style.symbol)
                        .font(TravelTypography.title)
                        .foregroundStyle(style.accent)
                        .padding(TravelSpacing.sm)
                        .background(style.accent.opacity(0.15), in: Circle())

                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(title)
                            .font(TravelTypography.cardTitle)
                            .multilineTextAlignment(.leading)
                        if let message {
                            Text(message)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(style.accessibilityPrefix): \(title)\(message.map { ". \($0)" } ?? "")")

                Spacer(minLength: 0)

                if let onDismiss {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .padding(TravelSpacing.xs)
                            .background(.thinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Dismiss")
                }
            }
        }
    }
}

#if DEBUG
struct PremiumBanner_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Text("Semantic styles")
                    .font(TravelTypography.section)
                PremiumBanner(
                    style: .info,
                    title: "Syncing your archive",
                    message: "New memories will appear once syncing finishes."
                )
                PremiumBanner(
                    style: .success,
                    title: "Trip saved",
                    message: "Your Kyoto journey was added to the timeline.",
                    onDismiss: {}
                )
                PremiumBanner(
                    style: .warning,
                    title: "Offline mode",
                    message: "Some media may be unavailable until you reconnect.",
                    onDismiss: {}
                )
                PremiumBanner(
                    style: .error,
                    title: "Couldn’t load passport",
                    message: "Pull to refresh to try again.",
                    onDismiss: {}
                )

                Divider()

                Text("Variations")
                    .font(TravelTypography.section)
                PremiumBanner(style: .success, title: "Title only")
                PremiumBanner(
                    style: .info,
                    title: "Custom icon",
                    message: "A caller-supplied SF Symbol overrides the default glyph.",
                    icon: "sparkles"
                )
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("PremiumBanner")
    }
}
#endif
