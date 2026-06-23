import SwiftUI

/// The animated launch / splash screen shown at startup, before onboarding.
///
/// Visual-only: a branded gradient stage with an animated brand mark and a
/// single call-to-action. There is no timer, networking or persistence — the
/// user advances by tapping "Get started".
struct LaunchScreen: View {
    let onContinue: () -> Void

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    TravelTheme.current.ink,
                    TravelTheme.current.ocean,
                    TravelTheme.current.tint.opacity(0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: TravelSpacing.xl) {
                Spacer()
                LaunchBrandMark()
                Spacer()
                VStack(spacing: TravelSpacing.sm) {
                    OnboardingPrimaryButton(title: "Get started", action: onContinue)
                    Text("Offline-first · No account needed")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .padding(TravelSpacing.lg)
            .padding(.bottom, TravelSpacing.md)
        }
    }
}
