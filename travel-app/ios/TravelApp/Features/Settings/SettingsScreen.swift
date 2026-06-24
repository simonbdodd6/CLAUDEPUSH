import SwiftUI
import Observation

@Observable
final class SettingsViewModel {
    let traveller = MockDTOProvider.traveller
    let passport = MockDTOProvider.passport
    let statistics = MockDTOProvider.statistics
    let collections = MockDTOProvider.collections

    var hasProfile: Bool { !traveller.displayName.isEmpty }

    var hero: SettingsHeroPreview {
        SettingsHeroPreview(
            title: "Your travel space",
            subtitle: "A calm overview of your traveller identity, archive and local experience.",
            memberSince: traveller.memberSince,
            countries: "\(traveller.summary.countries)",
            memories: "\(traveller.summary.memories)"
        )
    }

    var profile: TravellerProfilePreview {
        TravellerProfilePreview(
            name: traveller.displayName,
            homeCity: traveller.homeCity ?? "Home city not set",
            memberSince: traveller.memberSince,
            initials: Self.initials(for: traveller.displayName),
            passportProgress: passport.completion
        )
    }

    let preferences = [
        PreferenceCategoryPreview(
            id: "preference-appearance",
            title: "Appearance",
            detail: "System appearance with the Travel Intelligence theme.",
            status: "Automatic",
            symbol: "circle.lefthalf.filled",
            accent: TravelTheme.current.tint
        ),
        PreferenceCategoryPreview(
            id: "preference-motion",
            title: "Motion",
            detail: "Subtle transitions using the shared motion foundation.",
            status: "Standard",
            symbol: "waveform.path",
            accent: TravelTheme.current.coral
        ),
        PreferenceCategoryPreview(
            id: "preference-accessibility",
            title: "Accessibility",
            detail: "Native typography and system accessibility behavior.",
            status: "System",
            symbol: "accessibility",
            accent: TravelTheme.current.moss
        ),
        PreferenceCategoryPreview(
            id: "preference-content",
            title: "Travel content",
            detail: "Metric units and archive labels for this preview.",
            status: "Metric",
            symbol: "ruler.fill",
            accent: TravelTheme.current.sun
        )
    ]

    var archive: TravelArchivePreview {
        TravelArchivePreview(
            journeys: traveller.summary.journeys,
            memories: traveller.summary.memories,
            collections: collections.count,
            stampedCountries: passport.stamps.filter(\.isStamped).count,
            completion: passport.completion
        )
    }

    let appInformation = [
        AppInformationPreview(
            id: "app-version",
            title: "Travel Intelligence",
            detail: "Premium SwiftUI preview foundation",
            value: "Phase 18",
            symbol: "app.fill"
        ),
        AppInformationPreview(
            id: "app-data",
            title: "Data mode",
            detail: "Static deterministic DTO fixtures",
            value: "Offline",
            symbol: "internaldrive.fill"
        ),
        AppInformationPreview(
            id: "app-boundary",
            title: "Integrations",
            detail: "No accounts or external services",
            value: "None",
            symbol: "checkmark.shield.fill"
        )
    ]

    var statisticsCards: [SettingsStatisticPreview] {
        [
            SettingsStatisticPreview(
                id: "settings-stat-countries",
                value: "\(traveller.summary.countries)",
                label: "Countries",
                caption: "Distinct nations in the traveller summary.",
                symbol: "globe.europe.africa.fill",
                accent: TravelTheme.current.ocean
            ),
            SettingsStatisticPreview(
                id: "settings-stat-years",
                value: statisticValue(for: "active_years"),
                label: "Active years",
                caption: "Years represented by completed travel.",
                symbol: "calendar.badge.clock",
                accent: TravelTheme.current.moss
            ),
            SettingsStatisticPreview(
                id: "settings-stat-stamps",
                value: "\(passport.stamps.filter(\.isStamped).count)",
                label: "Preview stamps",
                caption: "Stamped entries in the passport fixture.",
                symbol: "seal.fill",
                accent: TravelTheme.current.coral
            )
        ]
    }

    private func statisticValue(for key: String) -> String {
        statistics.metrics.first { $0.key == key }?.value ?? "0"
    }

    private static func initials(for name: String) -> String {
        name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}

struct SettingsScreen: View {
    @State private var viewModel = SettingsViewModel()

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                SettingsHeroCard(preview: viewModel.hero)

                if viewModel.hasProfile {
                    populatedContent
                } else {
                    SettingsEmptyState()
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Traveller profile", subtitle: "Identity details from the existing TravellerDTO.") {
            TravellerProfileCard(preview: viewModel.profile)
        }

        PremiumSection(title: "Preferences", subtitle: "Read-only presentation settings for this static milestone.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.preferences) { preference in
                    PreferenceCategoryCard(preview: preference)
                }
            }
        }

        PremiumSection(title: "Travel archive summary", subtitle: "A composed view of passport and traveller fixtures.") {
            TravelArchiveCard(preview: viewModel.archive)
        }

        PremiumSection(title: "App information", subtitle: "Clear boundaries for the current visual application.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.appInformation) { information in
                    AppInformationCard(preview: information)
                }
            }
        }

        PremiumSection(title: "Statistics", subtitle: "A compact read-only summary of the local preview archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.statisticsCards) { statistic in
                    SettingsStatisticCard(preview: statistic)
                }
            }
        }
    }
}
