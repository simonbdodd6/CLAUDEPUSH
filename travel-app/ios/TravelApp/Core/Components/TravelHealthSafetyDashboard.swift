import SwiftUI

// MARK: - Travel health & safety dashboard (Phase 128)
//
// A flagship, presentation-only Health & Safety dashboard for Indonesia: a hero with
// at-a-glance information (emergency number, hospitals, pharmacies, common risks),
// region-filtered health advice, informational vaccination notes, food & water safety,
// mosquito/dengue prevention, sun/heat/dehydration guidance, ocean safety, monkey &
// wildlife safety, volcano & earthquake awareness, scooter-accident prevention, night-
// safety, women's solo-travel tips, LGBTQ+ travel notes, an emergency-contacts card,
// hospital/clinic placeholders, a pharmacy-essentials checklist, a first-aid checklist,
// travel-insurance reminders, an emergency-preparation checklist and a disclaimer. A
// caller supplies a `SafetyGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. The `Safety*` model names
// are deliberately distinct from Phase 122's `Health*` types to avoid any collision.
// `SafetyGuide` and its nested rows are lightweight presentation models (not DTOs); the
// component holds no data, networking, persistence, repository, view-model, navigation,
// AppContainer or DTO logic, and is not wired into any screen. The region filter and
// favourite stars are UI-only, and nothing here is medical or safety advice.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A safety severity level — drives the badge label and accent.
enum SafetySeverity {
    case info
    case caution
    case danger

    var label: String {
        switch self {
        case .info: "Info"
        case .caution: "Caution"
        case .danger: "Danger"
        }
    }

    var icon: String {
        switch self {
        case .info: "info.circle.fill"
        case .caution: "exclamationmark.triangle.fill"
        case .danger: "exclamationmark.octagon.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .info: return theme.moss
        case .caution: return theme.sun
        case .danger: return theme.coral
        }
    }
}

/// A single at-a-glance safety fact.
struct SafetyFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A generic safety/health advice row, with an optional severity badge and region tag.
struct SafetyRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var severity: SafetySeverity?
    var region: String

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, severity: SafetySeverity? = nil, region: String = "") {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.severity = severity
        self.region = region
    }
}

/// A checklist item (pharmacy, first-aid, emergency prep).
struct SafetyCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// The full, presentation-only content for a health & safety guide.
struct SafetyGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [SafetyFact]
    var regionAdvice: [SafetyRow]
    var vaccinations: [SafetyRow]
    var foodWater: [String]
    var mosquito: [String]
    var sunHeat: [String]
    var oceanSafety: [SafetyRow]
    var wildlife: [SafetyRow]
    var geoHazards: [SafetyRow]
    var scooterTips: [String]
    var nightSafety: [String]
    var womenTips: [String]
    var lgbtqNotes: [SafetyRow]
    var emergencyContacts: [SafetyRow]
    var hospitals: [SafetyRow]
    var pharmacyKit: [SafetyCheckItem]
    var firstAidKit: [SafetyCheckItem]
    var insuranceReminders: [String]
    var prepChecklist: [SafetyCheckItem]
    var disclaimer: String
}

/// A premium, presentation-only health & safety dashboard rendered from a `SafetyGuide`.
struct TravelHealthSafetyDashboard: View {
    var guide: SafetyGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedRegion = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let regionFilters = ["All", "Bali", "Lombok", "Gili", "Komodo", "Raja Ampat"]

    private var filteredAdvice: [SafetyRow] {
        guard selectedRegion != "All" else { return guide.regionAdvice }
        return guide.regionAdvice.filter { $0.region == selectedRegion }
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            preventGroup
            hazardGroup
            personalGroup
            prepGroup
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
            eyebrow: "Health & Safety",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Emergency"), label: "Emergency"),
                HeroMetric(value: factValue("Top hospital"), label: "Hospital"),
                HeroMetric(value: factValue("Main risk"), label: "Main risk")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(SafetyAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "The safety basics.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("By region", "Filter to where you are.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    regionFilter
                    if filteredAdvice.isEmpty {
                        GlassCard {
                            Text("No notes for that region.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        infoList(filteredAdvice)
                    }
                }
            }

            section("Vaccinations", "Informational only.", 3) {
                infoList(guide.vaccinations)
            }
        }
    }

    private var preventGroup: some View {
        Group {
            section("Food & water", "Avoiding ‘Bali belly’.", 4) {
                bulletCard(guide.foodWater, icon: "fork.knife", tint: theme.moss)
            }

            section("Mosquitoes & dengue", "Prevent the bites.", 5) {
                bulletCard(guide.mosquito, icon: "ladybug.fill", tint: theme.coral)
            }

            section("Sun, heat & hydration", "The tropical basics.", 6) {
                bulletCard(guide.sunHeat, icon: "sun.max.fill", tint: theme.sun)
            }
        }
    }

    private var hazardGroup: some View {
        Group {
            section("Ocean safety", "Respect the sea.", 7) {
                infoList(guide.oceanSafety)
            }

            section("Monkeys & wildlife", "Look, don’t touch.", 8) {
                infoList(guide.wildlife)
            }

            section("Volcanoes & quakes", "On the Ring of Fire.", 8) {
                infoList(guide.geoHazards)
            }

            section("Scooter safety", "The biggest tourist risk.", 8) {
                bulletCard(guide.scooterTips, icon: "scooter", tint: theme.coral)
            }
        }
    }

    private var personalGroup: some View {
        Group {
            section("Night safety", "After dark.", 8) {
                bulletCard(guide.nightSafety, icon: "moon.stars.fill", tint: theme.ocean)
            }

            section("Solo women travellers", "Generally safe & welcoming.", 8) {
                bulletCard(guide.womenTips, icon: "figure.stand", tint: theme.tint)
            }

            section("LGBTQ+ notes", "Informational.", 8) {
                infoList(guide.lgbtqNotes)
            }
        }
    }

    private var prepGroup: some View {
        Group {
            section("Emergency contacts", "Save these offline.", 8) {
                infoList(guide.emergencyContacts)
            }

            section("Hospitals & clinics", "Know your nearest.", 8) {
                infoList(guide.hospitals)
            }

            section("Pharmacy essentials", "Stock up at the apotek.", 8) {
                checklistCard(guide.pharmacyKit)
            }

            section("First-aid kit", "Pack before you go.", 8) {
                checklistCard(guide.firstAidKit)
            }

            section("Travel insurance", "Don’t travel without it.", 8) {
                bulletCard(guide.insuranceReminders, icon: "checkmark.shield.fill", tint: theme.moss)
            }

            section("Be prepared", "A quick readiness check.", 8) {
                checklistCard(guide.prepChecklist)
            }

            section("Important", "Please read.", 8) {
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
        .modifier(SafetyAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: SafetyFact) -> some View {
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

    // MARK: Region filter

    private var regionFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(regionFilters, id: \.self) { region in
                    let selected = region == selectedRegion
                    Button {
                        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedRegion = region }
                    } label: {
                        Text(region)
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
                    .accessibilityLabel("\(region) filter")
                    .accessibilityValue(selected ? "Selected" : "Not selected")
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    // MARK: Generic info list

    private func infoList(_ rows: [SafetyRow]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(rows) { row in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(row.icon, row.accent)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack(spacing: TravelSpacing.xs) {
                                Text(row.title)
                                    .font(TravelTypography.cardTitle)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let severity = row.severity {
                                    severityBadge(severity)
                                }
                            }
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
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? "")\(row.severity.map { ", \($0.label)" } ?? ""), \(row.detail)")
            }
        }
    }

    private func severityBadge(_ severity: SafetySeverity) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: severity.icon)
            Text(severity.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(severity.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(severity.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Checklist

    private func checklistCard(_ items: [SafetyCheckItem]) -> some View {
        GlassCard {
            VStack(spacing: TravelSpacing.xs) {
                ForEach(items) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.sm) {
                        Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(item.done ? theme.moss : Color.secondary)
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
                    .accessibilityLabel("\(item.name), \(item.done ? "packed" : "outstanding"). \(item.note)")
                }
            }
        }
    }

    // MARK: Disclaimer

    private var disclaimerCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "info.circle.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.coral)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Not medical or safety advice")
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
        .accessibilityLabel("Not medical or safety advice. \(guide.disclaimer)")
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

// MARK: - Safety appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct SafetyAppear: ViewModifier {
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
extension SafetyGuide {
    /// A deterministic sample health & safety guide for Indonesia (illustrative only).
    static var sampleIndonesia: SafetyGuide {
        let theme = TravelTheme.current
        return SafetyGuide(
            heroTitle: "Indonesia · Stay Safe",
            heroSubtitle: "Warm and welcoming — a little awareness keeps a trip across the islands trouble-free.",
            heroSymbol: "cross.case.fill",
            heroGradient: [theme.coral, theme.tint, theme.ocean],
            facts: [
                SafetyFact(icon: "phone.fill", label: "Emergency", value: "112"),
                SafetyFact(icon: "cross.fill", label: "Top hospital", value: "BIMC Bali"),
                SafetyFact(icon: "cross.case.fill", label: "Pharmacies", value: "Apotek (common)"),
                SafetyFact(icon: "exclamationmark.triangle.fill", label: "Main risk", value: "Scooter & tummy")
            ],
            regionAdvice: [
                SafetyRow(title: "Bali", subtitle: "Best facilities", icon: "leaf.fill", detail: "Good private hospitals (BIMC, Siloam); main risks are scooter accidents and dengue.", accent: theme.tint, severity: .info, region: "Bali"),
                SafetyRow(title: "Lombok", subtitle: "Limited care", icon: "mountain.2.fill", detail: "Siloam Mataram for serious cases; Rinjani trekking carries altitude and terrain risks.", accent: theme.sun, severity: .caution, region: "Lombok"),
                SafetyRow(title: "Gili Islands", subtitle: "Clinic only", icon: "beach.umbrella.fill", detail: "No cars (safer roads) but only clinics — serious cases evacuate by boat to Lombok or Bali.", accent: theme.sun, severity: .caution, region: "Gili"),
                SafetyRow(title: "Komodo / Labuan Bajo", subtitle: "Remote", icon: "ferry.fill", detail: "Basic clinic only; diving and boats are far from care — evacuate to Bali. Stay with dragon rangers.", accent: theme.coral, severity: .caution, region: "Komodo"),
                SafetyRow(title: "Raja Ampat", subtitle: "Very remote", icon: "water.waves", detail: "Minimal facilities and malaria risk; dive conservatively and carry DAN evacuation cover.", accent: theme.coral, severity: .danger, region: "Raja Ampat")
            ],
            vaccinations: [
                SafetyRow(title: "Routine vaccines", subtitle: "Be up to date", icon: "syringe.fill", detail: "MMR, tetanus-diphtheria, polio and chickenpox — informational, confirm with a clinic.", accent: theme.tint),
                SafetyRow(title: "Hepatitis A & typhoid", subtitle: "Often advised", icon: "syringe.fill", detail: "Commonly recommended for food- and water-borne illness; see a travel clinic.", accent: theme.sun),
                SafetyRow(title: "Rabies & others", subtitle: "Sometimes", icon: "pawprint.fill", detail: "Rabies (long/rural trips), hepatitis B and Japanese encephalitis may be suggested.", accent: theme.ocean),
                SafetyRow(title: "Yellow fever", subtitle: "Conditional", icon: "doc.text.fill", detail: "A certificate is required only if arriving from a yellow-fever endemic country.", accent: theme.moss)
            ],
            foodWater: [
                "Drink sealed bottled or properly filtered water only — never the tap.",
                "Be cautious with ice away from established cafés and restaurants.",
                "Eat freshly cooked, piping-hot food; busy warungs turn over fast and are safer.",
                "Peel fruit yourself and be wary of raw salads washed in tap water.",
                "Wash or sanitise hands before eating, especially at markets."
            ],
            mosquito: [
                "Dengue is present year-round islands-wide — prevention matters more than any jab.",
                "Use DEET or picaridin repellent day and night, and cover up at dawn and dusk.",
                "Sleep with a net or AC and clear any standing water near your room.",
                "See a doctor for high fever, severe aches or a rash — and avoid ibuprofen/aspirin."
            ],
            sunHeat: [
                "UV is extreme near the equator — high-SPF reef-safe sunscreen, reapplied often.",
                "Cover up and seek shade between 11am and 3pm.",
                "Drink more water than you think you need; carry oral rehydration salts.",
                "Heat exhaustion (headache, nausea, cramps) means stop, cool down and rehydrate."
            ],
            oceanSafety: [
                SafetyRow(title: "Rip currents", subtitle: "Beaches", icon: "water.waves", detail: "South-coast surf beaches have strong rips — swim between the flags at patrolled beaches only.", accent: theme.coral, severity: .danger),
                SafetyRow(title: "Reefs & coral cuts", subtitle: "Snorkel & dive", icon: "bandage.fill", detail: "Wear booties, never touch coral, and clean any cut immediately — they infect fast.", accent: theme.sun, severity: .caution),
                SafetyRow(title: "Jellyfish", subtitle: "Seasonal", icon: "allergens", detail: "Stings flare seasonally — ask locals, rinse with vinegar (not fresh water) and seek help if severe.", accent: theme.sun, severity: .caution),
                SafetyRow(title: "Sea urchins", subtitle: "Rocky shallows", icon: "circle.hexagongrid.fill", detail: "Watch where you step on rocks and reef; spines break off and need careful removal.", accent: theme.sun, severity: .caution),
                SafetyRow(title: "Boat traffic", subtitle: "Snorkelling", icon: "ferry.fill", detail: "Use a float or bright cap near boat channels and surface at the reef edge, not in the lane.", accent: theme.sun, severity: .caution)
            ],
            wildlife: [
                SafetyRow(title: "Monkeys", subtitle: "Ubud & Uluwatu", icon: "pawprint.fill", detail: "Don’t feed or make eye contact; secure glasses, phones and bags — bites carry rabies risk.", accent: theme.coral, severity: .caution),
                SafetyRow(title: "Stray dogs", subtitle: "Rabies risk", icon: "dog.fill", detail: "Avoid strays; if bitten or scratched, wash well and seek medical care urgently.", accent: theme.coral, severity: .danger),
                SafetyRow(title: "Komodo dragons", subtitle: "Komodo NP", icon: "lizard.fill", detail: "Stay with a ranger and keep your distance — they’re fast and their bite is dangerous.", accent: theme.sun, severity: .caution),
                SafetyRow(title: "Snakes", subtitle: "Rural & jungle", icon: "leaf.fill", detail: "Watch your footing on treks and in rice fields; wear closed shoes and don’t reach blindly.", accent: theme.sun, severity: .caution)
            ],
            geoHazards: [
                SafetyRow(title: "Active volcanoes", subtitle: "Agung, Rinjani, Merapi", icon: "mountain.2.fill", detail: "Check the official alert status, heed exclusion zones and only trek with licensed guides.", accent: theme.coral, severity: .caution),
                SafetyRow(title: "Earthquakes", subtitle: "Ring of Fire", icon: "waveform.path.ecg", detail: "Quakes are common — know your building’s exits and ‘drop, cover, hold on’.", accent: theme.sun, severity: .caution),
                SafetyRow(title: "Tsunami", subtitle: "Coastal", icon: "water.waves", detail: "After a strong coastal quake, move immediately to high ground — don’t wait for an official alert.", accent: theme.coral, severity: .danger)
            ],
            scooterTips: [
                "Wear a proper helmet on every trip — it’s the law and it saves lives.",
                "Don’t ride beyond your experience; tourist scooter crashes are the top injury.",
                "Avoid riding at night on unlit rural roads, and never after drinking.",
                "Carry a licence and IDP, ride defensively and watch for dogs and potholes."
            ],
            nightSafety: [
                "Stick to lit, busy areas and avoid isolated beaches after dark.",
                "Beware cheap spirits and arak — methanol poisoning is a real danger; stick to sealed brands.",
                "Watch your drink, and use registered transport (Gojek/Grab/Bluebird) home.",
                "Keep valuables out of sight and split your cash and cards."
            ],
            womenTips: [
                "Indonesia is generally safe and friendly for solo women travellers.",
                "Dress modestly away from the beach and in villages and temples.",
                "Trust your instincts, avoid isolated areas at night and be firm with unwanted attention.",
                "Share your itinerary with someone and keep your accommodation address handy."
            ],
            lgbtqNotes: [
                SafetyRow(title: "Broadly conservative", subtitle: "Informational", icon: "info.circle.fill", detail: "Indonesia is largely Muslim-majority and conservative; same-sex relations are legal nationally except in Aceh.", accent: theme.ocean, severity: .info),
                SafetyRow(title: "Bali is more relaxed", subtitle: "Tourist areas", icon: "leaf.fill", detail: "Bali and major tourist hubs are noticeably more tolerant and welcoming.", accent: theme.tint, severity: .info),
                SafetyRow(title: "Discretion is wise", subtitle: "Public spaces", icon: "hand.raised.fill", detail: "Public displays of affection are low-key for everyone; discretion avoids unwanted attention.", accent: theme.sun, severity: .caution)
            ],
            emergencyContacts: [
                SafetyRow(title: "Emergency (general)", subtitle: "112", icon: "phone.fill", detail: "Single nationwide number; a hospital’s direct line is often faster.", accent: theme.coral),
                SafetyRow(title: "Police", subtitle: "110", icon: "shield.fill", detail: "Tourist police operate in major destinations.", accent: theme.ocean),
                SafetyRow(title: "Ambulance", subtitle: "118 / 119", icon: "cross.case.fill", detail: "Response varies; private hospital ambulances can be quicker.", accent: theme.coral),
                SafetyRow(title: "Search & rescue", subtitle: "115 · Basarnas", icon: "figure.wave", detail: "For sea and remote-area rescue — relevant on island crossings and treks.", accent: theme.sun),
                SafetyRow(title: "Insurer & embassy", subtitle: "Save offline", icon: "doc.text.fill", detail: "Keep your insurer’s 24h line and your embassy’s number stored offline.", accent: theme.tint)
            ],
            hospitals: [
                SafetyRow(title: "BIMC Hospital", subtitle: "Bali · Kuta & Nusa Dua", icon: "cross.fill", detail: "International-standard private hospital used to treating travellers. Directions need a connection.", accent: theme.coral),
                SafetyRow(title: "Siloam Hospitals", subtitle: "Bali & Lombok", icon: "cross.fill", detail: "Large private network with 24h emergency care in Denpasar and Mataram.", accent: theme.coral),
                SafetyRow(title: "Island clinics", subtitle: "Gili & Labuan Bajo", icon: "cross.case.fill", detail: "Basic clinics for first response; serious cases are evacuated to Bali. (Placeholder)", accent: theme.sun)
            ],
            pharmacyKit: [
                SafetyCheckItem(name: "Oral rehydration salts", done: true, note: "For tummy bugs and heat"),
                SafetyCheckItem(name: "Anti-diarrhoeal & antacids", done: true, note: "Loperamide and similar"),
                SafetyCheckItem(name: "Painkillers", done: true, note: "Paracetamol / ibuprofen"),
                SafetyCheckItem(name: "Antihistamine", done: false, note: "Bites and allergic reactions"),
                SafetyCheckItem(name: "Motion-sickness tablets", done: false, note: "For boat crossings"),
                SafetyCheckItem(name: "Insect repellent (DEET)", done: true, note: "Dengue prevention")
            ],
            firstAidKit: [
                SafetyCheckItem(name: "Antiseptic & dressings", done: true, note: "Reef cuts infect fast"),
                SafetyCheckItem(name: "Plasters & blister care", done: true, note: "Treks and new sandals"),
                SafetyCheckItem(name: "Tweezers & scissors", done: false, note: "Spines and splinters"),
                SafetyCheckItem(name: "Gloves & tape", done: false, note: "Basic wound care"),
                SafetyCheckItem(name: "Personal prescriptions", done: false, note: "Plus a doctor’s letter")
            ],
            insuranceReminders: [
                "Travel without comprehensive medical and evacuation cover is a false economy.",
                "Check it includes scooter riding and diving to your planned depth — or add DAN.",
                "Confirm repatriation cover to fly you home if needed.",
                "Save the policy number and 24h assistance line offline, and call before major treatment."
            ],
            prepChecklist: [
                SafetyCheckItem(name: "Emergency numbers saved offline", done: true, note: "112, hospital, insurer, embassy"),
                SafetyCheckItem(name: "Itinerary shared", done: true, note: "With someone back home"),
                SafetyCheckItem(name: "Offline maps & documents", done: false, note: "Maps, passport and insurance copies"),
                SafetyCheckItem(name: "Nearest hospital noted", done: false, note: "For each island you visit"),
                SafetyCheckItem(name: "Power bank charged", done: false, note: "A dead phone is the real emergency")
            ],
            disclaimer: "This guide is illustrative and is not medical or safety advice. Conditions, facilities and risks change — consult a doctor or travel clinic, check your government’s official travel advisories, and use your own judgement before and during travel."
        )
    }
}

struct TravelHealthSafetyDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelHealthSafetyDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Health & safety · Indonesia")

            TravelHealthSafetyDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Health & safety · Dynamic Type XL")
        }
    }
}
#endif
