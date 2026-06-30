import SwiftUI

// MARK: - Travel offline essentials dashboard (Phase 130)
//
// A flagship, presentation-only Offline Essentials dashboard for Indonesia: a hero
// with a readiness overview, then everything a traveller wants saved before they lose
// signal — offline maps, saved bookings, emergency contacts, a passport/visa copies
// checklist, ferry tickets, hotel addresses, offline translation, offline currency
// notes, medical info, insurance details, dive cards/certifications, a backup-battery
// plan, a lost-phone plan and a no-signal travel checklist. A caller supplies an
// `OfflineGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `TravelTypography` and the tokens. The
// `Offline*` model names are deliberately distinct from earlier phases to avoid any
// collision. `OfflineGuide` and its nested rows are lightweight presentation models
// (not DTOs); the component holds no data, networking, persistence, repository, view-
// model, navigation, AppContainer or DTO logic, and is not wired into any screen. The
// "saved" states are static sample data and the favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A single at-a-glance offline-readiness fact.
struct OfflineFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single offline essential, with a saved/to-do state.
struct OfflineRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var saved: Bool

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, saved: Bool = true) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.saved = saved
    }
}

/// A checklist item (passport copies, no-signal checklist).
struct OfflineCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// The full, presentation-only content for an offline essentials guide.
struct OfflineGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [OfflineFact]
    var maps: [OfflineRow]
    var bookings: [OfflineRow]
    var ferryTickets: [OfflineRow]
    var hotelAddresses: [OfflineRow]
    var passportChecklist: [OfflineCheckItem]
    var emergencyContacts: [OfflineRow]
    var medicalInfo: [OfflineRow]
    var insurance: [OfflineRow]
    var diveCards: [OfflineRow]
    var translation: [OfflineRow]
    var currencyNotes: [OfflineRow]
    var batteryPlan: [OfflineRow]
    var lostPhonePlan: [OfflineRow]
    var noSignalChecklist: [OfflineCheckItem]
    var disclaimer: String

    /// All saveable rows, used for the readiness summary.
    var allRows: [OfflineRow] {
        maps + bookings + ferryTickets + hotelAddresses + emergencyContacts
            + medicalInfo + insurance + diveCards + translation + currencyNotes
            + batteryPlan + lostPhonePlan
    }
    var allChecks: [OfflineCheckItem] { passportChecklist + noSignalChecklist }
    var readyCount: Int { allRows.filter(\.saved).count + allChecks.filter(\.done).count }
    var totalCount: Int { allRows.count + allChecks.count }
    var readiness: Double {
        guard totalCount > 0 else { return 0 }
        return Double(readyCount) / Double(totalCount)
    }
}

/// A premium, presentation-only offline essentials dashboard rendered from an `OfflineGuide`.
struct TravelOfflineEssentialsDashboard: View {
    var guide: OfflineGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            hero
            readyGroup
            essentialsGroup
            docsGroup
            toolsGroup
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
            eyebrow: "Offline Essentials",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: "\(guide.readyCount)/\(guide.totalCount)", label: "Ready"),
                HeroMetric(value: factValue("Battery"), label: "Battery"),
                HeroMetric(value: factValue("Key contact"), label: "Contact")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(OfflineAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var readyGroup: some View {
        Group {
            section("At a glance", "Your offline kit.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Readiness", "How prepared you are for no signal.", 2) {
                readinessCard
            }

            section("Offline maps", "Navigate without data.", 3) {
                infoList(guide.maps)
            }
        }
    }

    private var essentialsGroup: some View {
        Group {
            section("Saved bookings", "Flights, tours and stays.", 4) {
                infoList(guide.bookings)
            }

            section("Ferry tickets", "Boats between the islands.", 5) {
                infoList(guide.ferryTickets)
            }

            section("Hotel addresses", "Show your driver.", 6) {
                infoList(guide.hotelAddresses)
            }
        }
    }

    private var docsGroup: some View {
        Group {
            section("Passport & visa copies", "Keep copies everywhere.", 7) {
                checklistCard(guide.passportChecklist)
            }

            section("Emergency contacts", "Saved offline.", 8) {
                infoList(guide.emergencyContacts)
            }

            section("Medical info", "If you can’t speak for yourself.", 8) {
                infoList(guide.medicalInfo)
            }

            section("Insurance details", "Policy to hand.", 8) {
                infoList(guide.insurance)
            }

            section("Dive cards & certs", "Proof to dive.", 8) {
                infoList(guide.diveCards)
            }
        }
    }

    private var toolsGroup: some View {
        Group {
            section("Offline translation", "Be understood anywhere.", 8) {
                infoList(guide.translation)
            }

            section("Currency notes", "Rough rates and cash.", 8) {
                infoList(guide.currencyNotes)
            }

            section("Backup battery plan", "Never hit zero.", 8) {
                infoList(guide.batteryPlan)
            }

            section("Lost-phone plan", "If it’s gone.", 8) {
                infoList(guide.lostPhonePlan)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("No-signal checklist", "Before you go off-grid.", 8) {
                checklistCard(guide.noSignalChecklist)
            }

            section("Good to know", "Keep copies safe.", 8) {
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
        .modifier(OfflineAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: OfflineFact) -> some View {
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

    // MARK: Readiness

    private var readinessCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    Text("\(guide.readyCount)")
                        .font(TravelTypography.display)
                        .foregroundStyle(theme.tint)
                    Text("of \(guide.totalCount) saved")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text("\(Int((guide.readiness * 100).rounded()))%")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(theme.tint)
                }
                PremiumProgressBar(
                    progress: appeared ? guide.readiness : 0,
                    colors: [theme.tint, theme.moss],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("Tick off the rest before you head somewhere off-grid like Komodo or Raja Ampat.")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Readiness, \(guide.readyCount) of \(guide.totalCount) essentials saved, \(Int((guide.readiness * 100).rounded())) percent.")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [OfflineRow]) -> some View {
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
                                savedPill(row.saved)
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
                .accessibilityLabel("\(row.title), \(row.saved ? "saved offline" : "to do")\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
            }
        }
    }

    private func savedPill(_ saved: Bool) -> some View {
        let tint = saved ? theme.moss : theme.sun
        return HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: saved ? "checkmark.circle.fill" : "circle.dashed")
            Text(saved ? "Saved" : "To do").textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(tint.opacity(0.15), in: Capsule())
    }

    // MARK: Checklist

    private func checklistCard(_ items: [OfflineCheckItem]) -> some View {
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
                    .accessibilityLabel("\(item.name), \(item.done ? "done" : "to do"). \(item.note)")
                }
            }
        }
    }

    // MARK: Disclaimer

    private var disclaimerCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "lock.shield.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Keep your copies secure")
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
        .accessibilityLabel("Keep your copies secure. \(guide.disclaimer)")
    }

    // MARK: Shared bits

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

// MARK: - Offline appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct OfflineAppear: ViewModifier {
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
extension OfflineGuide {
    /// A deterministic sample offline-essentials guide for an Indonesia trip.
    static var sampleIndonesia: OfflineGuide {
        let theme = TravelTheme.current
        return OfflineGuide(
            heroTitle: "Offline Essentials",
            heroSubtitle: "Bali, the Gilis, Komodo and Raja Ampat all have dead zones — save the important things now.",
            heroSymbol: "arrow.down.circle.fill",
            heroGradient: [theme.ocean, theme.tint, theme.moss],
            facts: [
                OfflineFact(icon: "map.fill", label: "Maps", value: "4 areas saved"),
                OfflineFact(icon: "powerplug.fill", label: "Battery", value: "Power bank ✓"),
                OfflineFact(icon: "phone.fill", label: "Key contact", value: "BIMC Bali"),
                OfflineFact(icon: "checkmark.shield.fill", label: "Insurance", value: "Saved offline")
            ],
            maps: [
                OfflineRow(title: "Bali (south)", subtitle: "Google Maps", icon: "map.fill", detail: "Canggu, Ubud, Sanur and the airport saved for offline navigation.", accent: theme.tint, saved: true),
                OfflineRow(title: "Gili & Lombok", subtitle: "Google Maps", icon: "map.fill", detail: "Gili Air/Meno and Kuta Lombok areas downloaded.", accent: theme.tint, saved: true),
                OfflineRow(title: "Labuan Bajo (Komodo)", subtitle: "Google Maps", icon: "map.fill", detail: "Town and harbour area saved — little signal out at the islands.", accent: theme.tint, saved: true),
                OfflineRow(title: "Organic Maps backup", subtitle: "Second app", icon: "map", detail: "Full offline backup in case Google Maps misbehaves.", accent: theme.ocean, saved: false)
            ],
            bookings: [
                OfflineRow(title: "Flight DPS → LBJ", subtitle: "Wings Air", icon: "airplane", detail: "E-ticket PDF and check-in reference screenshotted to the photo album.", accent: theme.sky, saved: true),
                OfflineRow(title: "Hotel confirmations", subtitle: "All stays", icon: "bed.double.fill", detail: "Booking PDFs and confirmation numbers saved offline for each island.", accent: theme.tint, saved: true),
                OfflineRow(title: "Komodo liveaboard", subtitle: "Voucher", icon: "sailboat.fill", detail: "Operator voucher and WhatsApp contact saved.", accent: theme.ocean, saved: false)
            ],
            ferryTickets: [
                OfflineRow(title: "Sanur → Lembongan", subtitle: "Fast boat", icon: "ferry.fill", detail: "Mobile ticket QR screenshotted in case the app won’t load at the pier.", accent: theme.sky, saved: true),
                OfflineRow(title: "Lembongan → Gili Air", subtitle: "Fast boat", icon: "ferry.fill", detail: "PDF ticket and operator number saved offline.", accent: theme.ocean, saved: true),
                OfflineRow(title: "Gili Air → Bangsal", subtitle: "Public boat", icon: "sailboat.fill", detail: "No e-ticket — note the schedule and harbour name offline.", accent: theme.tint, saved: false)
            ],
            hotelAddresses: [
                OfflineRow(title: "Canggu villa", subtitle: "Bali", icon: "house.fill", detail: "“Jl. Pantai Batu Bolong, Canggu” saved in Bahasa to show drivers.", accent: theme.tint, saved: true),
                OfflineRow(title: "Gili Air bungalow", subtitle: "Gili", icon: "house.fill", detail: "Pinned on the offline map with the owner’s WhatsApp.", accent: theme.moss, saved: true),
                OfflineRow(title: "Labuan Bajo hotel", subtitle: "Komodo", icon: "house.fill", detail: "Address and a screenshot of the map pin for the airport transfer.", accent: theme.ocean, saved: false)
            ],
            passportChecklist: [
                OfflineCheckItem(name: "Passport photo page scan", done: true, note: "In photos and cloud"),
                OfflineCheckItem(name: "e-VOA / visa QR", done: true, note: "Saved offline for arrival"),
                OfflineCheckItem(name: "Return / onward ticket", done: true, note: "Proof of onward travel"),
                OfflineCheckItem(name: "Spare passport photos", done: false, note: "For a visa extension"),
                OfflineCheckItem(name: "Printed paper copy", done: false, note: "Kept separate from the passport")
            ],
            emergencyContacts: [
                OfflineRow(title: "Emergency 112", subtitle: "Nationwide", icon: "phone.fill", detail: "Plus 118/119 ambulance and 115 sea rescue.", accent: theme.coral, saved: true),
                OfflineRow(title: "BIMC Hospital Bali", subtitle: "Direct line", icon: "cross.fill", detail: "Saved with the address; often faster than the general number.", accent: theme.coral, saved: true),
                OfflineRow(title: "Insurer 24h & DAN", subtitle: "Evacuation", icon: "lifepreserver.fill", detail: "Assistance line and DAN dive hotline stored offline.", accent: theme.ocean, saved: true),
                OfflineRow(title: "Embassy & ICE", subtitle: "Back home", icon: "person.crop.circle.badge.exclamationmark", detail: "Your embassy and an in-case-of-emergency contact saved.", accent: theme.tint, saved: false)
            ],
            medicalInfo: [
                OfflineRow(title: "Personal medical card", subtitle: "ICE", icon: "heart.text.square.fill", detail: "Blood type, allergies, conditions and medications on a lock-screen card.", accent: theme.coral, saved: true),
                OfflineRow(title: "Prescriptions & letter", subtitle: "Docs", icon: "pills.fill", detail: "Photo of prescriptions and a doctor’s letter for customs and pharmacies.", accent: theme.tint, saved: false)
            ],
            insurance: [
                OfflineRow(title: "Policy number & cover", subtitle: "Saved offline", icon: "doc.text.fill", detail: "Policy PDF, 24h assistance line and confirmation it covers diving.", accent: theme.moss, saved: true),
                OfflineRow(title: "Claim process notes", subtitle: "Just in case", icon: "list.bullet.rectangle.fill", detail: "What to photograph and report if you need to claim.", accent: theme.tint, saved: false)
            ],
            diveCards: [
                OfflineRow(title: "PADI Advanced card", subtitle: "Certification", icon: "rosette", detail: "Photo of your c-card and the dive shop will accept it.", accent: theme.ocean, saved: true),
                OfflineRow(title: "DAN membership", subtitle: "Dive cover", icon: "lifepreserver.fill", detail: "Membership number and emergency hotline saved.", accent: theme.tint, saved: true),
                OfflineRow(title: "Logbook & nitrox", subtitle: "Proof of dives", icon: "book.fill", detail: "Recent dives and your nitrox cert photographed for liveaboard check-in.", accent: theme.moss, saved: false)
            ],
            translation: [
                OfflineRow(title: "Indonesian language pack", subtitle: "Google Translate", icon: "character.book.closed.fill", detail: "Downloaded so you can translate menus and signs without data.", accent: theme.tint, saved: true),
                OfflineRow(title: "Key phrases note", subtitle: "Backup", icon: "text.bubble.fill", detail: "A short saved note of greetings, numbers and emergency phrases.", accent: theme.ocean, saved: false)
            ],
            currencyNotes: [
                OfflineRow(title: "Rough exchange rate", subtitle: "Reference", icon: "arrow.left.arrow.right", detail: "Noted £1 ≈ Rp 20,400 so you can sense-check prices offline.", accent: theme.sun, saved: true),
                OfflineRow(title: "Daily cash plan", subtitle: "Budget", icon: "banknote.fill", detail: "Cash drawn for boat days and small islands where cards don’t work.", accent: theme.moss, saved: false)
            ],
            batteryPlan: [
                OfflineRow(title: "Power bank charged", subtitle: "10,000mAh+", icon: "powerplug.fill", detail: "Topped up before every boat day and remote stay.", accent: theme.tint, saved: true),
                OfflineRow(title: "Charge nightly", subtitle: "Habit", icon: "battery.100percent.bolt", detail: "Phone and bank charged whenever mains power is available.", accent: theme.moss, saved: true),
                OfflineRow(title: "Cables & adapter", subtitle: "Spares", icon: "cable.connector", detail: "Spare cable and a Type C/F adapter packed.", accent: theme.ocean, saved: false)
            ],
            lostPhonePlan: [
                OfflineRow(title: "Find My enabled", subtitle: "Tracking", icon: "location.magnifyingglass", detail: "Device tracking and remote-wipe set up before you travel.", accent: theme.tint, saved: true),
                OfflineRow(title: "Numbers on paper", subtitle: "Backup", icon: "doc.plaintext.fill", detail: "Key contacts and your hotel written on a card, not just in the phone.", accent: theme.sun, saved: false),
                OfflineRow(title: "Cloud backup & spare", subtitle: "Recovery", icon: "icloud.fill", detail: "Recent backup done; a cheap spare phone and a local SIM as a fallback.", accent: theme.ocean, saved: false)
            ],
            noSignalChecklist: [
                OfflineCheckItem(name: "Offline maps downloaded", done: true, note: "Every island you’ll visit"),
                OfflineCheckItem(name: "Tickets screenshotted", done: true, note: "Boats, flights and tours"),
                OfflineCheckItem(name: "Cash on hand", done: true, note: "For cash-only islands and boats"),
                OfflineCheckItem(name: "Itinerary shared", done: false, note: "With someone back home"),
                OfflineCheckItem(name: "Power bank charged", done: false, note: "A dead phone is the real emergency")
            ],
            disclaimer: "This is a preparation aid, not secure storage. Keep copies of sensitive documents protected (a locked album or encrypted store), don’t share them carelessly, and confirm your live bookings and details before you travel."
        )
    }
}

struct TravelOfflineEssentialsDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelOfflineEssentialsDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Offline essentials · Indonesia")

            TravelOfflineEssentialsDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Offline essentials · Dynamic Type XL")
        }
    }
}
#endif
