// Generate original vector artwork as an opaque iOS icon.
// Run from the repository root: swift scripts/ios-icon.swift
import AppKit
let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(red: 0.047, green: 0.09, blue: 0.06, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()
NSColor(red: 0.25, green: 0.48, blue: 0.31, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 92, y: 155, width: 840, height: 570)).fill()
NSColor(red: 0.44, green: 0.68, blue: 0.43, alpha: 1).setStroke()
for inset in stride(from: 30.0, through: 150.0, by: 40.0) {
    let contour = NSBezierPath(ovalIn: NSRect(x: 92+inset, y: 155+inset/2,
        width: 840-inset*2, height: 570-inset))
    contour.lineWidth = 5; contour.stroke()
}
NSColor(red: 0.03, green: 0.09, blue: 0.05, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 514, y: 401, width: 144, height: 66)).fill()
NSColor(red: 0.92, green: 0.96, blue: 0.88, alpha: 1).setStroke()
let pole = NSBezierPath()
pole.move(to: NSPoint(x: 586, y: 434)); pole.line(to: NSPoint(x: 586, y: 844))
pole.lineWidth = 16; pole.stroke()
let flag = NSBezierPath()
flag.move(to: NSPoint(x: 594, y: 844)); flag.line(to: NSPoint(x: 802, y: 765))
flag.line(to: NSPoint(x: 594, y: 700)); flag.close()
NSColor(red: 0.95, green: 0.33, blue: 0.27, alpha: 1).setFill(); flag.fill()
NSColor.white.setFill()
NSBezierPath(ovalIn: NSRect(x: 290, y: 258, width: 95, height: 95)).fill()
NSGraphicsContext.restoreGraphicsState()
let path = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
// Export RGB without an alpha channel, as required for an iOS app icon.
let rgb = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
for y in 0..<size {
    for x in 0..<size {
        let source = y * bitmap.bytesPerRow + x * 4
        let destination = y * rgb.bytesPerRow + x * 3
        for channel in 0..<3 { rgb.bitmapData![destination+channel] = bitmap.bitmapData![source+channel] }
    }
}
try rgb.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
print("Generated \(path)")
