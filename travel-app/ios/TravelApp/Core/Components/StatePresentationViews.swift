import SwiftUI

// MARK: - Reusable state presentation views (Phase 27)
//
// Deterministic, presentation-only SwiftUI views for the loading, empty and
// error states established by the Phase 26 presentation contracts
// (`EmptyStatePresentation`, `ErrorStatePresentation`,
// `ViewModelStatePresentation`). These components render fixed copy supplied by
// a ViewModel's `statePresentation` value and carry no data, networking or
// business logic. They are not wired into feature screens yet.

/// Deterministic loading placeholder. Loading produces no Phase 26 contract
/// value, so this view takes fixed display copy directly.
struct LoadingStateView: View {
    var title: String = "Loading your travels"
    var message: String = "Gathering your saved memories."

    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(TravelTheme.current.tint)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text(title)
                    .font(TravelTypography.section)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.md)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}

/// Empty-state view driven by a Phase 26 `EmptyStatePresentation` contract.
/// The optional action label renders only when the contract supplies one.
struct EmptyStateView: View {
    let presentation: EmptyStatePresentation
    var symbol: String = "tray"
    var accent: Color = TravelTheme.current.tint

    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: symbol)
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text(presentation.title)
                    .font(TravelTypography.section)
                    .multilineTextAlignment(.center)
                Text(presentation.message)
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if let actionLabel = presentation.actionLabel {
                    StatePresentationActionLabel(text: actionLabel, accent: accent)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.md)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(presentation.title)
    }
}

/// Error-state view driven by a Phase 26 `ErrorStatePresentation` contract.
/// The optional action label renders only when the contract supplies one.
struct ErrorStateView: View {
    let presentation: ErrorStatePresentation
    var symbol: String = "exclamationmark.triangle"
    var accent: Color = TravelTheme.current.coral

    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: symbol)
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text(presentation.title)
                    .font(TravelTypography.section)
                    .multilineTextAlignment(.center)
                Text(presentation.message)
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if let actionLabel = presentation.actionLabel {
                    StatePresentationActionLabel(text: actionLabel, accent: accent)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.md)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(presentation.title)
    }
}

/// Resolves a `ViewModelStatePresentation` contract to its matching view.
/// ViewModels emit this value only for `.empty` and `.failed` states, so this
/// container renders exactly one of `EmptyStateView` or `ErrorStateView`.
struct StatePresentationView: View {
    let presentation: ViewModelStatePresentation

    var body: some View {
        switch presentation {
        case .empty(let empty):
            EmptyStateView(presentation: empty)
        case .failed(let error):
            ErrorStateView(presentation: error)
        }
    }
}

/// Static, non-interactive label for a contract's optional action text.
/// Wiring an action handler is deferred to a later phase.
private struct StatePresentationActionLabel: View {
    let text: String
    let accent: Color

    var body: some View {
        Text(text)
            .font(TravelTypography.caption)
            .foregroundStyle(accent)
            .padding(.horizontal, TravelSpacing.md)
            .padding(.vertical, TravelSpacing.xs)
            .background(.thinMaterial, in: Capsule())
    }
}
