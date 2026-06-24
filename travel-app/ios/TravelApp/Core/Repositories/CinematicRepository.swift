import Foundation

protocol CinematicRepository {
    var cinematic: CinematicDTO { get }
}

struct MockCinematicRepository: CinematicRepository {
    let cinematic: CinematicDTO

    init(cinematic: CinematicDTO = MockDTOProvider.cinematic) {
        self.cinematic = cinematic
    }
}
