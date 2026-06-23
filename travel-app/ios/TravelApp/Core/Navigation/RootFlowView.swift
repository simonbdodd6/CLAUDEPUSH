import SwiftUI

/// The top-level app flow gate: launch → onboarding → ready.
///
/// Phase is held in in-memory `@State` only (no persistence), so the launch and
/// onboarding experiences run each session and hand off to `RootShellView`.
/// This keeps the launch/onboarding work visual-only while still driving the
/// real app entry point.
struct RootFlowView: View {
    @State private var phase: AppLaunchPhase = .launch

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
