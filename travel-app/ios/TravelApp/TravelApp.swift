import SwiftUI

@main
struct TravelApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .tint(Theme.accent)
                .task { await appState.restore() }
        }
    }
}

/// Routes between the signed-out and signed-in experiences.
struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.isRestoring {
                StateView(kind: .loading)
            } else if appState.isSignedIn {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .animation(.default, value: appState.isSignedIn)
        .animation(.default, value: appState.isRestoring)
    }
}
