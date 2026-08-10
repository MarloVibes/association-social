import AppKit
import AVFoundation
import CoreVideo
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let rendered = root.appendingPathComponent("output/pitch-package/rendered")
let output = root.appendingPathComponent("output/pitch-package/video/Franchise_Mobile_x_NBA_2K_Backup_Visual_Reel.mp4")
let width = 1280
let height = 720
let secondsPerSlide = 4

try? FileManager.default.removeItem(at: output)

let slideURLs = try FileManager.default.contentsOfDirectory(at: rendered, includingPropertiesForKeys: nil)
    .filter { $0.lastPathComponent.range(of: #"^slide-\d\d\.png$"#, options: .regularExpression) != nil }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

guard !slideURLs.isEmpty else {
    fatalError("No rendered slide PNGs found")
}

let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 2_800_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
    ]
)
guard writer.canAdd(input) else { fatalError("Cannot add video input") }
writer.add(input)
guard writer.startWriting() else { fatalError(writer.error?.localizedDescription ?? "Unable to start video writer") }
writer.startSession(atSourceTime: .zero)

func pixelBuffer(for image: NSImage) -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let options: [String: Any] = [
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, options as CFDictionary, &buffer)
    guard let pixelBuffer = buffer else { fatalError("Unable to create pixel buffer") }
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { fatalError("Missing pixel buffer address") }
    guard let context = CGContext(
        data: baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else { fatalError("Unable to create graphics context") }
    context.setFillColor(NSColor.black.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("Unable to decode slide image") }
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    return pixelBuffer
}

var frameIndex: Int64 = 0
for slideURL in slideURLs {
    guard let image = NSImage(contentsOf: slideURL) else { fatalError("Unable to load \(slideURL.path)") }
    for _ in 0..<secondsPerSlide {
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.01) }
        let buffer = pixelBuffer(for: image)
        let time = CMTime(value: frameIndex, timescale: 1)
        guard adaptor.append(buffer, withPresentationTime: time) else {
            fatalError(writer.error?.localizedDescription ?? "Unable to append video frame")
        }
        frameIndex += 1
    }
}

input.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting { semaphore.signal() }
semaphore.wait()
guard writer.status == .completed else {
    fatalError(writer.error?.localizedDescription ?? "Video export failed")
}

print(output.path)
