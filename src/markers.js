var PORT_MARKERS = {
		"WEST": {
			"INPUT": "#westInPortMarker",
			"OUTPUT": "#westOutPortMarker"},
		"EAST": {
			"INPUT": "#eastInPortMarker",
			"OUTPUT": "#eastOutPortMarker"},
		"NORTH": {
			"INPUT": "#northInPortMarker",
			"OUTPUT": "#northOutPortMarker"},
	    "SOUTH": {
	    	"INPUT": "#southInPortMarker" ,
	    	"OUTPUT": "#southOutPortMarker"},
};

export function addMarkers(defs, PORT_PIN_SIZE) {
    // real size of marker
    var size = 12;
    function addMarker(id, arrowTranslate, arrowRotate=0) {
    	var rightArrow = "M 7 0 L 12 6 L 7 12 Z";
        var trans = "";
    
        if (arrowTranslate[0] !== 0 || arrowTranslate[1] !== 0)
        	trans += "translate(" + arrowTranslate[0] + ", " + arrowTranslate[1] + ")";
    
        if (arrowRotate !== 0)
        	trans += "rotate(" + arrowRotate + ")";
    
        var cont = defs.append("g");
    
        cont
        .attr("id", id)
        .attr("class", "port")
        .append("path")
        .attr("d", rightArrow)
        
        if (trans)
        	cont
            .attr("transform", trans);
    }
    
    var horizYOffset = (PORT_PIN_SIZE[1] - size) * 0.5;
    var horizYOffset2 = (PORT_PIN_SIZE[1] + size) * 0.5;
    
    var vertXOffset = -size * 0.5;
    addMarker("westInPortMarker", [vertXOffset, horizYOffset]);
    addMarker("westOutPortMarker",[ 1 - (2 * vertXOffset), horizYOffset2], 180);
    
    addMarker("eastInPortMarker", [ 1 - (2 * vertXOffset), horizYOffset2], 180);
    addMarker("eastOutPortMarker",[vertXOffset, horizYOffset]);
    
    addMarker("northInPortMarker", [0, 0], 90);
    addMarker("northOutPortMarker",[0, 0], 270);
    
    addMarker("southInPortMarker", [0, 0], 270);
    addMarker("southOutPortMarker",[0, 0], 90);
}

export function getIOMarker(d) {
    // var side = d.side;
    if (d.x < 0 ) {
        var side = "WEST"
    } else {
        var side = "EAST"
    }
    var portType = d.direction;
    var marker = PORT_MARKERS[side][portType];
    if (marker === undefined) {
    	throw new Error("Wrong side, portType", side, portType)
    }
    return marker;
}
