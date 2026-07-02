import SwiftUI

// MARK: - Indonesia transport essentials (M51)
//
// The first practical traveller-intelligence layer: deterministic, offline
// guidance on getting around Indonesia's headline islands — ferries and boats,
// local taxis and expected prices, airport transfers, island-to-island movement,
// common scams / overpay warnings, practical notes and wedding-guest usefulness.
//
// This file holds the pure-data models, a small provider protocol seam (a
// synchronous, offline analogue of the app's repositories) and a reusable
// presentation section. It introduces no networking, persistence, auth, backend
// or AI: the section renders whatever `[TravelTransportEssential]` it is handed,
// and the deterministic demo values live in `TravelTransportEssentialsDemoData`.

// MARK: Models

/// The mode of a transport option, with its presentation treatment.
enum TransportEssentialKind: String, CaseIterable, Identifiable {
    case airportTransfer
    case taxi
    case rideApp
    case ferry
    case islandHop
    case localBoat

    var id: String { rawValue }

    var label: String {
        switch self {
        case .airportTransfer: return "Airport transfer"
        case .taxi: return "Taxi"
        case .rideApp: return "Ride app"
        case .ferry: return "Ferry / fast boat"
        case .islandHop: return "Island hop"
        case .localBoat: return "Local boat"
        }
    }

    var icon: String {
        switch self {
        case .airportTransfer: return "airplane.arrival"
        case .taxi: return "car.fill"
        case .rideApp: return "iphone"
        case .ferry: return "ferry.fill"
        case .islandHop: return "sailboat.fill"
        case .localBoat: return "water.waves"
        }
    }

    var color: Color {
        let theme = TravelTheme.current
        switch self {
        case .airportTransfer: return theme.sky
        case .taxi: return theme.sun
        case .rideApp: return theme.tint
        case .ferry: return theme.ocean
        case .islandHop: return theme.coral
        case .localBoat: return theme.moss
        }
    }
}

/// A single way to get somewhere, with an optional expected price and duration.
struct TransportEssentialOption: Identifiable {
    var id: String { "\(kind.rawValue)-\(title)" }
    var kind: TransportEssentialKind
    var title: String
    var detail: String
    var typicalPrice: String? = nil
    var duration: String? = nil
}

/// An expected/typical price for a named route or ride, with an optional caveat.
struct TransportEssentialPrice: Identifiable {
    var id: String { route }
    var route: String
    var expected: String
    var note: String? = nil
}

/// Practical transport guidance for one place.
struct TravelTransportEssential: Identifiable {
    var id: String { place }
    var place: String
    var region: String
    var icon: String
    var accent: Color
    var summary: String
    var arrivalGateway: String
    var options: [TransportEssentialOption]
    var expectedPrices: [TransportEssentialPrice]
    var scamWarnings: [String]
    var travellerNotes: [String]
    var weddingGuestTip: String
}

/// A synchronous, offline provider seam for transport essentials — the
/// deterministic, presentation-library analogue of the app's repositories. No
/// networking, async or persistence: implementations return fixed data.
protocol TravelTransportEssentialsProviding {
    func transportEssentials() -> [TravelTransportEssential]
}

// MARK: Section

/// A premium, presentation-only section rendering practical transport guidance
/// for a set of places. Each place is an expandable card. Pure from its injected
/// data; holds only local expand/collapse state.
struct TravelTransportEssentialsSection: View {
    let essentials: [TravelTransportEssential]

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expanded: Set<String>

    init(essentials: [TravelTransportEssential]) {
        self.essentials = essentials
        _expanded = State(initialValue: Set(essentials.first.map { [$0.id] } ?? []))
    }

    private let theme = TravelTheme.current

    var body: some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(essentials) { essential in
                card(essential)
            }
        }
    }

    private func card(_ essential: TravelTransportEssential) -> some View {
        let isOpen = expanded.contains(essential.id)
        return GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                header(essential, isOpen: isOpen)
                Text(essential.summary)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                gatewayRow(essential)
                if isOpen {
                    detail(essential)
                }
            }
        }
    }

    // MARK: Header

    private func header(_ essential: TravelTransportEssential, isOpen: Bool) -> some View {
        Button {
            toggle(essential.id)
        } label: {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: essential.icon)
                    .font(.headline)
                    .foregroundStyle(essential.accent)
                    .frame(width: 46, height: 46)
                    .background(.thinMaterial, in: Circle())
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(essential.place)
                        .font(TravelTypography.cardTitle)
                    Text(essential.region)
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(essential.place), \(essential.region). \(isOpen ? "Collapse" : "Expand") transport guidance.")
    }

    private func gatewayRow(_ essential: TravelTransportEssential) -> some View {
        Label(essential.arrivalGateway, systemImage: "mappin.and.ellipse")
            .font(TravelTypography.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Expanded detail

    private func detail(_ essential: TravelTransportEssential) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            Divider().opacity(0.4)
            optionsBlock(essential.options)
            pricesBlock(essential.expectedPrices)
            bulletBlock("Watch out", essential.scamWarnings, icon: "exclamationmark.triangle.fill", tint: theme.coral)
            bulletBlock("Good to know", essential.travellerNotes, icon: "info.circle.fill", tint: theme.ocean)
            weddingBlock(essential.weddingGuestTip)
        }
        .transition(.opacity)
    }

    private func optionsBlock(_ options: [TransportEssentialOption]) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            blockTitle("Getting there & around")
            ForEach(options) { option in
                optionRow(option)
            }
        }
    }

    private func optionRow(_ option: TransportEssentialOption) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: option.kind.icon)
                .font(TravelTypography.caption)
                .foregroundStyle(option.kind.color)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(option.title)
                    .font(TravelTypography.caption)
                    .fixedSize(horizontal: false, vertical: true)
                Text(option.detail)
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if option.typicalPrice != nil || option.duration != nil {
                    HStack(spacing: TravelSpacing.xs) {
                        if let price = option.typicalPrice { metaChip(price, icon: "creditcard.fill") }
                        if let duration = option.duration { metaChip(duration, icon: "clock.fill") }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func pricesBlock(_ prices: [TransportEssentialPrice]) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            blockTitle("Expected prices")
            ForEach(prices) { price in
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.sm) {
                        Text(price.route)
                            .font(TravelTypography.caption)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Text(price.expected)
                            .font(TravelTypography.caption)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(.thinMaterial, in: Capsule())
                    }
                    if let note = price.note {
                        Text(note)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private func bulletBlock(_ title: String, _ items: [String], icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            blockTitle(title)
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: TravelSpacing.sm) {
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

    private func weddingBlock(_ tip: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: "heart.circle.fill")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(theme.coral)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text("Wedding guest tip")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(theme.coral)
                Text(tip)
                    .font(TravelTypography.caption)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.coral.opacity(0.10), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // MARK: Small pieces

    private func blockTitle(_ text: String) -> some View {
        Text(text)
            .font(TravelTypography.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
    }

    private func metaChip(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(TravelTypography.eyebrow)
            .foregroundStyle(.secondary)
            .padding(.horizontal, TravelSpacing.xs)
            .padding(.vertical, TravelSpacing.xxs)
            .background(.thinMaterial, in: Capsule())
    }

    private func toggle(_ id: String) {
        let mutate = {
            if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
        }
        if reduceMotion {
            mutate()
        } else {
            withAnimation(TravelMotion.gentle) { mutate() }
        }
    }
}

#if DEBUG
struct TravelTransportEssentialsSection_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Getting around Indonesia")
                    .font(TravelTypography.section)
                TravelTransportEssentialsSection(
                    essentials: TravelTransportEssentialsDemoData().transportEssentials()
                )
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("Transport essentials · Indonesia")
    }
}
#endif
