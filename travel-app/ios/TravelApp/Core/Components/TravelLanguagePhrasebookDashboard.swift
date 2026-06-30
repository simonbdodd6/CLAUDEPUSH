import SwiftUI

// MARK: - Travel language & phrasebook dashboard (Phase 123)
//
// A flagship, presentation-only Language & Phrasebook dashboard: a hero with
// at-a-glance facts (main language, script, English prevalence, politeness level), a
// "phrase of the day" placeholder, a UI-only search bar and category-filtered
// phrasebook of phrase cards (English, Bahasa Indonesia, phonetic pronunciation and a
// favourite star), essential words & numbers, a pronunciation guide, politeness &
// honorifics notes, useful slang, bargaining phrases, dietary/allergy phrases,
// highlighted emergency phrases, cultural communication tips (body language, saving
// face), offline-translation tips, per-region language notes and a pronunciation-
// approximation disclaimer. A caller supplies a `PhrasebookGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. `PhrasebookGuide` and its
// nested rows are lightweight presentation models (not DTOs); the component holds no
// data, networking, persistence, repository, view-model, navigation, AppContainer or
// DTO logic, and is not wired into any screen. The category filters, search bar and
// favourite stars are UI-only, and pronunciations are approximate.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A single at-a-glance language fact.
struct LangFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single phrasebook phrase.
struct LangPhrase: Identifiable {
    let id: String
    var english: String
    var local: String
    var pronunciation: String
    var category: String
    var emergency: Bool

    init(id: String? = nil, english: String, local: String, pronunciation: String, category: String, emergency: Bool = false) {
        self.id = id ?? "\(category)-\(english)"
        self.english = english
        self.local = local
        self.pronunciation = pronunciation
        self.category = category
        self.emergency = emergency
    }
}

/// A compact word/number pair (term, local, pronunciation).
struct LangPair: Identifiable {
    let id = UUID()
    var term: String
    var local: String
    var pronunciation: String
}

/// A generic language guide row reused for pronunciation, politeness, slang,
/// culture, offline apps and regional notes.
struct LangInfoRow: Identifiable {
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

/// The full, presentation-only content for a language & phrasebook guide.
struct PhrasebookGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [LangFact]
    var phraseOfTheDay: LangPhrase
    var phrases: [LangPhrase]
    var words: [LangPair]
    var numbers: [LangPair]
    var pronunciation: [LangInfoRow]
    var politeness: [LangInfoRow]
    var slang: [LangInfoRow]
    var bargaining: [LangPhrase]
    var dietary: [LangPhrase]
    var emergencyPhrases: [LangPhrase]
    var culturalTips: [LangInfoRow]
    var offlineTips: [String]
    var regionalNotes: [LangInfoRow]
    var disclaimer: String
}

/// A premium, presentation-only language & phrasebook dashboard rendered from a `PhrasebookGuide`.
struct TravelLanguagePhrasebookDashboard: View {
    var guide: PhrasebookGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedCategory = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let categories = ["All", "Greetings", "Dining", "Transport", "Shopping", "Emergencies", "Diving"]

    private var filteredPhrases: [LangPhrase] {
        guard selectedCategory != "All" else { return guide.phrases }
        return guide.phrases.filter { $0.category == selectedCategory }
    }

    var body: some View {
        PremiumScrollView {
            hero
            topGroup
            phraseGroup
            referenceGroup
            situationGroup
            cultureGroup
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
            eyebrow: "Language & Phrasebook",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Language"), label: "Language"),
                HeroMetric(value: factValue("English"), label: "English"),
                HeroMetric(value: factValue("Script"), label: "Script")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(LangAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var topGroup: some View {
        Group {
            section("Phrase of the day", "A new one each day.", 1) {
                phraseOfTheDayCard
            }

            section("At a glance", "The language basics.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }
        }
    }

    private var phraseGroup: some View {
        Group {
            section("Phrasebook", "Filter by situation.", 3) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    searchPlaceholder
                    categoryFilter
                    if filteredPhrases.isEmpty {
                        GlassCard {
                            Text("No \(selectedCategory.lowercased()) phrases here.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredPhrases) { phrase in
                                phraseCard(phrase)
                            }
                        }
                    }
                }
            }

            section("Words & numbers", "The building blocks.", 4) {
                VStack(spacing: TravelSpacing.md) {
                    PremiumAdaptiveGrid(minimumWidth: 150) {
                        ForEach(guide.words) { pair in
                            pairTile(pair)
                        }
                    }
                    PremiumAdaptiveGrid(minimumWidth: 104) {
                        ForEach(guide.numbers) { pair in
                            pairTile(pair)
                        }
                    }
                }
            }
        }
    }

    private var referenceGroup: some View {
        Group {
            section("Pronunciation", "Say it like a local.", 5) {
                infoList(guide.pronunciation)
            }

            section("Politeness & honorifics", "Address people warmly.", 6) {
                infoList(guide.politeness)
            }

            section("Useful slang", "Sound less like a textbook.", 7) {
                infoList(guide.slang)
            }
        }
    }

    private var situationGroup: some View {
        Group {
            section("Bargaining", "For markets and drivers.", 8) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.bargaining) { phrase in
                        phraseCard(phrase)
                    }
                }
            }

            section("Dietary & allergies", "Eat safely.", 8) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.dietary) { phrase in
                        phraseCard(phrase)
                    }
                }
            }

            section("Emergency phrases", "Keep these close.", 8) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.emergencyPhrases) { phrase in
                        phraseCard(phrase)
                    }
                }
            }
        }
    }

    private var cultureGroup: some View {
        Group {
            section("Communication & culture", "Body language and saving face.", 8) {
                infoList(guide.culturalTips)
            }

            section("Offline translation", "When the signal drops.", 8) {
                bulletCard(guide.offlineTips, icon: "character.book.closed.fill", tint: theme.tint)
            }

            section("Regional notes", "Beyond Bahasa Indonesia.", 8) {
                infoList(guide.regionalNotes)
            }

            section("Good to know", "About the pronunciations.", 8) {
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
        .modifier(LangAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Phrase of the day

    private var phraseOfTheDayCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Label("Phrase of the day", systemImage: "sparkles")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(guide.phraseOfTheDay.local)
                    .font(TravelTypography.display)
                    .foregroundStyle(theme.tint)
                    .fixedSize(horizontal: false, vertical: true)
                Text("“\(guide.phraseOfTheDay.english)” · \(guide.phraseOfTheDay.pronunciation)")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("A new phrase appears here each day. (Placeholder)")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Phrase of the day: \(guide.phraseOfTheDay.local), meaning \(guide.phraseOfTheDay.english), pronounced \(guide.phraseOfTheDay.pronunciation).")
    }

    // MARK: Facts & tiles

    private func factTile(_ fact: LangFact) -> some View {
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

    private func pairTile(_ pair: LangPair) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(pair.term)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(pair.local)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                    .fixedSize(horizontal: false, vertical: true)
                Text(pair.pronunciation)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(pair.term): \(pair.local), pronounced \(pair.pronunciation)")
    }

    // MARK: Search placeholder & category filter

    private var searchPlaceholder: some View {
        HStack(spacing: TravelSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            Text("Search phrases")
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Text("Soon")
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Search phrases. Placeholder, coming soon.")
    }

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

    // MARK: Phrase cards

    private func phraseCard(_ phrase: LangPhrase) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(phrase.emergency ? "exclamationmark.bubble.fill" : "text.bubble.fill", phrase.emergency ? theme.coral : theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(phrase.english)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(phrase.local)
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(phrase.emergency ? theme.coral : .primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Label(phrase.pronunciation, systemImage: "waveform")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton(phrase.id, phrase.english)
            }
            .padding(phrase.emergency ? TravelSpacing.xxs : 0)
            .overlay(
                phrase.emergency
                    ? RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous).stroke(theme.coral.opacity(0.4), lineWidth: 1)
                    : nil
            )
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(phrase.english): \(phrase.local), pronounced \(phrase.pronunciation)\(phrase.emergency ? ", emergency phrase" : "").")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [LangInfoRow]) -> some View {
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
                    Text("Pronunciations are approximate")
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
        .accessibilityLabel("Pronunciations are approximate. \(guide.disclaimer)")
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
        .accessibilityLabel(isFav ? "Saved phrase: \(name)" : "Save phrase \(name)")
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

// MARK: - Language appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct LangAppear: ViewModifier {
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
extension PhrasebookGuide {
    /// A deterministic sample phrasebook for Bahasa Indonesia (pronunciations approximate).
    static var sampleIndonesia: PhrasebookGuide {
        let theme = TravelTheme.current
        return PhrasebookGuide(
            heroTitle: "Bahasa Indonesia",
            heroSubtitle: "A friendly, phonetic language with no tones — a few words go a very long way.",
            heroSymbol: "character.bubble.fill",
            heroGradient: [theme.tint, theme.ocean, theme.sky],
            facts: [
                LangFact(icon: "globe.asia.australia.fill", label: "Language", value: "Bahasa"),
                LangFact(icon: "textformat", label: "Script", value: "Latin"),
                LangFact(icon: "person.2.wave.2.fill", label: "English", value: "Common in tourism"),
                LangFact(icon: "hand.raised.fill", label: "Politeness", value: "Warm & informal")
            ],
            phraseOfTheDay: LangPhrase(english: "Thank you", local: "Terima kasih", pronunciation: "tuh-REE-ma KA-see", category: "Greetings"),
            phrases: [
                LangPhrase(english: "Hello", local: "Halo", pronunciation: "HA-lo", category: "Greetings"),
                LangPhrase(english: "Good morning", local: "Selamat pagi", pronunciation: "suh-LA-mat PA-gee", category: "Greetings"),
                LangPhrase(english: "Thank you", local: "Terima kasih", pronunciation: "tuh-REE-ma KA-see", category: "Greetings"),
                LangPhrase(english: "You’re welcome", local: "Sama-sama", pronunciation: "SA-ma SA-ma", category: "Greetings"),
                LangPhrase(english: "Excuse me / sorry", local: "Permisi / Maaf", pronunciation: "per-MEE-see / ma-AF", category: "Greetings"),
                LangPhrase(english: "The bill, please", local: "Minta bill", pronunciation: "MIN-ta bill", category: "Dining"),
                LangPhrase(english: "Delicious", local: "Enak", pronunciation: "EH-nak", category: "Dining"),
                LangPhrase(english: "Not spicy", local: "Tidak pedas", pronunciation: "TEE-dak puh-DAS", category: "Dining"),
                LangPhrase(english: "Drinking water", local: "Air putih", pronunciation: "ay-EER POO-tee", category: "Dining"),
                LangPhrase(english: "Where is…?", local: "Di mana…?", pronunciation: "dee MA-na", category: "Transport"),
                LangPhrase(english: "Stop here", local: "Berhenti di sini", pronunciation: "ber-HEN-tee dee SEE-nee", category: "Transport"),
                LangPhrase(english: "How much to…?", local: "Berapa ke…?", pronunciation: "buh-RA-pa kuh", category: "Transport"),
                LangPhrase(english: "How much is it?", local: "Berapa harganya?", pronunciation: "buh-RA-pa har-GA-nya", category: "Shopping"),
                LangPhrase(english: "Too expensive", local: "Terlalu mahal", pronunciation: "ter-LA-loo MA-hal", category: "Shopping"),
                LangPhrase(english: "Just looking", local: "Lihat-lihat saja", pronunciation: "LEE-hat LEE-hat SA-ja", category: "Shopping"),
                LangPhrase(english: "Help!", local: "Tolong!", pronunciation: "TO-long", category: "Emergencies", emergency: true),
                LangPhrase(english: "Call a doctor", local: "Panggil dokter", pronunciation: "PANG-gil DOK-ter", category: "Emergencies", emergency: true),
                LangPhrase(english: "I want to dive", local: "Saya mau menyelam", pronunciation: "SA-ya MOW muh-NYUH-lam", category: "Diving"),
                LangPhrase(english: "The current is strong", local: "Arusnya kuat", pronunciation: "A-roos-nya KOO-at", category: "Diving"),
                LangPhrase(english: "Where are the mantas?", local: "Di mana manta?", pronunciation: "dee MA-na MAN-ta", category: "Diving")
            ],
            words: [
                LangPair(term: "Water", local: "Air", pronunciation: "ay-EER"),
                LangPair(term: "Food", local: "Makanan", pronunciation: "ma-KA-nan"),
                LangPair(term: "Toilet", local: "Kamar kecil", pronunciation: "KA-mar kuh-CHEEL"),
                LangPair(term: "Good", local: "Bagus", pronunciation: "BA-goos"),
                LangPair(term: "Beautiful", local: "Indah", pronunciation: "IN-dah"),
                LangPair(term: "Yes / No", local: "Ya / Tidak", pronunciation: "ya / TEE-dak")
            ],
            numbers: [
                LangPair(term: "1", local: "Satu", pronunciation: "SA-too"),
                LangPair(term: "2", local: "Dua", pronunciation: "DOO-a"),
                LangPair(term: "3", local: "Tiga", pronunciation: "TEE-ga"),
                LangPair(term: "5", local: "Lima", pronunciation: "LEE-ma"),
                LangPair(term: "10", local: "Sepuluh", pronunciation: "suh-POO-loo"),
                LangPair(term: "100", local: "Seratus", pronunciation: "suh-RA-toos"),
                LangPair(term: "1,000", local: "Seribu", pronunciation: "suh-REE-boo")
            ],
            pronunciation: [
                LangInfoRow(title: "‘C’ sounds like ‘ch’", subtitle: "Key rule", icon: "textformat.abc", detail: "Cabe (chilli) is ‘CHA-bay’, cantik (pretty) is ‘CHAN-tik’.", accent: theme.tint),
                LangInfoRow(title: "Pure, steady vowels", subtitle: "No diphthongs", icon: "waveform", detail: "A as in ‘father’, i as in ‘ee’, u as in ‘oo’ — vowels don’t glide.", accent: theme.ocean),
                LangInfoRow(title: "No tones", subtitle: "Easy win", icon: "music.note", detail: "Unlike Thai or Vietnamese, meaning doesn’t change with pitch.", accent: theme.moss),
                LangInfoRow(title: "Stress the penultimate", subtitle: "Rhythm", icon: "metronome.fill", detail: "Most words stress the second-to-last syllable; keep it relaxed.", accent: theme.sun)
            ],
            politeness: [
                LangInfoRow(title: "Pak / Bu", subtitle: "Mr / Mrs", icon: "person.fill", detail: "Address older men as ‘Pak’ and older women as ‘Bu’ — always polite.", accent: theme.tint),
                LangInfoRow(title: "Mas / Mbak", subtitle: "Younger adults", icon: "person.2.fill", detail: "Friendly terms for a young man (Mas) or woman (Mbak), common on Java and Bali.", accent: theme.ocean),
                LangInfoRow(title: "Tolong & silakan", subtitle: "Please", icon: "hands.sparkles.fill", detail: "‘Tolong’ asks for help; ‘silakan’ offers (please, go ahead). Smiling helps most.", accent: theme.moss)
            ],
            slang: [
                LangInfoRow(title: "Santai", subtitle: "Relax", icon: "beach.umbrella.fill", detail: "‘Take it easy’ — the unofficial motto of island life.", accent: theme.sun),
                LangInfoRow(title: "Mantap", subtitle: "Awesome", icon: "hand.thumbsup.fill", detail: "Used for anything great — food, a dive, a view.", accent: theme.tint),
                LangInfoRow(title: "Jalan-jalan", subtitle: "Wander", icon: "figure.walk", detail: "To go for a stroll or trip with no fixed plan.", accent: theme.ocean),
                LangInfoRow(title: "Gapapa", subtitle: "No worries", icon: "checkmark.circle.fill", detail: "Short for ‘tidak apa-apa’ — ‘it’s fine, no problem’.", accent: theme.moss)
            ],
            bargaining: [
                LangPhrase(english: "Can you lower it?", local: "Boleh kurang?", pronunciation: "BO-lay KOO-rang", category: "Shopping"),
                LangPhrase(english: "What’s your best price?", local: "Harga pas berapa?", pronunciation: "HAR-ga pas buh-RA-pa", category: "Shopping"),
                LangPhrase(english: "I’ll take it", local: "Saya ambil", pronunciation: "SA-ya AM-bil", category: "Shopping")
            ],
            dietary: [
                LangPhrase(english: "I’m vegetarian", local: "Saya vegetarian", pronunciation: "SA-ya ve-ge-TA-ree-an", category: "Dining"),
                LangPhrase(english: "I don’t eat meat", local: "Saya tidak makan daging", pronunciation: "SA-ya TEE-dak MA-kan DA-ging", category: "Dining"),
                LangPhrase(english: "I’m allergic to nuts", local: "Saya alergi kacang", pronunciation: "SA-ya a-LER-gee KA-chang", category: "Dining"),
                LangPhrase(english: "No MSG, please", local: "Tanpa micin, ya", pronunciation: "TAN-pa MEE-chin, ya", category: "Dining")
            ],
            emergencyPhrases: [
                LangPhrase(english: "Help!", local: "Tolong!", pronunciation: "TO-long", category: "Emergencies", emergency: true),
                LangPhrase(english: "I need a doctor", local: "Saya perlu dokter", pronunciation: "SA-ya per-LOO DOK-ter", category: "Emergencies", emergency: true),
                LangPhrase(english: "Where is the hospital?", local: "Di mana rumah sakit?", pronunciation: "dee MA-na ROO-mah SA-kit", category: "Emergencies", emergency: true),
                LangPhrase(english: "Call the police", local: "Panggil polisi", pronunciation: "PANG-gil po-LEE-see", category: "Emergencies", emergency: true),
                LangPhrase(english: "I’m lost", local: "Saya tersesat", pronunciation: "SA-ya ter-suh-SAT", category: "Emergencies", emergency: true)
            ],
            culturalTips: [
                LangInfoRow(title: "Use your right hand", subtitle: "Giving & receiving", icon: "hand.raised.fill", detail: "Pass and receive things with the right hand; the left is considered unclean.", accent: theme.tint),
                LangInfoRow(title: "Don’t point with a finger", subtitle: "Body language", icon: "hand.point.up.left.fill", detail: "Gesture with an open hand or your thumb; a pointed finger is rude.", accent: theme.ocean),
                LangInfoRow(title: "Keep your cool", subtitle: "Saving face", icon: "face.smiling.fill", detail: "Anger and confrontation cause loss of face — stay calm, smile and be patient.", accent: theme.moss),
                LangInfoRow(title: "Heads & feet", subtitle: "Respect", icon: "figure.stand", detail: "Don’t touch someone’s head or point your feet at people or shrines.", accent: theme.sun)
            ],
            offlineTips: [
                "Download the Indonesian pack in Google Translate before you travel.",
                "Use the camera-translate feature to read menus and signs offline.",
                "Save your most-used phrases as favourites for one-tap access.",
                "A printed mini-phrasebook is a reliable backup when your battery dies."
            ],
            regionalNotes: [
                LangInfoRow(title: "Bahasa Indonesia", subtitle: "Everywhere", icon: "globe.asia.australia.fill", detail: "The national lingua franca — learning it works across the whole archipelago.", accent: theme.tint),
                LangInfoRow(title: "Balinese (Basa Bali)", subtitle: "Bali", icon: "leaf.fill", detail: "Spoken at home in Bali with formal speech levels; everyone also speaks Bahasa.", accent: theme.ocean),
                LangInfoRow(title: "Sasak", subtitle: "Lombok", icon: "mountain.2.fill", detail: "The main local language of Lombok; Bahasa Indonesia is understood everywhere.", accent: theme.moss)
            ],
            disclaimer: "Pronunciations here are rough English approximations to get you understood, not exact phonetics. Locals will warmly help you with the real sounds — just give it a go."
        )
    }
}

struct TravelLanguagePhrasebookDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelLanguagePhrasebookDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Phrasebook · Indonesia")

            TravelLanguagePhrasebookDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Phrasebook · Dynamic Type XL")
        }
    }
}
#endif
