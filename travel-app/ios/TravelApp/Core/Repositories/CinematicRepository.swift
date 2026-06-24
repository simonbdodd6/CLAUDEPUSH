import Foundation

protocol CinematicRepository {
    var cinematic: CinematicDTO { get }
}

struct MockCinematicRepository: CinematicRepository {
    let cinematic: CinematicDTO

    init(dataSource: any CinematicDataSource = MockCinematicDataSource()) {
        self.cinematic = dataSource.cinematic
    }
}
