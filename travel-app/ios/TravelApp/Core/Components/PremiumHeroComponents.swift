import SwiftUI

// MARK: - Premium hero components (Phase 33)
//
// A reusable hero family for feature-screen headers, establishing a consistent
// premium identity. Built entirely from the existing design system
// (TravelTheme / TravelTypography / TravelSpacing / TravelRadius / GlassCard) —
// no new colours, typography, spacing tokens or themes. Presentation-only.
//
// Two members:
//   * PremiumHeroHeader — a plain (card-less) eyebrow + title + subtitle stack.
//   * PremiumHero       — a glass-card hero with an eyebrow/symbol row, an
//                         optional trailing accessory, an optional background
//                         accent and an optional decorative content slot.

/// The shared eyebrow + title + subtitle text stack, with no surrounding card.
/// Reproduces the plain header used at the top of the Home surface.
struct PremiumHeroHeader: View {
    let eyebrow: String?
    let symbol: String?
    let title: String
    let subtitle: String?

    init(eyebrow: String? = nil, symbol: String? = nil, title: String, subtitle: String? = nil) {
        self.eyebrow = eyebrow
        self.symbol = symbol
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            if let eyebrow {
                PremiumHeroEyebrow(eyebrow: eyebrow, symbol: symbol)
            }
            Text(title)
                .font(TravelTypography.display)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            if let subtitle {
                Text(subtitle)
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// A premium glass-card hero header.
///
/// Reproduces the generic `ScreenHero`: an uppercase eyebrow/symbol row with an
/// optional trailing accessory, a display title, a body subtitle, and an
/// optional decorative content area — now with an optional background accent.
struct PremiumHero<Accessory: View, Content: View>: View {
    let eyebrow: String?
    let symbol: String?
    let title: String
    let subtitle: String?
    let accent: Color?
    let hasAccessory: Bool
    let accessory: Accessory
    let content: Content

    init(
        eyebrow: String? = nil,
        symbol: String? = nil,
        title: String,
        subtitle: String? = nil,
        accent: Color? = nil,
        @ViewBuilder accessory: () -> Accessory,
        @ViewBuilder content: () -> Content
    ) {
        self.eyebrow = eyebrow
        self.symbol = symbol
        self.title = title
        self.subtitle = subtitle
        self.accent = accent
        self.hasAccessory = true
        self.accessory = accessory()
        self.content = content()
    }

    fileprivate init(
        eyebrow: String?,
        symbol: String?,
        title: String,
        subtitle: String?,
        accent: Color?,
        hasAccessory: Bool,
        accessory: Accessory,
        @ViewBuilder content: () -> Content
    ) {
        self.eyebrow = eyebrow
        self.symbol = symbol
        self.title = title
        self.subtitle = subtitle
        self.accent = accent
        self.hasAccessory = hasAccessory
        self.accessory = accessory
        self.content = content()
    }

    var body: some View {
        let card = GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                if eyebrow != nil || hasAccessory {
                    HStack {
                        if let eyebrow {
                            PremiumHeroEyebrow(eyebrow: eyebrow, symbol: symbol)
                        }
                        Spacer()
                        accessory
                    }
                }
                VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                    Text(title)
                        .font(TravelTypography.display)
                        .foregroundStyle(.primary)
                    if let subtitle {
                        Text(subtitle)
                            .font(TravelTypography.body)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                content
            }
        }

        if let accent {
            card.background(
                RoundedRectangle(cornerRadius: TravelRadius.hero, style: .continuous)
                    .fill(accent.opacity(0.12))
            )
        } else {
            card
        }
    }
}

extension PremiumHero where Accessory == EmptyView {
    /// A hero with no trailing accessory.
    init(
        eyebrow: String? = nil,
        symbol: String? = nil,
        title: String,
        subtitle: String? = nil,
        accent: Color? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.init(
            eyebrow: eyebrow,
            symbol: symbol,
            title: title,
            subtitle: subtitle,
            accent: accent,
            hasAccessory: false,
            accessory: EmptyView(),
            content: content
        )
    }
}

extension PremiumHero where Accessory == EmptyView, Content == EmptyView {
    /// A hero with neither a trailing accessory nor a decorative content area.
    init(
        eyebrow: String? = nil,
        symbol: String? = nil,
        title: String,
        subtitle: String? = nil,
        accent: Color? = nil
    ) {
        self.init(
            eyebrow: eyebrow,
            symbol: symbol,
            title: title,
            subtitle: subtitle,
            accent: accent,
            hasAccessory: false,
            accessory: EmptyView(),
            content: { EmptyView() }
        )
    }
}

/// The shared uppercase eyebrow label used by both hero members. Renders a
/// symbol + text `Label` when a symbol is supplied, otherwise plain text.
struct PremiumHeroEyebrow: View {
    let eyebrow: String
    let symbol: String?

    var body: some View {
        Group {
            if let symbol {
                Label(eyebrow, systemImage: symbol)
            } else {
                Text(eyebrow)
            }
        }
        .font(TravelTypography.caption)
        .textCase(.uppercase)
        .foregroundStyle(.secondary)
    }
}
