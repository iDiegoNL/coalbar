import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Rectangle {
    id: popup
    property var snapshot: ({})
    property bool connected: false
    property bool expanded: false
    signal action(string name)
    readonly property var display: connected && snapshot.presentation ? snapshot.presentation : ({heating: false, clock: "Unavailable", subtitle: "Start CoalBar to connect.", progress: null, noticeText: ""})
    readonly property string notice: connected ? (snapshot.notice || "") : ""
    readonly property bool heating: !!display.heating
    readonly property bool demo: !!snapshot.demo
    readonly property bool solid: !!snapshot.reduceTransparency
    readonly property string headline: connected ? (snapshot.headline || "Heater or timer unavailable") : "Heater or timer unavailable"
    readonly property string timeText: display.clock
    readonly property string subtitle: display.subtitle
    implicitWidth: 360
    implicitHeight: 440
    color: "#191a1b"
    radius: 26
    border.width: 1
    border.color: "#16ffffff"
    clip: true
    Canvas {
        id: backdrop
        visible: !popup.solid
        anchors.fill: parent
        onPaint: {
            var c=getContext("2d");c.reset()
            var g=c.createRadialGradient(width/2,95,5,width/2,95,160)
            g.addColorStop(0,popup.heating?"#20ff6e30":"#08ff6e30");g.addColorStop(1,"#00ff6e30")
            c.fillStyle=g;c.fillRect(0,0,width,height)
        }
        Connections { target: popup; function onHeatingChanged() { backdrop.requestPaint() } }
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 24
            spacing: 8
            Text { text: "♨"; color: "#ff6e30"; font.pixelSize: 20; font.family: "Noto Sans" }
            Text { text: "COALBAR"; color: "#eeeeee"; font.pixelSize: 11; font.bold: true; font.letterSpacing: 2.5; font.family: "Noto Sans" }
            Item { Layout.fillWidth: true }
            Rectangle {
                visible: popup.demo
                implicitWidth: 61; implicitHeight: 23; radius: 12; color: "#0fffffff"
                Row { anchors.centerIn: parent; spacing: 5
                    Rectangle { width: 5; height: 5; radius: 3; color: "#ff6e30"; anchors.verticalCenter: parent.verticalCenter }
                    Text { text: "DEMO"; font.family: "Noto Sans"; font.pixelSize: 9; font.weight: Font.DemiBold; font.letterSpacing: 1; color: "#dedede" }
                }
            }
        }
        CoalHeater {
            Layout.fillWidth: true
            Layout.preferredHeight: popup.demo || popup.notice !== "" ? 96 : 120
            Layout.topMargin: 8
            Layout.bottomMargin: 24
            active: popup.heating
            // Kirigami durations follow the desktop animation setting.
            animate: popup.expanded && !popup.snapshot.reduceMotion && Kirigami.Units.longDuration > 0
            reduceTransparency: popup.solid
            Accessible.name: popup.heating ? "Coals glowing on the heater" : "Heater resting"
        }
        Text { Layout.fillWidth: true; text: popup.headline; horizontalAlignment: Text.AlignHCenter; color: "#e1e1e1"; font.family: "Noto Sans"; font.pixelSize: 17; font.weight: Font.Medium }
        Text {
            Layout.fillWidth: true
            Layout.topMargin: 3
            text: popup.timeText
            horizontalAlignment: Text.AlignHCenter
            color: "white"
            font.family: "Noto Sans"
            font.pixelSize: /[a-z]/i.test(popup.timeText) ? 34 : 52
            font.weight: Font.Light
            font.letterSpacing: -1.5
        }
        Text { Layout.fillWidth: true; Layout.topMargin: 2; text: popup.subtitle; horizontalAlignment: Text.AlignHCenter; color: "#808080"; font.family: "Noto Sans"; font.pixelSize: 12 }
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 3
            Layout.topMargin: 19
            visible: popup.display.progress !== null && popup.display.progress !== undefined
            color: "#14ffffff"; radius: 2
            Rectangle {
                width: parent.width * (popup.display.progress || 0)
                height: 3; radius: 2
                gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0; color: "#806e30" } GradientStop { position: .55; color: "#ff6e30" } GradientStop { position: 1; color: "#ffa028" } }
            }
        }
        Item { Layout.fillHeight: true; Layout.minimumHeight: 12 }
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 48
            visible: popup.notice !== ""
            color: popup.solid ? "#30221d" : "#1aff6e30"; radius: 14
            RowLayout {
                anchors.fill: parent; anchors.margins: 12; spacing: 10
                Text { text: popup.notice === "flip" ? "↻" : popup.notice === "ready" ? "✓" : "♨"; color: "#ff6e30"; font.pixelSize: 18; font.family: "Noto Sans" }
                Text { Layout.fillWidth: true; text: popup.display.noticeText; wrapMode: Text.WordWrap; color: "#dedede"; font.family: "Noto Sans"; font.pixelSize: 11; font.weight: Font.Medium }
                CoalButton { text: "Got it"; color: "#ff6e30"; onClicked: popup.action("dismiss") }
            }
        }
        RowLayout {
            Layout.topMargin: 8
            visible: popup.demo
            spacing: 8
            CoalButton { text: "Flip"; onClicked: popup.action("flip") }
            CoalButton { text: "Ready"; onClicked: popup.action("ready") }
            CoalButton { text: "New coals"; onClicked: popup.action("fresh") }
            Item { Layout.fillWidth: true }
            CoalButton { text: "End"; onClicked: popup.action("endDemo") }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; Layout.topMargin: 16; Layout.bottomMargin: 12; color: "#17ffffff" }
        RowLayout {
            Layout.fillWidth: true
            CoalButton { text: "☷  Settings"; onClicked: popup.action("settings") }
            Item { Layout.fillWidth: true }
            CoalButton { text: "⏻"; label: "Quit CoalBar"; onClicked: popup.action("quit") }
        }
    }
}
