import SwiftUI

/// The multi-page onboarding flow: swipeable intro pages, a value-primer page
/// and a first-run welcome page, finishing into the main app.
///
/// Visual-only and static. Page state is in-memory `@State`; nothing is
/// persisted, so the flow simply runs each launch until "Get started".
struct OnboardingView: View {
    let onFinish: () -> Void

    @State private var index = 0

    private let pages = OnboardingContent.pages

    /// Total pages including the trailing welcome page.
    private var pageCount: Int { pages.count + 1 }
    private var isLastPage: Bool { index == pageCount - 1 }

    var body: some View {
        VStack(spacing: TravelSpacing.lg) {
            TabView(selection: $index) {
                ForEach(Array(pages.enumerated()), id: \.element.id) { offset, page in
                    OnboardingPageView(page: page)
                        .tag(offset)
                }
                OnboardingWelcomeCard()
                    .tag(pages.count)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut, value: index)

            VStack(spacing: TravelSpacing.md) {
                OnboardingProgressDots(count: pageCount, current: index)

                OnboardingPrimaryButton(title: isLastPage ? "Enter Travel Intelligence" : "Continue") {
                    advance()
                }

                OnboardingSecondaryButton(title: isLastPage ? "" : "Skip") {
                    onFinish()
                }
                .opacity(isLastPage ? 0 : 1)
                .disabled(isLastPage)
            }
            .padding(.horizontal, TravelSpacing.lg)
            .padding(.bottom, TravelSpacing.md)
        }
        .background(TravelTheme.current.background)
    }

    private func advance() {
        if isLastPage {
            onFinish()
        } else {
            withAnimation(.easeInOut) { index += 1 }
        }
    }
}

/// Static onboarding content. Deterministic, offline preview data only.
enum OnboardingContent {
    static let pages: [OnboardingPagePreview] = [
        OnboardingPagePreview(
            id: "memories",
            eyebrow: "Gather",
            title: "Every journey, beautifully kept",
            subtitle: "Trips, places and captured moments come together in one calm, premium space.",
            symbol: "sparkles",
            gradient: [TravelTheme.current.ocean, TravelTheme.current.sky, TravelTheme.current.coral.opacity(0.7)],
            primers: []
        ),
        OnboardingPagePreview(
            id: "passport",
            eyebrow: "Collect",
            title: "A passport for your travels",
            subtitle: "Watch stamps, milestones and reach build as your journeys are recorded.",
            symbol: "person.text.rectangle.fill",
            gradient: [TravelTheme.current.ink, TravelTheme.current.ocean, TravelTheme.current.tint.opacity(0.78)],
            primers: []
        ),
        OnboardingPagePreview(
            id: "stories",
            eyebrow: "Relive",
            title: "Timelines, stories and reels",
            subtitle: "Your history becomes a year-by-year timeline, story shelves and a cinematic reel.",
            symbol: "book.pages.fill",
            gradient: [TravelTheme.current.coral, TravelTheme.current.sun, TravelTheme.current.moss.opacity(0.72)],
            primers: []
        ),
        OnboardingPagePreview(
            id: "principles",
            eyebrow: "By design",
            title: "Private and offline-first",
            subtitle: "Travel Intelligence is built to be calm, deterministic and yours.",
            symbol: "checkmark.seal.fill",
            gradient: [TravelTheme.current.moss, TravelTheme.current.tint, TravelTheme.current.sky.opacity(0.7)],
            primers: [
                OnboardingPrimerPreview(id: "offline", title: "Offline-first", caption: "Everything is presented locally, with no account required.", symbol: "wifi.slash"),
                OnboardingPrimerPreview(id: "deterministic", title: "Deterministic", caption: "Fixed, reason-coded surfaces — never generated guesswork.", symbol: "function"),
                OnboardingPrimerPreview(id: "private", title: "Private by default", caption: "Your travel memories stay on your device.", symbol: "lock.fill")
            ]
        )
    ]
}
