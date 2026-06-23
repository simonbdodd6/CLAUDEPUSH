import SwiftUI

// MARK: - Presentation models

/// A single onboarding intro page.
struct OnboardingPagePreview: Identifiable {
    let id: String
    let eyebrow: String
    let title: String
    let subtitle: String
    let symbol: String
    let gradient: [Color]
    let primers: [OnboardingPrimerPreview]
}

/// A value primer row (offline-first, deterministic, private, …).
struct OnboardingPrimerPreview: Identifiable {
    let id: String
    let title: String
    let caption: String
    let symbol: String
}

// MARK: - Brand mark

/// Animated brand mark for the launch screen. The entrance animation runs on
/// appear via `withAnimation` — no timers, async or persistence.
struct LaunchBrandMark: View {
    @State private var appeared = false

    var body: some View {
        VStack(spacing: TravelSpacing.lg) {
            ZStack {
                Circle()
                    .fill(.white.opacity(0.14))
                    .frame(width: 132, height: 132)
                Circle()
                    .stroke(.white.opacity(0.35), lineWidth: 1)
                    .frame(width: 132, height: 132)
                Image(systemName: "globe.europe.africa.fill")
                    .font(.system(size: 58, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .scaleEffect(appeared ? 1 : 0.82)
            .opacity(appeared ? 1 : 0)

            VStack(spacing: TravelSpacing.xs) {
                Text("Travel Intelligence")
                    .font(TravelTypography.display)
                    .foregroundStyle(.white)
                Text("Your journeys, beautifully gathered.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.white.opacity(0.78))
            }
            .multilineTextAlignment(.center)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 12)
        }
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.74)) {
                appeared = true
            }
        }
    }
}

// MARK: - Onboarding page

/// A single full-bleed onboarding page: a gradient hero, copy, and optional
/// value primers.
struct OnboardingPageView: View {
    let page: OnboardingPagePreview

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xl) {
            RoundedRectangle(cornerRadius: TravelRadius.hero, style: .continuous)
                .fill(LinearGradient(colors: page.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(alignment: .bottomLeading) {
                    Image(systemName: page.symbol)
                        .font(.system(size: 72, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.92))
                        .padding(TravelSpacing.lg)
                }
                .frame(height: 280)
                .overlay {
                    RoundedRectangle(cornerRadius: TravelRadius.hero, style: .continuous)
                        .stroke(.white.opacity(0.25), lineWidth: 1)
                }

            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text(page.eyebrow)
                    .font(TravelTypography.caption)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(page.title)
                    .font(TravelTypography.display)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(page.subtitle)
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !page.primers.isEmpty {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(page.primers) { primer in
                        OnboardingValuePrimerRow(primer: primer)
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A single value-primer row shown on the primer onboarding page.
struct OnboardingValuePrimerRow: View {
    let primer: OnboardingPrimerPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: primer.symbol)
                .font(.headline)
                .foregroundStyle(TravelTheme.current.tint)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(primer.title)
                    .font(TravelTypography.cardTitle)
                Text(primer.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: TravelSpacing.sm)
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

// MARK: - Welcome

/// The first-run welcome hero shown on the final onboarding page.
struct OnboardingWelcomeCard: View {
    var body: some View {
        VStack(spacing: TravelSpacing.lg) {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [TravelTheme.current.tint, TravelTheme.current.ocean], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 104, height: 104)
                Image(systemName: "checkmark")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundStyle(.white)
            }
            VStack(spacing: TravelSpacing.sm) {
                Text("You're all set")
                    .font(TravelTypography.display)
                    .foregroundStyle(.primary)
                Text("Your premium, offline-first travel companion is ready. Explore memories, passport, timeline and stories whenever you like.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(TravelSpacing.lg)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Controls

/// Page indicator dots for the onboarding flow.
struct OnboardingProgressDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: TravelSpacing.xs) {
            ForEach(0..<count, id: \.self) { index in
                Capsule()
                    .fill(index == current ? TravelTheme.current.tint : Color.secondary.opacity(0.3))
                    .frame(width: index == current ? 22 : 8, height: 8)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: current)
        .accessibilityLabel("Page \(current + 1) of \(count)")
    }
}

/// Primary filled call-to-action button in the app's accent.
struct OnboardingPrimaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(TravelTypography.cardTitle)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, TravelSpacing.md)
                .background(TravelTheme.current.tint, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Secondary, quiet text button (e.g. "Skip").
struct OnboardingSecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, TravelSpacing.xs)
        }
        .buttonStyle(.plain)
    }
}
