import QtQuick

Canvas {
    id: art
    property bool active: false
    property bool animate: false
    property bool reduceTransparency: false
    onReduceTransparencyChanged: requestPaint()
    property real time: 0
    onActiveChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    Timer { interval: 42; running: art.active && art.animate && art.visible; repeat: true; onTriggered: { art.time += 0.042; art.requestPaint() } }
    onPaint: {
        var c = getContext("2d")
        c.reset()
        c.translate(width / 2, height / 2)
        var pulse = active ? 0.75 + Math.sin(time * 2) * 0.15 : 0.12
        function rounded(x,y,w,h,r) {
            c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r)
            c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
            c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r)
            c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath()
        }
        if (active && !reduceTransparency) {
            var glow = c.createRadialGradient(0,25,5,0,25,95)
            glow.addColorStop(0,"#35ff6e30"); glow.addColorStop(1,"#00ff6e30")
            c.fillStyle=glow; c.fillRect(-100,-65,200,145)
            for(var i=0;i<3;i++) {
                c.beginPath()
                for(var step=0;step<=24;step++) {
                    var yy=step*1.8, xx=(i-1)*27+Math.sin(yy/12-time*1.7+i)*4
                    if(step===0)c.moveTo(xx,-10-yy);else c.lineTo(xx,-10-yy)
                }
                var steam=c.createLinearGradient(0,-10,0,-56)
                steam.addColorStop(0,"#65ff6e30");steam.addColorStop(1,"#00ff6e30")
                c.strokeStyle=steam;c.lineWidth=1.3;c.lineCap="round";c.stroke()
            }
        }
        var metal=c.createLinearGradient(0,19,0,51)
        metal.addColorStop(0,"#484848"); metal.addColorStop(1,"#1e1e1e")
        rounded(-79,19,158,32,12);c.fillStyle=metal;c.fill();c.strokeStyle="#24ffffff";c.lineWidth=.7;c.stroke()
        c.beginPath();c.ellipse(-71,10,142,22);c.fillStyle="#b3000000";c.fill()
        for(var cube=0;cube<3;cube++) {
            c.save();c.translate((cube-1)*42,cube===1?-1:5);c.rotate((cube-1)*12*Math.PI/180)
            var coal=c.createLinearGradient(-19,-18,19,19)
            coal.addColorStop(0,active?"#6b2917":"#454545");coal.addColorStop(1,"#1c1c1c")
            rounded(-19,-18,38,37,5);c.fillStyle=coal;c.fill()
            c.strokeStyle="rgba(255,110,48,"+pulse+")";c.lineWidth=1.5;c.stroke()
            c.beginPath();c.moveTo(-15,8);c.lineTo(-1,-2);c.lineTo(5,2);c.lineTo(15,-10);c.moveTo(-1,-2);c.lineTo(-4,-14)
            c.strokeStyle="rgba(255,110,48,"+(pulse*.85)+")";c.lineWidth=1.2;c.stroke();c.restore()
        }
        c.beginPath();c.arc(57,36,2,0,2*Math.PI);c.fillStyle=active?"#ff6e30":"#595959";c.fill()
        c.fillStyle="#99000000";rounded(-59,51,20,4,2);c.fill();rounded(39,51,20,4,2);c.fill()
    }
}
