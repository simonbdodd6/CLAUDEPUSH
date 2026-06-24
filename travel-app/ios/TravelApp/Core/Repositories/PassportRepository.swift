import Foundation

protocol PassportRepository {
    var passport: PassportDTO { get }
}

struct MockPassportRepository: PassportRepository {
    let passport: PassportDTO

    init(dataSource: any PassportDataSource = MockPassportDataSource()) {
        self.passport = dataSource.passport
    }
}
