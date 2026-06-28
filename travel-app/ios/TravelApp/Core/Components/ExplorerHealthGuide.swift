import SwiftUI

// MARK: - Explorer health guide (Phase 92)
//
// A reusable, presentation-only health & wellbeing guide: vaccinations, traveller's
// diarrhoea, mosquito-borne disease, rabies, sun and heat, hydration, insurance,
// medical kit, pharmacies, diving health and mental wellbeing. Each entry carries
// an importance level, an overview, prevention steps, symptoms, when to see a
// doctor, before-you-go prep, treatment, who is most at risk, cost notes, an
// expert tip and common myths. Entries are colour-coded by importance.
//
// It reuses the existing design system exclusively — `GlassCard`, `PremiumPillRow`
// (the compact summary rows) and the tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are caller-
// supplied mock data; the component holds no data, networking, persistence,
// view-model, repository, navigation, AppContainer or DTO usage, and is not wired
// into any screen.
//
// Accessibility: every entry exposes one combined VoiceOver label covering the
// full detail set; text uses the Dynamic Type-scaling `TravelTypography` styles
// and wraps rather than truncating; and all motion (appearance + expand) is
// disabled under Reduce Motion.

/// How important a health topic is for a traveller — drives the colour coding.
enum HealthImportance: CaseIterable {
    case recommended
    case important
    case essential

    var label: String {
        switch self {
        case .recommended: "Recommended"
        case .important: "Important"
        case .essential: "Essential"
        }
    }

    var icon: String {
        switch self {
        case .recommended: "info.circle.fill"
        case .important: "exclamationmark.circle.fill"
        case .essential: "exclamationmark.octagon.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .recommended: return theme.moss
        case .important: return theme.sun
        case .essential: return theme.coral
        }
    }
}

/// A single, presentation-only health entry.
struct HealthItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var importance: HealthImportance
    var overview: String
    var prevention: [String]
    var symptoms: [String]
    var whenToSeeDoctor: String
    var beforeYouGo: [String]
    var treatment: String
    var whoMostAtRisk: String
    var costNote: String
    var expertTip: String
    var commonMyths: [String]
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        importance: HealthImportance,
        overview: String,
        prevention: [String],
        symptoms: [String],
        whenToSeeDoctor: String,
        beforeYouGo: [String],
        treatment: String,
        whoMostAtRisk: String,
        costNote: String,
        expertTip: String,
        commonMyths: [String],
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.importance = importance
        self.overview = overview
        self.prevention = prevention
        self.symptoms = symptoms
        self.whenToSeeDoctor = whenToSeeDoctor
        self.beforeYouGo = beforeYouGo
        self.treatment = treatment
        self.whoMostAtRisk = whoMostAtRisk
        self.costNote = costNote
        self.expertTip = expertTip
        self.commonMyths = commonMyths
        self.accent = accent
    }

    var accessibilityText: String {
        [
            category,
            importance.label,
            "overview: \(overview)",
            "prevention: \(prevention.joined(separator: "; "))",
            "symptoms: \(symptoms.joined(separator: "; "))",
            "when to see a doctor: \(whenToSeeDoctor)",
            "before you go: \(beforeYouGo.joined(separator: "; "))",
            "treatment: \(treatment)",
            "most at risk: \(whoMostAtRisk)",
            "cost: \(costNote)",
            "tip: \(expertTip)",
            "myths: \(commonMyths.joined(separator: "; "))"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerHealthGuide`.
enum HealthGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only health & wellbeing guide.
struct ExplorerHealthGuide: View {
    var items: [HealthItem]
    var layout: HealthGuideLayout = .expanded
    var title: String? = "Health & wellbeing"
    var subtitle: String? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        Group {
            if items.isEmpty {
                emptyState
            } else {
                switch layout {
                case .expanded: expanded
                case .compact: compact
                }
            }
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Expanded (expandable cards)

    private var expanded: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            header(titleFont: TravelTypography.section)

            VStack(spacing: TravelSpacing.md) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    HealthCard(item: item, startsExpanded: index == 0)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                }
            }
        }
    }

    // MARK: Compact (summary card)

    private var compact: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                    if let title {
                        Text(title).font(TravelTypography.cardTitle)
                    }
                    Spacer(minLength: 0)
                    Text(countLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: TravelSpacing.sm) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        PremiumPillRow(
                            symbol: item.icon,
                            accent: item.accent,
                            title: item.category,
                            subtitle: item.overview,
                            trailing: item.importance.label
                        )
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 8)
                        .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(item.accessibilityText)
                    }
                }
            }
        }
    }

    // MARK: Pieces

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
        items.count == 1 ? "1 topic" : "\(items.count) topics"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "heart.text.square")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No health notes listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Health card

/// A premium expandable GlassCard for one health topic: a summary (category,
/// overview, importance) that expands to reveal the full detail set. The whole
/// card is a single VoiceOver element, and all motion is disabled under Reduce
/// Motion.
private struct HealthCard: View {
    let item: HealthItem
    var startsExpanded: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expanded = false

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                summary
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { expanded.toggle() }
                    }

                if expanded {
                    Divider()
                    detail
                }
            }
        }
        .onAppear { expanded = startsExpanded }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.accessibilityText)
        .accessibilityHint(expanded ? "Showing details" : "Double tap to show details")
    }

    private var summary: some View {
        HStack(spacing: TravelSpacing.md) {
            medallion

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(item.category)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.overview)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(expanded ? nil : 2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                importanceBadge
                Image(systemName: "chevron.down")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
        }
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            labeledList("Prevention", item.prevention, icon: "checkmark.circle.fill", tint: TravelTheme.current.moss)

            labeledList("Symptoms", item.symptoms, icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.sun)

            calloutRow(icon: "cross.case.fill", tint: TravelTheme.current.coral, label: "When to see a doctor", text: item.whenToSeeDoctor)

            detailRow(icon: "bandage.fill", label: "Treatment", value: item.treatment)

            labeledList("Before you go", item.beforeYouGo, icon: "checklist", tint: item.accent)

            detailRow(icon: "person.fill.checkmark", label: "Most at risk", value: item.whoMostAtRisk)
            detailRow(icon: "creditcard.fill", label: "Cost", value: item.costNote)

            labeledList("Common myths", item.commonMyths, icon: "questionmark.circle.fill", tint: TravelTheme.current.sky)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Expert tip", text: item.expertTip)
        }
    }

    // MARK: Pieces

    private var medallion: some View {
        Image(systemName: item.icon)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(
                LinearGradient(
                    colors: [item.accent, item.accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: item.accent.opacity(0.3), radius: 8, y: 4)
    }

    private var importanceBadge: some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: item.importance.icon)
            Text(item.importance.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(item.importance.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(TravelTypography.caption)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func labeledList(_ label: String, _ items: [String], icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                ForEach(items, id: \.self) { entry in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: icon)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tint)
                        Text(entry)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private func calloutRow(icon: String, tint: Color, label: String, text: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(text)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}

#if DEBUG
struct ExplorerHealthGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Staying healthy across Bali, Lombok and the islands.
    private static let topics: [HealthItem] = [
        HealthItem(
            category: "Vaccinations", icon: "syringe.fill", importance: .essential,
            overview: "Routine and travel vaccines cut the risk of serious illness in Indonesia.",
            prevention: ["See a travel clinic 6–8 weeks before you fly", "Stay up to date on routine vaccines", "Discuss Hepatitis A, Typhoid, Rabies and Japanese Encephalitis"],
            symptoms: ["Preventive — no symptoms to watch"],
            whenToSeeDoctor: "Book a pre-travel consultation well ahead of departure.",
            beforeYouGo: ["Travel-clinic appointment", "Carry your vaccination record", "Check current advice (NHS Fit for Travel / CDC)"],
            treatment: "Preventive — not applicable.",
            whoMostAtRisk: "Long stays, rural travel and anyone with animal contact.",
            costNote: "Varies; several are private-prescription.",
            expertTip: "Hepatitis A and Typhoid are the priorities for Bali’s food and water exposure.",
            commonMyths: ["‘You don’t need any for Bali’ — several are strongly recommended"],
            accent: theme.coral
        ),
        HealthItem(
            category: "Bali belly", icon: "cross.case.fill", importance: .important,
            overview: "Traveller’s diarrhoea — the commonest traveller illness, usually from water, ice or under-cooked food.",
            prevention: ["Sealed or filtered water only", "Hot, freshly-cooked food", "Hand sanitiser before eating"],
            symptoms: ["Watery diarrhoea", "Cramps and nausea", "Mild fever"],
            whenToSeeDoctor: "Blood in stool, high fever, or symptoms lasting over 48 hours / dehydration.",
            beforeYouGo: ["Pack oralit (ORS) and basic meds", "Note your nearest clinic"],
            treatment: "Rest, rehydrate with ORS, eat bland food; antibiotics only if severe (see a doctor).",
            whoMostAtRisk: "Everyone — first-timers especially.",
            costNote: "ORS Rp 5–15k; a clinic visit from ~Rp 300k.",
            expertTip: "Rehydration beats any pill — ORS is your first move.",
            commonMyths: ["‘The chilli caused it’ — it’s water, ice or food, not spice"],
            accent: theme.sun
        ),
        HealthItem(
            category: "Dengue fever", icon: "ant.fill", importance: .important,
            overview: "Mosquito-borne (daytime Aedes); present across Bali and Indonesia, especially in the wet season.",
            prevention: ["Repellent (DEET/picaridin) day and night", "Cover up at dawn and dusk", "Clear standing water near you"],
            symptoms: ["High fever", "Severe headache and eye pain", "‘Breakbone’ muscle and joint pain", "Rash"],
            whenToSeeDoctor: "High fever — get a blood test; seek care fast if bleeding or severe.",
            beforeYouGo: ["Pack repellent", "Consider long sleeves for evenings"],
            treatment: "No specific cure — rest, fluids and paracetamol (NOT ibuprofen or aspirin).",
            whoMostAtRisk: "Wet-season travellers; a repeat infection can be more dangerous.",
            costNote: "Blood test from ~Rp 200k; hospital care if severe.",
            expertTip: "Use repellent in the daytime too — Aedes mosquitoes bite by day.",
            commonMyths: ["‘A net at night is enough’ — dengue mosquitoes bite during the day"],
            accent: theme.coral
        ),
        HealthItem(
            category: "Malaria", icon: "ladybug.fill", importance: .important,
            overview: "Low risk in Bali and Java; higher in eastern Indonesia — Papua, Raja Ampat and some rural areas.",
            prevention: ["Check if antimalarials are advised for your route", "Repellent and nets in higher-risk areas", "Cover up after dark"],
            symptoms: ["Fever, chills and sweats", "Headache and body aches", "Cyclical fever"],
            whenToSeeDoctor: "Any fever during or after travel to a risk area — treat as urgent.",
            beforeYouGo: ["Travel-clinic advice on prophylaxis", "Buy any prescribed antimalarials"],
            treatment: "Prompt medical diagnosis and treatment — it can be life-threatening.",
            whoMostAtRisk: "Travel to Papua, Raja Ampat and the remote east.",
            costNote: "Prophylaxis varies; treatment needs a hospital.",
            expertTip: "Bali itself is low-risk, but Raja Ampat and Papua are not — get route-specific advice.",
            commonMyths: ["‘All of Indonesia needs malaria pills’ — it’s region-specific; Bali usually doesn’t"],
            accent: theme.coral
        ),
        HealthItem(
            category: "Rabies", icon: "pawprint.fill", importance: .essential,
            overview: "Endemic in Bali (dogs, monkeys, cats); almost always fatal once symptoms begin.",
            prevention: ["Don’t touch or feed animals", "Avoid the grabby macaques at monkey forests", "Consider the pre-exposure vaccine for longer stays"],
            symptoms: ["Any bite, scratch or lick on broken skin from a mammal is a risk"],
            whenToSeeDoctor: "Immediately after any bite/scratch — wash 15 minutes, then get urgent post-exposure treatment.",
            beforeYouGo: ["Discuss the pre-exposure vaccine", "Know where PEP is available (Bali hospitals)"],
            treatment: "Wash the wound 15 minutes with soap and water, then start post-exposure vaccine ASAP — do not delay.",
            whoMostAtRisk: "Anyone around stray dogs or monkeys.",
            costNote: "A PEP course can be costly — insurance matters.",
            expertTip: "After any animal bite or scratch, wash for 15 minutes and get PEP the same day — never wait.",
            commonMyths: ["‘Only dog bites cause rabies’ — monkeys, cats and bats can too"],
            accent: theme.coral
        ),
        HealthItem(
            category: "Sun & heat", icon: "sun.max.fill", importance: .important,
            overview: "Tropical sun and humidity cause sunburn, heat exhaustion and dehydration quickly.",
            prevention: ["High-SPF reef-safe sunscreen, reapplied often", "Hydrate constantly", "Shade and rest in the midday heat"],
            symptoms: ["Sunburn", "Dizziness and headache (heat exhaustion)", "Confusion and no sweating (heatstroke — emergency)"],
            whenToSeeDoctor: "Heatstroke signs — confusion or collapse — are an emergency.",
            beforeYouGo: ["Pack reef-safe SPF 30–50", "Sun hat and UV sunglasses"],
            treatment: "Cool down, shade and fluids; heatstroke needs urgent cooling and medical help.",
            whoMostAtRisk: "Everyone; children and surfers especially.",
            costNote: "Sunscreen is pricier locally — bring your own.",
            expertTip: "Reapply sunscreen after every swim — equatorial UV is intense even under cloud.",
            commonMyths: ["‘Cloudy days are safe’ — UV penetrates cloud near the equator"],
            accent: theme.sun
        ),
        HealthItem(
            category: "Hydration & water", icon: "drop.fill", importance: .essential,
            overview: "Tap water isn’t potable, and dehydration is a constant risk in the heat.",
            prevention: ["Sealed or filtered water only", "Drink before you feel thirsty", "Add electrolytes when active or sweating"],
            symptoms: ["Dark urine", "Headache and fatigue", "Dizziness"],
            whenToSeeDoctor: "Severe dehydration with vomiting — seek care.",
            beforeYouGo: ["A reusable bottle and a filter option"],
            treatment: "Rehydrate with water plus electrolytes or ORS.",
            whoMostAtRisk: "Active travellers, divers and hikers.",
            costNote: "Refill stations are cheap or free.",
            expertTip: "Carry electrolytes for dive days and treks — water alone isn’t enough in the heat.",
            commonMyths: ["‘Ice is the risk’ — commercial tube ice is fine; tap water is the real issue"],
            accent: theme.sky
        ),
        HealthItem(
            category: "Travel insurance", icon: "checkmark.shield.fill", importance: .essential,
            overview: "Medical care and island evacuation can be enormously costly without cover.",
            prevention: ["Buy it before you travel", "Make sure it covers diving, scooters and evacuation", "Keep the 24-hour assistance number to hand"],
            symptoms: ["Not applicable"],
            whenToSeeDoctor: "Call the assistance line before major treatment where possible.",
            beforeYouGo: ["Compare policies", "Declare activities (diving, trekking, riding)", "Save the policy and number offline"],
            treatment: "Use the insurer’s assistance line to coordinate care and evacuation.",
            whoMostAtRisk: "Everyone — divers and scooter riders especially.",
            costNote: "A tiny fraction of a single evacuation’s cost.",
            expertTip: "Confirm scuba and scooter cover — standard policies often exclude both.",
            commonMyths: ["‘My card insurance is enough’ — it usually excludes diving and remote evacuation"],
            accent: theme.moss
        ),
        HealthItem(
            category: "Medical kit", icon: "bandage.fill", importance: .recommended,
            overview: "A small first-aid kit handles common issues before you need a pharmacy.",
            prevention: ["Pack ORS, plasters and antiseptic", "Add motion-sickness tablets and an antihistamine", "Include personal meds and copies of prescriptions"],
            symptoms: ["Not applicable"],
            whenToSeeDoctor: "When symptoms exceed simple self-care.",
            beforeYouGo: ["Assemble a compact kit", "Antiseptic for reef cuts, which heal slowly"],
            treatment: "Self-treat minor issues; escalate when needed.",
            whoMostAtRisk: "Island and remote travellers.",
            costNote: "Cheap to assemble at home.",
            expertTip: "Clean reef cuts immediately with antiseptic — tropical wounds infect fast.",
            commonMyths: ["‘I’ll just buy it there’ — remote islands have limited supplies"],
            accent: theme.tint
        ),
        HealthItem(
            category: "Pharmacies & medication", icon: "pills.fill", importance: .recommended,
            overview: "Apotek pharmacies are widespread; bring prescriptions and check what’s legal.",
            prevention: ["Carry meds in their original packaging", "Bring a doctor’s letter for controlled meds", "Know the generic names"],
            symptoms: ["Not applicable"],
            whenToSeeDoctor: "For prescriptions and any persistent symptoms.",
            beforeYouGo: ["Check your medicines are legal in Indonesia", "Pack enough for the trip plus a buffer"],
            treatment: "Pharmacist advice for minor issues.",
            whoMostAtRisk: "Anyone on regular medication.",
            costNote: "Many meds are cheap over the counter; some are restricted.",
            expertTip: "Some common meds (e.g. strong codeine) are restricted — carry a doctor’s letter.",
            commonMyths: ["‘Any medicine is available’ — some are controlled or simply unavailable"],
            accent: theme.tint
        ),
        HealthItem(
            category: "Diving & water health", icon: "water.waves", importance: .important,
            overview: "Decompression sickness, ear problems and marine stings need care — especially in remote dive areas.",
            prevention: ["Dive within your limits and stay hydrated", "Don’t fly for 18–24 hours after diving", "Know the nearest recompression chamber"],
            symptoms: ["Joint pain, dizziness or numbness (DCS)", "Ear pain", "Sting reactions"],
            whenToSeeDoctor: "Any DCS symptom — urgent; oxygen and a chamber.",
            beforeYouGo: ["Dive insurance (e.g. DAN)", "Check your medical fitness to dive"],
            treatment: "Stop diving, give oxygen, and contact a chamber or DAN immediately.",
            whoMostAtRisk: "Divers in Komodo, Raja Ampat and the Gilis.",
            costNote: "Chamber treatment is expensive — dive insurance is essential.",
            expertTip: "Komodo and Raja Ampat are remote — confirm the nearest chamber and carry DAN cover.",
            commonMyths: ["‘You can fly straight after diving’ — wait at least 18–24 hours"],
            accent: theme.ocean
        ),
        HealthItem(
            category: "Mental health & wellbeing", icon: "heart.fill", importance: .recommended,
            overview: "Burnout, culture shock and isolation are real on long trips — look after your mind too.",
            prevention: ["Keep a routine and take rest days", "Stay in touch with people back home", "Limit alcohol — it worsens mood and sleep"],
            symptoms: ["Persistent low mood", "Anxiety and poor sleep", "Withdrawal"],
            whenToSeeDoctor: "If low mood or anxiety persists — use telehealth or local support.",
            beforeYouGo: ["Continue any medication and carry enough", "Note telehealth options"],
            treatment: "Rest, connection and professional support via telehealth if needed.",
            whoMostAtRisk: "Long-term and solo travellers.",
            costNote: "Telehealth varies; many apps are available.",
            expertTip: "Build in rest days — constant travel is tiring, and pacing protects your wellbeing.",
            commonMyths: ["‘Travel is always a holiday’ — long trips can be mentally taxing"],
            accent: theme.sky
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Stay healthy (tap to expand)").font(TravelTypography.section)
                    ExplorerHealthGuide(
                        items: topics,
                        subtitle: "Staying well across Bali, Lombok, the Gilis, Komodo & Raja Ampat."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerHealthGuide(items: [], title: "Health & wellbeing")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Health · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerHealthGuide(
                        items: topics,
                        layout: .compact,
                        title: "Health & wellbeing"
                    )

                    Text("Compact · The essentials").font(TravelTypography.section)
                    ExplorerHealthGuide(
                        items: topics.filter { $0.importance == .essential },
                        layout: .compact,
                        title: "Don’t-skip essentials"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Health · Compact")

            ScrollView {
                ExplorerHealthGuide(items: Array(topics.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Health · Dynamic Type XL")
        }
    }
}
#endif
