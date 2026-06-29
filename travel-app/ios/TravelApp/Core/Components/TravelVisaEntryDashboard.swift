import SwiftUI

// MARK: - Travel visa & entry dashboard (Phase 119)
//
// A flagship, presentation-only Visa & Entry Requirements dashboard: a country hero
// with at-a-glance visa facts (type, maximum stay, cost, validity), an overall
// requirement status card, a filterable visa-options comparison (visa-on-arrival vs
// e-VOA vs visa-free), an entry-requirements checklist (passport validity, blank
// pages, return/onward ticket, proof of funds), a required-documents list, a
// step-by-step arrival process, extension options, health & vaccination notes, customs
// allowances, prohibited items, departure/exit requirements, embassy & consulate
// contacts, currency and SIM/connectivity quick facts and a disclaimer placeholder. A
// caller supplies a `VisaEntryGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. `VisaEntryGuide` and its
// nested rows are lightweight presentation models (not DTOs); the component holds no
// data, networking, persistence, repository, view-model, navigation, AppContainer or
// DTO logic, and is not wired into any screen. The category filters and favourite
// stars are UI-only, and all entry information is illustrative only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// Whether a visa is required, available on arrival, or not required — drives the
/// status badge glyph and accent.
enum VisaRequirement {
    case notRequired
    case onArrival
    case required

    var label: String {
        switch self {
        case .notRequired: "Not required"
        case .onArrival: "On arrival"
        case .required: "Required"
        }
    }

    var icon: String {
        switch self {
        case .notRequired: "checkmark.seal.fill"
        case .onArrival: "airplane.arrival"
        case .required: "doc.text.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .notRequired: return theme.moss
        case .onArrival: return theme.sun
        case .required: return theme.coral
        }
    }
}

/// A single at-a-glance visa or quick fact (icon, label and value).
struct VisaFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single visa option in the comparison.
struct VisaOption: Identifiable {
    let id: String
    var name: String
    var requirement: VisaRequirement
    var maxStay: String
    var cost: String
    var validity: String
    var categories: [String]
    var extendable: Bool
    var detail: String

    init(id: String? = nil, name: String, requirement: VisaRequirement, maxStay: String, cost: String, validity: String, categories: [String], extendable: Bool, detail: String) {
        self.id = id ?? name
        self.name = name
        self.requirement = requirement
        self.maxStay = maxStay
        self.cost = cost
        self.validity = validity
        self.categories = categories
        self.extendable = extendable
        self.detail = detail
    }
}

/// A single entry-requirements / pre-trip checklist item.
struct VisaCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var met: Bool
    var note: String
}

/// A numbered arrival-process step.
struct VisaArrivalStep: Identifiable {
    let id = UUID()
    var step: Int
    var title: String
    var detail: String
}

/// A generic guide row reused for documents, customs, extensions, departure,
/// embassy contacts and connectivity.
struct VisaInfoRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// The full, presentation-only content for a visa & entry guide.
struct VisaEntryGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var overallRequirement: VisaRequirement
    var requirementSummary: String
    var facts: [VisaFact]
    var visaOptions: [VisaOption]
    var checklist: [VisaCheckItem]
    var documents: [VisaInfoRow]
    var arrivalSteps: [VisaArrivalStep]
    var extensionOptions: [VisaInfoRow]
    var healthNotes: [String]
    var customsAllowances: [VisaInfoRow]
    var prohibitedItems: [String]
    var departureRequirements: [VisaInfoRow]
    var embassyContacts: [VisaInfoRow]
    var quickFacts: [VisaFact]
    var disclaimer: String
}

/// A premium, presentation-only visa & entry dashboard rendered from a `VisaEntryGuide`.
struct TravelVisaEntryDashboard: View {
    var guide: VisaEntryGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedCategory = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let categories = ["All", "Tourist", "Business", "Transit"]

    private var filteredOptions: [VisaOption] {
        guard selectedCategory != "All" else { return guide.visaOptions }
        return guide.visaOptions.filter { $0.categories.contains(selectedCategory) }
    }

    var body: some View {
        PremiumScrollView {
            hero
            statusGroup
            visaGroup
            requirementsGroup
            practicalGroup
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
            eyebrow: "Visa & Entry",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Max stay"), label: "Max stay"),
                HeroMetric(value: factValue("Cost"), label: "Cost"),
                HeroMetric(value: factValue("Validity"), label: "Validity")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(VisaEntryAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var statusGroup: some View {
        Group {
            section("Status", "Do you need a visa?", 1) {
                requirementCard
            }

            section("At a glance", "The key visa facts.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }
        }
    }

    private var visaGroup: some View {
        Group {
            section("Visa options", "Compare by trip purpose.", 3) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    categoryFilter
                    if filteredOptions.isEmpty {
                        GlassCard {
                            Text("No \(selectedCategory.lowercased()) options listed.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredOptions) { option in
                                optionCard(option)
                            }
                        }
                    }
                }
            }
        }
    }

    private var requirementsGroup: some View {
        Group {
            section("Entry checklist", "Have these ready on arrival.", 4) {
                checklistCard
            }

            section("Required documents", "Bring or have to hand.", 5) {
                infoList(guide.documents)
            }

            section("Arrival process", "Step by step at the airport.", 6) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.arrivalSteps) { step in
                        stepCard(step)
                    }
                }
            }

            section("Extensions", "Staying longer.", 7) {
                infoList(guide.extensionOptions)
            }
        }
    }

    private var practicalGroup: some View {
        Group {
            section("Health & vaccinations", "Before you fly.", 8) {
                bulletCard(guide.healthNotes, icon: "cross.case.fill", tint: theme.coral)
            }

            section("Customs allowances", "What you may bring in.", 8) {
                infoList(guide.customsAllowances)
            }

            section("Prohibited items", "Leave these at home.", 8) {
                bulletCard(guide.prohibitedItems, icon: "xmark.octagon.fill", tint: theme.coral)
            }

            section("Departure & exit", "Leaving the country.", 8) {
                infoList(guide.departureRequirements)
            }

            section("Embassy & consulate", "If you need help.", 8) {
                infoList(guide.embassyContacts)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Quick facts", "Currency, SIM & connectivity.", 8) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.quickFacts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Before you go", "Always double-check.", 8) {
                disclaimerCard
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(VisaEntryAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Requirement card

    private var requirementCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                requirementBadge(guide.overallRequirement)
                Text(guide.requirementSummary)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Visa status: \(guide.overallRequirement.label). \(guide.requirementSummary)")
    }

    private func requirementBadge(_ requirement: VisaRequirement) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: requirement.icon)
            Text(requirement.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(requirement.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    // MARK: At-a-glance / quick facts

    private func factTile(_ fact: VisaFact) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                Image(systemName: fact.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                Text(fact.value)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(fact.label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(fact.label): \(fact.value)")
    }

    // MARK: Category filter

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(categories, id: \.self) { category in
                    filterChip(category)
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    private func filterChip(_ category: String) -> some View {
        let selected = category == selectedCategory
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedCategory = category }
        } label: {
            Text(category)
                .font(TravelTypography.caption)
                .foregroundStyle(selected ? .white : .secondary)
                .padding(.horizontal, TravelSpacing.md)
                .padding(.vertical, TravelSpacing.xs)
                .background(
                    selected ? AnyShapeStyle(theme.tint) : AnyShapeStyle(.thinMaterial),
                    in: Capsule()
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(category) filter")
        .accessibilityValue(selected ? "Selected" : "Not selected")
    }

    // MARK: Visa option cards

    private func optionCard(_ option: VisaOption) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(option.requirement.icon, option.requirement.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        requirementBadge(option.requirement)
                        Text(option.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(option.categories.joined(separator: " · "))
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(option.id, option.name)
                }

                PremiumAdaptiveGrid(minimumWidth: 104) {
                    optionMetric("clock.fill", option.maxStay, "Max stay")
                    optionMetric("banknote.fill", option.cost, "Cost")
                    optionMetric("calendar", option.validity, "Validity")
                    optionMetric("arrow.clockwise", option.extendable ? "Yes" : "No", "Extendable")
                }

                Text(option.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(option.name), \(option.requirement.label), max stay \(option.maxStay), cost \(option.cost), validity \(option.validity), \(option.extendable ? "extendable" : "not extendable"). \(option.detail)")
    }

    private func optionMetric(_ icon: String, _ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Label(value, systemImage: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(.primary)
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }

    // MARK: Checklist

    private var checklistCard: some View {
        GlassCard {
            VStack(spacing: TravelSpacing.xs) {
                ForEach(guide.checklist) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.sm) {
                        Image(systemName: item.met ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(item.met ? theme.moss : theme.sun)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(item.name)
                                .font(TravelTypography.caption)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(item.note)
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.name), \(item.met ? "met" : "check this"). \(item.note)")
                }
            }
        }
    }

    // MARK: Arrival steps

    private func stepCard(_ step: VisaArrivalStep) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion("\(step.step)", theme.tint, isText: true)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(step.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(step.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step \(step.step), \(step.title). \(step.detail)")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [VisaInfoRow]) -> some View {
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
                        favouriteButton(row.id, row.title)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Disclaimer

    private var disclaimerCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "info.circle.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Check official sources before travel")
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(guide.disclaimer)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Check official sources before travel. \(guide.disclaimer)")
    }

    // MARK: Shared bits

    private func bulletCard(_ points: [String], icon: String, tint: Color) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                ForEach(points, id: \.self) { point in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: icon)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tint)
                        Text(point)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

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
        .accessibilityLabel(isFav ? "Saved note: \(name)" : "Save note \(name)")
    }

    private func medallion(_ glyph: String, _ accent: Color, isText: Bool = false) -> some View {
        Group {
            if isText {
                Text(glyph).font(TravelTypography.cardTitle)
            } else {
                Image(systemName: glyph).font(TravelTypography.cardTitle)
            }
        }
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

// MARK: - Visa & entry appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct VisaEntryAppear: ViewModifier {
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
extension VisaEntryGuide {
    /// A deterministic sample guide for Indonesia entry (illustrative only).
    static var sampleIndonesia: VisaEntryGuide {
        let theme = TravelTheme.current
        return VisaEntryGuide(
            heroTitle: "Indonesia · Entry",
            heroSubtitle: "Most tourists enter on a 30-day Visa on Arrival (B1) or its online e-VOA — extendable once.",
            heroSymbol: "doc.text.fill",
            heroGradient: [theme.coral, theme.sun, theme.tint],
            overallRequirement: .onArrival,
            requirementSummary: "Visa on Arrival available to most nationalities for tourism — buy at the airport or online as an e-VOA before you fly.",
            facts: [
                VisaFact(icon: "doc.text.fill", label: "Visa type", value: "B1 / VoA"),
                VisaFact(icon: "clock.fill", label: "Max stay", value: "30 days"),
                VisaFact(icon: "banknote.fill", label: "Cost", value: "IDR 500k (≈£25)"),
                VisaFact(icon: "calendar", label: "Validity", value: "Single entry")
            ],
            visaOptions: [
                VisaOption(name: "Visa on Arrival (B1)", requirement: .onArrival, maxStay: "30 days", cost: "IDR 500k", validity: "Single entry", categories: ["Tourist", "Business"], extendable: true, detail: "Buy at the VoA counter on arrival at major airports; extend once for another 30 days at an immigration office."),
                VisaOption(name: "e-VOA (online B1)", requirement: .onArrival, maxStay: "30 days", cost: "IDR 500k", validity: "Single entry", categories: ["Tourist", "Business"], extendable: true, detail: "Apply on the official molina portal before departure; scan the QR at the e-VOA autogate to skip the payment queue."),
                VisaOption(name: "ASEAN visa-free", requirement: .notRequired, maxStay: "30 days", cost: "Free", validity: "Single entry", categories: ["Tourist", "Transit"], extendable: false, detail: "Citizens of most ASEAN countries enter visa-free for tourism; the stay is not extendable."),
                VisaOption(name: "B211A visit visa", requirement: .required, maxStay: "60 days", cost: "From IDR 2m", validity: "Single entry", categories: ["Business"], extendable: true, detail: "Apply ahead through a sponsor for longer business or social visits; extendable up to 180 days.")
            ],
            checklist: [
                VisaCheckItem(name: "Passport valid 6+ months", met: true, note: "Beyond your intended departure date"),
                VisaCheckItem(name: "Two blank passport pages", met: true, note: "For stamps on entry and exit"),
                VisaCheckItem(name: "Return / onward ticket", met: false, note: "Proof of onward travel may be checked"),
                VisaCheckItem(name: "Proof of funds", met: false, note: "Sufficient funds for your stay if asked")
            ],
            documents: [
                VisaInfoRow(title: "Passport", subtitle: "Required", icon: "person.text.rectangle.fill", detail: "Machine-readable, valid at least six months with blank pages.", accent: theme.tint),
                VisaInfoRow(title: "e-VOA / VoA receipt", subtitle: "Required", icon: "qrcode", detail: "Printed or on your phone — the QR is scanned at the autogate.", accent: theme.sun),
                VisaInfoRow(title: "Onward ticket", subtitle: "Recommended", icon: "airplane", detail: "Confirmed flight out of Indonesia within the permitted stay.", accent: theme.ocean),
                VisaInfoRow(title: "Customs declaration (e-CD)", subtitle: "Required", icon: "doc.badge.gearshape.fill", detail: "Complete the electronic Customs Declaration QR within 3 days of arrival.", accent: theme.coral)
            ],
            arrivalSteps: [
                VisaArrivalStep(step: 1, title: "e-VOA / VoA", detail: "Have your e-VOA QR ready, or pay at the VoA counter if buying on arrival."),
                VisaArrivalStep(step: 2, title: "Immigration", detail: "Use the autogate with your e-VOA, or queue at the immigration counter for a stamp."),
                VisaArrivalStep(step: 3, title: "Baggage claim", detail: "Collect your luggage; keep your passport and boarding pass handy."),
                VisaArrivalStep(step: 4, title: "e-Customs", detail: "Show your e-CD customs QR at the scanner on the way out of the hall.")
            ],
            extensionOptions: [
                VisaInfoRow(title: "Extend the VoA once", subtitle: "+30 days", icon: "arrow.clockwise", detail: "Apply at an immigration office (or via an agent) before your 30 days expire.", accent: theme.tint),
                VisaInfoRow(title: "Online extension", subtitle: "e-VOA", icon: "iphone", detail: "e-VOA holders can often extend online through the official portal.", accent: theme.sun),
                VisaInfoRow(title: "Overstay penalty", subtitle: "Avoid", icon: "exclamationmark.triangle.fill", detail: "A daily fine (around IDR 1m/day) applies for staying beyond your permit.", accent: theme.coral)
            ],
            healthNotes: [
                "No vaccinations are required for entry from most countries.",
                "Yellow-fever certificate is required only if arriving from an endemic country.",
                "Consider hepatitis A/B, typhoid and tetanus — check with a travel clinic.",
                "Carry comprehensive travel and (for divers) dive insurance."
            ],
            customsAllowances: [
                VisaInfoRow(title: "Alcohol", subtitle: "Allowance", icon: "wineglass.fill", detail: "Up to 1 litre of alcoholic beverages per adult traveller.", accent: theme.ocean),
                VisaInfoRow(title: "Tobacco", subtitle: "Allowance", icon: "smoke.fill", detail: "200 cigarettes, 25 cigars or 100g of tobacco per adult.", accent: theme.tint),
                VisaInfoRow(title: "Currency", subtitle: "Declare over", icon: "banknote.fill", detail: "Amounts of IDR 100m or equivalent must be declared.", accent: theme.sun)
            ],
            prohibitedItems: [
                "Narcotics and drugs — extremely severe penalties apply.",
                "Pornographic material and items deemed offensive.",
                "Certain weapons, ammunition and Chinese-printed medicines.",
                "Fresh fruit, plants and animal products without a permit."
            ],
            departureRequirements: [
                VisaInfoRow(title: "Departure tax", subtitle: "Usually included", icon: "ticket.fill", detail: "International departure tax is normally bundled into your airfare.", accent: theme.moss),
                VisaInfoRow(title: "Exit stamp / autogate", subtitle: "Required", icon: "airplane.departure", detail: "Clear immigration on the way out; e-VOA holders can use the autogates.", accent: theme.tint),
                VisaInfoRow(title: "Check your stay", subtitle: "Important", icon: "calendar.badge.exclamationmark", detail: "Leave on or before your permit expiry to avoid overstay fines.", accent: theme.coral)
            ],
            embassyContacts: [
                VisaInfoRow(title: "Your embassy (Jakarta)", subtitle: "Consular help", icon: "building.columns.fill", detail: "Register your trip and keep your embassy’s emergency line saved offline.", accent: theme.ocean),
                VisaInfoRow(title: "Consulate (Bali)", subtitle: "Regional", icon: "building.2.fill", detail: "Several countries maintain a consulate or agent in Denpasar for lost-passport help.", accent: theme.tint),
                VisaInfoRow(title: "Emergency services", subtitle: "112", icon: "phone.fill", detail: "National emergency number; tourist police operate in major areas.", accent: theme.coral)
            ],
            quickFacts: [
                VisaFact(icon: "banknote.fill", label: "Currency", value: "Rupiah (IDR)"),
                VisaFact(icon: "creditcard.fill", label: "Cards & cash", value: "Cash widely used"),
                VisaFact(icon: "simcard.fill", label: "SIM", value: "Telkomsel / XL"),
                VisaFact(icon: "wifi", label: "Connectivity", value: "eSIM on arrival")
            ],
            disclaimer: "Entry rules change frequently and vary by nationality. This guide is illustrative only — always confirm current requirements with the official Indonesian immigration authority and your government before you travel."
        )
    }
}

struct TravelVisaEntryDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelVisaEntryDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Visa & entry · Indonesia")

            TravelVisaEntryDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Visa & entry · Dynamic Type XL")
        }
    }
}
#endif
