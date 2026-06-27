import SwiftUI

// MARK: - Premium passport stamp (Phase 63)
//
// A reusable, presentation-only "ink stamp" for a destination: five states, two
// styles (circular badge or rectangular stamp), an optional date, an optional
// icon and an optional rarity-accent override. Rendered in an authentic ink
// aesthetic (accent border + tint) using the existing design tokens only, with a
// subtle ink-press appearance animation. It carries no data, networking,
// persistence or navigation and is not wired into any screen.
//
// This is a standalone, flexible stamp distinct from the existing 2-state
// `PassportStampCell` / `PremiumStampBadge`; those are intentionally left as-is.

/// Visual state of a `PassportStamp`.
enum PassportStampState: CaseIterable {
    case visited
    case wishlist
    case locked
    case rare
    case eventExclusive

    var label: String {
        switch self {
        case .visited: "Visited"
        case .wishlist: "Wishlist"
        case .locked: "Locked"
        case .rare: "Rare"
        case .eventExclusive: "Event"
        }
    }

    /// Default ink accent; callers may override via `accent`.
    var defaultAccent: Color {
        switch self {
        case .visited: TravelTheme.current.tint
        case .wishlist: TravelTheme.current.sky
        case .locked: TravelTheme.current.ink
        case .rare: TravelTheme.current.sun
        case .eventExclusive: TravelTheme.current.coral
        }
    }

    var defaultGlyph: String {
        switch self {
        case .visited: "checkmark.seal.fill"
        case .wishlist: "heart"
        case .locked: "lock.fill"
        case .rare: "star.fill"
        case .eventExclusive: "ticket.fill"
        }
    }

    /// Whether the stamp reads as pressed (solid border + ink-angle rotation).
    var isStamped: Bool {
        switch self {
        case .visited, .rare, .eventExclusive: true
        case .wishlist, .locked: false
        }
    }

    var isLocked: Bool { self == .locked }
}

/// Shape style for a `PassportStamp`.
enum PassportStampStyle {
    case circular
    case rectangular
}

/// A premium, presentation-only passport ink stamp.
struct PassportStamp: View {
    var state: PassportStampState = .visited
    var style: PassportStampStyle = .circular
    var destination: String
    var date: String? = nil
    var icon: String? = nil
    /// Optional rarity-accent override; defaults to the state's ink accent.
    var accent: Color? = nil

    @State private var pressed = false

    private var renderColor: Color {
        state.isLocked
            ? TravelTheme.current.ink.opacity(0.35)
            : (accent ?? state.defaultAccent)
    }

    private var glyph: String { icon ?? state.defaultGlyph }

    private var borderStrokeStyle: StrokeStyle {
        state.isStamped
            ? StrokeStyle(lineWidth: 2)
            : StrokeStyle(lineWidth: 2, dash: [4, 4])
    }

    /// Slight ink-angle rotation for pressed stamps.
    private var finalRotation: Double { state.isStamped ? -5 : 0 }

    var body: some View {
        Group {
            switch style {
            case .circular: circularStamp
            case .rectangular: rectangularStamp
            }
        }
        .scaleEffect(pressed ? 1 : 1.18)
        .opacity(pressed ? 1 : 0)
        .onAppear {
            withAnimation(TravelMotion.gentle) { pressed = true }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // MARK: Styles

    private var circularStamp: some View {
        VStack(spacing: TravelSpacing.xs) {
            ZStack {
                Circle()
                    .fill(renderColor.opacity(0.10))
                Circle()
                    .strokeBorder(renderColor, style: borderStrokeStyle)
                Image(systemName: glyph)
                    .font(TravelTypography.title)
                    .foregroundStyle(renderColor)
            }
            .frame(width: TravelIconSize.statusBadge, height: TravelIconSize.statusBadge)
            .rotationEffect(.degrees(pressed ? finalRotation : finalRotation + 6))

            Text(destination)
                .font(TravelTypography.caption)
                .foregroundStyle(state.isStamped ? .primary : .secondary)
                .lineLimit(1)
            if let date {
                Text(date)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var rectangularStamp: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            HStack(spacing: TravelSpacing.xs) {
                Image(systemName: glyph)
                    .font(TravelTypography.body)
                    .foregroundStyle(renderColor)
                Text(state.label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(renderColor)
                Spacer(minLength: 0)
            }
            Text(destination)
                .font(TravelTypography.cardTitle)
                .foregroundStyle(state.isLocked ? .secondary : .primary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if let date {
                Text(date)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(TravelSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            renderColor.opacity(0.08),
            in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                .strokeBorder(renderColor, style: borderStrokeStyle)
        )
        .rotationEffect(.degrees(pressed ? finalRotation : finalRotation + 6))
    }

    private var accessibilityText: String {
        var parts = ["\(state.label) stamp", destination]
        if let date { parts.append(date) }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct PassportStamp_Previews: PreviewProvider {
    private static let circularColumns = [GridItem(.adaptive(minimum: 140), spacing: TravelSpacing.md)]
    private static let rectangularColumns = [GridItem(.adaptive(minimum: 220), spacing: TravelSpacing.md)]

    private static func destination(for state: PassportStampState) -> String {
        switch state {
        case .visited: "Japan"
        case .wishlist: "Iceland"
        case .locked: "Antarctica"
        case .rare: "Bhutan"
        case .eventExclusive: "Rio Carnival"
        }
    }

    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Circular · every state")
                    .font(TravelTypography.section)
                LazyVGrid(columns: circularColumns, spacing: TravelSpacing.lg) {
                    ForEach(PassportStampState.allCases, id: \.self) { state in
                        PassportStamp(
                            state: state,
                            style: .circular,
                            destination: destination(for: state),
                            date: "2025"
                        )
                    }
                }

                Divider()

                Text("Rectangular · every state")
                    .font(TravelTypography.section)
                LazyVGrid(columns: rectangularColumns, spacing: TravelSpacing.md) {
                    ForEach(PassportStampState.allCases, id: \.self) { state in
                        PassportStamp(
                            state: state,
                            style: .rectangular,
                            destination: destination(for: state),
                            date: "Apr 2025"
                        )
                    }
                }

                Divider()

                Text("Variations")
                    .font(TravelTypography.section)
                LazyVGrid(columns: rectangularColumns, spacing: TravelSpacing.md) {
                    PassportStamp(state: .visited, style: .rectangular, destination: "Custom accent", date: "2024", accent: TravelTheme.current.moss)
                    PassportStamp(state: .rare, style: .rectangular, destination: "No date")
                    PassportStamp(state: .eventExclusive, style: .circular, destination: "Custom icon", date: "2023", icon: "music.note")
                    PassportStamp(state: .wishlist, style: .circular, destination: "Long destination name wraps")
                }
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("PassportStamp")
    }
}
#endif
