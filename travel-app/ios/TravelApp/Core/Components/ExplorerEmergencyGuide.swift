import SwiftUI

// MARK: - Explorer emergency guide (Phase 89)
//
// A reusable, presentation-only emergency guide giving travellers instant access
// to what they need in a crisis: the right number, when to call, immediate first
// actions, important notes, useful local phrases, the nearest help, documents to
// prepare and expert advice. Entries are colour-coded by priority.
//
// It reuses the existing design system exclusively — `GlassCard`, `PremiumPillRow`
// (the compact summary rows) and the tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are caller-
// supplied mock data; the component holds no data, networking, persistence,
// view-model, repository, navigation, AppContainer or DTO usage, and is not wired
// into any screen. Phone numbers are shown as selectable text (not tappable `tel:`
// links) to keep the component strictly presentation-only.
//
// Accessibility: every entry exposes one combined VoiceOver label including the
// phone number; text uses the Dynamic Type-scaling `TravelTypography` styles and
// wraps rather than truncating; and all motion (appearance + expand) is disabled
// under Reduce Motion.

/// How urgent an emergency category is — drives the colour coding.
enum EmergencyPriority: CaseIterable {
    case standard
    case high
    case critical

    var label: String {
        switch self {
        case .standard: "Standard"
        case .high: "High"
        case .critical: "Critical"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .standard: return theme.ocean
        case .high: return theme.sun
        case .critical: return theme.coral
        }
    }
}

/// A useful local phrase with its English meaning.
struct EmergencyPhrase: Hashable {
    var indonesian: String
    var english: String
}

/// A single, presentation-only emergency entry.
struct EmergencyItem: Identifiable {
    let id: String
    var type: String
    var icon: String
    var priority: EmergencyPriority
    var phoneNumber: String
    var whenToCall: String
    var firstActions: [String]
    var importantNotes: String
    var phrases: [EmergencyPhrase]
    var nearestHelp: String
    var documents: [String]
    var expertAdvice: String

    /// `id` defaults to the type, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        type: String,
        icon: String,
        priority: EmergencyPriority,
        phoneNumber: String,
        whenToCall: String,
        firstActions: [String],
        importantNotes: String,
        phrases: [EmergencyPhrase],
        nearestHelp: String,
        documents: [String],
        expertAdvice: String
    ) {
        self.id = id ?? type
        self.type = type
        self.icon = icon
        self.priority = priority
        self.phoneNumber = phoneNumber
        self.whenToCall = whenToCall
        self.firstActions = firstActions
        self.importantNotes = importantNotes
        self.phrases = phrases
        self.nearestHelp = nearestHelp
        self.documents = documents
        self.expertAdvice = expertAdvice
    }

    /// Colour-coded by priority.
    var accent: Color { priority.accent }

    var accessibilityText: String {
        let phraseText = phrases.map { "\($0.indonesian) meaning \($0.english)" }.joined(separator: "; ")
        return [
            type,
            "\(priority.label) priority",
            "phone number \(phoneNumber)",
            "when to call: \(whenToCall)",
            "first actions: \(firstActions.joined(separator: "; "))",
            "important: \(importantNotes)",
            "useful phrases: \(phraseText)",
            "nearest help: \(nearestHelp)",
            "documents: \(documents.joined(separator: ", "))",
            "advice: \(expertAdvice)"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerEmergencyGuide`.
enum EmergencyGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only emergency guide.
struct ExplorerEmergencyGuide: View {
    var items: [EmergencyItem]
    var layout: EmergencyGuideLayout = .expanded
    var title: String? = "Emergency"
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
                    EmergencyCard(item: item, startsExpanded: index == 0)
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
                            title: item.type,
                            subtitle: item.whenToCall,
                            trailing: item.phoneNumber
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
        items.count == 1 ? "1 contact" : "\(items.count) contacts"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "cross.case")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No emergency contacts listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Emergency card

/// A premium expandable GlassCard for one emergency entry. The summary shows the
/// type, the phone number (prominent and selectable) and the priority — the
/// critical information stays visible without expanding. The whole card is a
/// single VoiceOver element, and all motion is disabled under Reduce Motion.
private struct EmergencyCard: View {
    let item: EmergencyItem
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
                Text(item.type)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: TravelSpacing.xs) {
                    Image(systemName: "phone.fill")
                        .font(TravelTypography.caption)
                        .foregroundStyle(item.accent)
                    Text(item.phoneNumber)
                        .font(TravelTypography.cardTitle)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                priorityBadge
                Image(systemName: "chevron.down")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
        }
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            detailRow(icon: "phone.arrow.up.right.fill", label: "When to call", value: item.whenToCall)

            labeledList("Immediate actions", item.firstActions, icon: "arrow.right.circle.fill", tint: item.accent)

            calloutRow(icon: "exclamationmark.bubble.fill", tint: item.accent, label: "Important", text: item.importantNotes)

            phrasesBlock(item.phrases)

            detailRow(icon: "mappin.and.ellipse", label: "Nearest help", value: item.nearestHelp)

            labeledChips("Documents to prepare", item.documents)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Expert advice", text: item.expertAdvice)
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

    private var priorityBadge: some View {
        Text(item.priority.label)
            .textCase(.uppercase)
            .font(TravelTypography.eyebrow)
            .foregroundStyle(.white)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(item.priority.accent, in: Capsule())
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
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: icon)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tint)
                        Text(item)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private func labeledChips(_ label: String, _ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(items, id: \.self) { item in
                        Text(item)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(.thinMaterial, in: Capsule())
                    }
                }
            }
        }
    }

    private func phrasesBlock(_ phrases: [EmergencyPhrase]) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text("Useful phrases")
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                ForEach(phrases, id: \.self) { phrase in
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
struct ExplorerEmergencyGuide_Previews: PreviewProvider {

    /// Emergency contacts and advice across Bali, Lombok, the Gilis, Komodo and
    /// Raja Ampat. (112 reaches all services nationwide.)
    private static let emergencies: [EmergencyItem] = [
        EmergencyItem(
            type: "Police", icon: "shield.lefthalf.filled", priority: .high, phoneNumber: "110",
            whenToCall: "Crime, theft, assault or to file a report.",
            firstActions: ["Move to a safe, public place", "Note descriptions and plate numbers", "Ask a local to help translate"],
            importantNotes: "112 also reaches police nationwide and has English-speaking operators.",
            phrases: [EmergencyPhrase(indonesian: "Tolong, panggil polisi!", english: "Please call the police!"),
                      EmergencyPhrase(indonesian: "Saya mau lapor.", english: "I want to report something.")],
            nearestHelp: "Nearest Polsek (police station); tourist police in Bali’s resort areas.",
            documents: ["Passport", "Copy of passport", "Details of what happened"],
            expertAdvice: "Get a written police report (laporan polisi) — insurers and embassies require it."
        ),
        EmergencyItem(
            type: "Ambulance", icon: "cross.case.fill", priority: .critical, phoneNumber: "118 / 119",
            whenToCall: "Serious injury, chest pain, breathing trouble or unconsciousness.",
            firstActions: ["Check breathing and bleeding", "Don’t move a fall/spinal casualty", "Send someone to flag the ambulance"],
            importantNotes: "Response can be slow; a taxi/Grab to a private hospital is often faster on Bali.",
            phrases: [EmergencyPhrase(indonesian: "Panggil ambulans!", english: "Call an ambulance!"),
                      EmergencyPhrase(indonesian: "Ada yang terluka parah.", english: "Someone is badly injured.")],
            nearestHelp: "Private hospitals (BIMC, Siloam) on Bali; clinics on the Gilis and Lombok.",
            documents: ["ID/passport", "Travel insurance card", "List of allergies and medications"],
            expertAdvice: "Save your hotel’s exact address and nearest hospital in your phone on arrival."
        ),
        EmergencyItem(
            type: "Fire", icon: "flame.fill", priority: .critical, phoneNumber: "113",
            whenToCall: "Fire, gas leak or for fire-brigade rescue.",
            firstActions: ["Get everyone out and stay out", "Raise the alarm", "Close doors behind you to slow the fire"],
            importantNotes: "Villa kitchens and mosquito coils are common ignition sources — know your exits.",
            phrases: [EmergencyPhrase(indonesian: "Kebakaran!", english: "Fire!"),
                      EmergencyPhrase(indonesian: "Panggil pemadam kebakaran!", english: "Call the fire brigade!")],
            nearestHelp: "Local Damkar (fire service); hotel staff and security.",
            documents: ["Not required — evacuate first"],
            expertAdvice: "On check-in, locate the two nearest exits and the extinguisher."
        ),
        EmergencyItem(
            type: "Coast Guard / Sea Rescue", icon: "lifepreserver", priority: .critical, phoneNumber: "115 (BASARNAS)",
            whenToCall: "Drowning, a missing swimmer/diver, or a boat in distress.",
            firstActions: ["Keep eyes on the person and point", "Throw a float, don’t become a second casualty", "Alert lifeguards and boat crew"],
            importantNotes: "BASARNAS (115) runs national search and rescue; dive operators monitor radios.",
            phrases: [EmergencyPhrase(indonesian: "Tolong, ada orang tenggelam!", english: "Help, someone is drowning!"),
                      EmergencyPhrase(indonesian: "Panggil tim penyelamat!", english: "Call the rescue team!")],
            nearestHelp: "Beach lifeguard (Balawista) posts; dive centres on the Gilis and Komodo.",
            documents: ["Dive certification (if relevant)", "Number of people involved"],
            expertAdvice: "Diving Komodo or Raja Ampat? Confirm the boat carries oxygen and a radio."
        ),
        EmergencyItem(
            type: "Tourist Police", icon: "shield.righthalf.filled", priority: .high, phoneNumber: "112 · Bali +62 361 754599",
            whenToCall: "Tourist-specific problems: scams, disputes, lost items, language help.",
            firstActions: ["Explain calmly in simple English", "Have your passport copy ready", "Ask for an officer who speaks English"],
            importantNotes: "Bali’s tourist police are used to helping visitors and often speak English.",
            phrases: [EmergencyPhrase(indonesian: "Saya turis, saya butuh bantuan.", english: "I’m a tourist, I need help."),
                      EmergencyPhrase(indonesian: "Bisa bantu saya?", english: "Can you help me?")],
            nearestHelp: "Tourist police posts in Kuta, Ubud and other resort areas.",
            documents: ["Passport", "Photos/details of the incident"],
            expertAdvice: "112 is free, works without credit, and connects to an English operator."
        ),
        EmergencyItem(
            type: "Hospitals", icon: "cross.fill", priority: .high, phoneNumber: "BIMC Bali +62 361 761263",
            whenToCall: "Illness or injury needing a doctor but not an ambulance.",
            firstActions: ["Choose a private hospital for faster English-speaking care", "Bring your insurance details", "Take a Grab/taxi if able"],
            importantNotes: "Private hospitals may require a deposit or card guarantee before treatment.",
            phrases: [EmergencyPhrase(indonesian: "Saya butuh dokter.", english: "I need a doctor."),
                      EmergencyPhrase(indonesian: "Di mana rumah sakit terdekat?", english: "Where is the nearest hospital?")],
            nearestHelp: "BIMC and Siloam (Bali); Lombok and the Gilis have smaller clinics only.",
            documents: ["Passport", "Travel insurance policy", "Payment card"],
            expertAdvice: "Serious cases on the Gilis/Lombok are often transferred to Bali — insurance matters."
        ),
        EmergencyItem(
            type: "Pharmacies", icon: "pills.fill", priority: .standard, phoneNumber: "Apotek K-24 (24 hr)",
            whenToCall: "Minor ailments, prescriptions and travel medicines.",
            firstActions: ["Describe symptoms simply or show the medicine box", "Ask if the pharmacist speaks English", "Check expiry dates"],
            importantNotes: "Many medicines are sold over the counter; bring a photo of any regular prescription.",
            phrases: [EmergencyPhrase(indonesian: "Di mana apotek?", english: "Where is a pharmacy?"),
                      EmergencyPhrase(indonesian: "Saya butuh obat ini.", english: "I need this medicine.")],
            nearestHelp: "Kimia Farma, Guardian and Apotek K-24 (24-hour) on Bali.",
            documents: ["Prescription or a photo of it", "Generic name of your medication"],
            expertAdvice: "Carry the generic drug name — local brands differ from those back home."
        ),
        EmergencyItem(
            type: "Embassy / Consulate", icon: "building.columns.fill", priority: .standard, phoneNumber: "Your embassy · AUS CG Bali +62 361 2000100",
            whenToCall: "Serious legal trouble, hospitalisation, or a lost/stolen passport.",
            firstActions: ["Find your country’s embassy (Jakarta) or consulate (Bali)", "Note their after-hours line", "Have your details ready"],
            importantNotes: "Most embassies are in Jakarta; several countries have a consulate in Bali.",
            phrases: [EmergencyPhrase(indonesian: "Saya perlu menghubungi kedutaan.", english: "I need to contact my embassy."),
                      EmergencyPhrase(indonesian: "Saya warga negara asing.", english: "I am a foreign national.")],
            nearestHelp: "Consulates in Bali (Australia, and several others); embassies in Jakarta.",
            documents: ["Passport or any ID", "Travel details", "Police report if relevant"],
            expertAdvice: "Save your embassy’s 24-hour emergency line in your phone before you travel."
        ),
        EmergencyItem(
            type: "Lost Passport", icon: "person.text.rectangle.fill", priority: .standard, phoneNumber: "Police 110, then your embassy",
            whenToCall: "Your passport is lost or stolen.",
            firstActions: ["File a police report immediately", "Contact your embassy/consulate", "Gather ID copies and photos"],
            importantNotes: "You’ll need the police report for an emergency travel document and immigration.",
            phrases: [EmergencyPhrase(indonesian: "Saya kehilangan paspor saya.", english: "I have lost my passport."),
                      EmergencyPhrase(indonesian: "Saya butuh surat keterangan polisi.", english: "I need a police report.")],
            nearestHelp: "Police station for the report; embassy/consulate for the replacement.",
            documents: ["Police report", "Passport photos", "Copy of the lost passport", "Flight details"],
            expertAdvice: "Keep a photo of your passport in the cloud and two printed copies separately."
        ),
        EmergencyItem(
            type: "Natural Disaster", icon: "exclamationmark.triangle.fill", priority: .critical, phoneNumber: "BNPB 117 · general 112",
            whenToCall: "Floods, landslides or any major hazard needing assistance.",
            firstActions: ["Follow official BPBD/BNPB instructions", "Move away from the hazard", "Keep your phone charged for alerts"],
            importantNotes: "BMKG issues weather/quake alerts; BNPB/BPBD coordinate disaster response.",
            phrases: [EmergencyPhrase(indonesian: "Apakah aman di sini?", english: "Is it safe here?"),
                      EmergencyPhrase(indonesian: "Ke mana arah evakuasi?", english: "Which way is the evacuation route?")],
            nearestHelp: "Local BPBD office; hotel staff relay official guidance.",
            documents: ["Passport", "Phone and power bank", "Cash"],
            expertAdvice: "Enable Indonesian emergency alerts and note your hotel’s muster point."
        ),
        EmergencyItem(
            type: "Volcano", icon: "mountain.2.fill", priority: .high, phoneNumber: "PVMBG · local BPBD",
            whenToCall: "Eruption warning, ashfall, or before trekking an active volcano.",
            firstActions: ["Respect the official exclusion zone", "Wear a mask/cloth against ash", "Heed flight and road advisories"],
            importantNotes: "Agung (Bali) and Rinjani (Lombok) are active; PVMBG sets the alert level.",
            phrases: [EmergencyPhrase(indonesian: "Apakah gunung berapi aman?", english: "Is the volcano safe?"),
                      EmergencyPhrase(indonesian: "Apakah ada abu vulkanik?", english: "Is there volcanic ash?")],
            nearestHelp: "BPBD and licensed trek operators; airport advisories for ashfall.",
            documents: ["Trek permit", "Travel insurance covering volcanic disruption"],
            expertAdvice: "Check PVMBG’s alert level before booking any Agung or Rinjani trek."
        ),
        EmergencyItem(
            type: "Earthquake", icon: "waveform.path", priority: .critical, phoneNumber: "112 · BMKG alerts",
            whenToCall: "After a strong quake with injuries or trapped people.",
            firstActions: ["Drop, cover and hold on during shaking", "Move away from glass and tall furniture", "After shaking, check for hazards and exit calmly"],
            importantNotes: "Lombok and the region are seismically active; aftershocks follow large quakes.",
            phrases: [EmergencyPhrase(indonesian: "Gempa bumi!", english: "Earthquake!"),
                      EmergencyPhrase(indonesian: "Ada yang terjebak!", english: "Someone is trapped!")],
            nearestHelp: "BPBD rescue; hotel muster points.",
            documents: ["Passport", "Phone", "Shoes by the bed at night"],
            expertAdvice: "A coastal quake can precede a tsunami — if it’s strong, head inland/uphill."
        ),
        EmergencyItem(
            type: "Tsunami", icon: "water.waves", priority: .critical, phoneNumber: "112 · BMKG / sirens",
            whenToCall: "After a strong coastal quake or an official tsunami warning.",
            firstActions: ["Move immediately to high ground or inland", "Don’t wait for an official alert if the quake was strong", "Follow evacuation signs"],
            importantNotes: "Natural warning signs: strong shaking, a roar, or the sea suddenly retreating.",
            phrases: [EmergencyPhrase(indonesian: "Tsunami! Lari ke tempat tinggi!", english: "Tsunami! Run to high ground!"),
                      EmergencyPhrase(indonesian: "Di mana tempat evakuasi?", english: "Where is the evacuation point?")],
            nearestHelp: "Tsunami evacuation routes (signed in many coastal towns); high ground.",
            documents: ["Grab phone and go — speed beats belongings"],
            expertAdvice: "Know whether your beach accommodation is in a low-lying zone before you sleep."
        ),
        EmergencyItem(
            type: "Medical Evacuation", icon: "stethoscope", priority: .critical, phoneNumber: "Your insurer’s 24-hr line",
            whenToCall: "Serious cases on remote islands needing transfer to Bali or abroad.",
            firstActions: ["Call your insurance assistance line first", "Let them coordinate the transfer", "Stabilise and stay with the patient"],
            importantNotes: "Evacuation from the Gilis, Komodo or Raja Ampat is costly without cover.",
            phrases: [EmergencyPhrase(indonesian: "Saya butuh evakuasi medis.", english: "I need a medical evacuation."),
                      EmergencyPhrase(indonesian: "Tolong hubungi asuransi saya.", english: "Please contact my insurance.")],
            nearestHelp: "International SOS and similar assistance firms coordinate from Bali.",
            documents: ["Insurance policy number", "Passport", "Any medical records/notes"],
            expertAdvice: "Confirm your policy covers diving and remote evacuation before the trip."
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · In an emergency (tap to expand)").font(TravelTypography.section)
                    ExplorerEmergencyGuide(
                        items: emergencies,
                        subtitle: "Who to call and what to do — across Bali, Lombok, the Gilis, Komodo & Raja Ampat."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerEmergencyGuide(items: [], title: "Emergency")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Emergency · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · Numbers at a glance").font(TravelTypography.section)
                    ExplorerEmergencyGuide(
                        items: emergencies,
                        layout: .compact,
                        title: "Emergency"
                    )

                    Text("Compact · Critical only").font(TravelTypography.section)
                    ExplorerEmergencyGuide(
                        items: emergencies.filter { $0.priority == .critical },
                        layout: .compact,
                        title: "Critical contacts"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Emergency · Compact")

            ScrollView {
                ExplorerEmergencyGuide(items: Array(emergencies.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Emergency · Dynamic Type XL")
        }
    }
}
#endif
