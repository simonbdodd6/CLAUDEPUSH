import SwiftUI

// MARK: - Premium progress view (Phase 56)
//
// A reusable, presentation-only progress component supporting both determinate
// (0–100%) and indeterminate loading, with optional title/subtitle and small /
// medium / large size variants. It uses the existing design tokens only and
// reuses `PremiumProgressBar` for the determinate fill; it carries no data,
// networking or business logic and is not wired into any screen.

/// Size variant for `PremiumProgressView`, scaling the indicator and typography
/// from the existing token scales.
enum PremiumProgressSize {
    case small
    case medium
    case large

    /// Determinate bar thickness, drawn from the spacing scale.
    var barHeight: CGFloat {
        switch self {
        case .small: TravelSpacing.xs   // 8
        case .medium: TravelSpacing.sm  // 12
        case .large: TravelSpacing.md   // 16
        }
    }

    var titleFont: Font {
        switch self {
        case .small: TravelTypography.caption
        case .medium: TravelTypography.cardTitle
        case .large: TravelTypography.section
        }
    }

    var subtitleFont: Font {
        switch self {
        case .small: TravelTypography.caption
        case .medium: TravelTypography.caption
        case .large: TravelTypography.body
        }
    }

    /// Vertical spacing between the indicator and the text block.
    var spacing: CGFloat {
        switch self {
        case .small: TravelSpacing.xs
        case .medium: TravelSpacing.sm
        case .large: TravelSpacing.md
        }
    }

    var controlSize: ControlSize {
        switch self {
        case .small: .small
        case .medium: .regular
        case .large: .large
        }
    }
}

/// A reusable progress view supporting determinate and indeterminate states.
///
/// Pass a `value` in `0...1` for a determinate bar (a percentage label is shown
/// alongside it); pass `nil` for an indeterminate circular spinner.
struct PremiumProgressView: View {
    /// Progress in `0...1`, or `nil` for indeterminate loading.
    var value: Double? = nil
    var title: String? = nil
    var subtitle: String? = nil
    var size: PremiumProgressSize = .medium
    var accent: Color = TravelTheme.current.tint

    var body: some View {
        VStack(alignment: .leading, spacing: size.spacing) {
            indicator

            if title != nil || subtitle != nil {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    if let title {
                        Text(title)
                            .font(size.titleFont)
                    }
                    if let subtitle {
                        Text(subtitle)
                            .font(size.subtitleFont)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title ?? "Loading")
        .accessibilityValue(value == nil ? "" : "\(percent)%")
    }

    @ViewBuilder
    private var indicator: some View {
        if let value {
            HStack(spacing: TravelSpacing.sm) {
                PremiumProgressBar(
                    progress: value,
                    colors: [accent, accent],
                    height: size.barHeight
                )
                Text("\(percent)%")
                    .font(size.subtitleFont)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        } else {
            ProgressView()
                .progressViewStyle(.circular)
                .controlSize(size.controlSize)
                .tint(accent)
        }
    }

    /// Clamped integer percentage for the determinate label / accessibility value.
    private var percent: Int {
        Int((min(max(value ?? 0, 0), 1) * 100).rounded())
    }
}

#if DEBUG
struct PremiumProgressView_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Indeterminate")
                    .font(TravelTypography.section)
                PremiumProgressView(title: "Loading", subtitle: "Small", size: .small)
                PremiumProgressView(title: "Loading", subtitle: "Medium", size: .medium)
                PremiumProgressView(title: "Loading", subtitle: "Large", size: .large)
                PremiumProgressView(size: .medium)

                Divider()

                Text("Determinate")
                    .font(TravelTypography.section)
                PremiumProgressView(value: 0.0, title: "Passport", subtitle: "0% · small", size: .small)
                PremiumProgressView(value: 0.64, title: "Passport", subtitle: "64% · medium", size: .medium)
                PremiumProgressView(value: 1.0, title: "Complete", subtitle: "100% · large", size: .large, accent: TravelTheme.current.success)
                PremiumProgressView(value: 0.4)
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("PremiumProgressView")
    }
}
#endif
