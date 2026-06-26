import SwiftUI
import Observation

@Observable
final class CinematicViewModel {
    let cinematic: CinematicDTO
    private(set) var loadingState: ViewModelLoadingState
    private let loader: AsyncStateLoader<Bool>

    init(repository: any CinematicRepository) {
        let cinematic = repository.cinematic
        self.cinematic = cinematic
        self.loadingState = .resolved(isEmpty: cinematic.scenes.isEmpty)
        self.loader = AsyncStateLoader(isEmpty: { $0 }, load: { try await repository.loadCinematic().scenes.isEmpty })
    }

    /// Re-resolves `loadingState` through the async loading seam. Not invoked in
    /// the current synchronous flow, so runtime behaviour is unchanged.
    @MainActor func reload() async {
        await loader.reload()
        loadingState = loader.state
    }

    var hasScenes: Bool { loadingState == .loaded }

    var statePresentation: ViewModelStatePresentation? {
        loadingState.presentation(
            empty: EmptyStatePresentation(
                title: "Your travel reel is ready",
                message: "Completed trips and memory scenes can become a cinematic travel reel here.",
                actionLabel: nil,
                reasonCode: "cinematic_scenes_empty"
            ),
            failureTitle: "Unable to load cinematic memories"
        )
    }

    var hero: CinematicHeroPreview {
        CinematicHeroPreview(
            title: "Your travels as a film reel",
            subtitle: "An immersive visual stage for scenes, moods, moments and destination-led memories.",
            scenes: "\(cinematic.scenes.count)",
            destinations: "\(Set(cinematic.scenes.map(\.place)).count)",
            duration: "3m"
        )
    }

    let reels = [
        FilmReelPreview(
            id: "reel-coast",
            title: "Coastal light",
            subtitle: "Sea cliffs, harbours and golden-hour chapters.",
            sceneCount: "6 scenes",
            symbol: "sunset.fill",
            gradient: [TravelTheme.current.ocean, TravelTheme.current.sky, TravelTheme.current.sun.opacity(0.78)]
        ),
        FilmReelPreview(
            id: "reel-city",
            title: "City nights",
            subtitle: "Late walks, train windows and quiet streets.",
            sceneCount: "5 scenes",
            symbol: "building.2.fill",
            gradient: [TravelTheme.current.ink, TravelTheme.current.ocean, TravelTheme.current.coral.opacity(0.7)]
        ),
        FilmReelPreview(
            id: "reel-milestone",
            title: "Milestone reel",
            subtitle: "First trips, new countries and big arrival moments.",
            sceneCount: "7 scenes",
            symbol: "seal.fill",
            gradient: [TravelTheme.current.coral, TravelTheme.current.sun, TravelTheme.current.moss.opacity(0.72)]
        )
    ]

    let scenes = [
        MemoryScenePreview(id: "scene-amalfi", title: "Blue hour above the coast", place: "Positano, Italy", caption: "A featured memory with warm light and cliffside depth.", symbol: "sunset.fill", accent: TravelTheme.current.sun),
        MemoryScenePreview(id: "scene-kyoto", title: "Temple evening", place: "Kyoto, Japan", caption: "A quiet cultural scene from the latest journey.", symbol: "leaf.fill", accent: TravelTheme.current.moss),
        MemoryScenePreview(id: "scene-cape-town", title: "Continent marker", place: "Cape Town, South Africa", caption: "A milestone scene from a major travel reach moment.", symbol: "globe.americas.fill", accent: TravelTheme.current.ocean)
    ]

    let moods = [
        DestinationMoodPreview(id: "mood-italy", destination: "Italy", mood: "Golden coast", caption: "Warm light, terraces and sea air.", symbol: "sun.max.fill", gradient: [TravelTheme.current.sun, TravelTheme.current.coral]),
        DestinationMoodPreview(id: "mood-japan", destination: "Japan", mood: "Quiet motion", caption: "Rail days, gardens and evening streets.", symbol: "tram.fill", gradient: [TravelTheme.current.moss, TravelTheme.current.sky]),
        DestinationMoodPreview(id: "mood-portugal", destination: "Portugal", mood: "First chapter", caption: "A soft opening to the travel archive.", symbol: "flag.checkered", gradient: [TravelTheme.current.ocean, TravelTheme.current.tint])
    ]

    let moments = [
        CinematicMomentPreview(id: "moment-opening", title: "Opening frame", subtitle: "Lisbon begins the traveller archive.", marker: "00:00", symbol: "play.circle.fill"),
        CinematicMomentPreview(id: "moment-peak", title: "Emotional peak", subtitle: "Blue hour on the Amalfi coast.", marker: "01:42", symbol: "sparkles"),
        CinematicMomentPreview(id: "moment-close", title: "Closing scene", subtitle: "Kyoto closes the current reel.", marker: "03:08", symbol: "moon.stars.fill")
    ]

    let statistics = [
        CinematicStatisticPreview(id: "stat-scenes", value: "18", label: "Scenes", caption: "Visual memories prepared for the reel.", symbol: "film.fill"),
        CinematicStatisticPreview(id: "stat-moods", value: "7", label: "Moods", caption: "Destination atmospheres in the reel.", symbol: "paintpalette.fill"),
        CinematicStatisticPreview(id: "stat-moments", value: "5", label: "Story beats", caption: "Opening, peak and closing travel moments.", symbol: "waveform.path.ecg")
    ]
}
