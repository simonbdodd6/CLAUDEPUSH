import SwiftUI
import Observation

struct CinematicScreen: View {
    @State private var viewModel: CinematicViewModel

    init(container: AppContainer = .mock()) {
        _viewModel = State(initialValue: container.makeCinematicViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                CinematicHeroCard(preview: viewModel.hero)

                PremiumScreenStateContainer(
                    loadingState: viewModel.loadingState,
                    presentation: viewModel.statePresentation
                ) {
                    populatedContent
                }
            }
            .navigationTitle("Cinematic")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Travel film reels", subtitle: "Visual reels grouped by atmosphere and journey shape.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.reels) { reel in
                    FilmReelCard(reel: reel)
                }
            }
        }

        PremiumSection(title: "Featured memory scenes", subtitle: "Scenes selected from completed travel moments.") {
            VStack(spacing: TravelSpacing.md) {
                ForEach(viewModel.scenes) { scene in
                    MemorySceneCard(scene: scene)
                }
            }
        }

        PremiumSection(title: "Destination moods", subtitle: "A visual mood board for the travel reel.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.moods) { mood in
                    DestinationMoodCard(mood: mood)
                }
            }
        }

        PremiumSection(title: "Cinematic story moments", subtitle: "Opening, peak and closing beats for the reel.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.moments) { moment in
                    CinematicMomentRow(moment: moment)
                }
            }
        }

        PremiumSection(title: "Visual journey statistics", subtitle: "A compact overview of the cinematic surface.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.statistics) { statistic in
                    CinematicStatisticCard(statistic: statistic)
                }
            }
        }
    }
}
