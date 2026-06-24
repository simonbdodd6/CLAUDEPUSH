import Foundation

protocol CollectionsRepository {
    var collections: [CollectionDTO] { get }
}

struct MockCollectionsRepository: CollectionsRepository {
    let collections: [CollectionDTO]

    init(collections: [CollectionDTO] = MockDTOProvider.collections) {
        self.collections = collections
    }
}
