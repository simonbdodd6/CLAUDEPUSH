import SwiftUI

// A small, premium, Apple-native design system. Restrained colour, system
// materials, generous spacing — Journal/Things/Day One feel.

enum Theme {
    static let accent = Color(red: 0.04, green: 0.52, blue: 0.50) // teal — Indonesia sea
    static let spacing: CGFloat = 16
    static let corner: CGFloat = 16
}

extension Font {
    static let screenTitle = Font.system(.largeTitle, design: .rounded).weight(.bold)
    static let cardTitle = Font.system(.headline, design: .rounded)
    static let cardBody = Font.system(.subheadline, design: .rounded)
}

/// A soft, material card used across screens.
struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(Theme.spacing)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
    }
}

/// Empty / loading / error states, used by every screen for consistency.
struct StateView: View {
    enum Kind { case loading, empty(String), error(String) }
    let kind: Kind
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            switch kind {
            case .loading:
                ProgressView()
            case .empty(let message):
                Image(systemName: "tray").font(.largeTitle).foregroundStyle(.secondary)
                Text(message).font(.cardBody).foregroundStyle(.secondary).multilineTextAlignment(.center)
            case .error(let message):
                Image(systemName: "exclamationmark.triangle").font(.largeTitle).foregroundStyle(.orange)
                Text(message).font(.cardBody).foregroundStyle(.secondary).multilineTextAlignment(.center)
                if let retry { Button("Try again", action: retry).buttonStyle(.borderedProminent).tint(Theme.accent) }
            }
        }
        .padding(Theme.spacing)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
