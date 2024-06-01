import {section2svgPath} from "./elk/elk-d3-utils.js";
import * as d3 from "d3";

function numberToColor(num) {
    // Use the BKDRHash function for even distribution
    let hash = 0;
    const str = num.toString();
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 131 + str.charCodeAt(i)) % 359; // Keep hash within valid hue range
    }

    // Calculate hue, saturation, and lightness based on the hash
    const hue = hash;
    const saturation = 70 + (hash % 30); // Keep saturation between 70% and 99%
    const lightness = 40 + (hash % 20); // Keep lightness between 40% and 59%

    // Return the HSL color string
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function renderLinks(root, edges) {
    let junctionPoints = [];

    let link = root.selectAll(".link")
        .data(edges)
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("style", function (d) {
            let sourceColor = numberToColor(d.source);
            let targetColor = numberToColor(d.target);
            let edgeColor = d3.interpolateRgb(sourceColor, targetColor)(0.5);
            return "stroke: " + edgeColor + ";";
        })
        .attr("d", function(d) {
            if (!d.sections) {
                d._svgPath = "";
                return "";
            }
            if (d.bendpoints || d.sections.length > 1) {
                throw new Error("NotImplemented");
            }
            if(d.junctionPoints)
                d.junctionPoints.forEach(function (jp) {
                    junctionPoints.push(jp);
                });
            d._svgPath = section2svgPath(d.sections[0]);
            return d._svgPath;
        });

    let linkWrap = root.selectAll(".link-wrap")
        .data(edges)
        .enter()
        .append("path")
        .attr("style", function (d) {
            let sourceColor = numberToColor(d.source);
            let targetColor = numberToColor(d.target);
            let edgeColor = d3.interpolateRgb(sourceColor, targetColor)(0.5);
            return "stroke: " + edgeColor + ";";
        })
        .attr("class", function (d) {
            let cssClass;
            if (d.hwMeta.parent) {
                cssClass = d.hwMeta.parent.hwMeta.cssClass;
            } else {
                cssClass = d.hwMeta.cssClass
            }
            if (typeof cssClass !== 'undefined') {
                return "link-wrap " + cssClass;
            } else {
                return "link-wrap";
            }
        })
        .attr("style", function (d) {
            if (d.hwMeta.parent) {
                return d.hwMeta.parent.hwMeta.cssStyle;
            } else {
                return d.hwMeta.cssStyle
            }
        })
        .attr("d", function(d) {
            return d._svgPath;
        });

    let junctionPoint = root.selectAll(".junction-point")
      .data(junctionPoints)
      .enter()
      .append("circle")
      .attr("r", "3")
      .attr("cx", function(d) {
          return d.x;
      })
      .attr("cy", function(d) {
          return d.y;
      })
      .attr("class", "junction-point");

    return [link, linkWrap, junctionPoint];
}