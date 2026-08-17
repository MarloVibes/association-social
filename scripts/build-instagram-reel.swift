import AVFoundation
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let input = root.appendingPathComponent("output/social-promo/reel-frames")
let output = root.appendingPathComponent("output/social-promo/Franchise_Mobile_Instagram_Reel.mp4")
let files = try FileManager.default.contentsOfDirectory(at: input, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension.lowercased() == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

guard !files.isEmpty else {
    fatalError("No Reel frames found")
}

try? FileManager.default.removeItem(at: output)
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: 1080,
    AVVideoHeightKey: 1920,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 5_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
]
let inputWriter = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
inputWriter.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: inputWriter,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: 1080,
        kCVPixelBufferHeightKey as String: 1920,
    ]
)
writer.add(inputWriter)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func pixelBuffer(from image: NSImage) -> CVPixelBuffer? {
    var buffer: CVPixelBuffer?
    CVPixelBufferCreate(kCFAllocatorDefault, 1080, 1920, kCVPixelFormatType_32ARGB, nil, &buffer)
    guard let pixelBuffer = buffer else { return nil }
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
    guard let context = CGContext(
        data: CVPixelBufferGetBaseAddress(pixelBuffer),
        width: 1080,
        height: 1920,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else { return nil }
    context.setFillColor(NSColor.black.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: 1080, height: 1920))
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: 1080, height: 1920))
    return pixelBuffer
}

let fps: Int32 = 30
let secondsPerFrame = 2.6
var frameNumber: Int64 = 0
for file in files {
    guard let image = NSImage(contentsOf: file), let buffer = pixelBuffer(from: image) else { continue }
    let count = Int(secondsPerFrame * Double(fps))
    for _ in 0..<count {
        while !inputWriter.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
        adaptor.append(buffer, withPresentationTime: CMTime(value: frameNumber, timescale: fps))
        frameNumber += 1
    }
}
inputWriter.markAsFinished()
await writer.finishWriting()
if writer.status != .completed {
    fatalError(writer.error?.localizedDescription ?? "Reel export failed")
}
print(output.path)
