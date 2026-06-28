import SwiftUI

// MARK: - Travel packing & preparation dashboard (Phase 112)
//
// A premium Packing & Preparation dashboard travellers can use before every trip:
// a departure countdown, overall packing-completion progress, a must-not-forget
// favourites list, and a full set of interactive checklists (documents, passport,
// visa, flights, ferries, accommodation, insurance, vaccinations, medications,
// electronics, chargers, camera/drone, dive and surf gear, clothing, toiletries,
// money, emergency contacts, offline maps, download-before-you-go and the last 24
// hours). A caller supplies a `PackingDashboard` value; progress is derived in-view
// from the UI-only checklist state (deterministic presentation arithmetic).
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumProgressBar`, `PremiumMetricTile`,
// `GlassCard`, `MapTexturePlaceholder`, `TravelTypography` and the tokens.
// `PackingDashboard` / `PackingGroup` are lightweight presentation models (not
// DTOs); the dashboard holds no data, networking, persistence, repository,
// view-model, navigation, AppContainer or DTO logic, and is not wired into any
// screen. All checklist and favourite toggles are UI-only.
//
// Accessibility: checklist items are independently focusable toggle buttons; cards
// expose combined VoiceOver labels; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// A named group of checklist items.
struct PackingGroup: Identifiable {
    let id: String
    var title: String
    var subtitle: String
    var icon: String
    var accent: Color
    var items: [String]

    init(id: String? = nil, title: String, subtitle: String, icon: String, accent: Color, items: [String]) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.accent = accent
        self.items = items
    }
}

/// The full, presentation-only content for a packing & preparation dashboard.
struct PackingDashboard {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var countdownDays: Int
    var departureLabel: String
    var favouriteItems: [String]
    var groups: [PackingGroup]

    var totalItems: Int { groups.reduce(0) { $0 + $1.items.count } }
}

/// A premium, presentation-only packing & preparation dashboard rendered from a `PackingDashboard`.
struct TravelPackingChecklistDashboard: View {
    var plan: PackingDashboard

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var checked: Set<String> = []
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    private var progress: Double {
        guard plan.totalItems > 0 else { return 0 }
        return min(max(Double(checked.count) / Double(plan.totalItems), 0), 1)
    }

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: plan.heroSymbol,
                title: plan.heroTitle,
                subtitle: plan.heroSubtitle,
                gradient: plan.heroGradient,
                metrics: [
                    HeroMetric(value: "\(plan.countdownDays) days", label: "Until departure"),
                    HeroMetric(value: "\(Int((progress * 100).rounded()))%", label: "Packed"),
                    HeroMetric(value: "\(plan.totalItems)", label: "Items")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(PackingAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            countdownCard
                .modifier(PackingAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            section("Must not forget", "Tick your non-negotiables.", 2) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(plan.favouriteItems, id: \.self) { item in
                            favouriteRow(item)
                        }
                    }
                }
            }

            ForEach(Array(plan.groups.enumerated()), id: \.element.id) { index, group in
                section(group.title, group.subtitle, index + 3) {
                    groupCard(group)
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

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(PackingAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Cards & rows

    private var countdownCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text("Departure in")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    Text("\(plan.countdownDays)")
                        .font(TravelTypography.display)
                        .monospacedDigit()
                    Text("days")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text(plan.departureLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                PremiumProgressBar(
                    progress: appeared ? progress : 0,
                    colors: [theme.moss, theme.sky],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("\(checked.count) of \(plan.totalItems) packed · \(Int((progress * 100).rounded()))% complete")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Departure in \(plan.countdownDays) days, \(plan.departureLabel). \(checked.count) of \(plan.totalItems) items packed.")
    }

    private func groupCard(_ group: PackingGroup) -> some View {
        let done = group.items.filter { checked.contains(key(group, $0)) }.count
        return GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(spacing: TravelSpacing.md) {
                    medallion(group.icon, group.accent)
                    Spacer(minLength: 0)
                    Text("\(done)/\(group.items.count)")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                VStack(spacing: TravelSpacing.xxs) {
                    ForEach(group.items, id: \.self) { item in
                        checkRow(key: key(group, item), label: item)
                    }
                }
            }
        }
    }

    private func favouriteRow(_ item: String) -> some View {
        let isFav = favourites.contains(item)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isFav { favourites.remove(item) } else { favourites.insert(item) }
            }
        } label: {
            HStack(spacing: TravelSpacing.sm) {
                Image(systemName: isFav ? "star.fill" : "star")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isFav ? theme.sun : Color.secondary)
                Text(item)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isFav ? .secondary : .primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item) — must not forget")
        .accessibilityValue(isFav ? "Starred" : "Not starred")
        .accessibilityHint("Double tap to toggle")
    }

    private func checkRow(key: String, label: String) -> some View {
        let isOn = checked.contains(key)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isOn { checked.remove(key) } else { checked.insert(key) }
            }
        } label: {
            HStack(alignment: .top, spacing: TravelSpacing.sm) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isOn ? theme.moss : Color.secondary)
                Text(label)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isOn ? .secondary : .primary)
                    .strikethrough(isOn, color: .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(isOn ? "Packed" : "Not packed")
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

    private func key(_ group: PackingGroup, _ item: String) -> String { "\(group.id)::\(item)" }
}

// MARK: - Packing appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct PackingAppear: ViewModifier {
    let appeared: Bool
    let reduceMotion: Bool
    let index: Int

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 10)
            .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.04), value: appeared)
    }
}

#if DEBUG
extension PackingDashboard {
    /// A deterministic sample packing plan for an Indonesia trip.
    static var sampleIndonesia: PackingDashboard {
        let theme = TravelTheme.current
        return PackingDashboard(
            heroTitle: "Packing & Prep",
            heroSubtitle: "Everything ticked off before you fly out to Bali, Lombok and the islands.",
            heroSymbol: "suitcase.fill",
            heroGradient: [theme.tint, theme.ocean, theme.sun.opacity(0.6)],
            countdownDays: 5,
            departureLabel: "Departs 12 Aug 2025",
            favouriteItems: ["Passport", "Reef-safe sunscreen", "Mosquito repellent", "Power bank", "Cash for the islands", "Dive computer"],
            groups: [
                PackingGroup(title: "Essential documents", subtitle: "The non-negotiables.", icon: "doc.text.fill", accent: theme.coral, items: ["Passport (6+ months validity)", "Printed + cloud copies", "Travel insurance details", "Flight & hotel confirmations", "International driving permit (scooters)"]),
                PackingGroup(title: "Passport", subtitle: "Check it’s travel-ready.", icon: "person.text.rectangle.fill", accent: theme.ocean, items: ["Valid 6+ months beyond travel", "2+ blank pages", "Photocopy stored separately", "Cloud photo backup"]),
                PackingGroup(title: "Visa", subtitle: "Entry sorted.", icon: "checkmark.seal.fill", accent: theme.sky, items: ["Check visa-on-arrival eligibility", "VOA fee in cash or card", "e-VOA printed if used", "Onward/return ticket proof"]),
                PackingGroup(title: "Flight tickets", subtitle: "Ready to board.", icon: "airplane", accent: theme.sky, items: ["E-tickets downloaded offline", "Seats & baggage confirmed", "Online check-in 24h before", "Domestic baggage limits noted"]),
                PackingGroup(title: "Ferry tickets", subtitle: "Island crossings booked.", icon: "ferry.fill", accent: theme.ocean, items: ["Fast boat booked (e.g. Gili Getaway)", "QR/screenshot saved offline", "Morning crossing chosen", "Harbour & pickup confirmed"]),
                PackingGroup(title: "Accommodation", subtitle: "Every night covered.", icon: "bed.double.fill", accent: theme.sun, items: ["All bookings confirmed", "Addresses saved offline", "Check-in times noted", "First-night transfer arranged"]),
                PackingGroup(title: "Insurance documents", subtitle: "Covered for anything.", icon: "checkmark.shield.fill", accent: theme.moss, items: ["Covers diving & scooters", "24-hour assistance number saved", "Policy number stored offline", "Medical evacuation included"]),
                PackingGroup(title: "Vaccinations", subtitle: "Health prepared.", icon: "syringe.fill", accent: theme.coral, items: ["Routine vaccines up to date", "Hepatitis A & Typhoid", "Rabies (for longer stays)", "Vaccine record carried"]),
                PackingGroup(title: "Medications", subtitle: "Your travel kit.", icon: "pills.fill", accent: theme.coral, items: ["Personal meds + spares", "Oralit (ORS) for Bali belly", "Antihistamine & motion-sickness", "Doctor’s letter for controlled meds"]),
                PackingGroup(title: "Electronics", subtitle: "Gadgets ready.", icon: "iphone.gen3", accent: theme.tint, items: ["Phone + offline maps", "Power bank (carry-on only)", "Headphones", "Kindle / tablet"]),
                PackingGroup(title: "Chargers & adapters", subtitle: "Stay powered.", icon: "powerplug.fill", accent: theme.moss, items: ["Universal travel adapter", "Multi-port USB charger", "All charging cables", "Spare batteries (carry-on)"]),
                PackingGroup(title: "Camera & drone", subtitle: "Capture it all.", icon: "camera.fill", accent: theme.tint, items: ["Camera + spare memory cards", "Spare camera batteries", "Drone + registration/permits", "Silica gel for humidity"]),
                PackingGroup(title: "Dive equipment", subtitle: "Ready for the reef.", icon: "water.waves", accent: theme.ocean, items: ["Mask + dive computer", "Certification & logbook", "DAN dive insurance", "3mm shorty (warm water)"]),
                PackingGroup(title: "Surf equipment", subtitle: "Ready for the waves.", icon: "figure.surfing", accent: theme.sky, items: ["Boardies & rash vest", "Reef booties", "Reef-safe sunscreen", "Ding-repair kit (own board)"]),
                PackingGroup(title: "Clothing by climate", subtitle: "Dress for the tropics.", icon: "tshirt.fill", accent: theme.sun, items: ["Light, quick-dry tropical wear", "Sarong for temples", "Warm layer for Rinjani / Bromo", "Light rain jacket (wet season)"]),
                PackingGroup(title: "Toiletries", subtitle: "The essentials.", icon: "shower.fill", accent: theme.sky, items: ["Reef-safe sunscreen (SPF 30–50)", "Mosquito repellent (DEET/picaridin)", "Travel-size liquids (≤100ml)", "After-sun & lip balm"]),
                PackingGroup(title: "Money & cards", subtitle: "Funds sorted.", icon: "banknote.fill", accent: theme.moss, items: ["Cash — island ATMs run dry", "Backup card stored separately", "Cards enabled for travel", "Small notes for warungs & ferries"]),
                PackingGroup(title: "Emergency contacts", subtitle: "Saved and reachable.", icon: "cross.case.fill", accent: theme.coral, items: ["112 & 115 saved offline", "Embassy after-hours number", "Hotel & insurer numbers", "Next-of-kin contact"]),
                PackingGroup(title: "Offline maps", subtitle: "Navigate without signal.", icon: "map.fill", accent: theme.tint, items: ["Bali, Lombok & Gilis downloaded", "Hotel pins saved", "Maps.me as a backup", "Offline Indonesian translation pack"]),
                PackingGroup(title: "Download before you go", subtitle: "Apps & files.", icon: "arrow.down.circle.fill", accent: theme.ocean, items: ["Gojek & Grab apps", "Booking confirmations", "Entertainment for the flight", "VPN installed & signed in"]),
                PackingGroup(title: "Last 24 hours", subtitle: "Final run-through.", icon: "clock.fill", accent: theme.coral, items: ["Check in online", "Charge all devices & power bank", "Withdraw / confirm cash", "Confirm the airport transfer", "Re-pack carry-on essentials"])
            ]
        )
    }
}

struct TravelPackingChecklistDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelPackingChecklistDashboard(plan: .sampleIndonesia)
                .previewDisplayName("Packing & prep · Indonesia")

            TravelPackingChecklistDashboard(plan: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Packing & prep · Dynamic Type XL")
        }
    }
}
#endif
