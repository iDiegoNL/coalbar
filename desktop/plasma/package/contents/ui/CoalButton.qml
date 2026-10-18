import QtQuick

FocusScope {
    id: button
    property string text: ""
    property string label: text
    property color color: "#8e8f91"
    signal clicked()
    implicitWidth: caption.implicitWidth + 8
    implicitHeight: 24
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: label
    Accessible.onPressAction: clicked()
    Keys.onSpacePressed: clicked()
    Keys.onReturnPressed: clicked()
    Rectangle { anchors.fill: parent; radius: 5; color: mouse.containsMouse || button.activeFocus ? "#18ffffff" : "transparent"; border.width: button.activeFocus ? 1 : 0; border.color: "#ff6e30" }
    Text { id: caption; anchors.centerIn: parent; text: button.text; color: button.color; font.family: "Noto Sans"; font.pixelSize: 11 }
    MouseArea { id: mouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: button.clicked() }
}
