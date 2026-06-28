import SwiftUI

// MARK: - Explorer culture & etiquette guide (Phase 96)
//
// A reusable, presentation-only guide to local customs and etiquette so travellers
// can be respectful guests. Each entry carries why it matters, clear do's and
// don'ts, a useful local phrase, where it applies, common mistakes and an expert
// tip. Entries are colour-coded by how important they are to get right.
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

/// How important an etiquette point is to get right — drives the colour coding.
enum EtiquetteImportance: CaseIterable {
    case goodToKnow
    case important
    case essential

    var label: String {
        switch self {
        case .goodToKnow: "Good to know"
        case .important: "Important"
        case .essential: "Essential"
        }
    }

    var icon: String {
        switch self {
        case .goodToKnow: "info.circle.fill"
        case .important: "exclamationmark.circle.fill"
        case .essential: "exclamationmark.octagon.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .goodToKnow: return theme.moss
        case .important: return theme.sun
        case .essential: return theme.coral
        }
    }
}

/// A single, presentation-only etiquette entry.
struct EtiquetteItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var importance: EtiquetteImportance
    var overview: String
    var dos: [String]
    var donts: [String]
    var localPhrase: String
    var whereItApplies: String
    var commonMistakes: [String]
    var expertTip: String
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        importance: EtiquetteImportance,
        overview: String,
        dos: [String],
        donts: [String],
        localPhrase: String,
        whereItApplies: String,
        commonMistakes: [String],
        expertTip: String,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.importance = importance
        self.overview = overview
        self.dos = dos
        self.donts = donts
        self.localPhrase = localPhrase
        self.whereItApplies = whereItApplies
        self.commonMistakes = commonMistakes
        self.expertTip = expertTip
        self.accent = accent
    }

    var accessibilityText: String {
        [
            category,
            importance.label,
            "overview: \(overview)",
            "do: \(dos.joined(separator: "; "))",
            "don't: \(donts.joined(separator: "; "))",
            "useful phrase: \(localPhrase)",
            "where it applies: \(whereItApplies)",
            "common mistakes: \(commonMistakes.joined(separator: "; "))",
            "tip: \(expertTip)"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerCultureEtiquetteGuide`.
enum EtiquetteGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only culture & etiquette guide.
struct ExplorerCultureEtiquetteGuide: View {
    var items: [EtiquetteItem]
    var layout: EtiquetteGuideLayout = .expanded
    var title: String? = "Culture & etiquette"
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
                    EtiquetteCard(item: item, startsExpanded: index == 0)
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
                Image(systemName: "hands.sparkles")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No etiquette notes listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Etiquette card

/// A premium expandable GlassCard for one etiquette topic: a summary (category and
/// why it matters) that expands to do's, don'ts and the full detail set. The whole
/// card is a single VoiceOver element, and all motion is disabled under Reduce
/// Motion.
private struct EtiquetteCard: View {
    let item: EtiquetteItem
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
            labeledList("Do", item.dos, icon: "checkmark.circle.fill", tint: TravelTheme.current.moss)
            labeledList("Don't", item.donts, icon: "xmark.circle.fill", tint: TravelTheme.current.coral)

            calloutRow(icon: "character.bubble.fill", tint: item.accent, label: "Useful phrase", text: item.localPhrase)

            detailRow(icon: "mappin.and.ellipse", label: "Where it applies", value: item.whereItApplies)

            labeledList("Common mistakes", item.commonMistakes, icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.sun)

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
struct ExplorerCultureEtiquetteGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Respectful travel across Bali, Lombok and Indonesia.
    private static let etiquette: [EtiquetteItem] = [
        EtiquetteItem(
            category: "Temple etiquette", icon: "building.columns.fill", importance: .essential,
            overview: "Temples are active places of worship — respect keeps you welcome.",
            dos: ["Wear a sarong and sash (often provided/rented)", "Walk behind people who are praying", "Lower your voice"],
            donts: ["Don’t enter if menstruating (local custom)", "Don’t stand higher than a priest", "Don’t point your feet at shrines or people"],
            localPhrase: "“Permisi” — Excuse me (to pass politely)",
            whereItApplies: "All Balinese temples (pura) and Hindu/ Islamic sites",
            commonMistakes: ["Skipping the sarong", "Climbing on shrines for photos", "Loud talking during ceremonies"],
            expertTip: "Keep a light sarong in your bag — you’ll need it at temples and some offices.",
            accent: theme.ocean
        ),
        EtiquetteItem(
            category: "Dress code", icon: "tshirt.fill", importance: .important,
            overview: "Beachwear is fine at the beach; cover up elsewhere, especially at sacred sites.",
            dos: ["Cover shoulders and knees at temples", "Dress modestly in villages and Lombok (more Muslim)", "Carry a light cover-up"],
            donts: ["Don’t wear swimwear in shops or restaurants", "Don’t go topless on most beaches", "Don’t wear revealing clothing at ceremonies"],
            localPhrase: "“Sopan” — polite / modest",
            whereItApplies: "Temples, villages, Lombok, government offices",
            commonMistakes: ["Walking into a warung in a bikini", "Short shorts at temples", "Assuming Lombok is as relaxed as Bali"],
            expertTip: "Lombok is more conservative than Bali — pack a few modest outfits.",
            accent: theme.sun
        ),
        EtiquetteItem(
            category: "Greetings & gestures", icon: "hand.wave.fill", importance: .important,
            overview: "Indonesians are warm and polite; small gestures of respect go a long way.",
            dos: ["Smile and greet warmly", "Give and receive with the right hand", "A slight nod/bow shows respect"],
            donts: ["Don’t use the left hand for giving/eating", "Don’t touch people’s heads (the head is sacred)", "Don’t beckon with a single finger"],
            localPhrase: "“Selamat pagi/siang/sore/malam” — Good morning/day/evening/night",
            whereItApplies: "Everywhere",
            commonMistakes: ["Handing money with the left hand", "Patting a child’s head", "Aggressive pointing"],
            expertTip: "Use your right hand for handshakes, giving and receiving — the left is considered unclean.",
            accent: theme.tint
        ),
        EtiquetteItem(
            category: "Photography etiquette", icon: "camera.fill", importance: .important,
            overview: "Ask before photographing people and ceremonies — consent matters.",
            dos: ["Ask permission for portraits", "Be discreet at ceremonies", "Respect ‘no photo’ signs"],
            donts: ["Don’t photograph people praying up close", "Don’t use drones near temples/ceremonies", "Don’t pose disrespectfully at sacred sites"],
            localPhrase: "“Boleh foto?” — May I take a photo?",
            whereItApplies: "Temples, ceremonies, markets, villages",
            commonMistakes: ["Shoving a camera into a ritual", "Flying a drone over a temple", "Disrespectful poses at shrines"],
            expertTip: "Ask “Boleh foto?” with a smile — you’ll usually get a warmer photo and a yes.",
            accent: theme.coral
        ),
        EtiquetteItem(
            category: "Dining etiquette", icon: "fork.knife", importance: .goodToKnow,
            overview: "Meals are relaxed; a few customs show good manners.",
            dos: ["Eat with the right hand or a spoon and fork", "Try a bit of everything offered", "Wait to be invited to start at a host’s home"],
            donts: ["Don’t eat with the left hand", "Don’t refuse hospitality outright", "Don’t blow your nose at the table"],
            localPhrase: "“Terima kasih” — Thank you · “Enak!” — Delicious!",
            whereItApplies: "Warungs, restaurants, homes",
            commonMistakes: ["Using the left hand", "Loudly declining offered food", "Expecting forks everywhere"],
            expertTip: "A spoon (right hand) and fork (left, to push) is the standard — the fork rarely goes to your mouth.",
            accent: theme.moss
        ),
        EtiquetteItem(
            category: "Offerings (canang sari)", icon: "leaf.fill", importance: .essential,
            overview: "Small daily offerings on the ground and shrines are sacred — never disrespect them.",
            dos: ["Step around offerings on the pavement", "Treat shrines and offerings with respect", "Watch your step on temple steps"],
            donts: ["Don’t step on or kick canang sari", "Don’t move offerings for a photo", "Don’t touch shrine offerings"],
            localPhrase: "“Canang sari” — the daily Balinese offering",
            whereItApplies: "All over Bali — pavements, doorways, shrines",
            commonMistakes: ["Treading on offerings", "Photographing by moving them", "Letting kids pick them up"],
            expertTip: "Those little flower trays underfoot are sacred offerings — step around, never on, them.",
            accent: theme.ocean
        ),
        EtiquetteItem(
            category: "Bargaining", icon: "tag.fill", importance: .goodToKnow,
            overview: "Haggling is expected at markets but not in fixed-price shops — keep it friendly.",
            dos: ["Bargain with a smile at markets", "Start around 50–60% and meet in the middle", "Accept the final price gracefully"],
            donts: ["Don’t haggle in supermarkets/minimarts", "Don’t be aggressive or insulting", "Don’t bargain hard over tiny sums"],
            localPhrase: "“Boleh kurang?” — Can it be cheaper?",
            whereItApplies: "Markets, art shops, drivers (agree first)",
            commonMistakes: ["Haggling where prices are fixed", "Getting angry over small amounts", "Walking away rudely"],
            expertTip: "Bargain with a smile — it’s a friendly game, not a fight, and goodwill gets better prices.",
            accent: theme.sun
        ),
        EtiquetteItem(
            category: "Public behaviour", icon: "person.2.fill", importance: .important,
            overview: "Keeping calm and avoiding public displays preserves ‘face’ and goodwill.",
            dos: ["Stay calm and smile, even when frustrated", "Keep affection low-key in public", "Be patient with ‘jam karet’ (rubber time)"],
            donts: ["Don’t shout or lose your temper", "Don’t embarrass someone publicly", "Don’t be overtly affectionate at sacred sites"],
            localPhrase: "“Tidak apa-apa” — It’s okay / no worries",
            whereItApplies: "Everywhere, especially rural and sacred areas",
            commonMistakes: ["Losing your temper to ‘win’", "Public arguments", "Heavy PDA in villages"],
            expertTip: "Anger makes you lose face and rarely helps — a calm smile solves more here than shouting.",
            accent: theme.tint
        ),
        EtiquetteItem(
            category: "Tipping", icon: "banknote.fill", importance: .goodToKnow,
            overview: "Tipping isn’t obligatory but is appreciated; many places add a service charge.",
            dos: ["Round up or tip 5–10% for good service", "Tip drivers and guides for a great day", "Check if service is already added"],
            donts: ["Don’t feel pressured to over-tip", "Don’t tip on top of a clear service charge unless you wish", "Don’t leave loose change as an insult"],
            localPhrase: "“Untuk Anda” — This is for you",
            whereItApplies: "Restaurants, drivers, guides, spas",
            commonMistakes: ["Double-tipping over service charge", "Ignoring great guides/drivers", "Big-city tipping habits"],
            expertTip: "Check the bill for a 5–10% service charge before adding more — tipping is welcome, not required.",
            accent: theme.moss
        ),
        EtiquetteItem(
            category: "Ceremonies & processions", icon: "sparkles", importance: .important,
            overview: "Religious processions are frequent — give way and observe respectfully.",
            dos: ["Pull over and let processions pass", "Watch quietly from a respectful distance", "Dress modestly if attending"],
            donts: ["Don’t cut through a procession", "Don’t walk in front of people praying", "Don’t treat ceremonies as a photo op"],
            localPhrase: "“Odalan” — a temple anniversary ceremony",
            whereItApplies: "Roads and temples across Bali",
            commonMistakes: ["Beeping at a procession", "Crossing in front of worshippers", "Intrusive filming"],
            expertTip: "If a procession blocks the road, simply wait — it’s a privilege to witness, not a delay.",
            accent: theme.coral
        ),
        EtiquetteItem(
            category: "Beach & village", icon: "beach.umbrella.fill", importance: .goodToKnow,
            overview: "Be a considerate guest in local spaces, on the sand and in the kampung.",
            dos: ["Take your rubbish with you", "Respect surfers’ lineup and locals’ priority", "Cover up when leaving the beach"],
            donts: ["Don’t litter or disturb offerings on the sand", "Don’t drop in on waves", "Don’t wander into homes/compounds uninvited"],
            localPhrase: "“Permisi” — Excuse me (entering a space)",
            whereItApplies: "Beaches, surf breaks, villages",
            commonMistakes: ["Leaving litter", "Dropping in while surfing", "Walking into family compounds"],
            expertTip: "Respect the surf lineup and local priority — patience earns waves and goodwill.",
            accent: theme.sky
        ),
        EtiquetteItem(
            category: "Language & politeness", icon: "character.bubble.fill", importance: .goodToKnow,
            overview: "A few words of Indonesian are warmly received and open doors.",
            dos: ["Learn greetings and ‘thank you’", "Use ‘Pak’ (sir) and ‘Ibu’ (ma’am)", "Smile and be patient"],
            donts: ["Don’t assume everyone speaks English", "Don’t speak loudly to be understood", "Don’t skip basic greetings"],
            localPhrase: "“Terima kasih” — Thank you · “Sama-sama” — You’re welcome",
            whereItApplies: "Everywhere",
            commonMistakes: ["Launching into English with no greeting", "Raising your voice", "Forgetting Pak/Ibu"],
            expertTip: "Learn five words — hello, please, thank you, sorry, delicious — and you’ll be treated wonderfully.",
            accent: theme.tint
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Be a good guest (tap to expand)").font(TravelTypography.section)
                    ExplorerCultureEtiquetteGuide(
                        items: etiquette,
                        subtitle: "Respecting local customs across Bali, Lombok & Indonesia."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerCultureEtiquetteGuide(items: [], title: "Culture & etiquette")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Etiquette · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerCultureEtiquetteGuide(
                        items: etiquette,
                        layout: .compact,
                        title: "Culture & etiquette"
                    )

                    Text("Compact · The essentials").font(TravelTypography.section)
                    ExplorerCultureEtiquetteGuide(
                        items: etiquette.filter { $0.importance == .essential },
                        layout: .compact,
                        title: "Don’t-get-it-wrong essentials"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Etiquette · Compact")

            ScrollView {
                ExplorerCultureEtiquetteGuide(items: Array(etiquette.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Etiquette · Dynamic Type XL")
        }
    }
}
#endif
