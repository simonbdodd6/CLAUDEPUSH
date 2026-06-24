import Foundation

protocol PassportDataSource {
    var passport: PassportDTO { get }
}

struct MockPassportDataSource: PassportDataSource {
    let passport: PassportDTO

    init(passport: PassportDTO = MockDTOProvider.passport) {
        self.passport = passport
    }
}
