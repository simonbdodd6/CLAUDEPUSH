import SwiftUI

#if DEBUG

// MARK: - Destination guide preview (Phase 98)
//
// A DEBUG-only premium destination page that shows how all of the Travel
// Essentials content comes together for a single destination (Gili Air). The whole
// file lives inside `#if DEBUG`, so it does not exist in release builds, is not
// wired into navigation, and modifies no production screen.
//
// It is composition glue only — it reuses the existing design system
// (`PremiumScrollView`, `PremiumSection`, `PremiumHeroHeader`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumMetricTile`, `PremiumPillRow` and the design
// tokens) and references the existing guide components in the "Essential guides"
// section (it embeds `ExplorerFerryGuide` and `ExplorerEmergencyGuide` in their
// compact layouts). The "Before you go" checklist is UI-only (presentation
// `@State`); nothing performs real navigation, data, networking, persistence,
// view-model or DTO work.
//
// Accessibility: cards expose combined VoiceOver labels; the checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

private struct DestinationExperience: Identifiable {
    let id: String
    let title: String
    let blurb: String
    let icon: String
    let gradient: [Color]
}

struct DestinationGuidePreview: View {

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var checked: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            PremiumHeroHeader(
                eyebrow: "Indonesia · Lombok",
                symbol: "beach.umbrella.fill",
                title: "Gili Air",
                subtitle: "The calmest of the three Gilis — car-free white sand, turtle-filled reefs and a laid-back island pace."
            )
            .modifier(SectionAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            heroImage
                .modifier(SectionAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            overviewGroup
            detailGroup
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Scroll sections (grouped to stay within the ViewBuilder arity limit)

    private var overviewGroup: some View {
        Group {
            section("Quick facts", "A snapshot before you arrive.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 140) {
                    factTile("Car-free", "No cars or motorbikes")
                    factTile("~45 min", "Fast boat from Bali")
                    factTile("IDR", "Indonesian rupiah")
                    factTile("Apr–Oct", "Best months")
                    factTile("Indonesian", "Language (+ Sasak)")
                    factTile("Calmest", "Of the three Gilis")
                }
            }

            section("Best time to visit", "When to go for the best conditions.", 3) {
                summaryCard(icon: "sun.max.fill", accent: theme.sun, points: [
                    "April–October (dry season) is ideal: sunny, calm seas, great visibility.",
                    "July–August is busiest and priciest; May–June and September are the sweet spot.",
                    "November–March is greener and cheaper, with afternoon rain and rougher crossings."
                ])
            }

            section("Weather", "What to expect day to day.", 4) {
                GlassCard {
                    VStack(alignment: .leading, spacing: TravelSpacing.md) {
                        PremiumAdaptiveGrid(minimumWidth: 120) {
                            factTile("27–31°C", "Temperature")
                            factTile("Low", "Rain (Apr–Oct)")
                            factTile("75–85%", "Humidity")
                        }
                        Text("Warm and humid all year; a sea breeze keeps the island comfortable.")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
            }

            section("Daily budget", "Typical spend per person, per day.", 5) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        budgetRow("Backpacker", "Rp 350–600k", theme.moss)
                        budgetRow("Mid-range", "Rp 800k–1.5m", theme.sun)
                        budgetRow("Premium", "Rp 2.5m+", theme.coral)
                    }
                }
            }

            section("Getting there & around", "Ferries and island transport.", 6) {
                summaryCard(icon: "ferry.fill", accent: theme.ocean, points: [
                    "Fast boats run from Bali (Padang Bai/Amed/Serangan) and from Bangsal on Lombok.",
                    "Book named operators (Eka Jaya, Gili Getaway) — never beach touts.",
                    "The island is car-free: get around on foot, by bicycle or by cidomo (pony cart)."
                ])
            }

            section("Connectivity", "Staying online.", 7) {
                summaryCard(icon: "wifi", accent: theme.sky, points: [
                    "Buy a Telkomsel or XL SIM on the mainland before you cross.",
                    "4G is generally good; most cafés and guesthouses have Wi-Fi.",
                    "An eSIM (Airalo/Nomad) is handy if you’d rather arrive already connected."
                ])
            }

            section("Food & health", "Eat well, stay well.", 8) {
                summaryCard(icon: "fork.knife", accent: theme.sun, points: [
                    "Warungs and fresh-grilled seafood are cheap and excellent.",
                    "Drink only sealed or filtered water — never the tap; refill stations cut plastic.",
                    "Bring reef-safe sunscreen and mosquito repellent (daytime dengue risk)."
                ])
            }
        }
    }

    private var detailGroup: some View {
        Group {
            section("Culture & etiquette", "Be a respectful guest.", 9) {
                summaryCard(icon: "hands.sparkles.fill", accent: theme.ocean, points: [
                    "Lombok is predominantly Muslim — dress modestly away from the beach.",
                    "Be mindful around prayer times and during Ramadan.",
                    "Ask before photographing people, and use your right hand to give and receive."
                ])
            }

            section("Emergency", "Save these before you go.", 10) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        emergencyRow("General emergency", "112", theme.coral)
                        emergencyRow("Police", "110", theme.tint)
                        emergencyRow("Ambulance", "118 / 119", theme.coral)
                        emergencyRow("Sea rescue (BASARNAS)", "115", theme.ocean)
                        emergencyRow("Serious cases", "Transfer to Lombok / Bali", theme.sun)
                    }
                }
            }

            section("Packing checklist", "The island essentials.", 11) {
                summaryCard(icon: "suitcase.fill", accent: theme.tint, points: [
                    "Reef-safe sunscreen, hat and UV sunglasses",
                    "Snorkel/mask, rash vest and a dry bag",
                    "Mosquito repellent and a small first-aid kit",
                    "Plenty of cash — island ATMs are unreliable"
                ], bulletIcon: "checkmark.circle.fill", bulletTint: theme.moss)
            }

            section("Top experiences", "The best of Gili Air.", 12) {
                PremiumAdaptiveGrid(minimumWidth: 220) {
                    ForEach(experiences) { experience in
                        experienceCard(experience)
                    }
                }
            }

            section("Before you go", "Tick these off first.", 13) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(beforeYouGo, id: \.self) { item in
                            checklistRow(item)
                        }
                    }
                }
            }

            section("Essential guides", "The full guides, composed in compact form.", 14) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerFerryGuide(routes: ferryPreview, layout: .compact, title: "Ferries to Gili Air")
                    ExplorerEmergencyGuide(items: emergencyPreview, layout: .compact, title: "Emergency contacts")
                }
                .modifier(SectionAppear(appeared: appeared, reduceMotion: reduceMotion, index: 14))
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(SectionAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Hero image

    private var heroImage: some View {
        RoundedRectangle(cornerRadius: TravelRadius.hero, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [theme.ocean, theme.sky, theme.sun.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(alignment: .topTrailing) {
                Image(systemName: "beach.umbrella.fill")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(TravelSpacing.lg)
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("GILI AIR")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.white.opacity(0.85))
                    Text("White sand, turtle reefs, no traffic")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(TravelSpacing.lg)
            }
            .frame(height: 220)
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.hero, style: .continuous)
                    .stroke(.white.opacity(0.25), lineWidth: 1)
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Gili Air — a decorative destination image")
    }

    // MARK: Cards & rows

    private func factTile(_ value: String, _ label: String) -> some View {
        PremiumMetricTile(value: value, label: label)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(value), \(label)")
    }

    private func summaryCard(icon: String, accent: Color, points: [String], bulletIcon: String = "circle.fill", bulletTint: Color? = nil) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(icon, accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    ForEach(points, id: \.self) { point in
                        HStack(alignment: .top, spacing: TravelSpacing.xs) {
                            Image(systemName: bulletIcon)
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(bulletTint ?? accent)
                            Text(point)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func budgetRow(_ level: String, _ cost: String, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.sm) {
            Text(level)
                .textCase(.uppercase)
                .font(TravelTypography.eyebrow)
                .foregroundStyle(tint)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xxs)
                .background(tint.opacity(0.15), in: Capsule())
            Spacer(minLength: TravelSpacing.sm)
            Text(cost)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, TravelSpacing.xxs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(level), \(cost) per day")
    }

    private func emergencyRow(_ label: String, _ value: String, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.sm) {
            Image(systemName: "phone.fill")
                .font(TravelTypography.caption)
                .foregroundStyle(tint)
                .frame(width: 18)
            Text(label)
                .font(TravelTypography.caption)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: TravelSpacing.sm)
            Text(value)
                .font(TravelTypography.cardTitle)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, TravelSpacing.xxs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value)")
    }

    private func experienceCard(_ experience: DestinationExperience) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(
                        LinearGradient(colors: experience.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: experience.icon)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(TravelSpacing.md)
                    }
                    .frame(height: 96)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(experience.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(experience.blurb)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(experience.title). \(experience.blurb)")
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

    // MARK: Mock content

    private var experiences: [DestinationExperience] {
        [
            DestinationExperience(id: "turtles", title: "Snorkel with turtles", blurb: "Green and hawksbill turtles right off the east-side beaches.", icon: "water.waves", gradient: [theme.ocean, theme.sky]),
            DestinationExperience(id: "sunset", title: "Sunset swings & bars", blurb: "Iconic over-water swings facing Mount Agung at golden hour.", icon: "sunset.fill", gradient: [theme.coral, theme.sun]),
            DestinationExperience(id: "freedive", title: "Freediving & scuba", blurb: "Calm, clear water and well-run dive schools for all levels.", icon: "figure.open.water.swim", gradient: [theme.tint, theme.ocean]),
            DestinationExperience(id: "bike", title: "Island bike loop", blurb: "Circle the whole car-free island by bicycle in under an hour.", icon: "bicycle", gradient: [theme.moss, theme.sky]),
            DestinationExperience(id: "yoga", title: "Beach yoga & wellness", blurb: "Sunrise yoga shalas and slow mornings by the sea.", icon: "figure.mind.and.body", gradient: [theme.sun, theme.moss])
        ]
    }

    private let beforeYouGo: [String] = [
        "Book your fast boat in advance",
        "Withdraw cash on Bali (island ATMs run dry)",
        "Get travel insurance that covers diving",
        "Download offline maps & a translation pack",
        "Buy a Telkomsel SIM on the mainland",
        "Pack reef-safe sunscreen & mosquito repellent"
    ]

    private var ferryPreview: [FerryRoute] {
        [
            FerryRoute(
                departurePort: "Padang Bai", arrivalPort: "Gili Air",
                operatorName: "Gili Getaway",
                officialBooking: "Book direct on the operator’s site",
                bookingWebsites: ["giligetaway.com", "Bookaway"],
                averagePrice: "Rp 400k", duration: "≈ 2 hrs", frequency: "1–2 daily",
                luggageAllowance: "1 large bag + hand luggage",
                checkIn: "Arrive 45–60 min before departure",
                seaConditions: "Open-water crossing; calmest in the morning.",
                rainySeasonNote: "Nov–Mar afternoons can be rough — take the morning boat.",
                cancellation: .moderate,
                paymentMethods: ["Cash", "Card"],
                familyFriendliness: .good,
                accessibilityNote: "Beach-launch boarding; not wheelchair accessible.",
                expertTip: "The first morning departure is calmest and least crowded.",
                commonScam: "Beach touts reselling ‘full’ boats — buy from the operator desk.",
                accent: theme.ocean
            )
        ]
    }

    private var emergencyPreview: [EmergencyItem] {
        [
            EmergencyItem(
                type: "General emergency", icon: "exclamationmark.shield.fill", priority: .critical, phoneNumber: "112",
                whenToCall: "Any emergency — police, fire or ambulance, nationwide.",
                firstActions: ["Stay calm and state your location clearly", "Ask for an English-speaking operator"],
                importantNotes: "112 is free and works without phone credit.",
                phrases: [EmergencyPhrase(indonesian: "Tolong!", english: "Help!")],
                nearestHelp: "Island clinic on Gili Air; hospitals on Lombok and Bali.",
                documents: ["Passport", "Travel insurance details"],
                expertAdvice: "Save 112 and your insurer’s line offline before you cross."
            ),
            EmergencyItem(
                type: "Sea rescue", icon: "lifepreserver", priority: .critical, phoneNumber: "115 (BASARNAS)",
                whenToCall: "Drowning, a missing swimmer/diver or a boat in distress.",
                firstActions: ["Keep eyes on the person and point", "Alert lifeguards and dive crews"],
                importantNotes: "Dive operators monitor radios and can respond quickly.",
                phrases: [EmergencyPhrase(indonesian: "Ada orang tenggelam!", english: "Someone is drowning!")],
                nearestHelp: "Gili Air dive centres; BASARNAS for sea rescue.",
                documents: ["Number of people involved"],
                expertAdvice: "Confirm your dive boat carries oxygen and a radio."
            )
        ]
    }
}

// MARK: - Section appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct SectionAppear: ViewModifier {
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

struct DestinationGuidePreview_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            DestinationGuidePreview()
                .previewDisplayName("Destination · Gili Air")

            DestinationGuidePreview()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Destination · Gili Air · Dynamic Type XL")
        }
    }
}

#endif
