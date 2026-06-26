import SwiftUI

// MARK: - Semantic design tokens (Phase 43)
//
// An additive semantic vocabulary layered over the existing brand palette and
// primitives: semantic colour roles, elevation/shadow tokens and glyph-size
// tokens. Every token equals the literal value it replaces, so adopting these
// tokens is visually identical — no new colours, sizes or shadows are
// introduced. This establishes the named tokens later phases (dark mode,
// animation, theming) can build on instead of scattered magic numbers.

extension TravelTheme {
    /// Semantic role colours, mapped onto the existing brand palette so meaning
    /// (not just hue) can be expressed at call sites.
    var danger: Color { coral }
    var success: Color { moss }
    var warning: Color { sun }
    var info: Color { sky }
}

/// A reusable shadow definition (colour, blur radius and offset).
struct TravelShadow: Equatable {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat
}

/// Elevation tokens — the app's standard shadow treatments.
enum TravelElevation {
    /// The standard raised glass-card shadow.
    static let card = TravelShadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 12)
}

extension View {
    /// Applies a `TravelShadow` elevation token.
    func travelShadow(_ shadow: TravelShadow) -> some View {
        self.shadow(color: shadow.color, radius: shadow.radius, x: shadow.x, y: shadow.y)
    }
}

/// Glyph-size tokens for SF Symbols rendered as standalone marks, so recurring
/// icon sizes are named rather than repeated as literals.
enum TravelIconSize {
    /// The glyph point size for hero status / empty-state badges.
    static let statusGlyph: CGFloat = 44
    /// The circular container size behind a hero status / empty-state glyph.
    static let statusBadge: CGFloat = 88
}
