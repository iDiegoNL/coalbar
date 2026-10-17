import AppKit
import SwiftUI

@main
struct CoalBarApp {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var model: CoalModel!
    private var item: NSStatusItem!
    private var panel: MenuPanel!
    private var outsideClick: Any?
    private var localClick: Any?
    private var settingsWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMainMenu()
        model = CoalModel()
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.isVisible = false
        item.button?.target = self
        item.button?.action = #selector(togglePopover)
        panel = MenuPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 440),
                          styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.onHide = { [weak self] in self?.model.panelVisible = false }
        panel.title = "CoalBar"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        let hostingView = NSHostingView(rootView: CoalPanel(model: model, settings: { [weak self] in self?.showSettings() }))
        hostingView.focusRingType = .none
        hostingView.wantsLayer = true
        hostingView.layer?.cornerRadius = 26
        hostingView.layer?.masksToBounds = true
        panel.contentView = hostingView
        outsideClick = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            Task { @MainActor in self?.panel.orderOut(nil) }
        }
        localClick = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .keyDown]) { [weak self] event in
            guard let self else { return event }
            if event.type == .keyDown && event.keyCode == 53 && self.panel.isVisible {
                self.panel.orderOut(nil)
                return nil
            }
            if event.type != .keyDown && event.window != self.panel && event.window != self.item.button?.window {
                self.panel.orderOut(nil)
            }
            return event
        }
        model.visibilityChanged = { [weak self] in self?.updateItem() }
        model.showPreview = { [weak self] in self?.togglePopover() }
        updateItem()
        if !model.configured { showSettings() }
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(wokeUp), name: NSWorkspace.didWakeNotification, object: nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    private func installMainMenu() {
        // AppKit routes standard editing shortcuts through the main menu,
        // including when SwiftUI hosts the secure token field.
        let menu = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu(title: "CoalBar")
        applicationMenu.addItem(withTitle: "Quit CoalBar", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showSettings()
        return true
    }
    private func updateItem() {
        if item.isVisible != model.visible { item.isVisible = model.visible }
        if !model.visible { panel.orderOut(nil) }
        item.button?.title = model.menuTitle.isEmpty ? "" : " \(model.menuTitle)"
        let symbol = model.notice?.icon ?? (model.reading.phase == .off ? "flame" : "flame.fill")
        item.button?.image = NSImage(systemSymbolName: symbol, accessibilityDescription: model.headline)
        item.button?.imagePosition = .imageLeading
        item.button?.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        item.button?.toolTip = model.headline
    }
    @objc private func togglePopover() {
        guard let button = item.button, let window = button.window else { return }
        if panel.isVisible { panel.orderOut(nil); return }
        // Convert the actual menu bar button into global screen coordinates.
        // A fixed-size panel avoids NSPopover re-anchoring when countdown content changes.
        let anchor = window.convertToScreen(button.convert(button.bounds, to: nil))
        let screen = window.screen ?? NSScreen.main
        let visible = screen?.visibleFrame ?? anchor
        let size = NSSize(width: 360, height: 440)
        let x = max(visible.minX + 8, min(anchor.midX - size.width / 2, visible.maxX - size.width - 8))
        let top = min(anchor.minY - 8, visible.maxY - 8)
        panel.setFrame(NSRect(x: x, y: max(visible.minY + 8, top - size.height), width: size.width, height: size.height), display: true)
        model.panelVisible = true
        panel.makeKeyAndOrderFront(nil)
    }

    @objc private func wokeUp() { Task { await model.refresh() } }
    private func showSettings() {
        panel?.orderOut(nil)
        if settingsWindow == nil {
            let controller = NSHostingController(rootView: SettingsView(model: model))
            let window = NSWindow(contentViewController: controller)
            window.title = "CoalBar Settings"
            window.styleMask = [.titled, .closable, .miniaturizable]
            window.isReleasedWhenClosed = false
            window.center()
            settingsWindow = window
        }
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.makeKeyAndOrderFront(nil)
    }
}

final class MenuPanel: NSPanel {
    var onHide: (() -> Void)?
    override func orderOut(_ sender: Any?) {
        super.orderOut(sender)
        onHide?()
    }
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
