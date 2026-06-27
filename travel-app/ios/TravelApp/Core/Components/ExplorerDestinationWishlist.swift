import SwiftUI

// MARK: - Explorer destination wishlist (Phase 79)
//
// A reusable, presentation-only "dream destinations" wishlist: a gallery of
// places the traveller wants to visit, each with a gradient image placeholder, a
// status (dreaming → planned → booked → next trip), a priority, planning progress
// and an optional target year. It is the forward-looking counterpart to the
// achievement shelf — what's next, rather than what's earned.
//
// It reuses the existing design system exclusively — `GlassCard`,
// `PremiumProgressBar`, `PremiumAdaptiveGrid`, the gradient image-placeholder
// idiom shared with `PremiumThumbnailTile` / `PremiumGradientTile`, and the tokens
// (`TravelTheme`, `TravelSpacing`, `TravelRadius`, `TravelTypography`,
// `TravelMotion`). All values are caller-supplied mock data; the component holds
// no data, networking, persistence, view-model, navigation or MapKit usage, and is
// not wired into any screen. Animations are subtle appearance polish only (a
// staggered fade-and-rise; progress bars ease in on appear).

/// Where a wished-for destination sits in the planning journey.
enum WishlistStatus: CaseIterable {
    case dreaming
    case planned
    case booked
    case nextTrip

    var label: String {
        switch self {
        case .dreaming: "Dreaming"
        case .planned: "Planned"
        case .booked: "Booked"
        case .nextTrip: "Next Trip"
        }
    }

    var icon: String {
        switch self {
        case .dreaming: "sparkles"
        case .planned: "calendar"
        case .booked: "checkmark.seal.fill"
        case .nextTrip: "airplane.departure"
        }
    }

    /// Status accent — existing palette colours only.
    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .dreaming: return theme.sky
        case .planned: return theme.tint
        case .booked: return theme.moss
        case .nextTrip: return theme.coral
        }
    }
}

/// How keen the traveller is to visit — shown as filled dots and a label.
enum WishlistPriority: CaseIterable {
    case someday
    case soon
    case topPick

    var label: String {
        switch self {
        case .someday: "Someday"
        case .soon: "Soon"
        case .topPick: "Top pick"
        }
    }

    /// Filled-dot count (1...3).
    var level: Int {
        switch self {
        case .someday: 1
        case .soon: 2
        case .topPick: 3
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .someday: return theme.sky
        case .soon: return theme.tint
        case .topPick: return theme.coral
        }
    }
}

/// A single, presentation-only wishlist destination.
struct WishlistDestination: Identifiable {
    let id: String
    var name: String
    var country: String
    var status: WishlistStatus
    var priority: WishlistPriority
    /// Planning progress toward visiting, `0...1`.
    var progress: Double
    var targetYear: String?
    var symbol: String
    /// Optional placeholder gradient; falls back to a status-tinted gradient.
    var gradient: [Color]?

    /// `id` defaults to "name, country", matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        name: String,
        country: String,
        status: WishlistStatus,
        priority: WishlistPriority,
        progress: Double,
        targetYear: String? = nil,
        symbol: String = "mappin.and.ellipse",
        gradient: [Color]? = nil
    ) {
        self.id = id ?? "\(name), \(country)"
        self.name = name
        self.country = country
        self.status = status
        self.priority = priority
        self.progress = progress
        self.targetYear = targetYear
        self.symbol = symbol
        self.gradient = gradient
    }

    var clampedProgress: Double { min(max(progress, 0), 1) }
    var percent: Int { Int((clampedProgress * 100).rounded()) }
    var effectiveGradient: [Color] { gradient ?? [status.accent, status.accent.opacity(0.55)] }

    var accessibilityText: String {
        var parts = [name, country, status.label, "\(priority.label) priority", "\(percent) percent planned"]
        if let targetYear { parts.append("target \(targetYear)") }
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerDestinationWishlist`.
enum WishlistLayout {
    case compact
    case expanded
}

/// A premium, presentation-only dream-destinations wishlist.
struct ExplorerDestinationWishlist: View {
    var destinations: [WishlistDestination]
    var layout: WishlistLayout = .expanded
    var title: String? = "Dream destinations"
    var subtitle: String? = nil

    @State private var appeared = false

    private func animatedProgress(_ value: Double) -> Double { appeared ? value : 0 }

    var body: some View {
        Group {
            if destinations.isEmpty {
                emptyState
            } else {
                switch layout {
                case .expanded: expanded
                case .compact: compact
                }
            }
        }
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
    }

    // MARK: Expanded

    private var expanded: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            header(titleFont: TravelTypography.section)

            PremiumAdaptiveGrid(minimumWidth: 240) {
                ForEach(Array(destinations.enumerated()), id: \.element.id) { index, destination in
                    destinationCard(destination)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                }
            }
        }
    }

    private func destinationCard(_ destination: WishlistDestination) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                placeholder(destination, height: 124)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(destination.name)
                        .font(TravelTypography.cardTitle)
                        .lineLimit(1)
                    Label(destination.country, systemImage: "mappin.and.ellipse")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                priorityRow(destination.priority)

                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    PremiumProgressBar(
                        progress: animatedProgress(destination.clampedProgress),
                        colors: [destination.status.accent, TravelTheme.current.sky],
                        height: TravelSpacing.xs
                    )
                    Text("\(destination.percent)% planned")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(destination.accessibilityText)
    }

    // MARK: Compact

    private var compact: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                if title != nil || subtitle != nil {
                    HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                        if let title {
                            Text(title).font(TravelTypography.cardTitle)
                        }
                        Spacer(minLength: 0)
                        Text(countLabel)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(spacing: TravelSpacing.sm) {
                    ForEach(Array(destinations.enumerated()), id: \.element.id) { index, destination in
                        compactRow(destination)
                            .opacity(appeared ? 1 : 0)
                            .offset(y: appeared ? 0 : 8)
                            .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                    }
                }
            }
        }
    }

    private func compactRow(_ destination: WishlistDestination) -> some View {
        HStack(spacing: TravelSpacing.md) {
            swatch(destination, size: 46)

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(destination.name)
                    .font(TravelTypography.cardTitle)
                    .lineLimit(1)
                HStack(spacing: TravelSpacing.xs) {
                    Text(destination.country)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    if let targetYear = destination.targetYear {
                        Text("· \(targetYear)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                PremiumProgressBar(
                    progress: animatedProgress(destination.clampedProgress),
                    colors: [destination.status.accent, TravelTheme.current.sky],
                    height: TravelSpacing.xxs
                )
            }

            Spacer(minLength: TravelSpacing.sm)

            statusBadge(destination.status)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(destination.accessibilityText)
    }

    // MARK: Pieces

    private func placeholder(_ destination: WishlistDestination, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
            .fill(
                LinearGradient(
                    colors: destination.effectiveGradient,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(alignment: .topTrailing) {
                Image(systemName: destination.symbol)
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(TravelSpacing.md)
            }
            .overlay(alignment: .bottomLeading) {
                statusBadge(destination.status)
                    .padding(TravelSpacing.sm)
            }
            .overlay(alignment: .bottomTrailing) {
                if let targetYear = destination.targetYear {
                    Text(targetYear)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white)
                        .padding(.horizontal, TravelSpacing.sm)
                        .padding(.vertical, TravelSpacing.xxs)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(TravelSpacing.sm)
                }
            }
            .frame(height: height)
            .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .stroke(.white.opacity(0.25), lineWidth: 1)
            )
    }

    private func swatch(_ destination: WishlistDestination, size: CGFloat) -> some View {
        Image(systemName: destination.symbol)
            .font(.headline)
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(
                LinearGradient(
                    colors: destination.effectiveGradient,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.3), lineWidth: 1)
            )
    }

    private func statusBadge(_ status: WishlistStatus) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: status.icon)
            Text(status.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(status.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private func priorityRow(_ priority: WishlistPriority) -> some View {
        HStack(spacing: TravelSpacing.xs) {
            HStack(spacing: TravelSpacing.xxs) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(index < priority.level ? priority.accent : Color.secondary.opacity(0.25))
                        .frame(width: 6, height: 6)
                }
            }
            Text(priority.label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func header(titleFont: Font) -> some View {
        if title != nil || subtitle != nil {
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                    if let title {
                        Text(title).font(titleFont)
                    }
                    Spacer(minLength: 0)
                    Text(countLabel)
                        .font(TravelTypography.caption)
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

    private var countLabel: String {
        destinations.count == 1 ? "1 destination" : "\(destinations.count) destinations"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "map")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("Your wishlist is empty — start dreaming up your next adventure.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

#if DEBUG
struct ExplorerDestinationWishlist_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// A dreamer with a varied wishlist across every status and priority.
    private static let dreamer: [WishlistDestination] = [
        WishlistDestination(name: "Lofoten Islands", country: "Norway", status: .nextTrip, priority: .topPick, progress: 0.8, targetYear: "2025", symbol: "mountain.2.fill", gradient: [theme.ocean, theme.sky]),
        WishlistDestination(name: "Kyoto", country: "Japan", status: .booked, priority: .soon, progress: 0.6, targetYear: "2025", symbol: "leaf.fill", gradient: [theme.moss, theme.sky]),
        WishlistDestination(name: "Patagonia", country: "Argentina", status: .planned, priority: .topPick, progress: 0.45, targetYear: "2026", symbol: "figure.hiking", gradient: [theme.moss, theme.ocean]),
        WishlistDestination(name: "Santorini", country: "Greece", status: .dreaming, priority: .someday, progress: 0.15, symbol: "sun.max.fill", gradient: [theme.sun, theme.coral]),
        WishlistDestination(name: "Serengeti", country: "Tanzania", status: .dreaming, priority: .soon, progress: 0.25, targetYear: "2027", symbol: "pawprint.fill", gradient: [theme.sun, theme.moss])
    ]

    /// A planner whose trips are mostly locked in.
    private static let planner: [WishlistDestination] = [
        WishlistDestination(name: "Banff", country: "Canada", status: .booked, priority: .topPick, progress: 0.9, targetYear: "2025", symbol: "mountain.2.fill", gradient: [theme.ocean, theme.sky]),
        WishlistDestination(name: "Lisbon", country: "Portugal", status: .nextTrip, priority: .soon, progress: 0.7, targetYear: "2025", symbol: "building.2.fill", gradient: [theme.coral, theme.sun]),
        WishlistDestination(name: "Maldives", country: "Maldives", status: .planned, priority: .topPick, progress: 0.5, targetYear: "2026", symbol: "water.waves", gradient: [theme.sky, theme.ocean])
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Dreamer").font(TravelTypography.section)
                    ExplorerDestinationWishlist(
                        destinations: dreamer,
                        subtitle: "Places calling your name."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerDestinationWishlist(destinations: [], title: "Dream destinations")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Wishlist · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · Dreamer").font(TravelTypography.section)
                    ExplorerDestinationWishlist(
                        destinations: dreamer,
                        layout: .compact
                    )

                    Text("Compact · Planner").font(TravelTypography.section)
                    ExplorerDestinationWishlist(
                        destinations: planner,
                        layout: .compact,
                        title: "Upcoming adventures"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Wishlist · Compact")
        }
    }
}
#endif
