import SwiftUI

// MARK: - Travel culture & etiquette dashboard (Phase 125)
//
// A flagship, presentation-only Culture & Etiquette dashboard for Indonesia: a hero
// with at-a-glance facts (main religion, dress code, greeting style, tipping norm), a
// category-filtered etiquette guide of do's & don'ts with severity badges, temple &
// sacred-site rules, greetings & body-language norms, dress-code guidance by setting,
// religious & ceremony awareness (Nyepi, Galungan, canang sari), dining etiquette,
// gift-giving & social customs, photography etiquette, bargaining etiquette, taboos &
// sensitivities, regional cultural notes, useful respectful phrases and a disclaimer
// placeholder. A caller supplies a `CultureGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. `CultureGuide` and its
// nested rows are lightweight presentation models (not DTOs); the component holds no
// data, networking, persistence, repository, view-model, navigation, AppContainer or
// DTO logic, and is not wired into any screen. The category filters and favourite stars
// are UI-only, and the content is general guidance only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// How important an etiquette point is — drives the severity badge label and accent.
enum EtiquetteSeverity {
    case gentle
    case important
    case sacred

    var label: String {
        switch self {
        case .gentle: "Good to know"
        case .important: "Important"
        case .sacred: "Show respect"
        }
    }

    var icon: String {
        switch self {
        case .gentle: "info.circle.fill"
        case .important: "exclamationmark.circle.fill"
        case .sacred: "hands.sparkles.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .gentle: return theme.moss
        case .important: return theme.sun
        case .sacred: return theme.coral
        }
    }
}

/// A single at-a-glance culture fact.
struct CultureFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single do / don't etiquette rule.
struct EtiquetteRule: Identifiable {
    let id: String
    var isDo: Bool
    var title: String
    var detail: String
    var severity: EtiquetteSeverity
    var category: String

    init(id: String? = nil, isDo: Bool, title: String, detail: String, severity: EtiquetteSeverity, category: String) {
        self.id = id ?? "\(category)-\(title)"
        self.isDo = isDo
        self.title = title
        self.detail = detail
        self.severity = severity
        self.category = category
    }
}

/// A generic culture guide row reused for temple rules, greetings, ceremonies,
/// dining, customs, taboos and regional notes.
struct CultureInfoRow: Identifiable {
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

/// A respectful phrase (English, local, pronunciation).
struct CulturePhrase: Identifiable {
    let id = UUID()
    var english: String
    var local: String
    var pronunciation: String
}

/// The full, presentation-only content for a culture & etiquette guide.
struct CultureGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [CultureFact]
    var rules: [EtiquetteRule]
    var templeRules: [CultureInfoRow]
    var greetings: [CultureInfoRow]
    var dressCode: [CultureInfoRow]
    var ceremonies: [CultureInfoRow]
    var dining: [CultureInfoRow]
    var customs: [CultureInfoRow]
    var photography: [CultureInfoRow]
    var bargaining: [CultureInfoRow]
    var taboos: [CultureInfoRow]
    var regionalNotes: [CultureInfoRow]
    var phrases: [CulturePhrase]
    var disclaimer: String
}

/// A premium, presentation-only culture & etiquette dashboard rendered from a `CultureGuide`.
struct TravelCultureEtiquetteDashboard: View {
    var guide: CultureGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedCategory = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let categories = ["All", "Temples", "Dining", "Social", "Dress", "Photography", "Bargaining"]

    private var filteredRules: [EtiquetteRule] {
        guard selectedCategory != "All" else { return guide.rules }
        return guide.rules.filter { $0.category == selectedCategory }
    }

    var body: some View {
        PremiumScrollView {
            hero
            topGroup
            sacredGroup
            socialGroup
            regionGroup
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
            eyebrow: "Culture & Etiquette",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Religion"), label: "Religion"),
                HeroMetric(value: factValue("Dress"), label: "Dress"),
                HeroMetric(value: factValue("Greeting"), label: "Greeting")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(CultureAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var topGroup: some View {
        Group {
            section("At a glance", "Culture basics.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Do’s & don’ts", "Filter by situation.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    categoryFilter
                    if filteredRules.isEmpty {
                        GlassCard {
                            Text("No \(selectedCategory.lowercased()) tips here.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredRules) { rule in
                                ruleCard(rule)
                            }
                        }
                    }
                }
            }
        }
    }

    private var sacredGroup: some View {
        Group {
            section("Temples & sacred sites", "Sacred spaces, simple rules.", 3) {
                infoList(guide.templeRules)
            }

            section("Greetings & body language", "Connect respectfully.", 4) {
                infoList(guide.greetings)
            }

            section("Dress code", "What to wear, and where.", 5) {
                infoList(guide.dressCode)
            }

            section("Religion & ceremonies", "Be aware and considerate.", 6) {
                infoList(guide.ceremonies)
            }
        }
    }

    private var socialGroup: some View {
        Group {
            section("Dining etiquette", "At the table.", 7) {
                infoList(guide.dining)
            }

            section("Gifts & social customs", "Visiting and giving.", 8) {
                infoList(guide.customs)
            }

            section("Photography", "Capture it kindly.", 8) {
                infoList(guide.photography)
            }

            section("Bargaining", "Haggle with a smile.", 8) {
                infoList(guide.bargaining)
            }

            section("Taboos & sensitivities", "Lines not to cross.", 8) {
                infoList(guide.taboos)
            }
        }
    }

    private var regionGroup: some View {
        Group {
            section("Regional notes", "One country, many cultures.", 8) {
                infoList(guide.regionalNotes)
            }

            section("Respectful phrases", "A little goes a long way.", 8) {
                phrasesCard
            }

            section("Good to know", "Please read.", 8) {
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
        .modifier(CultureAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: CultureFact) -> some View {
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

    // MARK: Rule cards

    private func ruleCard(_ rule: EtiquetteRule) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(rule.isDo ? "checkmark" : "xmark", rule.isDo ? theme.moss : theme.coral)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        tagPill(rule.isDo ? "Do" : "Don’t", rule.isDo ? theme.moss : theme.coral)
                        severityBadge(rule.severity)
                    }
                    Text(rule.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(rule.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton(rule.id, rule.title)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(rule.isDo ? "Do" : "Don’t"), \(rule.severity.label). \(rule.title). \(rule.detail)")
    }

    private func severityBadge(_ severity: EtiquetteSeverity) -> some View {
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

    // MARK: Generic info list

    private func infoList(_ rows: [CultureInfoRow]) -> some View {
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

    // MARK: Phrases

    private var phrasesCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                ForEach(Array(guide.phrases.enumerated()), id: \.element.id) { index, phrase in
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(phrase.english)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                        HStack(spacing: TravelSpacing.xs) {
                            Text(phrase.local)
                                .font(TravelTypography.cardTitle)
                                .foregroundStyle(theme.tint)
                            Text("· \(phrase.pronunciation)")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(phrase.english): \(phrase.local), pronounced \(phrase.pronunciation)")
                    if index < guide.phrases.count - 1 {
                        Divider().opacity(0.4)
                    }
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
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Customs vary — observe and ask")
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
        .accessibilityLabel("Customs vary, observe and ask. \(guide.disclaimer)")
    }

    // MARK: Shared bits

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

// MARK: - Culture appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct CultureAppear: ViewModifier {
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
extension CultureGuide {
    /// A deterministic sample culture & etiquette guide for Indonesia.
    static var sampleIndonesia: CultureGuide {
        let theme = TravelTheme.current
        return CultureGuide(
            heroTitle: "Indonesia · Culture",
            heroSubtitle: "Warm, devout and diverse — a little respect and a smile open every door.",
            heroSymbol: "hands.sparkles.fill",
            heroGradient: [theme.coral, theme.sun, theme.tint],
            facts: [
                CultureFact(icon: "moon.stars.fill", label: "Religion", value: "Muslim · Bali Hindu"),
                CultureFact(icon: "tshirt.fill", label: "Dress", value: "Modest"),
                CultureFact(icon: "hand.wave.fill", label: "Greeting", value: "Handshake + smile"),
                CultureFact(icon: "banknote.fill", label: "Tipping", value: "Not expected")
            ],
            rules: [
                EtiquetteRule(isDo: true, title: "Wear a sarong & sash at temples", detail: "Cover your legs and waist before entering any temple — sarongs are usually provided.", severity: .sacred, category: "Temples"),
                EtiquetteRule(isDo: false, title: "Don’t climb temple structures", detail: "Never climb shrines, gates or sacred trees for a photo — it deeply offends.", severity: .sacred, category: "Temples"),
                EtiquetteRule(isDo: true, title: "Eat with your right hand", detail: "Use the right hand to eat and pass food; the left is considered unclean.", severity: .important, category: "Dining"),
                EtiquetteRule(isDo: false, title: "Don’t lose your temper", detail: "Public anger causes loss of face — stay calm, smile and be patient.", severity: .important, category: "Social"),
                EtiquetteRule(isDo: true, title: "Dress modestly off the beach", detail: "Cover shoulders and knees in towns, villages and temples.", severity: .important, category: "Dress"),
                EtiquetteRule(isDo: false, title: "Don’t wear swimwear in town", detail: "Bikinis and bare chests belong at the beach or pool, not the street.", severity: .gentle, category: "Dress"),
                EtiquetteRule(isDo: true, title: "Ask before you photograph people", detail: "A smile and a gesture is enough; most people happily agree.", severity: .important, category: "Photography"),
                EtiquetteRule(isDo: false, title: "Don’t fly drones over ceremonies", detail: "Drones are banned or unwelcome over temples and religious events — get permission.", severity: .important, category: "Photography"),
                EtiquetteRule(isDo: true, title: "Bargain with a smile", detail: "Haggling is expected in markets — keep it light and friendly.", severity: .gentle, category: "Bargaining"),
                EtiquetteRule(isDo: false, title: "Don’t haggle over tiny sums", detail: "Pushing hard to save pennies, or bargaining in fixed-price shops, is poor form.", severity: .gentle, category: "Bargaining")
            ],
            templeRules: [
                CultureInfoRow(title: "Sarong & sash", subtitle: "Required", icon: "figure.stand.dress", detail: "Wrap a sarong (kamen) and tie a sash (selendang) before entering — usually lent at the gate.", accent: theme.coral),
                CultureInfoRow(title: "Menstruation custom", subtitle: "Please observe", icon: "hand.raised.fill", detail: "Women who are menstruating are traditionally asked not to enter temple inner areas.", accent: theme.sun),
                CultureInfoRow(title: "Don’t climb or sit high", subtitle: "Respect", icon: "exclamationmark.triangle.fill", detail: "Never climb shrines; keep your head lower than priests and offerings.", accent: theme.coral),
                CultureInfoRow(title: "Mind ceremonies", subtitle: "Defer", icon: "sparkles", detail: "Walk behind people praying, don’t block processions, and skip the flash.", accent: theme.tint)
            ],
            greetings: [
                CultureInfoRow(title: "Soft handshake", subtitle: "Then the heart", icon: "hand.wave.fill", detail: "A light handshake often followed by touching your own hand to your chest is warm and respectful.", accent: theme.tint),
                CultureInfoRow(title: "Use your right hand", subtitle: "Always", icon: "hand.point.up.left.fill", detail: "Give, receive and gesture with the right hand; two hands to elders shows extra respect.", accent: theme.ocean),
                CultureInfoRow(title: "Don’t point with a finger", subtitle: "Body language", icon: "hand.raised.fingers.spread.fill", detail: "Use an open hand or your thumb; beckon with the palm facing down.", accent: theme.moss),
                CultureInfoRow(title: "Smile and soften", subtitle: "Tone", icon: "face.smiling.fill", detail: "A smile, patience and a gentle voice are valued far above directness.", accent: theme.sun)
            ],
            dressCode: [
                CultureInfoRow(title: "Temples", subtitle: "Most modest", icon: "building.columns.fill", detail: "Shoulders and knees covered, plus a sarong and sash.", accent: theme.coral),
                CultureInfoRow(title: "Mosques", subtitle: "Conservative", icon: "moon.stars.fill", detail: "Women cover the hair and arms; everyone dresses modestly and removes shoes.", accent: theme.ocean),
                CultureInfoRow(title: "Towns & villages", subtitle: "Everyday", icon: "house.fill", detail: "Modest casual wear; cover up away from tourist beaches.", accent: theme.tint),
                CultureInfoRow(title: "Beach & resort", subtitle: "Relaxed", icon: "beach.umbrella.fill", detail: "Swimwear is fine at the beach and pool — cover up to walk into shops or restaurants.", accent: theme.sun)
            ],
            ceremonies: [
                CultureInfoRow(title: "Nyepi (Day of Silence)", subtitle: "March · Bali", icon: "moon.zzz.fill", detail: "A full day of silence: no travel, lights, work or noise — even the airport closes. Stay in your hotel.", accent: theme.coral),
                CultureInfoRow(title: "Galungan & Kuningan", subtitle: "Bali", icon: "sparkles", detail: "Tall penjor poles line the streets and families visit temples — a beautiful time to be respectful.", accent: theme.tint),
                CultureInfoRow(title: "Canang sari offerings", subtitle: "Daily", icon: "leaf.fill", detail: "Little palm-leaf offerings sit on the ground and shrines — step around them, never on them.", accent: theme.moss),
                CultureInfoRow(title: "Ramadan", subtitle: "Muslim areas", icon: "moon.fill", detail: "In Lombok and beyond, be discreet eating, drinking and smoking in daylight during the fasting month.", accent: theme.ocean)
            ],
            dining: [
                CultureInfoRow(title: "Right hand only", subtitle: "Eating & passing", icon: "fork.knife", detail: "Eat and pass dishes with the right hand; many meals are eaten by hand or with a spoon and fork.", accent: theme.tint),
                CultureInfoRow(title: "Wait to be invited", subtitle: "‘Silakan makan’", icon: "person.2.fill", detail: "Let your host invite you to start; it’s polite to accept food or drink that’s offered.", accent: theme.ocean),
                CultureInfoRow(title: "Sharing is normal", subtitle: "Communal", icon: "takeoutbag.and.cup.and.straw.fill", detail: "Dishes are often shared family-style; take modest portions and leave a little.", accent: theme.moss)
            ],
            customs: [
                CultureInfoRow(title: "Remove your shoes", subtitle: "Entering homes", icon: "shoe.fill", detail: "Take off shoes before entering a home or some shops — follow your host’s lead.", accent: theme.tint),
                CultureInfoRow(title: "Give & receive politely", subtitle: "Right hand", icon: "gift.fill", detail: "Offer and accept gifts with the right hand or both hands; gifts aren’t opened in front of the giver.", accent: theme.sun),
                CultureInfoRow(title: "Bring a small gift", subtitle: "If invited", icon: "bag.fill", detail: "Visiting a home? A little something — fruit or sweets — is a kind gesture.", accent: theme.moss)
            ],
            photography: [
                CultureInfoRow(title: "Ask first", subtitle: "People & prayer", icon: "camera.fill", detail: "Always ask before photographing people, especially at ceremonies and in villages.", accent: theme.tint),
                CultureInfoRow(title: "No flash at ceremonies", subtitle: "Be discreet", icon: "bolt.slash.fill", detail: "Don’t intrude on prayer or processions; keep a respectful distance.", accent: theme.ocean),
                CultureInfoRow(title: "Drones need permission", subtitle: "Often restricted", icon: "airplane", detail: "Drones are banned over many temples and ceremonies — check local rules first.", accent: theme.coral)
            ],
            bargaining: [
                CultureInfoRow(title: "Where to haggle", subtitle: "Markets & art shops", icon: "bag.fill", detail: "Bargaining is expected at markets and with drivers, not in fixed-price stores or restaurants.", accent: theme.tint),
                CultureInfoRow(title: "Keep it friendly", subtitle: "Smile", icon: "face.smiling.fill", detail: "Start politely, enjoy the back-and-forth, and walk away with a smile if there’s no deal.", accent: theme.moss),
                CultureInfoRow(title: "Don’t over-haggle", subtitle: "Be fair", icon: "hand.thumbsup.fill", detail: "A small difference means more to a stall-holder than to you — settle graciously.", accent: theme.sun)
            ],
            taboos: [
                CultureInfoRow(title: "The head is sacred", subtitle: "Don’t touch", icon: "brain.head.profile", detail: "Avoid touching anyone’s head — even a child’s — as it’s considered the most sacred part of the body.", accent: theme.coral),
                CultureInfoRow(title: "Feet are lowest", subtitle: "Mind them", icon: "shoeprints.fill", detail: "Don’t point your feet at people or shrines, and never use a foot to point or move things.", accent: theme.coral),
                CultureInfoRow(title: "The left hand", subtitle: "Unclean", icon: "hand.raised.fill", detail: "Avoid using the left hand to give, receive, eat or greet.", accent: theme.sun),
                CultureInfoRow(title: "Keep affection private", subtitle: "Modesty", icon: "heart.slash.fill", detail: "Public displays of affection are frowned upon, especially in conservative areas.", accent: theme.ocean)
            ],
            regionalNotes: [
                CultureInfoRow(title: "Bali", subtitle: "Hindu", icon: "leaf.fill", detail: "Daily offerings, temple ceremonies and processions are woven into everyday life — go with the flow and defer.", accent: theme.tint),
                CultureInfoRow(title: "Lombok (Sasak)", subtitle: "Muslim", icon: "moon.stars.fill", detail: "More conservative than Bali — dress modestly, respect prayer times and Ramadan.", accent: theme.ocean),
                CultureInfoRow(title: "Papua / Raja Ampat", subtitle: "Diverse", icon: "globe.asia.australia.fill", detail: "Christian and traditional cultures; ask before visiting villages and respect customary (adat) land and reefs.", accent: theme.moss)
            ],
            phrases: [
                CulturePhrase(english: "Excuse me / sorry", local: "Permisi / Maaf", pronunciation: "per-MEE-see / ma-AF"),
                CulturePhrase(english: "Thank you", local: "Terima kasih", pronunciation: "tuh-REE-ma KA-see"),
                CulturePhrase(english: "Please, go ahead", local: "Silakan", pronunciation: "SEE-la-kan"),
                CulturePhrase(english: "May I take a photo?", local: "Boleh saya foto?", pronunciation: "BO-lay SA-ya FO-to")
            ],
            disclaimer: "Customs vary across Indonesia’s many cultures and islands. This is general guidance, not strict rules — watch what locals do, ask politely when unsure, and you’ll be warmly welcomed."
        )
    }
}

struct TravelCultureEtiquetteDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelCultureEtiquetteDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Culture & etiquette · Indonesia")

            TravelCultureEtiquetteDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Culture & etiquette · Dynamic Type XL")
        }
    }
}
#endif
