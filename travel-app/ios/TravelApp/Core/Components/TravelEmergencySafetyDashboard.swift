import SwiftUI

// MARK: - Travel emergency & safety dashboard (Phase 108)
//
// A premium Emergency & Safety dashboard giving travellers quick access to the most
// important information they may need during a trip — emergency numbers, hospitals,
// pharmacies, embassies, a lost-passport guide, insurance checklist, useful phrases,
// ocean/volcano/earthquake/disaster advice, scam awareness, solo / women / night
// safety, and a UI-only offline checklist. A caller supplies an `EmergencyPlan`.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumPillRow`,
// `PremiumMetricTile`, `GlassCard`, `MapTexturePlaceholder`, `TravelTypography` and
// the tokens — and the Phase-101 `DestinationListItem` and Phase-89 `EmergencyPhrase`
// models. `EmergencyPlan` is a lightweight presentation model (not a DTO); the
// dashboard holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. Phone
// numbers are shown as selectable text (not tappable `tel:` links); the offline
// checklist toggles are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// The full, presentation-only content for an emergency & safety dashboard.
struct EmergencyPlan {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var emergencyNumbers: [DestinationListItem]
    var hospitals: [DestinationListItem]
    var pharmacies: [DestinationListItem]
    var embassies: [DestinationListItem]
    var lostPassport: [String]
    var insuranceChecklist: [String]
    var phrases: [EmergencyPhrase]
    var oceanBeach: [String]
    var volcanoEarthquake: [String]
    var naturalDisaster: [String]
    var scamAwareness: [String]
    var soloSafety: [String]
    var womenTips: [String]
    var nightSafety: [String]
    var offlineChecklist: [String]
}

/// A premium, presentation-only emergency & safety dashboard rendered from an `EmergencyPlan`.
struct TravelEmergencySafetyDashboard: View {
    var plan: EmergencyPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var checked: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: plan.heroSymbol,
                title: plan.heroTitle,
                subtitle: plan.heroSubtitle,
                gradient: plan.heroGradient,
                metrics: [
                    HeroMetric(value: "\(plan.emergencyNumbers.count)", label: "Numbers"),
                    HeroMetric(value: "\(plan.hospitals.count)", label: "Hospitals"),
                    HeroMetric(value: "112", label: "Nationwide")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(EmergencySafetyAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            section("Emergency numbers", "Save these before you travel.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 160) {
                    ForEach(plan.emergencyNumbers) { item in
                        numberCard(item)
                    }
                }
            }

            listSection("Hospitals & clinics", "Where to get care.", plan.hospitals, tag: "Hospital", 2)
            listSection("Pharmacies", "For prescriptions and remedies.", plan.pharmacies, tag: "Pharmacy", 3)
            listSection("Embassy & consulate", "Your country’s help abroad.", plan.embassies, tag: "Embassy", 4)

            section("Lost passport", "What to do, step by step.", 5) {
                numberedCard(plan.lostPassport, tint: theme.coral)
            }

            section("Travel insurance checklist", "Confirm before you go.", 6) {
                bulletCard(plan.insuranceChecklist, icon: "checkmark.shield.fill", tint: theme.moss)
            }

            section("Useful emergency phrases", "A few words can help fast.", 7) {
                GlassCard {
                    VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                        ForEach(plan.phrases, id: \.self) { phrase in
                            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                                Text(phrase.indonesian)
                                    .font(TravelTypography.caption)
                                    .textSelection(.enabled)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("“\(phrase.english)”")
                                    .font(TravelTypography.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }

            section("Ocean & beach safety", "Respect the sea.", 8) {
                bulletCard(plan.oceanBeach, icon: "water.waves", tint: theme.ocean)
            }

            section("Volcano & earthquake", "Be ready to act.", 9) {
                bulletCard(plan.volcanoEarthquake, icon: "mountain.2.fill", tint: theme.coral)
            }

            section("Natural disasters", "Follow official guidance.", 10) {
                bulletCard(plan.naturalDisaster, icon: "exclamationmark.triangle.fill", tint: theme.sun)
            }

            section("Scam awareness", "Common traps to avoid.", 11) {
                bulletCard(plan.scamAwareness, icon: "exclamationmark.shield.fill", tint: theme.coral)
            }

            section("Solo traveller safety", "Look after yourself.", 12) {
                bulletCard(plan.soloSafety, icon: "figure.walk", tint: theme.tint)
            }

            section("Women traveller tips", "Travel confidently.", 13) {
                bulletCard(plan.womenTips, icon: "person.fill", tint: theme.coral)
            }

            section("Night safety", "After dark.", 14) {
                bulletCard(plan.nightSafety, icon: "moon.stars.fill", tint: theme.ocean)
            }

            section("Offline emergency checklist", "Prepare before you lose signal.", 15) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(plan.offlineChecklist, id: \.self) { item in
                            checklistRow(item)
                        }
                    }
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

    // MARK: Section helpers

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(EmergencySafetyAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    private func listSection(_ title: String, _ subtitle: String, _ items: [DestinationListItem], tag: String, _ index: Int) -> some View {
        section(title, subtitle, index) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(items) { item in
                    PremiumPillRow(symbol: item.icon, accent: item.accent, title: item.title, subtitle: item.detail, trailing: tag)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(item.title). \(item.detail)")
                }
            }
        }
    }

    // MARK: Cards & rows

    private func numberCard(_ item: DestinationListItem) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack {
                    medallion(item.icon, item.accent)
                    Spacer(minLength: 0)
                }
                Text(item.title)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.detail)
                    .font(TravelTypography.section)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.title), \(item.detail)")
    }

    private func numberedCard(_ steps: [String], tint: Color) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: TravelSpacing.sm) {
                        Text("\(index + 1)")
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.white)
                            .frame(width: 22, height: 22)
                            .background(tint, in: Circle())
                        Text(step)
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

    private func checklistRow(_ item: String) -> some View {
        let isChecked = checked.contains(item)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isChecked { checked.remove(item) } else { checked.insert(item) }
            }
        } label: {
            HStack(alignment: .top, spacing: TravelSpacing.sm) {
                Image(systemName: isChecked ? "checkmark.circle.fill" : "circle")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isChecked ? theme.moss : Color.secondary)
                Text(item)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isChecked ? .secondary : .primary)
                    .strikethrough(isChecked, color: .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item)
        .accessibilityValue(isChecked ? "Done" : "Not done")
        .accessibilityHint("Double tap to toggle")
    }

    private func medallion(_ icon: String, _ accent: Color) -> some View {
        Image(systemName: icon)
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

// MARK: - Emergency & safety appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct EmergencySafetyAppear: ViewModifier {
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
extension EmergencyPlan {
    /// A deterministic sample emergency & safety plan for Indonesia.
    static var sampleIndonesia: EmergencyPlan {
        let theme = TravelTheme.current
        return EmergencyPlan(
            heroTitle: "Emergency & Safety",
            heroSubtitle: "Quick access to the numbers, help and advice you might need across Bali, Lombok and the islands.",
            heroSymbol: "cross.case.fill",
            heroGradient: [theme.coral, theme.ocean, theme.sky],
            emergencyNumbers: [
                DestinationListItem(icon: "exclamationmark.shield.fill", title: "General emergency", detail: "112", accent: theme.coral),
                DestinationListItem(icon: "shield.lefthalf.filled", title: "Police", detail: "110", accent: theme.tint),
                DestinationListItem(icon: "cross.case.fill", title: "Ambulance", detail: "118 / 119", accent: theme.coral),
                DestinationListItem(icon: "flame.fill", title: "Fire service", detail: "113", accent: theme.coral),
                DestinationListItem(icon: "shield.righthalf.filled", title: "Tourist Police (Bali)", detail: "112 · +62 361 754599", accent: theme.sun),
                DestinationListItem(icon: "lifepreserver", title: "Sea rescue (BASARNAS)", detail: "115", accent: theme.ocean)
            ],
            hospitals: [
                DestinationListItem(icon: "cross.fill", title: "BIMC Hospital (Kuta / Nusa Dua)", detail: "Private, English-speaking, 24h ER. +62 361 761263.", accent: theme.coral),
                DestinationListItem(icon: "cross.fill", title: "Siloam Hospitals (Bali)", detail: "Large private network with emergency rooms.", accent: theme.ocean),
                DestinationListItem(icon: "cross.case.fill", title: "Local clinics (klinik / puskesmas)", detail: "Fine for minor issues; serious cases transfer to Bali.", accent: theme.sun)
            ],
            pharmacies: [
                DestinationListItem(icon: "pills.fill", title: "Kimia Farma", detail: "Trusted nationwide chain.", accent: theme.moss),
                DestinationListItem(icon: "pills.fill", title: "Guardian / Watsons", detail: "Common in malls and tourist areas.", accent: theme.sky),
                DestinationListItem(icon: "pills.fill", title: "Apotek K-24", detail: "24-hour pharmacies in the cities.", accent: theme.coral)
            ],
            embassies: [
                DestinationListItem(icon: "building.columns.fill", title: "Australian Consulate-General, Bali", detail: "+62 361 2000 100", accent: theme.ocean),
                DestinationListItem(icon: "building.columns.fill", title: "New Zealand Embassy, Jakarta", detail: "+62 21 2995 5800", accent: theme.sky),
                DestinationListItem(icon: "globe", title: "Find your embassy", detail: "Most are in Jakarta; save the after-hours line offline.", accent: theme.tint)
            ],
            lostPassport: [
                "File a police report immediately — you’ll need it.",
                "Contact your embassy or consulate.",
                "Bring passport photos, an ID copy and your flight details.",
                "Apply for an emergency travel document; allow a few extra days."
            ],
            insuranceChecklist: [
                "Bought before you travelled.",
                "Covers diving, scooters and medical evacuation.",
                "24-hour assistance number saved offline.",
                "Policy number and documents stored offline."
            ],
            phrases: [
                EmergencyPhrase(indonesian: "Tolong!", english: "Help!"),
                EmergencyPhrase(indonesian: "Panggil ambulans!", english: "Call an ambulance!"),
                EmergencyPhrase(indonesian: "Saya butuh dokter.", english: "I need a doctor."),
                EmergencyPhrase(indonesian: "Di mana rumah sakit?", english: "Where is the hospital?"),
                EmergencyPhrase(indonesian: "Panggil polisi!", english: "Call the police!")
            ],
            oceanBeach: [
                "Check for flags and ask locals before swimming.",
                "Caught in a rip current? Don’t fight it — swim parallel to shore, then back in.",
                "Many beaches have strong currents and no lifeguards.",
                "Wear reef booties and never touch or stand on the reef."
            ],
            volcanoEarthquake: [
                "Earthquake: drop, cover and hold on; move away from glass and tall furniture.",
                "A strong coastal quake can precede a tsunami — head inland or to high ground.",
                "Volcano: respect the exclusion zone and follow PVMBG / BPBD alerts.",
                "Agung (Bali) and Rinjani (Lombok) are active — check the alert level before trekking."
            ],
            naturalDisaster: [
                "Follow official BNPB / BPBD instructions and local guidance.",
                "Keep your phone charged and enable emergency alerts.",
                "Know your accommodation’s muster point and evacuation route.",
                "Keep cash, water and documents accessible."
            ],
            scamAwareness: [
                "Use Blue Bird or insist on the meter; avoid unmetered taxis.",
                "Buy ferry tickets at official desks, never from beach touts.",
                "Photograph rental scooters first to avoid ‘damage’ claims.",
                "Be wary of ‘police’ demanding on-the-spot roadside fines."
            ],
            soloSafety: [
                "Share your itinerary and live location with someone you trust.",
                "Trust your instincts and leave any situation that feels off.",
                "Keep a backup card and cash stored separately.",
                "Avoid arriving somewhere new late at night."
            ],
            womenTips: [
                "Dress modestly away from the beach, especially in Lombok.",
                "Use reputable, app-booked transport at night.",
                "A confident, firm ‘no’ deters unwanted attention.",
                "Choose well-reviewed accommodation with good security."
            ],
            nightSafety: [
                "Stick to busy, well-lit areas.",
                "Watch your drink and pace yourself in nightlife spots.",
                "Pre-book your ride home rather than walking alone.",
                "Carry a torch on the Gilis — there are no street lights."
            ],
            offlineChecklist: [
                "Save offline maps and a translation pack",
                "Store passport and insurance photos offline",
                "Note 112 and your embassy number",
                "Download your booking confirmations",
                "Carry a charged power bank"
            ]
        )
    }
}

struct TravelEmergencySafetyDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelEmergencySafetyDashboard(plan: .sampleIndonesia)
                .previewDisplayName("Emergency & safety · Indonesia")

            TravelEmergencySafetyDashboard(plan: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Emergency & safety · Dynamic Type XL")
        }
    }
}
#endif
