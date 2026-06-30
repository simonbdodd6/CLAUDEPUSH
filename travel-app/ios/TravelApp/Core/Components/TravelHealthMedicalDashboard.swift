import SwiftUI

// MARK: - Travel health & medical dashboard (Phase 122)
//
// A flagship, presentation-only Health & Medical dashboard: a hero with at-a-glance
// facts (water safety, vaccination status, travel-insurance reminder, nearest
// hospital), a filterable health-essentials list, recommended & required vaccinations,
// malaria/dengue risk by region with risk badges, a personal medical-kit checklist,
// prescription & medication notes (carry letter, customs), food & water safety, dive-
// medicine notes (DAN, chamber locations, fit-to-dive), sun/heat/dehydration advice,
// common ailments & remedies, pharmacy (apotek) guidance, a hospital & clinic
// directory by region, a travel-insurance checklist, emergency numbers & evacuation
// notes and a disclaimer placeholder. A caller supplies a `HealthGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. `HealthGuide` and its
// nested rows are lightweight presentation models (not DTOs); the component holds no
// data, networking, persistence, repository, view-model, navigation, AppContainer or
// DTO logic, and is not wired into any screen. The category filters and favourite stars
// are UI-only, and nothing here is medical advice.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A severity / risk level — drives the badge label and accent.
enum HealthRisk {
    case low
    case moderate
    case high

    var label: String {
        switch self {
        case .low: "Low"
        case .moderate: "Moderate"
        case .high: "High"
        }
    }

    var icon: String {
        switch self {
        case .low: "checkmark.shield.fill"
        case .moderate: "exclamationmark.triangle.fill"
        case .high: "exclamationmark.octagon.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .low: return theme.moss
        case .moderate: return theme.sun
        case .high: return theme.coral
        }
    }
}

/// A single at-a-glance health fact.
struct HealthFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A recommended or required vaccination.
struct HealthVaccine: Identifiable {
    let id = UUID()
    var name: String
    var required: Bool
    var detail: String
}

/// A region's malaria / dengue risk.
struct HealthRegionRisk: Identifiable {
    let id = UUID()
    var region: String
    var malaria: HealthRisk
    var dengue: HealthRisk
    var detail: String
}

/// A personal medical-kit or insurance checklist item.
struct HealthCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// A generic health guide row reused for essentials, prescriptions, dive medicine,
/// pharmacy, hospitals and emergency contacts.
struct HealthInfoRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var category: String
    var risk: HealthRisk?

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, category: String = "", risk: HealthRisk? = nil) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.category = category
        self.risk = risk
    }
}

/// The full, presentation-only content for a health & medical guide.
struct HealthGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [HealthFact]
    var essentials: [HealthInfoRow]
    var vaccines: [HealthVaccine]
    var regionRisks: [HealthRegionRisk]
    var medicalKit: [HealthCheckItem]
    var prescriptions: [HealthInfoRow]
    var foodWaterTips: [String]
    var diveMedicine: [HealthInfoRow]
    var sunHeatTips: [String]
    var commonAilments: [HealthInfoRow]
    var pharmacy: [HealthInfoRow]
    var hospitals: [HealthInfoRow]
    var insuranceChecklist: [HealthCheckItem]
    var emergencyContacts: [HealthInfoRow]
    var evacuationNotes: [String]
    var disclaimer: String
}

/// A premium, presentation-only health & medical dashboard rendered from a `HealthGuide`.
struct TravelHealthMedicalDashboard: View {
    var guide: HealthGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedCategory = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let categories = ["All", "Vaccines", "Kit", "Dive", "Emergency"]

    private var filteredEssentials: [HealthInfoRow] {
        guard selectedCategory != "All" else { return guide.essentials }
        return guide.essentials.filter { $0.category == selectedCategory }
    }

    var body: some View {
        PremiumScrollView {
            hero
            focusGroup
            preventGroup
            careGroup
            directoryGroup
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
            eyebrow: "Health & Medical",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Tap water"), label: "Water"),
                HeroMetric(value: factValue("Vaccines"), label: "Vaccines"),
                HeroMetric(value: factValue("Insurance"), label: "Insurance")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(HealthAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var focusGroup: some View {
        Group {
            section("Essentials", "Filter to what matters now.", 1) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    categoryFilter
                    if filteredEssentials.isEmpty {
                        GlassCard {
                            Text("No \(selectedCategory.lowercased()) essentials here.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        infoList(filteredEssentials)
                    }
                }
            }

            section("At a glance", "Health basics for the trip.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }
        }
    }

    private var preventGroup: some View {
        Group {
            section("Vaccinations", "Required and recommended.", 3) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.vaccines) { vaccine in
                        vaccineCard(vaccine)
                    }
                }
            }

            section("Malaria & dengue", "Risk by region.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.regionRisks) { risk in
                        regionRiskCard(risk)
                    }
                }
            }

            section("Medical kit", "Pack before you go.", 5) {
                checklistCard(guide.medicalKit)
            }

            section("Prescriptions", "Carrying medication.", 6) {
                infoList(guide.prescriptions)
            }
        }
    }

    private var careGroup: some View {
        Group {
            section("Food & water", "Avoiding ‘Bali belly’.", 7) {
                bulletCard(guide.foodWaterTips, icon: "fork.knife", tint: theme.moss)
            }

            section("Dive medicine", "Stay safe underwater.", 8) {
                infoList(guide.diveMedicine)
            }

            section("Sun, heat & hydration", "The tropical basics.", 8) {
                bulletCard(guide.sunHeatTips, icon: "sun.max.fill", tint: theme.sun)
            }

            section("Common ailments", "Quick remedies.", 8) {
                infoList(guide.commonAilments)
            }

            section("Pharmacy (apotek)", "Buying medicine locally.", 8) {
                infoList(guide.pharmacy)
            }
        }
    }

    private var directoryGroup: some View {
        Group {
            section("Hospitals & clinics", "By region.", 8) {
                infoList(guide.hospitals)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Travel insurance", "Check before you fly.", 8) {
                checklistCard(guide.insuranceChecklist)
            }

            section("Emergency numbers", "Save these offline.", 8) {
                infoList(guide.emergencyContacts)
            }

            section("Evacuation", "If things get serious.", 8) {
                bulletCard(guide.evacuationNotes, icon: "cross.case.fill", tint: theme.coral)
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
        .modifier(HealthAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: HealthFact) -> some View {
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

    // MARK: Vaccines

    private func vaccineCard(_ vaccine: HealthVaccine) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion("syringe.fill", vaccine.required ? theme.coral : theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(vaccine.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(vaccine.required ? "Required" : "Recommended", vaccine.required ? theme.coral : theme.sun)
                    }
                    Text(vaccine.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton("vaccine-\(vaccine.name)", vaccine.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(vaccine.name), \(vaccine.required ? "required" : "recommended"). \(vaccine.detail)")
    }

    // MARK: Region risk

    private func regionRiskCard(_ risk: HealthRegionRisk) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion("map.fill", theme.tint)
                    Text(risk.region)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                HStack(spacing: TravelSpacing.xs) {
                    riskBadge("Malaria", risk.malaria)
                    riskBadge("Dengue", risk.dengue)
                }
                Text(risk.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(risk.region). Malaria risk \(risk.malaria.label), dengue risk \(risk.dengue.label). \(risk.detail)")
    }

    private func riskBadge(_ label: String, _ risk: HealthRisk) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: risk.icon)
            Text("\(label): \(risk.label)").textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(risk.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(risk.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Checklist

    private func checklistCard(_ items: [HealthCheckItem]) -> some View {
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

    // MARK: Generic info list

    private func infoList(_ rows: [HealthInfoRow]) -> some View {
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
                                if let risk = row.risk {
                                    tagPill(risk.label, risk.accent)
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
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? "")\(row.risk.map { ", \($0.label) risk" } ?? ""), \(row.detail)")
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
                    Text("Not medical advice")
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
        .accessibilityLabel("Not medical advice. \(guide.disclaimer)")
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

    private func tagPill(_ text: String, _ tint: Color) -> some View {
        Text(text)
            .font(TravelTypography.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(tint)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(tint.opacity(0.15), in: Capsule())
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

// MARK: - Health appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct HealthAppear: ViewModifier {
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
extension HealthGuide {
    /// A deterministic sample health guide for Indonesia (illustrative only).
    static var sampleIndonesia: HealthGuide {
        let theme = TravelTheme.current
        return HealthGuide(
            heroTitle: "Indonesia · Health",
            heroSubtitle: "Stay well across the islands — vaccines, mozzie risk, dive medicine and where to find care.",
            heroSymbol: "cross.case.fill",
            heroGradient: [theme.coral, theme.tint, theme.ocean],
            facts: [
                HealthFact(icon: "drop.fill", label: "Tap water", value: "Don’t drink"),
                HealthFact(icon: "syringe.fill", label: "Vaccines", value: "Hep A + typhoid"),
                HealthFact(icon: "checkmark.shield.fill", label: "Insurance", value: "Dive cover a must"),
                HealthFact(icon: "cross.fill", label: "Top hospital", value: "BIMC Bali")
            ],
            essentials: [
                HealthInfoRow(title: "Hepatitis A + typhoid", subtitle: "Before you fly", icon: "syringe.fill", detail: "The two most-recommended jabs for Indonesia — see a travel clinic 4–6 weeks ahead.", accent: theme.sun, category: "Vaccines"),
                HealthInfoRow(title: "Mosquito protection", subtitle: "Daily", icon: "ladybug.fill", detail: "Dengue is the main mozzie risk islands-wide — repellent day and night.", accent: theme.tint, category: "Kit"),
                HealthInfoRow(title: "DAN dive insurance", subtitle: "If diving", icon: "lifepreserver.fill", detail: "Standard travel cover rarely includes diving or chamber treatment — add DAN.", accent: theme.ocean, category: "Dive"),
                HealthInfoRow(title: "Save emergency numbers", subtitle: "Offline", icon: "phone.fill", detail: "Store 112, your hospital and insurer’s evac line before you travel.", accent: theme.coral, category: "Emergency")
            ],
            vaccines: [
                HealthVaccine(name: "Routine vaccines", required: false, detail: "Be up to date on MMR, tetanus-diphtheria, polio and chickenpox."),
                HealthVaccine(name: "Hepatitis A", required: false, detail: "Strongly recommended — spread through contaminated food and water."),
                HealthVaccine(name: "Typhoid", required: false, detail: "Recommended, especially for street food and rural travel."),
                HealthVaccine(name: "Hepatitis B", required: false, detail: "Recommended for longer stays and anyone who may need medical care."),
                HealthVaccine(name: "Rabies (pre-exposure)", required: false, detail: "Consider it for long, rural or remote trips — dogs and monkeys carry it."),
                HealthVaccine(name: "Yellow fever", required: true, detail: "Certificate required only if arriving from a yellow-fever endemic country.")
            ],
            regionRisks: [
                HealthRegionRisk(region: "Bali", malaria: .low, dengue: .high, detail: "Malaria risk is negligible; dengue is present year-round, so prevent bites."),
                HealthRegionRisk(region: "Lombok & Gilis", malaria: .low, dengue: .moderate, detail: "Low malaria risk; dengue present, worse in the rainy season."),
                HealthRegionRisk(region: "Komodo / Labuan Bajo", malaria: .moderate, dengue: .moderate, detail: "Flores carries some malaria risk — ask a clinic about prophylaxis."),
                HealthRegionRisk(region: "Raja Ampat / Papua", malaria: .high, dengue: .moderate, detail: "Significant malaria risk in Papua — prophylaxis is usually advised.")
            ],
            medicalKit: [
                HealthCheckItem(name: "Oral rehydration salts", done: true, note: "For ‘Bali belly’ and heat"),
                HealthCheckItem(name: "Anti-diarrhoeal & antacids", done: true, note: "Loperamide and similar"),
                HealthCheckItem(name: "Painkillers", done: true, note: "Paracetamol / ibuprofen"),
                HealthCheckItem(name: "Antiseptic & plasters", done: true, note: "Reef cuts infect fast"),
                HealthCheckItem(name: "Insect repellent (DEET)", done: true, note: "Dengue prevention"),
                HealthCheckItem(name: "Reef-safe sunscreen", done: false, note: "High SPF, oxybenzone-free"),
                HealthCheckItem(name: "Personal prescriptions", done: false, note: "Plus a doctor’s letter")
            ],
            prescriptions: [
                HealthInfoRow(title: "Original packaging", subtitle: "Always", icon: "pills.fill", detail: "Keep medicines in labelled original boxes with the prescription inside.", accent: theme.tint, category: "Kit"),
                HealthInfoRow(title: "Doctor’s letter", subtitle: "Carry it", icon: "doc.text.fill", detail: "A signed letter listing your medicines and conditions smooths customs and pharmacies.", accent: theme.ocean, category: "Kit"),
                HealthInfoRow(title: "Restricted medicines", subtitle: "Check first", icon: "exclamationmark.triangle.fill", detail: "Strong painkillers, codeine and some ADHD/sleep meds are tightly controlled — verify before travel.", accent: theme.coral, category: "Kit", risk: .moderate)
            ],
            foodWaterTips: [
                "Drink sealed bottled or properly filtered water only — never the tap.",
                "Be cautious with ice away from established cafés and restaurants.",
                "Eat freshly cooked, piping-hot food; busy warungs turn over fast and are safer.",
                "Peel fruit yourself and be wary of raw salads washed in tap water.",
                "Wash or sanitise hands before eating, especially at markets."
            ],
            diveMedicine: [
                HealthInfoRow(title: "DAN membership", subtitle: "Essential", icon: "lifepreserver.fill", detail: "Covers chamber treatment and evacuation that standard policies exclude.", accent: theme.ocean, category: "Dive"),
                HealthInfoRow(title: "Hyperbaric chambers", subtitle: "Know the nearest", icon: "cross.case.fill", detail: "Sanglah (Prof Ngoerah) and BIMC in Bali have chambers; Komodo and Raja Ampat evacuate to Bali.", accent: theme.tint, category: "Dive", risk: .moderate),
                HealthInfoRow(title: "Fit to dive", subtitle: "Self-check", icon: "heart.text.square.fill", detail: "Don’t dive with a cold, congestion or hangover; mind your no-fly time before flights.", accent: theme.moss, category: "Dive"),
                HealthInfoRow(title: "Hydrate & rest", subtitle: "Reduce DCS risk", icon: "drop.fill", detail: "Heat and alcohol dehydrate you fast — a big factor in decompression illness.", accent: theme.sky, category: "Dive")
            ],
            sunHeatTips: [
                "Reapply high-SPF reef-safe sunscreen often; the equatorial sun is fierce.",
                "Cover up and seek shade between 11am and 3pm.",
                "Drink more water than you think you need — dehydration creeps up.",
                "Watch for heat exhaustion: headache, nausea and cramps mean stop and cool down."
            ],
            commonAilments: [
                HealthInfoRow(title: "Traveller’s diarrhoea", subtitle: "‘Bali belly’", icon: "pills.circle.fill", detail: "Rehydrate aggressively; see a doctor if there’s blood, high fever or it lasts 48h+.", accent: theme.sun, category: "Kit", risk: .moderate),
                HealthInfoRow(title: "Coral cuts & infections", subtitle: "Clean fast", icon: "bandage.fill", detail: "Scrub, disinfect and watch tropical cuts closely — they infect quickly.", accent: theme.coral, category: "Kit"),
                HealthInfoRow(title: "Dengue fever", subtitle: "See a doctor", icon: "thermometer.high", detail: "High fever, severe aches and rash — get tested; avoid ibuprofen/aspirin.", accent: theme.coral, category: "Emergency", risk: .high)
            ],
            pharmacy: [
                HealthInfoRow(title: "Apotek everywhere", subtitle: "Pharmacies", icon: "cross.case.fill", detail: "Kimia Farma, Guardian and Watsons are common in towns and tourist areas.", accent: theme.moss, category: "Kit"),
                HealthInfoRow(title: "Over-the-counter", subtitle: "Widely available", icon: "pills.fill", detail: "Basics are cheap and easy to buy; pharmacists often speak some English.", accent: theme.tint, category: "Kit"),
                HealthInfoRow(title: "Check authenticity", subtitle: "Buy reputable", icon: "checkmark.seal.fill", detail: "Stick to established chains to avoid counterfeit or expired medicines.", accent: theme.ocean, category: "Kit")
            ],
            hospitals: [
                HealthInfoRow(title: "BIMC Hospital", subtitle: "Bali · Kuta & Nusa Dua", icon: "cross.fill", detail: "International-standard private hospital used to treating travellers and divers.", accent: theme.coral, category: "Emergency"),
                HealthInfoRow(title: "Siloam Hospitals", subtitle: "Bali · Denpasar", icon: "cross.fill", detail: "Large private network with 24h emergency care.", accent: theme.coral, category: "Emergency"),
                HealthInfoRow(title: "Prof. Ngoerah (Sanglah)", subtitle: "Bali · public", icon: "cross.case.fill", detail: "Main public hospital with a hyperbaric chamber for dive emergencies.", accent: theme.ocean, category: "Dive"),
                HealthInfoRow(title: "Siloam Mataram", subtitle: "Lombok", icon: "cross.fill", detail: "The main private hospital on Lombok; serious cases may transfer to Bali.", accent: theme.coral, category: "Emergency"),
                HealthInfoRow(title: "Siloam Clinic", subtitle: "Komodo · Labuan Bajo", icon: "cross.case.fill", detail: "Basic care only; serious illness or injury is evacuated to Bali.", accent: theme.sun, category: "Emergency", risk: .moderate)
            ],
            insuranceChecklist: [
                HealthCheckItem(name: "Medical & evacuation cover", done: true, note: "Adequate limits for the region"),
                HealthCheckItem(name: "Scuba diving included", done: false, note: "To your planned depth — or add DAN"),
                HealthCheckItem(name: "Repatriation", done: true, note: "Cover to fly you home if needed"),
                HealthCheckItem(name: "Policy & numbers saved", done: false, note: "Offline copy and 24h assistance line")
            ],
            emergencyContacts: [
                HealthInfoRow(title: "Emergency (general)", subtitle: "112", icon: "phone.fill", detail: "Single nationwide number; a hospital’s direct line is often faster.", accent: theme.coral, category: "Emergency"),
                HealthInfoRow(title: "Ambulance", subtitle: "118 / 119", icon: "cross.case.fill", detail: "Response times vary; private hospital ambulances may be quicker.", accent: theme.coral, category: "Emergency"),
                HealthInfoRow(title: "DAN emergency hotline", subtitle: "Diving", icon: "lifepreserver.fill", detail: "Call DAN for dive-injury advice and to coordinate chamber treatment.", accent: theme.ocean, category: "Dive"),
                HealthInfoRow(title: "Insurer 24h assistance", subtitle: "Evacuation", icon: "airplane", detail: "Contact before major treatment so costs and evacuation are authorised.", accent: theme.tint, category: "Emergency")
            ],
            evacuationNotes: [
                "Serious cases across the islands are typically evacuated to Bali or Singapore.",
                "Authorise treatment and transfer with your insurer/DAN before incurring big costs.",
                "Remote dive sites mean evacuation can take many hours — dive conservatively.",
                "Keep a charged phone, power bank and your policy details within reach."
            ],
            disclaimer: "This guide is illustrative and is not medical advice. Health risks, requirements and facilities change — consult a doctor or travel clinic and official sources before you travel."
        )
    }
}

struct TravelHealthMedicalDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelHealthMedicalDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Health & medical · Indonesia")

            TravelHealthMedicalDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Health & medical · Dynamic Type XL")
        }
    }
}
#endif
