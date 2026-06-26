import SwiftUI

/// Stable `UserDefaults`-backed keys for app-wide persisted preferences.
enum AppStorageKeys {
    /// Whether the launch + onboarding flow has been completed at least once.
    static let hasCompletedOnboarding = "hasCompletedOnboarding"
}

/// The top-level app flow gate: launch → onboarding → ready.
///
/// On the first launch the launch and onboarding experiences run, then the flow
/// hands off to `RootShellView`. Completion is persisted via `@AppStorage`, so
/// subsequent launches start directly in the ready app and onboarding is shown
/// only once.
struct RootFlowView: View {
    @AppStorage(AppStorageKeys.hasCompletedOnboarding) private var hasCompletedOnboarding = false
    @State private var phase: AppLaunchPhase

    init() {
        // Skip the launch + onboarding flow once it has been completed.
        let completed = UserDefaults.standard.bool(forKey: AppStorageKeys.hasCompletedOnboarding)
        _phase = State(initialValue: completed ? .ready : .launch)
    }

    var body: some View {
        ZStack {
            switch phase {
            case .launch:
                LaunchScreen {
                    withAnimation(.easeInOut) { phase = .onboarding }
                }
                .transition(.opacity)
            case .onboarding:
                OnboardingView {
                    hasCompletedOnboarding = true
                    withAnimation(.easeInOut) { phase = .ready }
                }
                .transition(.opacity)
            case .ready:
                RootShellView()
                    .transition(.opacity)
            }
        }
    }
}

/// The stages of the app launch flow.
enum AppLaunchPhase {
    case launch
    case onboarding
    case ready
}
