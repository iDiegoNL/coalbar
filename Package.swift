// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "CoalBar",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "CoalBar", targets: ["CoalBar"])],
    targets: [.executableTarget(name: "CoalBar"), .testTarget(name: "CoalBarTests", dependencies: ["CoalBar"])]
)
