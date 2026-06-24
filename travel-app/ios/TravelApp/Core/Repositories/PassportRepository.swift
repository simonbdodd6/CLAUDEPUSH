import Foundation

protocol PassportRepository {
    var passport: PassportDTO { get }
}

struct MockPassportRepository: PassportRepository {
    let passport: PassportDTO

    init(passport: PassportDTO = MockDTOProvider.passport) {
        self.passport = passport
    }
}
