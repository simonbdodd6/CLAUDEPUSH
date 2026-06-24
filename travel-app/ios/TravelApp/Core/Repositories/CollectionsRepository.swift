import Foundation

protocol CollectionsRepository {
    var collections: [CollectionDTO] { get }
}

struct MockCollectionsRepository: CollectionsRepository {
    let collections: [CollectionDTO]

    init(dataSource: any CollectionsDataSource = MockCollectionsDataSource()) {
        self.collections = dataSource.collections
    }
}
