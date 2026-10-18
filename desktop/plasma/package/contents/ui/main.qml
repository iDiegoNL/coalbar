import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as Controls
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    property var snapshot: ({})
    property bool connected: false
    property var pollRequest: null
    property double pollStartedAt: 0
    property var actionRequests: []
    property string bridgeToken: ""
    property double receivedAt: 0
    property double lastPopupRequest: 0
    readonly property string label: connected ? (snapshot.menuTitle || "Heater off") : "CoalBar"
    readonly property string heading: connected ? snapshot.headline : "Start CoalBar to connect"
    preferredRepresentation: compactRepresentation
    toolTipMainText: "CoalBar · " + label
    toolTipSubText: heading
    Plasmoid.status: connected && snapshot.visible ? PlasmaCore.Types.ActiveStatus : PlasmaCore.Types.PassiveStatus

    function disconnect() {
        connected = false
        snapshot = ({})
    }
    function cancelRequest(request) {
        request.onreadystatechange = function() {}
        request.abort()
    }
    function refresh() {
        var now = Date.now()
        var active = []
        for (var i = 0; i < actionRequests.length; i++) {
            var entry = actionRequests[i]
            if (now - entry.startedAt >= 3000) cancelRequest(entry.request)
            else if (entry.request.readyState !== XMLHttpRequest.DONE) active.push(entry)
        }
        actionRequests = active
        if (pollRequest) {
            if (now - pollStartedAt < 3000) return
            cancelRequest(pollRequest)
            pollRequest = null
            disconnect()
        }
        var request = new XMLHttpRequest()
        pollRequest = request
        pollStartedAt = now
        request.onreadystatechange = function() {
            if (request.readyState !== XMLHttpRequest.DONE || pollRequest !== request) return
            pollRequest = null
            if (request.status === 200) {
                try {
                    var next = JSON.parse(request.responseText)
                    if (!next || typeof next.token !== "string" || !next.token) throw new Error("Invalid state")
                    // A new process has a new nonce; old popup requests must not
                    // reopen a popup when a widget is added or the app restarts.
                    if (bridgeToken !== next.token) {
                        bridgeToken = next.token
                        lastPopupRequest = next.popupRequest || 0
                    }
                    snapshot = next
                    connected = true
                    receivedAt = Date.now()
                    if (snapshot.popupRequest && snapshot.popupRequest > lastPopupRequest) {
                        lastPopupRequest = snapshot.popupRequest
                        root.expanded = true
                    }
                }
                catch (error) { disconnect() }
            } else disconnect()
        }
        request.open("GET", "http://127.0.0.1:43179/state")
        request.send()
    }
    function act(name) {
        if (!connected) return
        var request = new XMLHttpRequest()
        request.open("POST", "http://127.0.0.1:43179/" + name)
        request.setRequestHeader("X-CoalBar-Token", snapshot.token)
        request.onreadystatechange = function() { if (request.readyState === XMLHttpRequest.DONE) refresh() }
        actionRequests = actionRequests.concat([{request: request, startedAt: Date.now()}])
        request.send()
    }
    Component.onDestruction: {
        if (pollRequest) cancelRequest(pollRequest)
        for (var i = 0; i < actionRequests.length; i++) cancelRequest(actionRequests[i].request)
    }
    Timer { interval: 1000; running: true; repeat: true; triggeredOnStart: true; onTriggered: root.refresh() }
    compactRepresentation: MouseArea {
        implicitWidth: row.implicitWidth + 16
        implicitHeight: Kirigami.Units.iconSizes.smallMedium
        Layout.minimumWidth: implicitWidth
        Layout.preferredWidth: implicitWidth
        Layout.maximumWidth: implicitWidth
        Accessible.role: Accessible.Button
        Accessible.name: root.heading + ", " + root.label
        activeFocusOnTab: true
        onClicked: root.expanded = !root.expanded
        Keys.onSpacePressed: root.expanded = !root.expanded
        Keys.onReturnPressed: root.expanded = !root.expanded
        RowLayout {
            id: row
            anchors.centerIn: parent
            spacing: 6
            Kirigami.Icon {
                source: root.snapshot.notice === "flip" ? "view-refresh" : root.snapshot.notice === "ready" ? "emblem-ok-symbolic" : "preferences-system-power-management"
                implicitWidth: Kirigami.Units.iconSizes.small
                implicitHeight: implicitWidth
            }
            Controls.Label { text: root.label; font.family: "monospace" }
        }
    }
    // Plasma owns positioning; CoalPopup owns its Swift-inspired appearance.
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    fullRepresentation: CoalPopup {
        Layout.minimumWidth: 360
        Layout.maximumWidth: 360
        Layout.preferredWidth: 360
        Layout.minimumHeight: root.snapshot.demo && root.snapshot.notice ? 480 : 440
        Layout.preferredHeight: Layout.minimumHeight
        snapshot: root.snapshot
        connected: root.connected
        expanded: root.expanded
        onAction: function(name) {
            if (name === "settings" || name === "quit") root.expanded = false
            root.act(name)
        }
    }
}
