import SwiftUI

// MARK: - Travel journey dashboard (Phase 138)
//
// A flagship, presentation-only Journey dashboard giving an end-to-end view of a trip
// from leaving home until returning: a hero with departure countdown, the current
// journey stage and overall progress, journey statistics, a departure-checklist
// summary, flight / airport-transfer / ferry / accommodation / activities / transport
// timelines, budget / document / offline / health & safety readiness, weather /
// connectivity / currency summaries, an emergency-contacts shortcut, upcoming
// reminders, timeline milestones, today's agenda, a next-destination preview, a journey
// map placeholder and a continue-journey button. A caller supplies a `JourneyPlan`
// value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumMetricTile`, `PremiumProgressBar`, `PremiumTimelineConnector`,
// `PremiumAdaptiveGrid`, `MapTexturePlaceholder`, `TravelTypography` and the tokens.
// The `Journey*` model names are deliberately distinct from earlier phases to avoid any
// collision. `JourneyPlan` and its nested rows are lightweight presentation models (not
// DTOs); the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The
// favourite stars and continue button are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with favourite buttons kept
// independently focusable; text uses the Dynamic Type-scaling `TravelTypography` styles
// and wraps rather than truncating; and all motion is disabled under Reduce Motion.

/// A journey segment / milestone status — drives the status badge label and accent.
enum JourneyStatus {
    case done
    case active
    case upcoming

    var label: String {
        switch self {
        case .done: "Done"
        case .active: "Now"
        case .upcoming: "Upcoming"
        }
    }

    var icon: String {
        switch self {
        case .done: "checkmark.circle.fill"
        case .active: "location.fill"
        case .upcoming: "circle.dashed"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .done: return theme.moss
        case .active: return theme.sun
        case .upcoming: return theme.ocean
        }
    }
}

/// A single at-a-glance journey statistic.
struct JourneyStat: Identifiable {
    let id = UUID()
    var value: String
    var label: String
}

/// A generic at-a-glance journey fact.
struct JourneyFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single timeline segment (flight, ferry, stay, activity, transfer).
struct JourneySegment: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var status: JourneyStatus
    var accent: Color

    init(title: String, subtitle: String? = nil, icon: String, detail: String, status: JourneyStatus, accent: Color) {
        self.id = "\(title)-\(subtitle ?? "")"
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.status = status
        self.accent = accent
    }
}

/// A timeline milestone.
struct JourneyMilestone: Identifiable {
    let id = UUID()
    var title: String
    var when: String
    var detail: String
    var status: JourneyStatus
}

/// A generic journey row reused for reminders, agenda and summaries.
struct JourneyRow: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
}

/// A readiness line for the readiness card.
struct JourneyReadiness: Identifiable {
    let id = UUID()
    var label: String
    var value: Double
    var accent: Color
}

/// The full, presentation-only content for the journey dashboard.
struct JourneyPlan {
    var title: String
    var subtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var dayOfTrip: Int
    var totalDays: Int
    var daysToReturn: Int
    var progress: Double
    var stages: [String]
    var currentStageIndex: Int
    var stats: [JourneyStat]
    var checklistDone: Int
    var checklistTotal: Int
    var checklistItems: [String]
    var flights: [JourneySegment]
    var transfers: [JourneySegment]
    var ferries: [JourneySegment]
    var accommodation: [JourneySegment]
    var activities: [JourneySegment]
    var transport: [JourneySegment]
    var readiness: [JourneyReadiness]
    var summaries: [JourneyFact]
    var todayAgenda: [JourneyRow]
    var reminders: [JourneyRow]
    var milestones: [JourneyMilestone]
    var nextDestination: JourneyRow
    var disclaimer: String
}

/// A premium, presentation-only journey dashboard rendered from a `JourneyPlan`.
struct TravelJourneyDashboard: View {
    var plan: JourneyPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            hero
            statusGroup
            readinessGroup
            timelinesGroup
            todayGroup
            footerGroup
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Hero

    private var hero: some View {
        FeatureHeroScaffold(
            eyebrow: "Journey",
            symbol: plan.heroSymbol,
            title: plan.title,
            subtitle: plan.subtitle,
            gradient: plan.heroGradient,
            metrics: [
                HeroMetric(value: "Day \(plan.dayOfTrip)/\(plan.totalDays)", label: "Journey"),
                HeroMetric(value: "\(percent(plan.progress))%", label: "Complete"),
                HeroMetric(value: "\(plan.daysToReturn)d", label: "To home")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(JourneyAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var statusGroup: some View {
        Group {
            section("Where you are", "Your current stage.", 1) {
                stageCard
            }

            section("Journey stats", "The trip in numbers.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(plan.stats) { stat in
                        PremiumMetricTile(value: stat.value, label: stat.label)
                    }
                }
            }

            section("Departure checklist", "Before you left.", 3) {
                checklistCard
            }
        }
    }

    private var readinessGroup: some View {
        Group {
            section("Readiness", "How prepared you are.", 4) {
                readinessCard
            }

            section("Conditions", "Weather, data and money.", 5) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(plan.summaries) { summary in
                        summaryTile(summary)
                    }
                }
            }
        }
    }

    private var timelinesGroup: some View {
        Group {
            section("Flights", "In the air.", 6) {
                segmentList(plan.flights)
            }

            section("Airport transfers", "To and from terminals.", 7) {
                segmentList(plan.transfers)
            }

            section("Ferries", "Between the islands.", 8) {
                segmentList(plan.ferries)
            }

            section("Accommodation", "Where you sleep.", 8) {
                segmentList(plan.accommodation)
            }

            section("Activities", "Dives, surf and more.", 8) {
                segmentList(plan.activities)
            }

            section("Transport", "Getting around.", 8) {
                segmentList(plan.transport)
            }
        }
    }

    private var todayGroup: some View {
        Group {
            section("Today", "What’s on now.", 8) {
                infoList(plan.todayAgenda)
            }

            section("Reminders", "Don’t forget.", 8) {
                infoList(plan.reminders)
            }

            section("Milestones", "The big moments.", 8) {
                milestonesCard
            }

            section("Next destination", "Coming up.", 8) {
                infoList([plan.nextDestination])
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Emergency", "Quick access.", 8) {
                emergencyShortcut
            }

            section("Journey map", "The whole route.", 8) {
                mapPlaceholder
            }

            section("Keep going", "Pick up the journey.", 8) {
                continueCard
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(JourneyAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Stage card

    private var stageCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text(currentStageName)
                    .font(TravelTypography.display)
                    .foregroundStyle(theme.tint)
                    .fixedSize(horizontal: false, vertical: true)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(Array(plan.stages.enumerated()), id: \.offset) { index, stage in
                            stagePill(index, stage)
                        }
                    }
                }
                PremiumProgressBar(progress: appeared ? plan.progress : 0, colors: [theme.tint, theme.sky], height: TravelSpacing.sm)
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("\(percent(plan.progress))% complete · home in \(plan.daysToReturn) days.")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Current stage \(currentStageName). \(percent(plan.progress)) percent complete, home in \(plan.daysToReturn) days.")
    }

    private var currentStageName: String {
        guard plan.stages.indices.contains(plan.currentStageIndex) else { return plan.stages.first ?? "" }
        return plan.stages[plan.currentStageIndex]
    }

    private func stagePill(_ index: Int, _ stage: String) -> some View {
        let isCurrent = index == plan.currentStageIndex
        let isPast = index < plan.currentStageIndex
        let tint = isCurrent ? theme.tint : (isPast ? theme.moss : Color.secondary)
        return HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: isPast ? "checkmark.circle.fill" : (isCurrent ? "location.fill" : "circle"))
            Text(stage)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(isCurrent ? .white : tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(isCurrent ? AnyShapeStyle(theme.tint) : AnyShapeStyle(tint.opacity(0.15)), in: Capsule())
    }

    // MARK: Checklist summary

    private var checklistCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(plan.checklistDone) of \(plan.checklistTotal) done")
                        .font(TravelTypography.cardTitle)
                    Spacer(minLength: 0)
                    Text("\(percent(checklistFraction))%")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(theme.tint)
                }
                PremiumProgressBar(progress: appeared ? checklistFraction : 0, colors: [theme.tint, theme.moss])
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    ForEach(Array(plan.checklistItems.enumerated()), id: \.offset) { index, item in
                        HStack(spacing: TravelSpacing.xs) {
                            Image(systemName: index < plan.checklistDone ? "checkmark.circle.fill" : "circle")
                                .font(TravelTypography.caption)
                                .foregroundStyle(index < plan.checklistDone ? theme.moss : Color.secondary)
                            Text(item)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Departure checklist, \(plan.checklistDone) of \(plan.checklistTotal) done.")
    }

    private var checklistFraction: Double {
        guard plan.checklistTotal > 0 else { return 0 }
        return Double(plan.checklistDone) / Double(plan.checklistTotal)
    }

    // MARK: Readiness card

    private var readinessCard: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(plan.readiness) { line in
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack {
                            Text(line.label)
                                .font(TravelTypography.caption)
                            Spacer(minLength: 0)
                            Text("\(percent(line.value))%")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                        PremiumProgressBar(progress: appeared ? line.value : 0, colors: [line.accent, line.accent.opacity(0.6)])
                            .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(line.label) \(percent(line.value)) percent.")
                }
            }
        }
    }

    private func summaryTile(_ summary: JourneyFact) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                Image(systemName: summary.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                Text(summary.value)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(summary.label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(summary.label): \(summary.value)")
    }

    // MARK: Segment list

    private func segmentList(_ segments: [JourneySegment]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(segments) { segment in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(segment.icon, segment.accent)
                            .opacity(segment.status == .done ? 0.6 : 1)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack(spacing: TravelSpacing.xs) {
                                Text(segment.title)
                                    .font(TravelTypography.cardTitle)
                                    .fixedSize(horizontal: false, vertical: true)
                                statusBadge(segment.status)
                            }
                            if let subtitle = segment.subtitle {
                                Text(subtitle)
                                    .font(TravelTypography.eyebrow)
                                    .textCase(.uppercase)
                                    .foregroundStyle(.secondary)
                            }
                            Text(segment.detail)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(segment.title), \(segment.status.label)\(segment.subtitle.map { ", \($0)" } ?? ""). \(segment.detail)")
            }
        }
    }

    private func statusBadge(_ status: JourneyStatus) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: status.icon)
            Text(status.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(status.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(status.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Milestones

    private var milestonesCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(plan.milestones.enumerated()), id: \.element.id) { index, milestone in
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    PremiumTimelineConnector(accent: milestone.status.accent, showsLine: index < plan.milestones.count - 1)
                    GlassCard {
                        HStack(alignment: .top, spacing: TravelSpacing.md) {
                            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                                HStack(spacing: TravelSpacing.xs) {
                                    Text(milestone.title)
                                        .font(TravelTypography.cardTitle)
                                        .fixedSize(horizontal: false, vertical: true)
                                    statusBadge(milestone.status)
                                }
                                Text(milestone.when)
                                    .font(TravelTypography.eyebrow)
                                    .textCase(.uppercase)
                                    .foregroundStyle(.secondary)
                                Text(milestone.detail)
                                    .font(TravelTypography.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                            favouriteButton("ms-\(milestone.title)", milestone.title)
                        }
                    }
                    .padding(.bottom, index < plan.milestones.count - 1 ? TravelSpacing.md : 0)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(milestone.title), \(milestone.status.label), \(milestone.when). \(milestone.detail)")
            }
        }
    }

    // MARK: Emergency / map / continue

    private var emergencyShortcut: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "cross.case.fill")
                    .font(TravelTypography.title)
                    .foregroundStyle(theme.coral)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Emergency contacts")
                        .font(TravelTypography.cardTitle)
                    Text("112 · BIMC Bali · insurer & DAN — saved offline.")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
            }
            .padding(TravelSpacing.md)
            .frame(maxWidth: .infinity)
            .background(theme.coral.opacity(0.1), in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Emergency contacts shortcut. Placeholder.")
    }

    private var mapPlaceholder: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                MapTexturePlaceholder()
                    .frame(height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                Label("Journey map coming soon", systemImage: "map.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Journey map. Placeholder.")
    }

    private var continueCard: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(TravelTypography.title)
                    .foregroundStyle(.white)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Continue your journey")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.white)
                    Text("Day \(plan.dayOfTrip) of \(plan.totalDays) — \(plan.daysToReturn) days to home.")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(TravelSpacing.md)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .leading, endPoint: .trailing),
                in: RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Continue your journey. Placeholder button.")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [JourneyRow]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(rows) { row in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(row.icon, row.accent)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(row.title)
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
                            if let subtitle = row.subtitle {
                                Text(subtitle)
                                    .font(TravelTypography.eyebrow)
                                    .textCase(.uppercase)
                                    .foregroundStyle(.secondary)
                            }
                            Text(row.detail)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Shared bits

    private func percent(_ value: Double) -> Int { Int((value * 100).rounded()) }

    private func favouriteButton(_ id: String, _ name: String) -> some View {
        let isFav = favourites.contains(id)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isFav { favourites.remove(id) } else { favourites.insert(id) }
            }
        } label: {
            Image(systemName: isFav ? "star.fill" : "star")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(isFav ? theme.sun : Color.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isFav ? "Saved milestone: \(name)" : "Save milestone \(name)")
    }

    private func medallion(_ glyph: String, _ accent: Color) -> some View {
        Image(systemName: glyph)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(
                LinearGradient(colors: [accent, accent.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: accent.opacity(0.3), radius: 8, y: 4)
            .accessibilityHidden(true)
    }
}

// MARK: - Journey appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct JourneyAppear: ViewModifier {
    let appeared: Bool
    let reduceMotion: Bool
    let index: Int

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 10)
            .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
    }
}

#if DEBUG
extension JourneyPlan {
    /// A deterministic sample journey, mid-trip across Indonesia (day 6 of 14).
    static var sampleIndonesia: JourneyPlan {
        let theme = TravelTheme.current
        return JourneyPlan(
            title: "Your Journey",
            subtitle: "From home to home — Bali, the Nusas, the Gilis, Lombok and Komodo.",
            heroSymbol: "figure.walk.motion",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            dayOfTrip: 6,
            totalDays: 14,
            daysToReturn: 8,
            progress: 0.43,
            stages: ["Prep", "Departure", "Islands", "Komodo", "Home"],
            currentStageIndex: 2,
            stats: [
                JourneyStat(value: "14", label: "Days"),
                JourneyStat(value: "5", label: "Islands"),
                JourneyStat(value: "3", label: "Flights"),
                JourneyStat(value: "8", label: "Dives")
            ],
            checklistDone: 8,
            checklistTotal: 10,
            checklistItems: ["Passport & e-VOA", "Insurance saved", "Cash drawn", "Bags packed", "eSIM bought"],
            flights: [
                JourneySegment(title: "London → Denpasar", subtitle: "Day 1 · done", icon: "airplane", detail: "Arrived late evening; transfer waiting.", status: .done, accent: theme.sky),
                JourneySegment(title: "Lombok → Labuan Bajo", subtitle: "Day 10", icon: "airplane", detail: "Short hop to the Komodo gateway.", status: .upcoming, accent: theme.coral)
            ],
            transfers: [
                JourneySegment(title: "Airport → Sanur", subtitle: "Day 1 · done", icon: "car.fill", detail: "Pre-booked private transfer.", status: .done, accent: theme.moss),
                JourneySegment(title: "Bangsal → Kuta Lombok", subtitle: "Day 7", icon: "car.fill", detail: "Driver pickup at the harbour.", status: .upcoming, accent: theme.ocean)
            ],
            ferries: [
                JourneySegment(title: "Sanur → Lembongan", subtitle: "Day 2 · done", icon: "ferry.fill", detail: "Calm morning crossing.", status: .done, accent: theme.sky),
                JourneySegment(title: "Lembongan → Gili Air", subtitle: "Day 4 · done", icon: "ferry.fill", detail: "Direct boat across.", status: .done, accent: theme.ocean),
                JourneySegment(title: "Gili Air → Bangsal", subtitle: "Day 7", icon: "ferry.fill", detail: "Reconfirm and pay — currently unpaid.", status: .upcoming, accent: theme.sun)
            ],
            accommodation: [
                JourneySegment(title: "Sanur hotel", subtitle: "Day 1 · done", icon: "bed.double.fill", detail: "One night to recover from the flight.", status: .done, accent: theme.tint),
                JourneySegment(title: "Gili Air bungalow", subtitle: "Days 4–6 · now", icon: "house.fill", detail: "Beachfront bungalow by the dive centre.", status: .active, accent: theme.sun),
                JourneySegment(title: "Kuta Lombok", subtitle: "Days 7–8", icon: "bed.double.fill", detail: "Surf base before the Komodo flight.", status: .upcoming, accent: theme.ocean)
            ],
            activities: [
                JourneySegment(title: "Dive Manta Point", subtitle: "Day 3 · done", icon: "water.waves", detail: "Reef mantas at the cleaning station.", status: .done, accent: theme.ocean),
                JourneySegment(title: "Snorkel with turtles", subtitle: "Today", icon: "tortoise.fill", detail: "Gili Meno turtle point this morning.", status: .active, accent: theme.moss),
                JourneySegment(title: "Surf Desert Point", subtitle: "Day 8", icon: "figure.surfing", detail: "World-class left when it’s working.", status: .upcoming, accent: theme.sky)
            ],
            transport: [
                JourneySegment(title: "Scooter on Gili Air", subtitle: "Now", icon: "bicycle", detail: "No cars — cycle or walk the island.", status: .active, accent: theme.moss),
                JourneySegment(title: "Private driver, Lombok", subtitle: "Day 7", icon: "steeringwheel", detail: "Day hire for the south coast.", status: .upcoming, accent: theme.tint)
            ],
            readiness: [
                JourneyReadiness(label: "Budget", value: 0.7, accent: theme.sun),
                JourneyReadiness(label: "Documents", value: 0.9, accent: theme.tint),
                JourneyReadiness(label: "Offline", value: 0.75, accent: theme.ocean),
                JourneyReadiness(label: "Health & safety", value: 0.85, accent: theme.moss)
            ],
            summaries: [
                JourneyFact(icon: "cloud.sun.fill", label: "Weather", value: "Sunny 29°C"),
                JourneyFact(icon: "wifi", label: "Connectivity", value: "4G on the Gilis"),
                JourneyFact(icon: "banknote.fill", label: "Currency", value: "£1≈Rp20.4k")
            ],
            todayAgenda: [
                JourneyRow(title: "Snorkel Gili Meno", subtitle: "10:00", icon: "tortoise.fill", detail: "Almost-guaranteed turtles at the turtle point.", accent: theme.moss),
                JourneyRow(title: "Check in for tomorrow’s boat", subtitle: "18:00", icon: "checkmark.circle.fill", detail: "Reconfirm the 09:00 fast boat to Lombok.", accent: theme.tint)
            ],
            reminders: [
                JourneyRow(title: "Pay the Komodo dive balance", subtitle: "Before Day 9", icon: "banknote.fill", detail: "Settle the liveaboard balance soon.", accent: theme.coral),
                JourneyRow(title: "Confirm the 09:00 fast boat", subtitle: "Tomorrow", icon: "ferry.fill", detail: "Gili Air to Bangsal — currently unpaid.", accent: theme.sun),
                JourneyRow(title: "Clocks go +1h at Komodo", subtitle: "Day 10", icon: "clock.fill", detail: "WITA — adjust alarms and pickups.", accent: theme.ocean)
            ],
            milestones: [
                JourneyMilestone(title: "Arrived in Bali", when: "Day 1", detail: "The journey began in Sanur.", status: .done),
                JourneyMilestone(title: "Reached the Gilis", when: "Day 4 · now", detail: "Diving, turtles and island calm.", status: .active),
                JourneyMilestone(title: "Komodo dragons", when: "Day 10", detail: "Padar, dragons and big-fish dives.", status: .upcoming),
                JourneyMilestone(title: "Journey home", when: "Day 14", detail: "Fly home via Denpasar.", status: .upcoming)
            ],
            nextDestination: JourneyRow(title: "Lombok next", subtitle: "Day 7", icon: "mountain.2.fill", detail: "Surf, Kuta Lombok and the gateway to Komodo.", accent: theme.sun),
            disclaimer: "This journey view aggregates illustrative sample data for one trip. It is a presentation overview only — confirm every booking, time and detail with the relevant provider as you travel."
        )
    }
}

struct TravelJourneyDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelJourneyDashboard(plan: .sampleIndonesia)
                .previewDisplayName("Journey · Indonesia")

            TravelJourneyDashboard(plan: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Journey · Dynamic Type XL")
        }
    }
}
#endif
