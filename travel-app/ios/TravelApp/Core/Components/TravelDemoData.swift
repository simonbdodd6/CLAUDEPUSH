import SwiftUI

// MARK: - Travel demo data (Integration 001)
//
// A DEBUG-only, presentation-only shared sample-data layer: one realistic Indonesia
// journey ("Bali & Beyond" for the traveller Simon) expressed once as pure Swift demo
// models, plus pure adapter methods that produce the existing dashboard sample models
// without changing any dashboard.
//
// This file is the single source of demo data for future integration. It introduces no
// production architecture: no networking, persistence, repository, view-model,
// AppContainer or DTO changes, and is wrapped entirely in `#if DEBUG`. The shared
// `Demo*` models hold only plain values (String/Int/Double/Bool/arrays and an
// `accentKey` string) — colours and the dashboards' own model types are resolved only
// inside the adapters. Each adapter constructs an existing model
// (`HomeV2Plan` / `HubGuide` / `JourneyPlan` / `PlannerV2Plan` / `IslandGuide`) from the
// same canonical trip, so the dashboards stay byte-for-byte unchanged.
//
// The trip deliberately exposes two lenses on the same journey: a pre-departure lens
// (`daysToDeparture`, used by Home and the Trip Planner) and an in-trip lens
// (`inTripDay` / `inTripProgress` / `inTripStageIndex`, used by the Journey dashboard),
// so no single field is self-contradictory.

#if DEBUG

// MARK: - Shared demo models (pure Swift)

/// A status shared across the demo models: complete, in progress, or still to come.
enum DemoStatus {
    case complete
    case current
    case pending
}

/// A simple value/label metric.
struct DemoMetric {
    var value: String
    var label: String
}

/// A saved/favourite destination.
struct DemoFavourite {
    var name: String
    var subtitle: String
    var icon: String
    var accentKey: String
}

/// An emergency contact.
struct DemoEmergencyContact {
    var name: String
    var role: String
    var number: String
    var icon: String
    var accentKey: String
}

/// A flight leg.
struct DemoFlight {
    var from: String
    var to: String
    var reference: String
    var date: String
    var status: DemoStatus
    var note: String
}

/// A ferry / fast-boat leg.
struct DemoFerry {
    var from: String
    var to: String
    var operatorName: String
    var date: String
    var status: DemoStatus
    var note: String
}

/// An accommodation stay.
struct DemoAccommodation {
    var name: String
    var area: String
    var nights: Int
    var price: String
    var dates: String
    var status: DemoStatus
    var detail: String
    var icon: String
    var accentKey: String
}

/// An activity (dive, surf, snorkel, sightseeing…).
struct DemoActivity {
    var title: String
    var kind: String
    var date: String
    var location: String
    var detail: String
    var status: DemoStatus
    var icon: String
    var accentKey: String
}

/// A single budget allocation line.
struct DemoBudgetLine {
    var label: String
    var amount: String
    var fraction: Double
    var accentKey: String
}

/// The trip budget.
struct DemoBudget {
    var perDay: String
    var spentLabel: String
    var totalLabel: String
    var fraction: Double
    var note: String
    var currencyNote: String
    var lines: [DemoBudgetLine]
}

/// A booking summary row.
struct DemoBooking {
    var title: String
    var subtitle: String
    var icon: String
    var detail: String
    var accentKey: String
}

/// A reminder.
struct DemoReminder {
    var title: String
    var subtitle: String
    var icon: String
    var detail: String
    var accentKey: String
}

/// An island, with the 12 canonical activity/vibe ratings in `TravelDemoData.ratingKeys` order.
struct DemoIsland {
    var name: String
    var tagline: String
    var region: String
    var icon: String
    var accentKey: String
    var bestFor: String
    var nights: Int
    var crowd: Int
    var budget: Int
    var ratings: [Int]
    var stayDuration: String
    var ferryAccess: String
    var airportAccess: String
    var bestSeason: String
    var highlights: [String]
    var avoid: [String]
}

/// The traveller.
struct DemoTraveller {
    var name: String
    var initials: String
    var homeCity: String
    var certifications: [String]
    var metrics: [DemoMetric]
    var favourites: [DemoFavourite]
    var emergency: [DemoEmergencyContact]
}

/// The full canonical trip.
struct DemoTrip {
    var title: String
    var subtitle: String
    var totalDays: Int
    var daysToDeparture: Int
    var departureLabel: String
    var inTripDay: Int
    var inTripProgress: Double
    var inTripStageIndex: Int
    var daysToReturn: Int
    var readiness: Double
    var planningProgress: Double
    var offlineReadiness: Double
    var packingCompletion: Double
    var documentReadiness: Double
    var healthReadiness: Double
    var weatherNow: String
    var connectivityNote: String
    var islandNames: [String]
    var flights: [DemoFlight]
    var ferries: [DemoFerry]
    var accommodation: [DemoAccommodation]
    var dives: [DemoActivity]
    var surf: [DemoActivity]
    var budget: DemoBudget
    var bookings: [DemoBooking]
    var reminders: [DemoReminder]
}

// MARK: - Demo data store + adapters

enum TravelDemoData {

    /// The canonical order of the 12 island ratings.
    static let ratingKeys = ["Surf", "Diving", "Snorkelling", "Beaches", "Nightlife", "Relaxation", "Nomads", "Families", "Couples", "Honeymoon", "Adventure", "Wildlife"]

    // MARK: Canonical journey

    static let traveller = DemoTraveller(
        name: "Simon",
        initials: "SD",
        homeCity: "London",
        certifications: ["PADI Advanced Open Water", "Enriched Air (Nitrox)", "DAN member"],
        metrics: [
            DemoMetric(value: "7", label: "Trips"),
            DemoMetric(value: "4", label: "Countries"),
            DemoMetric(value: "23", label: "Islands"),
            DemoMetric(value: "142", label: "Dives")
        ],
        favourites: [
            DemoFavourite(name: "Bali", subtitle: "Your upcoming base — temples & surf.", icon: "leaf.fill", accentKey: "tint"),
            DemoFavourite(name: "Raja Ampat", subtitle: "The richest reefs on Earth.", icon: "fish.fill", accentKey: "coral"),
            DemoFavourite(name: "Gili Air", subtitle: "Turtles and no traffic.", icon: "beach.umbrella.fill", accentKey: "moss"),
            DemoFavourite(name: "Lombok", subtitle: "Surf and Rinjani.", icon: "mountain.2.fill", accentKey: "sun")
        ],
        emergency: [
            DemoEmergencyContact(name: "Emergency", role: "Nationwide", number: "112", icon: "phone.fill", accentKey: "coral"),
            DemoEmergencyContact(name: "BIMC Hospital Bali", role: "Direct line", number: "+62 361 3000 911", icon: "cross.fill", accentKey: "coral"),
            DemoEmergencyContact(name: "Insurer 24h & DAN", role: "Evacuation", number: "Saved offline", icon: "lifepreserver.fill", accentKey: "ocean")
        ]
    )

    static let islands: [DemoIsland] = [
        DemoIsland(name: "Bali", tagline: "Something for everyone", region: "Bali", icon: "leaf.fill", accentKey: "tint", bestFor: "First-timers & variety", nights: 4, crowd: 4, budget: 2,
            ratings: [4, 3, 3, 3, 4, 3, 4, 4, 4, 4, 4, 2], stayDuration: "5–10 days", ferryAccess: "Main hub", airportAccess: "International (DPS)", bestSeason: "Apr–Oct",
            highlights: ["Temples & rice terraces", "Surf and beach clubs", "Ubud’s culture and jungle"], avoid: ["Kuta crowds and traffic", "Peak-season congestion"]),
        DemoIsland(name: "Gili Air", tagline: "Buzz meets calm", region: "Gili", icon: "beach.umbrella.fill", accentKey: "moss", bestFor: "Easygoing island vibe", nights: 3, crowd: 2, budget: 2,
            ratings: [1, 3, 4, 3, 2, 4, 3, 3, 4, 3, 2, 2], stayDuration: "2–4 days", ferryAccess: "Boat from Bali/Lombok", airportAccess: "None (via Lombok)", bestSeason: "Apr–Oct",
            highlights: ["Turtle snorkelling", "Sunset on the west side", "No motor traffic"], avoid: ["Limited medical care"]),
        DemoIsland(name: "Gili Meno", tagline: "Honeymoon hideaway", region: "Gili", icon: "heart.fill", accentKey: "coral", bestFor: "Couples & total calm", nights: 1, crowd: 1, budget: 2,
            ratings: [1, 3, 4, 4, 1, 4, 1, 2, 4, 4, 1, 2], stayDuration: "1–3 days", ferryAccess: "Boat from Bangsal/Bali", airportAccess: "None", bestSeason: "Apr–Oct",
            highlights: ["Turtle Point", "Underwater statues", "Empty beaches"], avoid: ["Very few amenities", "Quiet after dark"]),
        DemoIsland(name: "Lombok", tagline: "Bali’s quieter neighbour", region: "Lombok", icon: "mountain.2.fill", accentKey: "sun", bestFor: "Surf, treks & space", nights: 2, crowd: 2, budget: 2,
            ratings: [4, 3, 3, 4, 2, 4, 2, 3, 3, 3, 4, 2], stayDuration: "3–5 days", ferryAccess: "Fast boat & ferry", airportAccess: "Domestic (LOP)", bestSeason: "May–Oct",
            highlights: ["Mount Rinjani trek", "Kuta Lombok surf", "Pink Beach"], avoid: ["Long transfers", "Sparse rural facilities"]),
        DemoIsland(name: "Raja Ampat", tagline: "The richest reefs on Earth", region: "Raja Ampat", icon: "fish.fill", accentKey: "coral", bestFor: "Diving & remote nature", nights: 4, crowd: 1, budget: 4,
            ratings: [1, 4, 4, 4, 1, 4, 1, 2, 4, 4, 4, 4], stayDuration: "7–10 days", ferryAccess: "Ferry from Sorong", airportAccess: "Via Sorong (SOQ)", bestSeason: "Oct–Apr",
            highlights: ["Piaynemo karst panorama", "Unreal marine biodiversity", "Homestays & liveaboards"], avoid: ["High cost and remoteness", "Patchy connectivity"])
    ]

    static let trip = DemoTrip(
        title: "Bali & Beyond",
        subtitle: "A 14-night island-hop across Bali, the Gilis, Lombok and Raja Ampat.",
        totalDays: 14,
        daysToDeparture: 12,
        departureLabel: "12–26 Aug",
        inTripDay: 6,
        inTripProgress: 0.43,
        inTripStageIndex: 2,
        daysToReturn: 8,
        readiness: 0.78,
        planningProgress: 0.72,
        offlineReadiness: 0.75,
        packingCompletion: 0.70,
        documentReadiness: 0.90,
        healthReadiness: 0.85,
        weatherNow: "Sunny 30°C",
        connectivityNote: "4G on the Gilis",
        islandNames: ["Bali", "Gili Air", "Gili Meno", "Lombok", "Raja Ampat"],
        flights: [
            DemoFlight(from: "London", to: "Denpasar", reference: "7QK2P", date: "Day 1 · 12 Aug", status: .complete, note: "Arrive late evening; pre-booked transfer waiting."),
            DemoFlight(from: "Lombok (LOP)", to: "Sorong (SOQ)", reference: "WZ9", date: "Day 9 · 20 Aug", status: .pending, note: "Connect via Makassar to the Raja Ampat gateway."),
            DemoFlight(from: "Sorong", to: "London", reference: "7QK3R", date: "Day 14 · 26 Aug", status: .pending, note: "The long journey home via Denpasar.")
        ],
        ferries: [
            DemoFerry(from: "Sanur, Bali", to: "Gili Air", operatorName: "Kuda Hitam Express", date: "Day 5 · 16 Aug", status: .pending, note: "Direct fast boat; the open leg can be lively."),
            DemoFerry(from: "Gili Air", to: "Gili Meno", operatorName: "Local hopping boat", date: "Day 7 · 18 Aug", status: .pending, note: "Short island hop — agree the fare first."),
            DemoFerry(from: "Gili Meno", to: "Bangsal, Lombok", operatorName: "Public slow boat", date: "Day 8 · 19 Aug", status: .pending, note: "Cheap; leaves when full, so keep a buffer.")
        ],
        accommodation: [
            DemoAccommodation(name: "Canggu villa", area: "Bali", nights: 4, price: "£120/night", dates: "12–16 Aug", status: .complete, detail: "Private-pool villa near Batu Bolong beach.", icon: "house.fill", accentKey: "tint"),
            DemoAccommodation(name: "Gili Air bungalow", area: "Gili Air", nights: 3, price: "£55/night", dates: "16–19 Aug", status: .complete, detail: "Beachfront bungalow by the dive centre.", icon: "beach.umbrella.fill", accentKey: "moss"),
            DemoAccommodation(name: "Kuta Lombok hotel", area: "Lombok", nights: 2, price: "£40/night", dates: "19–21 Aug", status: .current, detail: "Surf base and gateway to the Raja Ampat flight.", icon: "bed.double.fill", accentKey: "sun"),
            DemoAccommodation(name: "Raja Ampat homestay", area: "Raja Ampat", nights: 4, price: "£90/night", dates: "21–25 Aug", status: .pending, detail: "Overwater homestay near the best dive sites.", icon: "house.lodge.fill", accentKey: "coral")
        ],
        dives: [
            DemoActivity(title: "Dive Manta Point", kind: "dive", date: "Day 3 · 14 Aug", location: "Nusa Penida", detail: "Reef mantas at the cleaning station.", status: .complete, icon: "water.waves", accentKey: "ocean"),
            DemoActivity(title: "Dive Shark Point", kind: "dive", date: "Day 6 · 17 Aug", location: "Gili Trawangan", detail: "Reef sharks and turtles on an easy reef.", status: .current, icon: "water.waves", accentKey: "ocean"),
            DemoActivity(title: "Dive Cape Kri", kind: "dive", date: "Day 11 · 22 Aug", location: "Raja Ampat", detail: "Record fish counts in the Dampier Strait.", status: .pending, icon: "water.waves", accentKey: "coral")
        ],
        surf: [
            DemoActivity(title: "Surf Batu Bolong", kind: "surf", date: "Day 2 · 13 Aug", location: "Canggu, Bali", detail: "Mellow longboard waves to warm up.", status: .complete, icon: "figure.surfing", accentKey: "sky"),
            DemoActivity(title: "Surf Desert Point", kind: "surf", date: "Day 9 · 20 Aug", location: "Lombok", detail: "World-class left when it’s working.", status: .pending, icon: "figure.surfing", accentKey: "sky")
        ],
        budget: DemoBudget(
            perDay: "£62",
            spentLabel: "£980",
            totalLabel: "£1,400",
            fraction: 0.70,
            note: "On track at about £62/day for the trip.",
            currencyNote: "£1 ≈ Rp 20,400 — cash and cards both widely used.",
            lines: [
                DemoBudgetLine(label: "Accommodation", amount: "£22", fraction: 0.37, accentKey: "ocean"),
                DemoBudgetLine(label: "Food & drink", amount: "£15", fraction: 0.25, accentKey: "sun"),
                DemoBudgetLine(label: "Diving & activities", amount: "£15", fraction: 0.25, accentKey: "tint"),
                DemoBudgetLine(label: "Transport", amount: "£8", fraction: 0.13, accentKey: "moss")
            ]
        ),
        bookings: [
            DemoBooking(title: "Return flight", subtitle: "DPS · 12 Aug", icon: "airplane", detail: "London to Denpasar, confirmed.", accentKey: "sky"),
            DemoBooking(title: "Canggu villa", subtitle: "12–16 Aug", icon: "bed.double.fill", detail: "First four nights booked.", accentKey: "tint"),
            DemoBooking(title: "Gili fast boat", subtitle: "16 Aug", icon: "ferry.fill", detail: "Sanur → Gili Air, paid.", accentKey: "ocean")
        ],
        reminders: [
            DemoReminder(title: "Book the Raja Ampat homestay balance", subtitle: "This week", icon: "house.lodge.fill", detail: "Confirm before peak-season rooms sell out.", accentKey: "coral"),
            DemoReminder(title: "Buy an eSIM before you fly", subtitle: "Connectivity", icon: "simcard.fill", detail: "Be online the moment you land.", accentKey: "tint"),
            DemoReminder(title: "Confirm dive insurance", subtitle: "Health", icon: "lifepreserver.fill", detail: "Check it covers your planned depths.", accentKey: "ocean")
        ]
    )

    // MARK: Helpers

    static func accent(_ key: String) -> Color {
        let theme = TravelTheme.current
        switch key {
        case "tint": return theme.tint
        case "ocean": return theme.ocean
        case "sky": return theme.sky
        case "coral": return theme.coral
        case "sun": return theme.sun
        case "moss": return theme.moss
        default: return theme.tint
        }
    }

    private static var heroGradient: [Color] {
        let theme = TravelTheme.current
        return [theme.ocean, theme.tint, theme.sky]
    }

    private static func journeyStatus(_ status: DemoStatus) -> JourneyStatus {
        switch status {
        case .complete: return .done
        case .current: return .active
        case .pending: return .upcoming
        }
    }

    private static func island(_ name: String) -> DemoIsland? {
        islands.first { $0.name == name }
    }

    // MARK: Adapter — Home Dashboard V2

    static func homeV2Plan() -> HomeV2Plan {
        let t = trip
        return HomeV2Plan(
            greeting: "Welcome back",
            travellerName: traveller.name,
            heroSymbol: "sparkles",
            heroGradient: heroGradient,
            nextTripTitle: t.title,
            nextTripSubtitle: "Your \(t.totalDays)-night island-hop is almost here — let’s get you ready.",
            daysToNextTrip: t.daysToDeparture,
            departureLabel: t.departureLabel,
            readiness: t.readiness,
            stats: traveller.metrics.map { HomeV2Stat(value: $0.value, label: $0.label) },
            activeJourneyTitle: "Planning your next trip",
            activeJourneyDetail: "\(t.title) — flights and stays booked, a few steps left.",
            activeJourneyProgress: t.planningProgress,
            bookings: t.bookings.map { HomeV2Row(title: $0.title, subtitle: $0.subtitle, icon: $0.icon, detail: $0.detail, accent: accent($0.accentKey)) },
            budgetSpent: t.budget.spentLabel,
            budgetTotal: t.budget.totalLabel,
            budgetFraction: t.budget.fraction,
            budgetNote: t.budget.note,
            weatherPlaceholder: "Bali · \(t.weatherNow)",
            shortcuts: homeShortcuts(),
            quickActions: [
                HomeV2Action(title: "Add booking", icon: "plus.circle.fill", accent: accent("tint")),
                HomeV2Action(title: "New trip", icon: "calendar.badge.plus", accent: accent("ocean")),
                HomeV2Action(title: "Packing", icon: "bag.fill", accent: accent("sun")),
                HomeV2Action(title: "Budget", icon: "wallet.bifold.fill", accent: accent("moss")),
                HomeV2Action(title: "Search", icon: "magnifyingglass", accent: accent("sky")),
                HomeV2Action(title: "Notes", icon: "square.and.pencil", accent: accent("coral"))
            ],
            favourites: traveller.favourites.map { HomeV2Destination(name: $0.name, subtitle: $0.subtitle, icon: $0.icon, accent: accent($0.accentKey)) },
            recentActivity: [
                HomeV2Row(title: "Booked Gili fast boat", subtitle: "Today", icon: "ferry.fill", detail: "Sanur → Gili Air confirmed.", accent: accent("ocean")),
                HomeV2Row(title: "Updated budget", subtitle: "Yesterday", icon: "wallet.bifold.fill", detail: "Raised the daily allowance to \(t.budget.perDay).", accent: accent("moss")),
                HomeV2Row(title: "Saved insurance offline", subtitle: "2 days ago", icon: "arrow.down.circle.fill", detail: "Policy added to the document wallet.", accent: accent("tint"))
            ],
            reminders: t.reminders.map { HomeV2Row(title: $0.title, subtitle: $0.subtitle, icon: $0.icon, detail: $0.detail, accent: accent($0.accentKey)) }
        )
    }

    private static func homeShortcuts() -> [HomeV2Shortcut] {
        [
            HomeV2Shortcut(title: "Destination", icon: "globe.asia.australia.fill", accent: accent("tint")),
            HomeV2Shortcut(title: "Journey", icon: "figure.walk.motion", accent: accent("ocean")),
            HomeV2Shortcut(title: "Planner", icon: "calendar", accent: accent("sky")),
            HomeV2Shortcut(title: "Documents", icon: "wallet.bifold.fill", accent: accent("moss")),
            HomeV2Shortcut(title: "Offline", icon: "arrow.down.circle.fill", accent: accent("sun")),
            HomeV2Shortcut(title: "Ferries", icon: "ferry.fill", accent: accent("ocean")),
            HomeV2Shortcut(title: "Stays", icon: "bed.double.fill", accent: accent("tint")),
            HomeV2Shortcut(title: "Currency", icon: "banknote.fill", accent: accent("moss")),
            HomeV2Shortcut(title: "Connectivity", icon: "wifi", accent: accent("tint")),
            HomeV2Shortcut(title: "Health", icon: "cross.case.fill", accent: accent("coral")),
            HomeV2Shortcut(title: "Culture", icon: "hands.sparkles.fill", accent: accent("sun")),
            HomeV2Shortcut(title: "Islands", icon: "map.fill", accent: accent("sky")),
            HomeV2Shortcut(title: "Weather", icon: "cloud.sun.fill", accent: accent("sky"))
        ]
    }

    // MARK: Adapter — Destination Hub (Bali)

    static func destinationHub() -> HubGuide {
        let theme = TravelTheme.current
        let bali = island("Bali")
        return HubGuide(
            destination: "Bali",
            subtitle: "Temples, surf, rice terraces and a launchpad to every island — your Bali home base.",
            heroSymbol: "leaf.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sun],
            bestTime: "Apr–Oct",
            weatherNow: trip.weatherNow,
            bestFor: bali?.bestFor.lowercased() ?? "first-timers & variety",
            readiness: 0.82,
            facts: [
                HubFact(value: "Apr–Oct", label: "Best time"),
                HubFact(value: "30°C", label: "Now"),
                HubFact(value: "IDR", label: "Currency"),
                HubFact(value: "Bahasa", label: "Language")
            ],
            experiences: [
                HubExperience(title: "Uluwatu temple & surf", category: "Iconic", icon: "figure.surfing", detail: "Clifftop temple, kecak fire dance at sunset and world-class waves below.", accent: theme.sky),
                HubExperience(title: "Ubud rice terraces", category: "Nature", icon: "leaf.fill", detail: "Tegallalang terraces, jungle villas and the Sacred Monkey Forest.", accent: theme.moss),
                HubExperience(title: "Mount Batur sunrise", category: "Adventure", icon: "mountain.2.fill", detail: "A pre-dawn volcano trek for sunrise above the clouds.", accent: theme.coral),
                HubExperience(title: "Nusa Penida day trip", category: "Day trip", icon: "water.waves", detail: "Kelingking Beach and manta snorkelling, a fast boat from Sanur.", accent: theme.ocean)
            ],
            snapshots: [
                HubSnapshot(title: "Accommodation", icon: "bed.double.fill", headline: "£8–£500/night", detail: "Hostels, homestays, hotels and private-pool villas everywhere.", accent: theme.tint),
                HubSnapshot(title: "Food", icon: "fork.knife", headline: "Rp 25k warungs", detail: "Cheap local warungs to beach clubs and fine dining.", accent: theme.sun),
                HubSnapshot(title: "Transport", icon: "car.fill", headline: "Gojek / Grab + driver", detail: "Ride apps, scooters and great-value private drivers.", accent: theme.ocean),
                HubSnapshot(title: "Ferries", icon: "ferry.fill", headline: "Hub to all islands", detail: "Fast boats from Sanur and Padang Bai.", accent: theme.sky),
                HubSnapshot(title: "Surf", icon: "figure.surfing", headline: "World-class", detail: "Uluwatu, Canggu and Keramas for every level.", accent: theme.sky, rating: 4),
                HubSnapshot(title: "Diving", icon: "water.waves", headline: "Good", detail: "Amed, Tulamben’s wreck and Nusa Penida’s mantas.", accent: theme.ocean, rating: 3),
                HubSnapshot(title: "Snorkelling", icon: "fish.fill", headline: "Good", detail: "Menjangan, Amed and the Nusa reefs.", accent: theme.tint, rating: 3),
                HubSnapshot(title: "Wildlife", icon: "pawprint.fill", headline: "Some", detail: "Monkeys, birds and rich marine life offshore.", accent: theme.moss, rating: 2),
                HubSnapshot(title: "Health & safety", icon: "cross.case.fill", headline: "Good hospitals", detail: "BIMC and Siloam; mind scooters and dengue.", accent: theme.coral),
                HubSnapshot(title: "Currency", icon: "banknote.fill", headline: "£1≈Rp20.4k", detail: "Cash and cards both widely used.", accent: theme.moss),
                HubSnapshot(title: "Connectivity", icon: "wifi", headline: "Strong 4G", detail: "eSIMs and fast café Wi-Fi across the south.", accent: theme.tint, rating: 4),
                HubSnapshot(title: "Visa", icon: "doc.text.fill", headline: "VoA / e-VOA 30d", detail: "Visa on arrival for most, extendable once.", accent: theme.ocean),
                HubSnapshot(title: "Culture", icon: "hands.sparkles.fill", headline: "Hindu island", detail: "Temples, daily offerings and frequent ceremonies.", accent: theme.coral),
                HubSnapshot(title: "Weather", icon: "cloud.sun.fill", headline: "Dry Apr–Oct", detail: "Warm 30°C; wetter and humid Nov–Mar.", accent: theme.sun)
            ],
            itineraryPreview: [
                HubRow(title: "Days 1–2 · Canggu", subtitle: "Settle in", icon: "figure.surfing", detail: "Surf, cafés and sunset beach bars.", accent: theme.sky),
                HubRow(title: "Days 3–4 · Ubud", subtitle: "Culture", icon: "leaf.fill", detail: "Rice terraces, temples and a jungle villa.", accent: theme.moss),
                HubRow(title: "Day 5 · Nusa Penida", subtitle: "Day trip", icon: "water.waves", detail: "Kelingking Beach and manta snorkelling.", accent: theme.ocean)
            ],
            timelinePreview: [
                HubRow(title: "Arrive DPS", subtitle: "Day 1", icon: "airplane.arrival", detail: "Transfer to Canggu and unwind.", accent: theme.sky),
                HubRow(title: "Explore the south", subtitle: "Days 1–4", icon: "map.fill", detail: "Beaches, surf and Ubud’s culture.", accent: theme.tint),
                HubRow(title: "Onward to the islands", subtitle: "Day 5", icon: "ferry.fill", detail: "Fast boat to Gili Air.", accent: theme.ocean)
            ],
            nearbyIslands: nearbyHubRows(),
            disclaimer: "This hub aggregates illustrative sample data to give a quick overview of a destination. Open the full guides and confirm current details with providers before you plan or book."
        )
    }

    private static func nearbyHubRows() -> [HubRow] {
        islands.filter { $0.name != "Bali" }.prefix(4).map { isle in
            HubRow(title: isle.name, subtitle: isle.stayDuration, icon: isle.icon, detail: isle.tagline, accent: accent(isle.accentKey))
        }
    }

    // MARK: Adapter — Journey Dashboard (in-trip lens)

    static func journeyDashboard() -> JourneyPlan {
        let t = trip
        return JourneyPlan(
            title: "Your Journey",
            subtitle: t.subtitle,
            heroSymbol: "figure.walk.motion",
            heroGradient: heroGradient,
            dayOfTrip: t.inTripDay,
            totalDays: t.totalDays,
            daysToReturn: t.daysToReturn,
            progress: t.inTripProgress,
            stages: ["Prep", "Departure", "Islands", "Raja Ampat", "Home"],
            currentStageIndex: t.inTripStageIndex,
            stats: [
                JourneyStat(value: "\(t.totalDays)", label: "Days"),
                JourneyStat(value: "\(t.islandNames.count)", label: "Islands"),
                JourneyStat(value: "\(t.flights.count)", label: "Flights"),
                JourneyStat(value: "\(t.dives.count)", label: "Dives")
            ],
            checklistDone: 8,
            checklistTotal: 10,
            checklistItems: ["Passport & e-VOA", "Insurance saved", "Cash drawn", "Bags packed", "eSIM bought"],
            flights: t.flights.map { JourneySegment(title: "\($0.from) → \($0.to)", subtitle: $0.date, icon: "airplane", detail: $0.note, status: journeyStatus($0.status), accent: accent("sky")) },
            transfers: [
                JourneySegment(title: "Airport → Canggu", subtitle: "Day 1 · done", icon: "car.fill", detail: "Pre-booked private transfer.", status: .done, accent: accent("moss")),
                JourneySegment(title: "Bangsal → Kuta Lombok", subtitle: "Day 8", icon: "car.fill", detail: "Driver pickup at the harbour.", status: .upcoming, accent: accent("ocean"))
            ],
            ferries: t.ferries.map { JourneySegment(title: "\($0.from) → \($0.to)", subtitle: $0.date, icon: "ferry.fill", detail: $0.note, status: journeyStatus($0.status), accent: accent("sky")) },
            accommodation: t.accommodation.map { JourneySegment(title: $0.name, subtitle: "\($0.dates)", icon: $0.icon, detail: $0.detail, status: journeyStatus($0.status), accent: accent($0.accentKey)) },
            activities: (t.dives + t.surf).map { JourneySegment(title: $0.title, subtitle: $0.date, icon: $0.icon, detail: $0.detail, status: journeyStatus($0.status), accent: accent($0.accentKey)) },
            transport: [
                JourneySegment(title: "Scooter on Gili Air", subtitle: "Now", icon: "bicycle", detail: "No cars — cycle or walk the island.", status: .active, accent: accent("moss")),
                JourneySegment(title: "Private driver, Lombok", subtitle: "Day 8", icon: "steeringwheel", detail: "Day hire for the south coast.", status: .upcoming, accent: accent("tint"))
            ],
            readiness: [
                JourneyReadiness(label: "Budget", value: t.budget.fraction, accent: accent("sun")),
                JourneyReadiness(label: "Documents", value: t.documentReadiness, accent: accent("tint")),
                JourneyReadiness(label: "Offline", value: t.offlineReadiness, accent: accent("ocean")),
                JourneyReadiness(label: "Health & safety", value: t.healthReadiness, accent: accent("moss"))
            ],
            summaries: [
                JourneyFact(icon: "cloud.sun.fill", label: "Weather", value: t.weatherNow),
                JourneyFact(icon: "wifi", label: "Connectivity", value: t.connectivityNote),
                JourneyFact(icon: "banknote.fill", label: "Currency", value: "£1≈Rp20.4k")
            ],
            todayAgenda: [
                JourneyRow(title: "Snorkel Gili Meno", subtitle: "10:00", icon: "tortoise.fill", detail: "Almost-guaranteed turtles at the turtle point.", accent: accent("moss")),
                JourneyRow(title: "Check in for tomorrow’s boat", subtitle: "18:00", icon: "checkmark.circle.fill", detail: "Reconfirm the 09:00 fast boat to Lombok.", accent: accent("tint"))
            ],
            reminders: t.reminders.map { JourneyRow(title: $0.title, subtitle: $0.subtitle, icon: $0.icon, detail: $0.detail, accent: accent($0.accentKey)) },
            milestones: [
                JourneyMilestone(title: "Arrived in Bali", when: "Day 1", detail: "The journey began in Canggu.", status: .done),
                JourneyMilestone(title: "Reached the Gilis", when: "Day 5 · now", detail: "Diving, turtles and island calm.", status: .active),
                JourneyMilestone(title: "Raja Ampat", when: "Day 9", detail: "Piaynemo and the richest reefs on Earth.", status: .upcoming),
                JourneyMilestone(title: "Journey home", when: "Day 14", detail: "Fly home via Denpasar.", status: .upcoming)
            ],
            nextDestination: JourneyRow(title: "Lombok next", subtitle: "Day 8", icon: "mountain.2.fill", detail: "Surf, Kuta Lombok and the Raja Ampat flight.", accent: accent("sun")),
            disclaimer: "This journey view aggregates illustrative sample data for one trip. It is a presentation overview only — confirm every booking, time and detail as you travel."
        )
    }

    // MARK: Adapter — Trip Planner V2 (pre-departure lens)

    static func tripPlannerV2() -> PlannerV2Plan {
        let t = trip
        return PlannerV2Plan(
            destination: t.title,
            subtitle: t.subtitle,
            heroSymbol: "map.fill",
            heroGradient: heroGradient,
            departureLabel: t.departureLabel,
            daysToDeparture: t.daysToDeparture,
            readiness: t.readiness,
            planningProgress: t.planningProgress,
            offlineReadiness: t.offlineReadiness,
            packingCompletion: t.packingCompletion,
            facts: [
                PlannerV2Fact(value: "\(t.totalDays)", label: "Nights"),
                PlannerV2Fact(value: "\(t.islandNames.count)", label: "Islands"),
                PlannerV2Fact(value: t.budget.perDay, label: "Per day"),
                PlannerV2Fact(value: "\(t.dives.count)", label: "Dives planned")
            ],
            modules: plannerModules(),
            itinerary: islands.map { PlannerV2Itinerary(island: $0.name, nights: "\($0.nights) night\($0.nights == 1 ? "" : "s")", icon: $0.icon, detail: $0.tagline, accent: accent($0.accentKey)) },
            timelinePreview: [
                PlannerV2Row(title: "Day 1 · Arrive Bali", subtitle: "12 Aug", icon: "airplane.arrival", detail: "Land at DPS, transfer to Canggu.", accent: accent("sky")),
                PlannerV2Row(title: "Day 5 · Boat to Gili Air", subtitle: "16 Aug", icon: "ferry.fill", detail: "Fast boat from Sanur.", accent: accent("ocean")),
                PlannerV2Row(title: "Day 9 · Fly to Raja Ampat", subtitle: "20 Aug", icon: "airplane", detail: "Lombok to Sorong.", accent: accent("sun")),
                PlannerV2Row(title: "Day 14 · Return home", subtitle: "26 Aug", icon: "house.fill", detail: "Fly home via Denpasar.", accent: accent("coral"))
            ],
            quickActions: [
                PlannerV2Action(title: "Add booking", icon: "plus.circle.fill", accent: accent("tint")),
                PlannerV2Action(title: "Edit budget", icon: "wallet.bifold.fill", accent: accent("moss")),
                PlannerV2Action(title: "Packing list", icon: "bag.fill", accent: accent("sun")),
                PlannerV2Action(title: "Documents", icon: "doc.text.fill", accent: accent("ocean")),
                PlannerV2Action(title: "Island guide", icon: "map.fill", accent: accent("sky")),
                PlannerV2Action(title: "Weather", icon: "cloud.sun.fill", accent: accent("coral"))
            ],
            shortcuts: ["Timeline", "Documents", "Budget", "Packing", "Islands", "Weather"],
            notesPlaceholder: "“Confirm Raja Ampat homestay balance; ask villa about early check-in.”",
            recentActivity: [
                PlannerV2Row(title: "Booked Gili fast boat", subtitle: "Today", icon: "ferry.fill", detail: "Sanur → Gili Air confirmed.", accent: accent("ocean")),
                PlannerV2Row(title: "Updated budget", subtitle: "Yesterday", icon: "wallet.bifold.fill", detail: "Raised the daily allowance to \(t.budget.perDay).", accent: accent("moss")),
                PlannerV2Row(title: "Saved insurance offline", subtitle: "2 days ago", icon: "arrow.down.circle.fill", detail: "Policy added to the document wallet.", accent: accent("tint"))
            ],
            recommendations: t.reminders.map { PlannerV2Row(title: $0.title, subtitle: $0.subtitle, icon: $0.icon, detail: $0.detail, accent: accent($0.accentKey)) },
            disclaimer: "This planner aggregates illustrative sample data for a single trip. It is a presentation overview only — confirm every booking, requirement and figure with the relevant provider before you travel."
        )
    }

    private static func plannerModules() -> [PlannerV2Module] {
        [
            PlannerV2Module(title: "Flights", icon: "airplane", status: .ready, summary: "Return DPS booked; Raja Ampat hop confirmed."),
            PlannerV2Module(title: "Ferries", icon: "ferry.fill", status: .inProgress, summary: "2 of 3 fast boats booked.", progress: 0.66),
            PlannerV2Module(title: "Accommodation", icon: "bed.double.fill", status: .ready, summary: "Every night booked.", progress: 1.0),
            PlannerV2Module(title: "Transport", icon: "car.fill", status: .todo, summary: "Arrange the airport pickup."),
            PlannerV2Module(title: "Budget", icon: "wallet.bifold.fill", status: .inProgress, summary: "\(trip.budget.perDay)/day planned.", progress: 0.7),
            PlannerV2Module(title: "Weather", icon: "cloud.sun.fill", status: .ready, summary: "Dry season — calm and clear."),
            PlannerV2Module(title: "Visa & entry", icon: "doc.text.fill", status: .ready, summary: "e-VOA ready to scan."),
            PlannerV2Module(title: "Documents", icon: "wallet.bifold.fill", status: .alert, summary: "1 document still to save offline."),
            PlannerV2Module(title: "Offline", icon: "arrow.down.circle.fill", status: .inProgress, summary: "6 of 8 essentials saved.", progress: 0.75),
            PlannerV2Module(title: "Health", icon: "cross.case.fill", status: .inProgress, summary: "Vaccines done; confirm dive insurance.", progress: 0.6),
            PlannerV2Module(title: "Packing", icon: "bag.fill", status: .inProgress, summary: "70% packed.", progress: 0.7),
            PlannerV2Module(title: "Currency", icon: "banknote.fill", status: .ready, summary: "Cash and cards sorted."),
            PlannerV2Module(title: "Connectivity", icon: "wifi", status: .todo, summary: "Buy an eSIM before you fly."),
            PlannerV2Module(title: "Safety", icon: "shield.lefthalf.filled", status: .ready, summary: "No active alerts.")
        ]
    }

    // MARK: Adapter — Island Guide (the trip's islands)

    static func islandGuide() -> IslandGuide {
        let theme = TravelTheme.current
        return IslandGuide(
            heroTitle: "Choose Your Island",
            heroSubtitle: "Surf, mantas or hammocks — compare the islands on your Bali & Beyond route.",
            heroSymbol: "map.fill",
            heroGradient: heroGradient,
            facts: [
                IslandFact(icon: "globe.asia.australia.fill", label: "Islands", value: "\(islands.count) on this trip"),
                IslandFact(icon: "airplane.arrival", label: "Easiest", value: "Bali (DPS)"),
                IslandFact(icon: "water.waves", label: "Top dive", value: "Raja Ampat"),
                IslandFact(icon: "sun.max.fill", label: "Best season", value: "Apr–Oct")
            ],
            islands: islands.map { isle in
                IslandProfile(
                    name: isle.name, tagline: isle.tagline, icon: isle.icon, accent: accent(isle.accentKey), region: isle.region,
                    bestFor: isle.bestFor, crowd: isle.crowd, budget: isle.budget,
                    ratings: zip(ratingKeys, isle.ratings).map { IslandRating(key: $0.0, value: $0.1) },
                    stayDuration: isle.stayDuration, ferryAccess: isle.ferryAccess, airportAccess: isle.airportAccess,
                    bestSeason: isle.bestSeason, highlights: isle.highlights, avoid: isle.avoid
                )
            },
            matrixKeys: ["Surf", "Diving", "Snorkelling", "Beaches", "Nightlife"],
            recommendations: [
                IslandRecommendation(title: "First-timer", islands: "Bali", icon: "star.fill", detail: "Ease in with Bali’s variety before the islands.", accent: theme.tint),
                IslandRecommendation(title: "Diver", islands: "Raja Ampat · Gili Air", icon: "water.waves", detail: "World-class reefs and easy dive schools.", accent: theme.ocean),
                IslandRecommendation(title: "Honeymoon", islands: "Gili Meno", icon: "heart.fill", detail: "Quiet beaches and underwater statues.", accent: theme.coral)
            ],
            itineraries: [
                IslandItinerary(name: "Bali & Beyond", days: "14 days", route: "Bali → Gili Air → Gili Meno → Lombok → Raja Ampat", detail: "Culture, turtles, surf and the richest reefs on Earth.", icon: "map.fill")
            ],
            travelTimes: [
                IslandRow(title: "Bali ↔ Gili", subtitle: "Fast boat", icon: "ferry.fill", detail: "Roughly 1.5–2.5 hours, sea depending.", accent: theme.ocean),
                IslandRow(title: "Gili ↔ Lombok", subtitle: "Boat", icon: "ferry.fill", detail: "15–40 minutes from Bangsal.", accent: theme.sky),
                IslandRow(title: "Lombok ↔ Raja Ampat", subtitle: "Flights via Sorong", icon: "airplane", detail: "Half a day via Makassar/Sorong, then a ferry.", accent: theme.coral)
            ],
            region: "Indonesia",
            disclaimer: "Island ratings here are a subjective, illustrative guide to help you compare — not absolute scores. Check current information before you commit to a route."
        )
    }
}

// MARK: - Preview (verifies the adapters build the real dashboards)

struct TravelDemoData_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelHomeDashboardV2(plan: TravelDemoData.homeV2Plan())
                .previewDisplayName("Demo → Home V2")
            TravelDestinationHubDashboard(guide: TravelDemoData.destinationHub())
                .previewDisplayName("Demo → Destination Hub")
            TravelJourneyDashboard(plan: TravelDemoData.journeyDashboard())
                .previewDisplayName("Demo → Journey")
            TravelTripPlannerDashboardV2(plan: TravelDemoData.tripPlannerV2())
                .previewDisplayName("Demo → Trip Planner V2")
            TravelIslandGuideDashboard(guide: TravelDemoData.islandGuide())
                .previewDisplayName("Demo → Island Guide")
        }
    }
}

#endif
