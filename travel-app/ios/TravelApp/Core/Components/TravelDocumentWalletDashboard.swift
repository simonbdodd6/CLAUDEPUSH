import SwiftUI

// MARK: - Travel document wallet dashboard (Phase 131)
//
// A flagship, presentation-only Document Wallet dashboard: a hero with a readiness
// overview, a status summary (valid / expiring / action needed), a category-filtered
// list of document cards (passports, visas, bookings, ferry tickets, dive certificates,
// insurance), an emergency-contacts list and an offline-copies checklist. A caller
// supplies a `DocWalletGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `TravelTypography` and the tokens. The
// `Doc*` model names are deliberately distinct from earlier phases to avoid any
// collision. `DocWalletGuide` and its nested rows are lightweight presentation models
// (not DTOs); the component holds no data, networking, persistence, repository, view-
// model, navigation, AppContainer or DTO logic, and is not wired into any screen. The
// category filter, saved/checklist states and favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A document's status — drives the status badge label and accent.
enum DocStatus {
    case valid
    case expiring
    case action

    var label: String {
        switch self {
        case .valid: "Valid"
        case .expiring: "Expiring"
        case .action: "Action"
        }
    }

    var icon: String {
        switch self {
        case .valid: "checkmark.seal.fill"
        case .expiring: "clock.badge.exclamationmark.fill"
        case .action: "exclamationmark.triangle.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .valid: return theme.moss
        case .expiring: return theme.sun
        case .action: return theme.coral
        }
    }
}

/// A document category — drives the glyph, accent and the category filter.
enum DocCategory: String, CaseIterable {
    case passport
    case visa
    case booking
    case ticket
    case certificate
    case insurance

    var label: String {
        switch self {
        case .passport: "Passport"
        case .visa: "Visa"
        case .booking: "Booking"
        case .ticket: "Ticket"
        case .certificate: "Certificate"
        case .insurance: "Insurance"
        }
    }

    var icon: String {
        switch self {
        case .passport: "person.text.rectangle.fill"
        case .visa: "doc.text.fill"
        case .booking: "bed.double.fill"
        case .ticket: "ticket.fill"
        case .certificate: "rosette"
        case .insurance: "checkmark.shield.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .passport: return theme.tint
        case .visa: return theme.ocean
        case .booking: return theme.sky
        case .ticket: return theme.sun
        case .certificate: return theme.moss
        case .insurance: return theme.coral
        }
    }
}

/// A single at-a-glance wallet fact.
struct DocFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single stored document.
struct WalletDoc: Identifiable {
    let id: String
    var title: String
    var category: DocCategory
    var reference: String
    var expiry: String
    var detail: String
    var status: DocStatus
    var savedOffline: Bool

    init(id: String? = nil, title: String, category: DocCategory, reference: String, expiry: String, detail: String, status: DocStatus, savedOffline: Bool = true) {
        self.id = id ?? title
        self.title = title
        self.category = category
        self.reference = reference
        self.expiry = expiry
        self.detail = detail
        self.status = status
        self.savedOffline = savedOffline
    }
}

/// An emergency contact stored in the wallet.
struct DocContact: Identifiable {
    let id = UUID()
    var name: String
    var role: String
    var number: String
    var icon: String
    var accent: Color
}

/// A checklist item (offline copies).
struct DocCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// The full, presentation-only content for a document wallet.
struct DocWalletGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [DocFact]
    var documents: [WalletDoc]
    var contacts: [DocContact]
    var offlineCopies: [DocCheckItem]
    var disclaimer: String

    var validCount: Int { documents.filter { $0.status == .valid }.count }
    var expiringCount: Int { documents.filter { $0.status == .expiring }.count }
    var actionCount: Int { documents.filter { $0.status == .action }.count }
    var savedCount: Int { documents.filter(\.savedOffline).count }
    var savedReadiness: Double {
        guard !documents.isEmpty else { return 0 }
        return Double(savedCount) / Double(documents.count)
    }
}

/// A premium, presentation-only document wallet dashboard rendered from a `DocWalletGuide`.
struct TravelDocumentWalletDashboard: View {
    var guide: DocWalletGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedCategory = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private var categories: [String] { ["All"] + DocCategory.allCases.map(\.label) }

    private var filteredDocuments: [WalletDoc] {
        guard selectedCategory != "All" else { return guide.documents }
        return guide.documents.filter { $0.category.label == selectedCategory }
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            walletGroup
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
            eyebrow: "Document Wallet",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: "\(guide.documents.count)", label: "Documents"),
                HeroMetric(value: "\(guide.savedCount)/\(guide.documents.count)", label: "Saved"),
                HeroMetric(value: "\(guide.actionCount)", label: "Action")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(DocWalletAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "Your travel documents.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Status", "What needs attention.", 2) {
                overviewCard
            }
        }
    }

    private var walletGroup: some View {
        Group {
            section("Documents", "Filter by type.", 3) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    categoryFilter
                    if filteredDocuments.isEmpty {
                        GlassCard {
                            Text("No \(selectedCategory.lowercased()) documents.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredDocuments) { document in
                                documentCard(document)
                            }
                        }
                    }
                }
            }

            section("Emergency contacts", "Saved offline.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.contacts) { contact in
                        contactCard(contact)
                    }
                }
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Offline copies", "Backed up everywhere.", 5) {
                checklistCard(guide.offlineCopies)
            }

            section("Good to know", "Keep these safe.", 6) {
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
        .modifier(DocWalletAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: DocFact) -> some View {
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

    // MARK: Overview

    private var overviewCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                PremiumAdaptiveGrid(minimumWidth: 104) {
                    statusStat(.valid, guide.validCount)
                    statusStat(.expiring, guide.expiringCount)
                    statusStat(.action, guide.actionCount)
                }
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Saved offline")
                            .font(TravelTypography.caption)
                        Spacer(minLength: 0)
                        Text("\(guide.savedCount)/\(guide.documents.count)")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(theme.tint)
                    }
                    PremiumProgressBar(
                        progress: appeared ? guide.savedReadiness : 0,
                        colors: [theme.tint, theme.moss],
                        height: TravelSpacing.sm
                    )
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Status. \(guide.validCount) valid, \(guide.expiringCount) expiring, \(guide.actionCount) need action. \(guide.savedCount) of \(guide.documents.count) saved offline.")
    }

    private func statusStat(_ status: DocStatus, _ count: Int) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Label("\(count)", systemImage: status.icon)
                .font(TravelTypography.cardTitle)
                .foregroundStyle(status.accent)
            Text(status.label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }

    // MARK: Category filter

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(categories, id: \.self) { category in
                    let selected = category == selectedCategory
                    Button {
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
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    // MARK: Document cards

    private func documentCard(_ document: WalletDoc) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(document.category.icon, document.category.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack(spacing: TravelSpacing.xs) {
                            tagPill(document.category.label, document.category.accent)
                            statusBadge(document.status)
                        }
                        Text(document.title)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(document.reference)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(document.id, document.title)
                }
                HStack(spacing: TravelSpacing.xs) {
                    chip("calendar", document.expiry, theme.tint)
                    savedPill(document.savedOffline)
                }
                Text(document.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(document.category.label), \(document.title), \(document.status.label), \(document.reference), \(document.expiry), \(document.savedOffline ? "saved offline" : "not saved offline"). \(document.detail)")
    }

    private func statusBadge(_ status: DocStatus) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: status.icon)
            Text(status.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(status.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private func savedPill(_ saved: Bool) -> some View {
        let tint = saved ? theme.moss : theme.sun
        return HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: saved ? "arrow.down.circle.fill" : "circle.dashed")
            Text(saved ? "Offline" : "To save").textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(tint.opacity(0.15), in: Capsule())
    }

    // MARK: Contact cards

    private func contactCard(_ contact: DocContact) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(contact.icon, contact.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(contact.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(contact.role)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Label(contact.number, systemImage: "phone.fill")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                favouriteButton("contact-\(contact.name)", contact.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(contact.name), \(contact.role), \(contact.number)")
    }

    // MARK: Checklist

    private func checklistCard(_ items: [DocCheckItem]) -> some View {
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
                    Text("Keep documents secure")
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
        .accessibilityLabel("Keep documents secure. \(guide.disclaimer)")
    }

    // MARK: Shared bits

    private func chip(_ icon: String, _ text: String, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: icon)
            Text(text)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(tint.opacity(0.15), in: Capsule())
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
        .accessibilityLabel(isFav ? "Pinned: \(name)" : "Pin \(name)")
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

// MARK: - Document wallet appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct DocWalletAppear: ViewModifier {
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
extension DocWalletGuide {
    /// A deterministic sample document wallet for an Indonesia trip.
    static var sampleIndonesia: DocWalletGuide {
        let theme = TravelTheme.current
        return DocWalletGuide(
            heroTitle: "Document Wallet",
            heroSubtitle: "Every passport, ticket and certificate for your Indonesia trip — in one place, saved offline.",
            heroSymbol: "wallet.bifold.fill",
            heroGradient: [theme.tint, theme.ocean, theme.sky],
            facts: [
                DocFact(icon: "doc.on.doc.fill", label: "Documents", value: "9 stored"),
                DocFact(icon: "arrow.down.circle.fill", label: "Offline", value: "6 saved"),
                DocFact(icon: "clock.badge.exclamationmark.fill", label: "Expiring", value: "1 soon"),
                DocFact(icon: "exclamationmark.triangle.fill", label: "Action", value: "1 to do")
            ],
            documents: [
                WalletDoc(title: "UK Passport", category: .passport, reference: "No. 5•••••89", expiry: "Exp Mar 2030", detail: "Valid well beyond travel dates with blank pages for stamps.", status: .valid, savedOffline: true),
                WalletDoc(title: "e-VOA (B1 visa)", category: .visa, reference: "30-day · single", expiry: "On arrival +30d", detail: "QR ready to scan at the autogate; extendable once if you stay longer.", status: .valid, savedOffline: true),
                WalletDoc(title: "Return flight", category: .booking, reference: "DPS → LHR · ref 7QK2P", expiry: "26 Aug", detail: "E-ticket PDF and check-in reference saved to the photo album.", status: .valid, savedOffline: true),
                WalletDoc(title: "Hotel — Canggu villa", category: .booking, reference: "Conf. 88241", expiry: "12–16 Aug", detail: "Booking confirmation with the address in Bahasa for drivers.", status: .valid, savedOffline: true),
                WalletDoc(title: "Fast boat — Sanur ↔ Lembongan", category: .ticket, reference: "QR · Scoot Cruises", expiry: "13 Aug 08:00", detail: "Screenshotted QR in case the app won’t load at the pier.", status: .valid, savedOffline: true),
                WalletDoc(title: "Domestic flight — DPS → LBJ", category: .ticket, reference: "Wings Air · ref WZ9", expiry: "21 Aug", detail: "Booked, but the e-ticket still needs downloading for offline.", status: .action, savedOffline: false),
                WalletDoc(title: "PADI Advanced Open Water", category: .certificate, reference: "Cert. 21•••04", expiry: "No expiry", detail: "Photo of your c-card — dive shops will accept it for check-in.", status: .valid, savedOffline: true),
                WalletDoc(title: "DAN dive membership", category: .insurance, reference: "Member 4•••71", expiry: "Exp 30 Sep", detail: "Covers chamber treatment and evacuation — renew before it lapses.", status: .expiring, savedOffline: true),
                WalletDoc(title: "Travel insurance", category: .insurance, reference: "Policy TP-55•••", expiry: "Valid to 31 Aug", detail: "Confirmed to cover diving; save the 24h assistance line offline too.", status: .valid, savedOffline: false)
            ],
            contacts: [
                DocContact(name: "Emergency", role: "Nationwide", number: "112", icon: "phone.fill", accent: theme.coral),
                DocContact(name: "BIMC Hospital Bali", role: "Direct line", number: "+62 361 3000 911", icon: "cross.fill", accent: theme.coral),
                DocContact(name: "Insurer 24h assistance", role: "Evacuation & claims", number: "Saved offline", icon: "lifepreserver.fill", accent: theme.ocean),
                DocContact(name: "DAN dive hotline", role: "Dive emergencies", number: "Saved offline", icon: "cross.case.fill", accent: theme.tint),
                DocContact(name: "Embassy (Jakarta)", role: "Consular help", number: "Saved offline", icon: "building.columns.fill", accent: theme.moss)
            ],
            offlineCopies: [
                DocCheckItem(name: "Passport scan in cloud", done: true, note: "Plus a locked photo album"),
                DocCheckItem(name: "e-VOA QR saved offline", done: true, note: "Ready for arrival"),
                DocCheckItem(name: "Insurance PDF offline", done: true, note: "Policy and assistance line"),
                DocCheckItem(name: "Dive cert photo", done: true, note: "For liveaboard check-in"),
                DocCheckItem(name: "Printed paper copies", done: false, note: "Kept separate from originals"),
                DocCheckItem(name: "Copies shared with someone", done: false, note: "A trusted contact back home")
            ],
            disclaimer: "This wallet is a presentation aid, not secure storage. Keep sensitive documents in a protected place, share copies carefully, and always confirm validity and live booking details with the issuer before you travel."
        )
    }
}

struct TravelDocumentWalletDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelDocumentWalletDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Document wallet · Indonesia")

            TravelDocumentWalletDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Document wallet · Dynamic Type XL")
        }
    }
}
#endif
