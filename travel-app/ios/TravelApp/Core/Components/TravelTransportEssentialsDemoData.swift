import SwiftUI

// MARK: - Indonesia transport essentials — demo data (M51)
//
// Deterministic, offline transport intelligence for the six islands on the
// canonical "Bali & Beyond" route (and its wedding hops): Bali, Nusa Lembongan,
// Lombok, Gili Air, Gili Meno and Raja Ampat. Values are fixed, illustrative
// guidance — no networking, backend, persistence, auth or AI. Wrapped in
// `#if DEBUG` to match the rest of the shared demo data.

#if DEBUG

/// The deterministic demo provider of transport essentials. Conforms to the
/// offline `TravelTransportEssentialsProviding` seam so screens can depend on the
/// protocol rather than the concrete data.
struct TravelTransportEssentialsDemoData: TravelTransportEssentialsProviding {
    func transportEssentials() -> [TravelTransportEssential] { Self.all }

    private static let theme = TravelTheme.current

    static let all: [TravelTransportEssential] = [
        bali,
        nusaLembongan,
        lombok,
        giliAir,
        giliMeno,
        rajaAmpat
    ]

    // MARK: Bali

    static let bali = TravelTransportEssential(
        place: "Bali",
        region: "Main gateway · Bali",
        icon: "leaf.fill",
        accent: theme.tint,
        summary: "Indonesia's main international gateway (DPS). Prepaid airport taxis, Grab/Gojek and private drivers cover the island; fast boats leave for the Nusa islands, the Gilis and Lombok.",
        arrivalGateway: "Ngurah Rai (DPS) — roughly 30–60 min from the southern beach areas.",
        options: [
            TransportEssentialOption(kind: .airportTransfer, title: "Official airport taxi", detail: "Fixed-price coupon desk inside arrivals — pay first, skip the touts.", typicalPrice: "Rp 150–350k to south Bali", duration: "30–60 min"),
            TransportEssentialOption(kind: .rideApp, title: "Grab / Gojek", detail: "Cheapest metered option; use the app's designated airport pickup point.", typicalPrice: "Rp 100–250k → Seminyak"),
            TransportEssentialOption(kind: .taxi, title: "Bluebird metered taxi", detail: "Reputable blue taxis with a real meter — insist it's switched on.", typicalPrice: "Rp 5–7k / km"),
            TransportEssentialOption(kind: .ferry, title: "Fast boat to Gili / Lombok", detail: "Departs Padang Bai, Serangan or Amed.", typicalPrice: "Rp 400–700k", duration: "1.5–2.5 hr"),
            TransportEssentialOption(kind: .islandHop, title: "Fast boat to Nusa islands", detail: "Frequent morning departures from Sanur harbour.", typicalPrice: "Rp 150–300k", duration: "30–45 min")
        ],
        expectedPrices: [
            TransportEssentialPrice(route: "Airport → Seminyak (Grab)", expected: "Rp 100–250k", note: "The airport adds a pickup surcharge — still far cheaper than touts."),
            TransportEssentialPrice(route: "Metered taxi (Bluebird)", expected: "Rp 5–7k / km", note: "Refuse a flat 'special price' — ask for the meter."),
            TransportEssentialPrice(route: "Scooter rental / day", expected: "Rp 60–100k", note: "Helmet + international permit; photograph the bike before paying.")
        ],
        scamWarnings: [
            "Airport touts quoting a 'fixed' Rp 500k+ — use the official counter or Grab instead.",
            "Taxis with a 'broken meter' — walk away and order a Bluebird or Grab.",
            "Fast-boat agents upselling a 'VIP' tier — buy directly from the named operator."
        ],
        travellerNotes: [
            "Grab/Gojek pickups are restricted around some beach zones — walk a block to be collected.",
            "Carry small notes; many drivers can't change a Rp 100k bill.",
            "Southern traffic is heavy — leave extra time for airport runs."
        ],
        weddingGuestTip: "For a Bali wedding, pre-book a private driver for the day (~Rp 700k–1m) so a group can share transfers between villa, venue and airport."
    )

    // MARK: Nusa Lembongan

    static let nusaLembongan = TravelTransportEssential(
        place: "Nusa Lembongan",
        region: "Nusa islands",
        icon: "water.waves",
        accent: theme.sky,
        summary: "A small island reached by fast boat from Sanur. Get around on foot, by scooter or a short local boat to Ceningan and Nusa Penida.",
        arrivalGateway: "Arrive by fast boat from Sanur (Bali) — ~30–45 min to Jungutbatu / Mushroom Bay.",
        options: [
            TransportEssentialOption(kind: .islandHop, title: "Fast boat from Sanur", detail: "Frequent morning and afternoon departures; book a day ahead in peak season.", typicalPrice: "Rp 150–300k one-way", duration: "30–45 min"),
            TransportEssentialOption(kind: .taxi, title: "Truck / buggy transfer", detail: "No metered taxis — open trucks and buggies do short port-to-hotel hops.", typicalPrice: "Rp 50–100k per hop"),
            TransportEssentialOption(kind: .rideApp, title: "Scooter rental", detail: "The default way around; roads are narrow, steep and rough.", typicalPrice: "Rp 70–100k / day"),
            TransportEssentialOption(kind: .localBoat, title: "Boat to Penida / Ceningan", detail: "Short crossings; the yellow bridge links Ceningan on foot or scooter.", typicalPrice: "Rp 100–150k to Penida")
        ],
        expectedPrices: [
            TransportEssentialPrice(route: "Sanur → Lembongan (fast boat)", expected: "Rp 150–300k", note: "Return tickets are cheaper — keep the stub."),
            TransportEssentialPrice(route: "Buggy transfer (port → hotel)", expected: "Rp 50–100k", note: "Agree the price before your bags are loaded."),
            TransportEssentialPrice(route: "Scooter / day", expected: "Rp 70–100k")
        ],
        scamWarnings: [
            "Beach 'operators' charging extra for luggage — bags are included in the fare.",
            "Being dropped at the wrong beach to force a paid transfer — confirm your drop point."
        ],
        travellerNotes: [
            "Fast boats beach-land — expect a wet-foot boarding, so pack accordingly.",
            "Rough roads and steep hills; ride slowly or pre-book transfers.",
            "ATMs are limited and often empty — bring cash from Bali."
        ],
        weddingGuestTip: "Coordinate one boat time with the wedding party — operators will hold a group booking, and shared buggies from the pier save everyone haggling."
    )

    // MARK: Lombok

    static let lombok = TravelTransportEssential(
        place: "Lombok",
        region: "Ferry gateway · Lombok",
        icon: "mountain.2.fill",
        accent: theme.moss,
        summary: "Domestic airport (LOP) plus the ferry gateway at Bangsal for the Gilis. Distances are long, so pre-arranged transfers beat roadside haggling.",
        arrivalGateway: "Lombok International (LOP) — ~1.5–2 hr to Senggigi / Bangsal, longer to Kuta Lombok.",
        options: [
            TransportEssentialOption(kind: .airportTransfer, title: "Prepaid airport car", detail: "Fixed-fare desk in arrivals — the safest option for the long transfer.", typicalPrice: "Rp 250–450k to Bangsal", duration: "1.5–2 hr"),
            TransportEssentialOption(kind: .rideApp, title: "Grab / Gojek", detail: "Works around the airport and towns, patchy in rural areas.", typicalPrice: "Rp 200–400k → Senggigi"),
            TransportEssentialOption(kind: .ferry, title: "Public boat from Bangsal", detail: "Cheap slow boats to the Gilis — they leave when full.", typicalPrice: "Rp 20–40k", duration: "15–40 min"),
            TransportEssentialOption(kind: .islandHop, title: "Private fast boat to Gili", detail: "Direct hotel-to-island transfers, no Bangsal queue.", typicalPrice: "Rp 150–300k"),
            TransportEssentialOption(kind: .taxi, title: "Bluebird / Express taxi", detail: "Metered taxis around Mataram and Senggigi.", typicalPrice: "Rp 6–8k / km")
        ],
        expectedPrices: [
            TransportEssentialPrice(route: "LOP airport → Bangsal (car)", expected: "Rp 250–450k", note: "Share with others heading to the Gilis to split it."),
            TransportEssentialPrice(route: "Bangsal → Gili public boat", expected: "Rp 20–40k", note: "Buy at the official ticket office, not from porters."),
            TransportEssentialPrice(route: "Porter at Bangsal (per bag)", expected: "Rp 20–30k", note: "Optional — agree the number of bags first.")
        ],
        scamWarnings: [
            "Bangsal harbour touts inflating boat and porter prices — use the official ticket window.",
            "Drivers claiming your hotel is 'closed' to divert you to a commission property.",
            "'Charter only, no public boat today' is usually untrue — check the ticket office."
        ],
        travellerNotes: [
            "Transfers are long — leave a buffer for ferry connections and flights.",
            "Public boats stop by late afternoon; aim to reach the island before dusk.",
            "Carry cash for Bangsal; card payment isn't reliable."
        ],
        weddingGuestTip: "For a Gili wedding via Lombok, book a combined airport-car plus private-boat transfer as a group — it removes the Bangsal haggle entirely and syncs everyone's arrival."
    )

    // MARK: Gili Air

    static let giliAir = TravelTransportEssential(
        place: "Gili Air",
        region: "Gili islands",
        icon: "beach.umbrella.fill",
        accent: theme.ocean,
        summary: "Car- and motorbike-free: you move on foot, by bicycle or by cidomo (pony cart). Reach it by boat from Bangsal (Lombok) or direct from Bali.",
        arrivalGateway: "No airport — arrive by boat from Bangsal (~15 min) or fast boat from Bali (2–3 hr).",
        options: [
            TransportEssentialOption(kind: .islandHop, title: "Fast boat from Bali", detail: "Direct services from Padang Bai, Serangan or Amed.", typicalPrice: "Rp 400–700k", duration: "2–3 hr"),
            TransportEssentialOption(kind: .ferry, title: "Public boat from Bangsal", detail: "The cheapest hop across from Lombok.", typicalPrice: "Rp 20–40k", duration: "~15 min"),
            TransportEssentialOption(kind: .localBoat, title: "Gili-to-Gili hopper", detail: "Scheduled hopper between Air, Meno and Trawangan.", typicalPrice: "Rp 35–100k", duration: "10–20 min"),
            TransportEssentialOption(kind: .taxi, title: "Cidomo (pony cart)", detail: "The island's only 'taxi' — short rides with luggage.", typicalPrice: "Rp 50–150k per ride")
        ],
        expectedPrices: [
            TransportEssentialPrice(route: "Bali → Gili Air (fast boat)", expected: "Rp 400–700k", note: "Varies by operator and season — book the named company."),
            TransportEssentialPrice(route: "Cidomo (port → accommodation)", expected: "Rp 50–150k", note: "Agree the fare before loading; carts are pricey for the distance."),
            TransportEssentialPrice(route: "Gili ↔ Gili hopper", expected: "Rp 35–100k", note: "The public hopper has set times; a private charter costs more.")
        ],
        scamWarnings: [
            "Cidomo drivers quoting per-person for what is a per-cart ride — confirm it's per cart.",
            "'Last boat' pressure to sell a charter — check the public hopper schedule first."
        ],
        travellerNotes: [
            "No ATMs you should rely on — bring enough cash for your whole stay.",
            "Boats beach-land, so you'll wade a little — keep valuables dry.",
            "Walking the island takes ~1.5 hr; bicycles are cheap to hire."
        ],
        weddingGuestTip: "Cidomos are limited and slow — for a wedding, ask the venue to arrange carts for guests in advance, especially for evening events and formalwear."
    )

    // MARK: Gili Meno

    static let giliMeno = TravelTransportEssential(
        place: "Gili Meno",
        region: "Gili islands",
        icon: "heart.fill",
        accent: theme.coral,
        summary: "The quietest Gili — car-free, tiny and walkable in under an hour. Reached by the same Bangsal / Bali boats or the inter-Gili hopper.",
        arrivalGateway: "No airport — arrive by boat from Bangsal, or via Gili Air / Trawangan on the hopper.",
        options: [
            TransportEssentialOption(kind: .islandHop, title: "Fast boat from Bali", detail: "Some services stop directly; others route via Gili T then the hopper.", typicalPrice: "Rp 450–750k", duration: "2.5–3 hr"),
            TransportEssentialOption(kind: .ferry, title: "Public boat from Bangsal", detail: "The cheapest route across from Lombok.", typicalPrice: "Rp 25–45k", duration: "~20 min"),
            TransportEssentialOption(kind: .localBoat, title: "Inter-Gili hopper", detail: "Connects Meno with Air and Trawangan a few times daily.", typicalPrice: "Rp 35–100k", duration: "10–20 min"),
            TransportEssentialOption(kind: .taxi, title: "Cidomo (pony cart)", detail: "A handful of carts for luggage; most people simply walk.", typicalPrice: "Rp 50–150k per ride")
        ],
        expectedPrices: [
            TransportEssentialPrice(route: "Bali → Gili Meno (fast boat)", expected: "Rp 450–750k", note: "Confirm the boat actually stops at Meno, not just Gili T."),
            TransportEssentialPrice(route: "Hopper Meno ↔ Air", expected: "Rp 35–100k", note: "Fixed public times; miss it and a charter is dear."),
            TransportEssentialPrice(route: "Cidomo (port → villa)", expected: "Rp 50–150k", note: "Few carts here — agree the price up front.")
        ],
        scamWarnings: [
            "Boats 'dropping at Gili T instead' then charging for the hopper — book a Meno-stop ticket.",
            "Charter-only claims when the public hopper is simply running later in the day."
        ],
        travellerNotes: [
            "Almost no infrastructure — no ATMs and limited shops; bring cash and essentials.",
            "Very quiet after dark; carry a torch and pre-plan any late crossings.",
            "The island is walkable end-to-end; luggage is the only reason to take a cart."
        ],
        weddingGuestTip: "Meno is a popular intimate-wedding island but has the fewest carts and boats — lock in guest transfers and a boat time with the venue well ahead, and keep formalwear in a dry bag for the beach landing."
    )

    // MARK: Raja Ampat

    static let rajaAmpat = TravelTransportEssential(
        place: "Raja Ampat",
        region: "Remote · West Papua",
        icon: "fish.fill",
        accent: theme.sun,
        summary: "Remote and boat-based: fly to Sorong, ferry to Waisai, then arranged speedboats between homestays and resorts. There is little to no taxi or ride-app coverage.",
        arrivalGateway: "Fly to Sorong (SOQ) via Makassar / Jakarta, then take the Waisai ferry (~2 hr).",
        options: [
            TransportEssentialOption(kind: .airportTransfer, title: "Sorong airport → ferry port", detail: "A short taxi or ojek to the passenger ferry terminal.", typicalPrice: "Rp 100–200k", duration: "20–30 min"),
            TransportEssentialOption(kind: .ferry, title: "Sorong → Waisai ferry", detail: "Scheduled fast ferries with only a few daily departures.", typicalPrice: "Rp 130–220k", duration: "~2 hr"),
            TransportEssentialOption(kind: .localBoat, title: "Speedboat to homestay / resort", detail: "Pre-arranged by your accommodation — the only way between islands.", typicalPrice: "Rp 300k–2m+", duration: "0.5–3 hr"),
            TransportEssentialOption(kind: .islandHop, title: "Dive-boat / liveaboard", detail: "Diving is done by day-boat or liveaboard charter.", typicalPrice: "Included / by charter")
        ],
        expectedPrices: [
            TransportEssentialPrice(route: "Sorong → Waisai (ferry)", expected: "Rp 130–220k", note: "Buy at the terminal; departures are limited, so arrive early."),
            TransportEssentialPrice(route: "Speedboat to homestay", expected: "Rp 300k–2m+", note: "Fuel is expensive here — confirm the transfer cost when booking the room."),
            TransportEssentialPrice(route: "Marine park entry permit", expected: "Rp 1m (foreign visitor)", note: "Compulsory; pay once and keep the tag / receipt.")
        ],
        scamWarnings: [
            "Sorong port 'helpers' grabbing bags for a fee — decline politely and carry your own.",
            "Unofficial 'permit' sellers — the marine-park tag is issued through official channels or your host.",
            "Wildly inflated speedboat quotes if you arrive without a booking — arrange transfers in advance."
        ],
        travellerNotes: [
            "No reliable ATMs beyond Sorong / Waisai — bring plenty of cash for permits, transfers and homestays.",
            "Connections are sparse and weather-dependent; build in a buffer day around flights.",
            "There are effectively no taxis or ride apps once you leave Sorong — everything is by arranged boat."
        ],
        weddingGuestTip: "Raja Ampat is expedition-style — for any celebration here, transfers and boats must be chartered as a group through the resort or host; there is no turning up and hailing a ride."
    )
}

#endif
