import SwiftUI

// MARK: - Travel food & dining guide (Phase 107)
//
// A premium Food & Dining dashboard helping travellers discover local cuisine
// safely and confidently — must-try dishes, street food, restaurants, cafés,
// healthy and vegetarian/vegan options, seafood, food-safety and water advice,
// typical prices, tipping customs, local drinks and desserts, plus a UI-only
// favourites checklist. A caller supplies a `FoodGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumPillRow`,
// `PremiumMetricTile`, `GlassCard`, `MapTexturePlaceholder`, `TravelTypography` and
// the tokens — and the Phase-101 `DestinationListItem` for the list/price rows.
// `FoodGuide` / `DishItem` are lightweight presentation models (not DTOs); the
// dashboard holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The
// favourites checklist toggles are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// A featured dish, drink or dessert with a gradient image placeholder.
struct DishItem: Identifiable {
    let id: String
    var name: String
    var icon: String
    var description: String
    var price: String
    var gradient: [Color]

    init(id: String? = nil, name: String, icon: String, description: String, price: String, gradient: [Color]) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.description = description
        self.price = price
        self.gradient = gradient
    }
}

/// The full, presentation-only content for a food & dining guide.
struct FoodGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var favouriteFoods: [String]
    var mustTry: [DishItem]
    var streetFood: [DestinationListItem]
    var restaurants: [DestinationListItem]
    var cafes: [DestinationListItem]
    var healthy: [DestinationListItem]
    var vegetarianVegan: [DestinationListItem]
    var seafood: [DestinationListItem]
    var localDrinks: [DishItem]
    var desserts: [DishItem]
    var mealPrices: [DestinationListItem]
    var foodSafety: [String]
    var drinkingWater: [String]
    var tipping: [String]
}

/// A premium, presentation-only food & dining guide rendered from a `FoodGuide`.
struct TravelFoodDiningGuide: View {
    var guide: FoodGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: guide.heroSymbol,
                title: guide.heroTitle,
                subtitle: guide.heroSubtitle,
                gradient: guide.heroGradient,
                metrics: [
                    HeroMetric(value: "\(guide.mustTry.count)", label: "Must try"),
                    HeroMetric(value: "\(guide.localDrinks.count)", label: "Local drinks"),
                    HeroMetric(value: "\(guide.mealPrices.count)", label: "Price guides")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(FoodDashAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            section("Favourite foods", "Tick what you want to try.", 1) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(guide.favouriteFoods, id: \.self) { food in
                            favouriteRow(food)
                        }
                    }
                }
            }

            section("Must try", "The dishes not to miss.", 2) {
                dishGrid(guide.mustTry)
            }

            listSection("Street food", "Eat like a local, safely.", guide.streetFood, tag: "Street", 3)
            listSection("Local restaurants", "From warungs to fine dining.", guide.restaurants, tag: "Eat", 4)
            listSection("Cafés", "Coffee, brunch and bowls.", guide.cafes, tag: "Café", 5)
            listSection("Healthy options", "Light and fresh choices.", guide.healthy, tag: "Healthy", 6)
            listSection("Vegetarian & vegan", "Plant-based, made easy.", guide.vegetarianVegan, tag: "Veg", 7)
            listSection("Seafood", "Fresh from the sea.", guide.seafood, tag: "Sea", 8)

            section("Local drinks", "What to sip.", 9) {
                dishGrid(guide.localDrinks)
            }

            section("Desserts", "Sweet finishes.", 10) {
                dishGrid(guide.desserts)
            }

            section("Typical meal prices", "What things should cost.", 11) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.mealPrices) { item in
                        PremiumPillRow(symbol: item.icon, accent: item.accent, title: item.title, subtitle: "Typical price", trailing: item.detail)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(item.title), typical price \(item.detail)")
                    }
                }
            }

            section("Food safety tips", "Eat well, stay well.", 12) {
                bulletCard(guide.foodSafety, icon: "checkmark.shield.fill", tint: theme.moss)
            }

            section("Drinking water", "Get this one right.", 13) {
                bulletCard(guide.drinkingWater, icon: "drop.fill", tint: theme.sky)
            }

            section("Tipping customs", "What’s expected.", 14) {
                bulletCard(guide.tipping, icon: "banknote.fill", tint: theme.sun)
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
        .modifier(FoodDashAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
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

    private func dishGrid(_ dishes: [DishItem]) -> some View {
        PremiumAdaptiveGrid(minimumWidth: 200) {
            ForEach(dishes) { dish in
                dishCard(dish)
            }
        }
    }

    // MARK: Cards & rows

    private func favouriteRow(_ food: String) -> some View {
        let isFav = favourites.contains(food)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isFav { favourites.remove(food) } else { favourites.insert(food) }
            }
        } label: {
            HStack(spacing: TravelSpacing.sm) {
                Image(systemName: isFav ? "star.fill" : "star")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isFav ? theme.sun : Color.secondary)
                Text(food)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isFav ? .secondary : .primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(food) favourite")
        .accessibilityValue(isFav ? "Yes" : "No")
        .accessibilityHint("Double tap to toggle")
    }

    private func dishCard(_ dish: DishItem) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: dish.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topLeading) {
                        Image(systemName: dish.icon)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(TravelSpacing.md)
                    }
                    .overlay(alignment: .bottomTrailing) {
                        Text(dish.price)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.white)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(TravelSpacing.sm)
                    }
                    .frame(height: 96)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(dish.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(dish.description)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dish.name), \(dish.price). \(dish.description)")
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
}

// MARK: - Food dashboard appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct FoodDashAppear: ViewModifier {
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
extension FoodGuide {
    /// A deterministic sample food & dining guide for Indonesia.
    static var sampleIndonesia: FoodGuide {
        let theme = TravelTheme.current
        return FoodGuide(
            heroTitle: "Food & Dining",
            heroSubtitle: "Discover Indonesia’s food with confidence — what to try, where to eat and how to stay well.",
            heroSymbol: "fork.knife",
            heroGradient: [theme.coral, theme.sun, theme.moss],
            favouriteFoods: ["Nasi Goreng", "Satay", "Gado-Gado", "Babi Guling", "Fresh seafood", "Kopi Luwak", "Fresh coconut"],
            mustTry: [
                DishItem(name: "Nasi Goreng", icon: "fork.knife", description: "Indonesia’s beloved fried rice, often topped with a fried egg.", price: "Rp 20–40k", gradient: [theme.sun, theme.coral]),
                DishItem(name: "Mie Goreng", icon: "fork.knife", description: "Fried noodles — the noodle cousin of nasi goreng.", price: "Rp 20–40k", gradient: [theme.coral, theme.sun]),
                DishItem(name: "Satay (Sate)", icon: "flame.fill", description: "Skewered, charcoal-grilled meat with peanut sauce.", price: "Rp 25–50k", gradient: [theme.coral, theme.ocean]),
                DishItem(name: "Gado-Gado", icon: "leaf.fill", description: "Steamed vegetables and tofu in a rich peanut dressing.", price: "Rp 25–45k", gradient: [theme.moss, theme.sun]),
                DishItem(name: "Rendang", icon: "flame.fill", description: "Slow-cooked beef in coconut and spices — rich and tender.", price: "Rp 40–70k", gradient: [theme.coral, theme.moss]),
                DishItem(name: "Babi Guling", icon: "flame.fill", description: "Balinese spit-roast suckling pig — a Bali specialty.", price: "Rp 40–60k", gradient: [theme.coral, theme.sun])
            ],
            streetFood: [
                DestinationListItem(icon: "takeoutbag.and.cup.and.straw.fill", title: "Busy carts (kaki lima)", detail: "Eat where there’s a long local queue — high turnover means fresh.", accent: theme.sun),
                DestinationListItem(icon: "flame.fill", title: "Hot and fresh", detail: "Choose food cooked to order in front of you.", accent: theme.coral),
                DestinationListItem(icon: "banknote.fill", title: "Cash only", detail: "Carry small notes; some carts accept QRIS.", accent: theme.moss)
            ],
            restaurants: [
                DestinationListItem(icon: "house.fill", title: "Warungs", detail: "Family eateries — the most authentic, cheapest local food.", accent: theme.sun),
                DestinationListItem(icon: "doc.text.fill", title: "Check tax & service", detail: "Tourist menus add 10–21% — read before ordering.", accent: theme.coral),
                DestinationListItem(icon: "person.3.fill", title: "Busy means fresh", detail: "Pick places with good turnover.", accent: theme.ocean)
            ],
            cafes: [
                DestinationListItem(icon: "cup.and.saucer.fill", title: "Specialty coffee", detail: "Canggu and Ubud have world-class third-wave cafés.", accent: theme.coral),
                DestinationListItem(icon: "leaf.fill", title: "Smoothie bowls", detail: "Healthy breakfasts everywhere in Bali.", accent: theme.moss),
                DestinationListItem(icon: "wifi", title: "Co-working friendly", detail: "Fast Wi-Fi and all-day brunch.", accent: theme.sky)
            ],
            healthy: [
                DestinationListItem(icon: "leaf.fill", title: "Smoothie & açaí bowls", detail: "Tropical fruit, granola and seeds.", accent: theme.moss),
                DestinationListItem(icon: "cup.and.saucer.fill", title: "Fresh juices", detail: "Ask for ‘tanpa gula’ (no sugar).", accent: theme.sun),
                DestinationListItem(icon: "fish.fill", title: "Grilled fish & veg", detail: "Light, fresh and widely available.", accent: theme.ocean)
            ],
            vegetarianVegan: [
                DestinationListItem(icon: "leaf.fill", title: "Tempeh & tofu", detail: "Protein-rich staples in countless dishes.", accent: theme.moss),
                DestinationListItem(icon: "carrot.fill", title: "Gado-Gado & urap", detail: "Veg-forward classics — check for shrimp paste.", accent: theme.sun),
                DestinationListItem(icon: "character.bubble.fill", title: "Say ‘tanpa daging’", detail: "‘No meat’; watch for terasi and fish sauce.", accent: theme.coral)
            ],
            seafood: [
                DestinationListItem(icon: "fish.fill", title: "Jimbaran grills", detail: "Pick your catch and have it grilled on the beach.", accent: theme.ocean),
                DestinationListItem(icon: "flame.fill", title: "Eat it fresh", detail: "Choose busy places; have it cooked thoroughly.", accent: theme.coral),
                DestinationListItem(icon: "scalemass.fill", title: "Priced per 100g", detail: "Confirm the weight and price first.", accent: theme.sun)
            ],
            localDrinks: [
                DishItem(name: "Kopi (local coffee)", icon: "cup.and.saucer.fill", description: "Strong, sweet kopi tubruk — grounds settle at the bottom.", price: "Rp 20–40k", gradient: [theme.coral, theme.sun]),
                DishItem(name: "Kopi Luwak", icon: "cup.and.saucer.fill", description: "Famous (pricey) civet coffee — choose ethical, wild-sourced.", price: "Rp 50–150k", gradient: [theme.moss, theme.coral]),
                DishItem(name: "Fresh coconut", icon: "drop.fill", description: "Chilled young coconut water, straight from the shell.", price: "Rp 15–25k", gradient: [theme.sky, theme.moss]),
                DishItem(name: "Fresh juices", icon: "cup.and.saucer.fill", description: "Citrus and tropical juices — ask for less sugar.", price: "Rp 15–35k", gradient: [theme.sun, theme.coral])
            ],
            desserts: [
                DishItem(name: "Pisang goreng", icon: "flame.fill", description: "Crispy fried banana fritters.", price: "Rp 10–25k", gradient: [theme.sun, theme.coral]),
                DishItem(name: "Es campur", icon: "snowflake", description: "Shaved ice with fruit, jelly and syrup.", price: "Rp 15–30k", gradient: [theme.sky, theme.coral]),
                DishItem(name: "Dadar gulung", icon: "leaf.fill", description: "Pandan crêpes filled with palm-sugar coconut.", price: "Rp 10–25k", gradient: [theme.moss, theme.sun]),
                DishItem(name: "Tropical fruit", icon: "leaf.fill", description: "Mangosteen, salak and rambutan — peel and enjoy.", price: "Rp 10–40k", gradient: [theme.moss, theme.sky])
            ],
            mealPrices: [
                DestinationListItem(icon: "house.fill", title: "Warung meal", detail: "Rp 25–40k", accent: theme.sun),
                DestinationListItem(icon: "fork.knife", title: "Mid-range restaurant", detail: "Rp 100–200k", accent: theme.coral),
                DestinationListItem(icon: "wineglass.fill", title: "Beach-club dinner", detail: "Rp 250k+", accent: theme.coral),
                DestinationListItem(icon: "cup.and.saucer.fill", title: "Local coffee", detail: "Rp 20–40k", accent: theme.tint),
                DestinationListItem(icon: "drop.fill", title: "Fresh coconut", detail: "Rp 15–25k", accent: theme.sky),
                DestinationListItem(icon: "leaf.fill", title: "Tropical fruit (market)", detail: "Rp 10–40k", accent: theme.moss)
            ],
            foodSafety: [
                "Eat busy, hot-cooked food — high turnover is the safest sign.",
                "Drink only sealed or filtered water — never the tap.",
                "Peel fruit yourself; skip pre-cut fruit washed in tap water.",
                "Carry oralit (ORS) in case of ‘Bali belly’."
            ],
            drinkingWater: [
                "Tap water is not potable anywhere in Indonesia.",
                "Buy sealed bottles or use refill stations to cut plastic.",
                "Commercial tube ice (with a hole) is factory-made and safe.",
                "Brush your teeth with bottled water if you’re sensitive."
            ],
            tipping: [
                "Tipping isn’t obligatory but is genuinely appreciated.",
                "Many restaurants add a 5–10% service charge — check the bill first.",
                "Round up for great service; tip drivers and guides for a good day.",
                "Cash tips reach the staff most reliably."
            ]
        )
    }
}

struct TravelFoodDiningGuide_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelFoodDiningGuide(guide: .sampleIndonesia)
                .previewDisplayName("Food & dining · Indonesia")

            TravelFoodDiningGuide(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Food & dining · Dynamic Type XL")
        }
    }
}
#endif
