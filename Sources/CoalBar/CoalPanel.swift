import SwiftUI

private let ember = Color(red: 1, green: 0.43, blue: 0.19)

struct CoalPanel: View {
    @ObservedObject var model: CoalModel
    var settings: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var heating: Bool { model.reading.phase == .heating || model.reading.phase == .overdue }
    private var time: String {
        if model.notice == .fresh { return "Another round?" }
        if let remaining = model.reading.remaining { return clockText(remaining) }
        if let due = model.refreshDate, due > model.now { return clockText(due.timeIntervalSince(model.now)) }
        return "All quiet"
    }
    private var subtitle: String {
        if model.notice == .fresh { return "A fresh batch, whenever you’re ready." }
        if model.reading.phase == .overdue { return "Countdown ended. Check the heater." }
        if model.reading.phase == .paused { return "Heating countdown is paused." }
        if heating { return "until your coals are ready" }
        if model.refreshDate != nil { return "until your next-coal reminder" }
        if model.reading.phase == .unknown { return "Check your connection and automations." }
        return "Ready for your next session."
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "flame.fill").foregroundStyle(ember)
                Text("COALBAR").font(.system(size: 11, weight: .bold, design: .rounded)).tracking(2.5)
                Spacer()
                if model.demo {
                    HStack(spacing: 5) {
                        Circle().fill(ember).frame(width: 5, height: 5)
                        Text("DEMO").font(.system(size: 9, weight: .semibold)).tracking(1)
                    }.padding(.horizontal, 10).padding(.vertical, 6).background(.white.opacity(0.06), in: Capsule())
                }
            }.padding(.bottom, 8)

            CoalHeaterArt(active: heating, reduceMotion: reduceMotion || !model.panelVisible)
                .frame(height: model.demo ? 96 : 120).padding(.bottom, 24).accessibilityLabel(heating ? "Coals glowing on the heater" : "Heater resting")

            Text(model.notice == .fresh ? "Time for fresh coals" : model.notice == .flip ? "Time for a flip" : heating ? "Warming your coals" : model.notice == .ready ? "Your coals are ready" : "Heater is off")
                .font(.system(size: 17, weight: .medium, design: .rounded)).foregroundStyle(.white.opacity(0.88))
            Text(time).font(.system(size: time == "All quiet" || model.notice == .fresh ? 34 : 52, weight: .light, design: .rounded))
                .monospacedDigit().tracking(-1.5).foregroundStyle(.white)
                .contentTransition(.numericText(countsDown: true)).padding(.top, 3)
            Text(subtitle).font(.system(size: 12)).foregroundStyle(.white.opacity(0.5)).padding(.top, 2)

            if let remaining = model.reading.remaining, let duration = model.reading.duration, duration > 0 {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.08))
                        Capsule().fill(LinearGradient(colors: [ember.opacity(0.5), ember, .orange], startPoint: .leading, endPoint: .trailing))
                            .frame(width: geometry.size.width * min(1, max(0, 1 - remaining / duration)))
                    }
                }.frame(height: 3).padding(.top, 19)
            }

            Spacer(minLength: 12)
            if let notice = model.notice {
                HStack(spacing: 10) {
                    Image(systemName: notice.icon).font(.system(size: 18)).foregroundStyle(ember)
                    Text(notice == .flip ? "Turn them for an even glow." : notice == .ready ? "The plug is off. Time to collect." : "Time to put new coals on?")
                        .font(.system(size: 11, weight: .medium)).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button("Got it") { model.dismissNotice() }.buttonStyle(.plain)
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(ember)
                }.padding(12).background(ember.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
            }
            if model.demo {
                HStack {
                    Button("Flip") { model.preview(.flip) }
                    Button("Ready") { model.preview(.ready) }
                    Button("New coals") { model.preview(.fresh) }
                    Button("End") { model.setDemo(false) }
                }.font(.system(size: 10)).buttonStyle(.borderless).padding(.top, 8)
            }
            Rectangle().fill(.white.opacity(0.09)).frame(height: 1).padding(.top, 16).padding(.bottom, 12)
            HStack {
                Button(action: settings) { Label("Settings", systemImage: "slider.horizontal.3") }
                Spacer()
                Button { NSApplication.shared.terminate(nil) } label: { Image(systemName: "power") }
                    .help("Quit CoalBar").accessibilityLabel("Quit CoalBar")
            }.buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(.white.opacity(0.55))
        }
        .padding(24).frame(width: 360, height: 440)
        .background(alignment: .top) {
            Ellipse().fill(ember.opacity(heating ? 0.16 : 0.05)).frame(width: 260, height: 190).blur(radius: 45).offset(y: 20)
        }
        .modifier(CoalGlass())
        .preferredColorScheme(.dark)
    }
}

private struct CoalGlass: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) var reduceTransparency
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(Color(white: 0.10), in: RoundedRectangle(cornerRadius: 26))
        } else if #available(macOS 26.0, *) {
            content.glassEffect(.regular.tint(.black.opacity(0.55)), in: RoundedRectangle(cornerRadius: 26))
        } else {
            content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26))
        }
    }
}

private struct CoalHeaterArt: View {
    var active: Bool
    var reduceMotion: Bool
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 24, paused: !active || reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let pulse = active ? 0.75 + sin(t * 2) * 0.15 : 0.12
            ZStack {
                Ellipse().fill(ember.opacity(pulse * 0.35)).frame(width: 150, height: 40).blur(radius: 18).offset(y: 34)
                // Warmth rises above the cubes while heating.
                if active {
                    Canvas { drawing, size in
                        for i in 0..<3 {
                            var path = Path()
                            for step in 0...24 {
                                let y = Double(step) * 1.8
                                let x = size.width / 2 + Double(i - 1) * 27 + sin(y / 12 - t * 1.7 + Double(i)) * 4
                                let point = CGPoint(x: x, y: 49 - y)
                                if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
                            }
                            drawing.stroke(path, with: .linearGradient(Gradient(colors: [ember.opacity(0), ember.opacity(0.4)]), startPoint: .zero, endPoint: CGPoint(x: 0, y: 50)), style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
                        }
                    }.frame(width: 160, height: 50).offset(y: -38)
                }
                RoundedRectangle(cornerRadius: 12).fill(LinearGradient(colors: [Color(white: 0.28), Color(white: 0.12)], startPoint: .top, endPoint: .bottom))
                    .frame(width: 158, height: 32).overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.14), lineWidth: 0.7)).offset(y: 35)
                Ellipse().fill(.black.opacity(0.7)).frame(width: 142, height: 22).offset(y: 21)
                ForEach(0..<3) { index in
                    RoundedRectangle(cornerRadius: 5)
                        .fill(LinearGradient(colors: active ? [Color(red: 0.42, green: 0.16, blue: 0.09), Color(white: 0.11)] : [Color(white: 0.27), Color(white: 0.13)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(ember.opacity(pulse), lineWidth: 1.5))
                        .overlay {
                            Path { p in
                                p.move(to: CGPoint(x: 4, y: 26)); p.addLine(to: CGPoint(x: 18, y: 16))
                                p.addLine(to: CGPoint(x: 24, y: 20)); p.addLine(to: CGPoint(x: 34, y: 8))
                                p.move(to: CGPoint(x: 18, y: 16)); p.addLine(to: CGPoint(x: 15, y: 4))
                            }.stroke(ember.opacity(pulse * 0.85), style: StrokeStyle(lineWidth: 1.2, lineCap: .round))
                        }
                        .frame(width: 38, height: 37).rotationEffect(.degrees(Double(index - 1) * 12))
                        .shadow(color: ember.opacity(pulse * 0.4), radius: active ? 9 : 0)
                        .offset(x: Double(index - 1) * 42, y: index == 1 ? -1 : 5)
                }
                Circle().fill(active ? ember : Color(white: 0.35)).frame(width: 4, height: 4).offset(x: 57, y: 36)
                Capsule().fill(.black.opacity(0.6)).frame(width: 20, height: 4).offset(x: -49, y: 53)
                Capsule().fill(.black.opacity(0.6)).frame(width: 20, height: 4).offset(x: 49, y: 53)
            }
        }.accessibilityHidden(true)
    }
}
