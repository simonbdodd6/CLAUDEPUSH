import Foundation

protocol CollectionsDataSource {
    var collections: [CollectionDTO] { get }
}

struct MockCollectionsDataSource: CollectionsDataSource {
    let collections: [CollectionDTO]

    init(collections: [CollectionDTO] = MockDTOProvider.collections) {
        self.collections = collections
    }
}
