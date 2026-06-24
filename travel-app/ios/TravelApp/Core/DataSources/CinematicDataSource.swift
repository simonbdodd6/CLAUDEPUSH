import Foundation

protocol CinematicDataSource {
    var cinematic: CinematicDTO { get }
}

struct MockCinematicDataSource: CinematicDataSource {
    let cinematic: CinematicDTO

    init(cinematic: CinematicDTO = MockDTOProvider.cinematic) {
        self.cinematic = cinematic
    }
}
