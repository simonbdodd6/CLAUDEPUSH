import SwiftUI

// MARK: - AppContainer environment injection (Phase 40)
//
// Exposes the single composition root through the SwiftUI environment so it can
// be injected once from the application entry point instead of being recreated
// per screen. `AppContainer` itself stays Foundation-only; this file holds the
// SwiftUI bridge.

private struct AppContainerKey: EnvironmentKey {
    /// A single shared deterministic mock container, used only when no container
    /// has been injected (previews and tests). The app injects its own instance.
    static let defaultValue: AppContainer = .mock()
}

extension EnvironmentValues {
    /// The app-wide composition root. Injected once at the application entry
    /// point and read at the routing layer to build feature ViewModels.
    var appContainer: AppContainer {
        get { self[AppContainerKey.self] }
        set { self[AppContainerKey.self] = newValue }
    }
}
