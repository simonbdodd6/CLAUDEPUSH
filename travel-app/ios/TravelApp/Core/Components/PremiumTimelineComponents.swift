import SwiftUI

// MARK: - Premium timeline components (Phase 36)
//
// Reusable, presentation-only chronology primitives for travel history and
// memory surfaces. They use the existing design system exclusively.

enum PremiumTimelineDateBadgeStyle {
    case plain
    case capsule
}

enum PremiumTimelineDetailPlacement {
    case inline
    case body
}

/// A deterministic date label that can render as plain metadata or a capsule.
struct PremiumTimelineDateBadge: View {
    let label: String
    var style: PremiumTimelineDateBadgeStyle = .plain

    var body: some View {
        switch style {
        case .plain:
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        case .capsule:
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xxs)
                .background(.thinMaterial, in: Capsule())
        }
    }
}

/// The marker and continuation line used beside connected timeline items.
struct PremiumTimelineConnector: View {
    let accent: Color
    var showsLine = true

    var body: some View {
        VStack(spacing: 0) {
            Circle()
                .fill(accent)
                .frame(width: 14, height: 14)
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.82), lineWidth: 2)
                }
            if showsLine {
                Rectangle()
                    .fill(accent.opacity(0.24))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
            }
        }
        .frame(width: 18)
    }
}

/// A flexible timeline card with optional connector, date, icon and metadata.
struct PremiumTimelineItem: View {
    let title: String
    let subtitle: String?
    let subtitleSymbol: String?
    var subtitleUppercase = false
    let eyebrow: String?
    let detail: String?
    var detailPlacement: PremiumTimelineDetailPlacement = .body
    let symbol: String?
    let dateLabel: String?
    var dateBadgeStyle: PremiumTimelineDateBadgeStyle = .plain
    var accent: Color = TravelTheme.current.tint
    var showsConnector = true
    var symbolSize: CGFloat = 42
    var symbolFont: Font = .headline

    var body: some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            if showsConnector {
                PremiumTimelineConnector(accent: accent)
            }

            GlassCard {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        if let symbol {
                            Image(systemName: symbol)
                                .font(symbolFont)
                                .foregroundStyle(accent)
                                .frame(width: symbolSize, height: symbolSize)
                                .background(
                                    .thinMaterial,
                                    in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                                )
                        }

                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            if let eyebrow {
                                Text(eyebrow)
                                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                                    .textCase(.uppercase)
                                    .foregroundStyle(.secondary)
                            }
                            Text(title)
                                .font(TravelTypography.cardTitle)
                            if let subtitle {
                                if let subtitleSymbol {
                                    PremiumLocationBadge(
                                        label: subtitle,
                                        symbol: subtitleSymbol
                                    )
                                } else {
                                    Text(subtitle)
                                        .font(TravelTypography.caption)
                                        .textCase(subtitleUppercase ? .uppercase : nil)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            if detailPlacement == .inline, let detail {
                                Text(detail)
                                    .font(TravelTypography.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }

                        Spacer(minLength: TravelSpacing.sm)
                        if let dateLabel {
                            PremiumTimelineDateBadge(label: dateLabel, style: dateBadgeStyle)
                        }
                    }

                    if detailPlacement == .body, let detail {
                        Text(detail)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }
}

/// A dated timeline grouping with an optional summary and custom item content.
struct PremiumTimelineSection<Content: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(TravelTypography.title)
                if let subtitle {
                    Spacer(minLength: TravelSpacing.md)
                    Text(subtitle)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                }
            }
            .padding(.top, TravelSpacing.xs)

            content
        }
    }
}
