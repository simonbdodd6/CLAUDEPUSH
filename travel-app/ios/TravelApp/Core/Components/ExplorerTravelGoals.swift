import SwiftUI

// MARK: - Explorer travel goals (Phase 81)
//
// A reusable, presentation-only "life list" of long-term exploration goals — visit
// 50 countries, see every continent, dive with manta rays — each tracked with a
// progress bar, current/target counts, a completion percentage, an optional target
// year and a completed / in-progress status. It is the long-horizon companion to
// the short-term `TravelQuestCard`: ambitions measured in years, not seasons.
//
// It reuses the existing design system exclusively — `GlassCard`,
// `PremiumProgressBar`, `PremiumMetricTile`, `PremiumAdaptiveGrid` and the tokens
// (`TravelTheme`, `TravelSpacing`, `TravelRadius`, `TravelTypography`,
// `TravelMotion`). All values are caller-supplied mock data; the component holds
// no data, scoring, networking, persistence, view-model, navigation or MapKit
// usage, and is not wired into any screen. Animations are subtle appearance polish
// only (a staggered fade-and-rise; progress bars ease in on appear).

/// A single, presentation-only long-term travel goal.
struct TravelGoal: Identifiable {
    let id: String
    var title: String
    var icon: String
    var current: Int
    var target: Int
    var targetYear: String?
    var accent: Color

    /// `id` defaults to the title, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        title: String,
        icon: String,
        current: Int,
        target: Int,
        targetYear: String? = nil,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? title
        self.title = title
        self.icon = icon
        self.current = current
        self.target = target
        self.targetYear = targetYear
        self.accent = accent
    }

    var fraction: Double {
        guard target > 0 else { return 0 }
        return min(max(Double(current) / Double(target), 0), 1)
    }

    var percent: Int { Int((fraction * 100).rounded()) }
    var isComplete: Bool { target > 0 && current >= target }
    var clampedCurrent: Int { min(max(current, 0), target) }
    var statusLabel: String { isComplete ? "Completed" : "In progress" }

    var accessibilityText: String {
        var parts = [title, statusLabel, "\(clampedCurrent) of \(target)", "\(percent) percent"]
        if let targetYear { parts.append("target \(targetYear)") }
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerTravelGoals`.
enum TravelGoalsLayout {
    case compact
    case expanded
}

/// A premium, presentation-only long-term travel goals tracker.
struct ExplorerTravelGoals: View {
    var goals: [TravelGoal]
    var layout: TravelGoalsLayout = .expanded
    var title: String? = "Travel goals"
    var subtitle: String? = nil

    @State private var appeared = false

    // MARK: Derived

    private var completedCount: Int { goals.filter(\.isComplete).count }

    private var averagePercent: Int {
        guard !goals.isEmpty else { return 0 }
        let mean = goals.map(\.fraction).reduce(0, +) / Double(goals.count)
        return Int((mean * 100).rounded())
    }

    private func animatedFraction(_ value: Double) -> Double { appeared ? value : 0 }

    private var completedSummary: String {
        "\(completedCount) of \(goals.count) complete"
    }

    var body: some View {
        Group {
            if goals.isEmpty {
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

            PremiumAdaptiveGrid(minimumWidth: 104) {
                PremiumMetricTile(value: "\(completedCount)", label: "Completed")
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(completedCount) goals completed")
                PremiumMetricTile(value: "\(goals.count - completedCount)", label: "In progress")
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(goals.count - completedCount) goals in progress")
                PremiumMetricTile(value: "\(averagePercent)%", label: "Avg progress")
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(averagePercent) percent average progress")
            }

            VStack(spacing: TravelSpacing.md) {
                ForEach(Array(goals.enumerated()), id: \.element.id) { index, goal in
                    goalCard(goal)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                }
            }
        }
    }

    private func goalCard(_ goal: TravelGoal) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(goal.icon, accent: goal.accent, diameter: 46, font: TravelTypography.cardTitle)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(goal.title)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        if let targetYear = goal.targetYear {
                            Text("Target \(targetYear)")
                                .font(TravelTypography.eyebrow)
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                    statusBadge(goal)
                }

                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    PremiumProgressBar(
                        progress: animatedFraction(goal.fraction),
                        colors: barColors(goal),
                        height: TravelSpacing.sm
                    )
                    HStack {
                        Text("\(goal.clampedCurrent) / \(goal.target)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                        Spacer()
                        Text("\(goal.percent)%")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(goal.accessibilityText)
    }

    // MARK: Compact

    private var compact: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                    if let title {
                        Text(title).font(TravelTypography.cardTitle)
                    }
                    Spacer(minLength: 0)
                    Text(completedSummary)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: TravelSpacing.md) {
                    ForEach(Array(goals.enumerated()), id: \.element.id) { index, goal in
                        compactRow(goal)
                            .opacity(appeared ? 1 : 0)
                            .offset(y: appeared ? 0 : 8)
                            .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                    }
                }
            }
        }
    }

    private func compactRow(_ goal: TravelGoal) -> some View {
        HStack(spacing: TravelSpacing.md) {
            medallion(goal.icon, accent: goal.accent, diameter: 34, font: TravelTypography.caption)

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                HStack(spacing: TravelSpacing.xs) {
                    Text(goal.title)
                        .font(TravelTypography.cardTitle)
                        .lineLimit(1)
                    if goal.isComplete {
                        Image(systemName: "checkmark.seal.fill")
                            .font(TravelTypography.caption)
                            .foregroundStyle(TravelTheme.current.moss)
                    }
                    Spacer(minLength: 0)
                    Text("\(goal.percent)%")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                PremiumProgressBar(
                    progress: animatedFraction(goal.fraction),
                    colors: barColors(goal),
                    height: TravelSpacing.xxs
                )
                HStack(spacing: TravelSpacing.xs) {
                    Text("\(goal.clampedCurrent)/\(goal.target)")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                    if let targetYear = goal.targetYear {
                        Text("· by \(targetYear)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(goal.accessibilityText)
    }

    // MARK: Pieces

    private func medallion(_ icon: String, accent: Color, diameter: CGFloat, font: Font) -> some View {
        Image(systemName: icon)
            .font(font)
            .foregroundStyle(.white)
            .frame(width: diameter, height: diameter)
            .background(
                LinearGradient(
                    colors: [accent, accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1.5))
            .shadow(color: accent.opacity(0.3), radius: 8, y: 4)
    }

    private func statusBadge(_ goal: TravelGoal) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: goal.isComplete ? "checkmark.seal.fill" : "hourglass")
            Text(goal.statusLabel)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(goal.isComplete ? .white : .secondary)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(
            goal.isComplete ? AnyShapeStyle(TravelTheme.current.moss) : AnyShapeStyle(.thinMaterial),
            in: Capsule()
        )
    }

    private func barColors(_ goal: TravelGoal) -> [Color] {
        goal.isComplete
            ? [TravelTheme.current.moss, TravelTheme.current.sky]
            : [goal.accent, TravelTheme.current.sky]
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
                    Text(completedSummary)
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

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "flag.checkered")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No goals yet — set your first big travel ambition.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

#if DEBUG
struct ExplorerTravelGoals_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// The dashboard explorer's goals — kept consistent with the profile's
    /// 24 countries, 5 continents and 11 UNESCO sites.
    private static let explorerGoals: [TravelGoal] = [
        TravelGoal(title: "Visit 50 countries", icon: "globe.europe.africa.fill", current: 24, target: 50, targetYear: "2030", accent: theme.ocean),
        TravelGoal(title: "Visit every continent", icon: "globe.americas.fill", current: 5, target: 7, accent: theme.coral),
        TravelGoal(title: "Dive with manta rays", icon: "water.waves", current: 1, target: 1, targetYear: "2024", accent: theme.sky),
        TravelGoal(title: "Surf 100 waves", icon: "figure.surfing", current: 8, target: 100, accent: theme.tint),
        TravelGoal(title: "Visit 25 UNESCO sites", icon: "building.columns.fill", current: 11, target: 25, targetYear: "2032", accent: theme.sun)
    ]

    /// A brand-new traveller, just setting ambitions.
    private static let beginnerGoals: [TravelGoal] = [
        TravelGoal(title: "Visit 50 countries", icon: "globe.europe.africa.fill", current: 3, target: 50, targetYear: "2035", accent: theme.ocean),
        TravelGoal(title: "Visit every continent", icon: "globe.americas.fill", current: 1, target: 7, accent: theme.coral),
        TravelGoal(title: "Surf 100 waves", icon: "figure.surfing", current: 0, target: 100, accent: theme.tint)
    ]

    /// A near-complete bucket-list achiever.
    private static let achieverGoals: [TravelGoal] = [
        TravelGoal(title: "Visit 50 countries", icon: "globe.europe.africa.fill", current: 50, target: 50, targetYear: "2024", accent: theme.ocean),
        TravelGoal(title: "Visit every continent", icon: "globe.americas.fill", current: 7, target: 7, targetYear: "2023", accent: theme.coral),
        TravelGoal(title: "Dive with manta rays", icon: "water.waves", current: 1, target: 1, targetYear: "2022", accent: theme.sky),
        TravelGoal(title: "Visit 25 UNESCO sites", icon: "building.columns.fill", current: 22, target: 25, targetYear: "2025", accent: theme.sun)
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Explorer").font(TravelTypography.section)
                    ExplorerTravelGoals(
                        goals: explorerGoals,
                        subtitle: "The big ambitions you're working toward."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerTravelGoals(goals: [], title: "Travel goals")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Travel goals · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · Beginner").font(TravelTypography.section)
                    ExplorerTravelGoals(
                        goals: beginnerGoals,
                        layout: .compact,
                        title: "Travel goals"
                    )

                    Text("Compact · Achiever").font(TravelTypography.section)
                    ExplorerTravelGoals(
                        goals: achieverGoals,
                        layout: .compact,
                        title: "Life list"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Travel goals · Compact")
        }
    }
}
#endif
