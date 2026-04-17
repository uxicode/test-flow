import AppKit
import Foundation
import PDFKit
import Vision

func renderPage(
  _ page: PDFPage,
  crop: CGRect? = nil,
  maxDimension: CGFloat = 3400
) -> CGImage? {
  let pageBounds = page.bounds(for: .mediaBox)
  let bounds = crop ?? pageBounds
  if bounds.width <= 0 || bounds.height <= 0 {
    return nil
  }

  let scale = min(maxDimension / max(bounds.width, bounds.height), 3.5)
  let targetSize = NSSize(width: bounds.width * scale, height: bounds.height * scale)

  let image = NSImage(size: targetSize)
  image.lockFocus()
  defer { image.unlockFocus() }

  guard let context = NSGraphicsContext.current?.cgContext else {
    return nil
  }

  context.setFillColor(NSColor.white.cgColor)
  context.fill(CGRect(origin: .zero, size: targetSize))
  context.saveGState()
  context.scaleBy(x: scale, y: scale)
  context.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
  page.draw(with: .mediaBox, to: context)
  context.restoreGState()

  return image.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

func recognizeText(from cgImage: CGImage, languages: [String]) throws -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = languages
  request.minimumTextHeight = 0.004

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  try handler.perform([request])

  let lines = (request.results ?? [])
    .compactMap { $0.topCandidates(1).first?.string }
    .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  return lines.joined(separator: "\n")
}

func tiledRects(for bounds: CGRect) -> [CGRect] {
  let midX = bounds.midX
  let midY = bounds.midY
  let halfW = bounds.width / 2
  let halfH = bounds.height / 2
  let overlapX = halfW * 0.08
  let overlapY = halfH * 0.08

  return [
    bounds,
    CGRect(x: bounds.minX, y: bounds.minY, width: bounds.width, height: halfH + overlapY),
    CGRect(x: bounds.minX, y: midY - overlapY, width: bounds.width, height: halfH + overlapY),
    CGRect(x: bounds.minX, y: bounds.minY, width: halfW + overlapX, height: bounds.height),
    CGRect(x: midX - overlapX, y: bounds.minY, width: halfW + overlapX, height: bounds.height),
    CGRect(x: bounds.minX, y: bounds.minY, width: halfW + overlapX, height: halfH + overlapY),
    CGRect(x: midX - overlapX, y: bounds.minY, width: halfW + overlapX, height: halfH + overlapY),
    CGRect(x: bounds.minX, y: midY - overlapY, width: halfW + overlapX, height: halfH + overlapY),
    CGRect(x: midX - overlapX, y: midY - overlapY, width: halfW + overlapX, height: halfH + overlapY),
  ]
}

func normalizeLine(_ line: String) -> String {
  line
    .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespacesAndNewlines)
}

func lineQuality(_ line: String, koreanPreferred: Bool) -> Double {
  let text = normalizeLine(line)
  if text.isEmpty { return -10 }
  let chars = Array(text).filter { !$0.isWhitespace }
  if chars.isEmpty { return -10 }
  let hangul = chars.filter { $0.unicodeScalars.contains { (0xAC00...0xD7AF).contains($0.value) } }.count
  let alphaNum = chars.filter { $0.isLetter || $0.isNumber }.count
  let suspicious = chars.filter { "¤þñ÷äàìåºÂÞÙÛª²Ü¯Ã".contains($0) }.count
  var score = Double(alphaNum) / Double(chars.count)
  score -= Double(suspicious) * 0.8
  if koreanPreferred {
    score += Double(hangul) / Double(chars.count) * 2.5
    if hangul == 0 { score -= 1.5 }
  }
  return score
}

func dedupeLines(_ text: String, koreanPreferred: Bool) -> String {
  var seen = Set<String>()
  var kept: [String] = []
  for raw in text.components(separatedBy: .newlines) {
    let line = normalizeLine(raw)
    if line.isEmpty { continue }
    if lineQuality(line, koreanPreferred: koreanPreferred) < 0.15 { continue }
    if seen.contains(line) { continue }
    seen.insert(line)
    kept.append(line)
  }
  return kept.joined(separator: "\n")
}

let args = CommandLine.arguments
guard args.count >= 2 else {
  fputs("Usage: pdfOcr.swift <pdf-path> [max-pages] [language]\n", stderr)
  exit(2)
}

let pdfPath = args[1]
let maxPages = args.count >= 3 ? max(Int(args[2]) ?? 20, 1) : 20
let language = args.count >= 4 ? args[3] : "ko"
let recognitionLanguages = language == "ko" ? ["ko-KR"] : ["en-US"]
let koreanPreferred = language == "ko"

guard let document = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
  fputs("Unable to open PDF\n", stderr)
  exit(1)
}

var allText: [String] = []
let pageCount = min(document.pageCount, maxPages)

for idx in 0..<pageCount {
  guard let page = document.page(at: idx) else { continue }
  let pageBounds = page.bounds(for: .mediaBox)
  var pageTexts: [String] = []
  for rect in tiledRects(for: pageBounds) {
    guard let cgImage = renderPage(page, crop: rect) else { continue }
    do {
      let text = try recognizeText(from: cgImage, languages: recognitionLanguages)
      if !text.isEmpty {
        pageTexts.append(text)
      }
    } catch {
      continue
    }
  }
  let merged = dedupeLines(pageTexts.joined(separator: "\n"), koreanPreferred: koreanPreferred)
  if !merged.isEmpty {
    allText.append(merged)
  }
}

print(allText.joined(separator: "\n\n"))
