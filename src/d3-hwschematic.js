import * as d3 from "d3";
import { addMarkers } from "./markers";
import { NodeRendererContainer } from "./nodeRendererContainer";
import { GenericNodeRenderer } from "./node_renderers/generic";
import { renderLinks } from "./linkRenderer";
import { Tooltip } from "./tooltip";

import {
  hyperEdgesToEdges,
  getNet,
  initNodeParents,
  expandPorts,
} from "./dataPrepare";
import { default as d3elk } from "./elk/elk-d3";
import { selectGraphRootByPath } from "./hierarchySelection.js";

function getNameOfEdge(e) {
  let name = "<tspan>unnamed</tspan>";
  if (e.hwMeta) {
    if (typeof e.hwMeta.name === "undefined") {
      let p = e.hwMeta.parent;
      let pIsHyperEdge = typeof p.sources !== "undefined";
      if (pIsHyperEdge && p.hwMeta) {
        name = p.hwMeta.name;
      }
    } else {
      name = e.hwMeta.name;
    }
  }
  return name;
}

function getDetailsOfNode(n) {
  let details = "ID: " + n.id + "&#13;&#10;";
  if (n.hwMeta) {
    if (typeof n.hwMeta.name !== "undefined") {
      details += "Name: " + n.hwMeta.name + "&#13;&#10;";
    }
    if (typeof n.hwMeta.cls !== "undefined") {
      details += "Class: " + n.hwMeta.cls + "&#13;&#10;";
    }
  }
  return details;
}

function getDetailsOfPort(p) {
  let details = "ID: " + p.id + "&#13;&#10;";
  if (p.hwMeta) {
    if (typeof p.hwMeta.fullname !== "undefined") {
      details += "Name: " + p.hwMeta.fullname + "&#13;&#10;";
    }
    if (typeof p.hwMeta.cls !== "undefined") {
      details += "Class: " + p.hwMeta.cls + "&#13;&#10;";
    }
    if (typeof p.hwMeta.sig_name !== "undefined") {
      details += "Signal: " + p.hwMeta.sig_name + "&#13;&#10;";
    }
  }
  return details;
}

function toggleChild(child) {
  let parent = child.hwMeta.parent;

  // Initialize children, _children, edges and _edges arrays if undefined
  parent.children = parent.children || [];
  parent._children = parent._children || [];
  parent.edges = parent.edges || [];
  parent._edges = parent._edges || [];

  let visible = parent.children.includes(child);

  if (visible) {
    // Hide the child
    parent.children = parent.children.filter((c) => c !== child);
    parent._children.push(child);

    // Move edges connected to the child from visible to hidden
    parent.edges = parent.edges.filter((e) => {
      if (e.source === child.id || e.target === child.id) {
        parent._edges.push(e);
        return false;
      }
      return true;
    });

    parent.hwMeta.renderer.prepare(parent);
    return parent;
  } else {
    // Show the child
    parent._children = parent._children.filter((c) => c !== child);
    parent.children.push(child);

    // Move edges connected to the child from hidden to visible
    parent._edges = parent._edges.filter((e) => {
      if (
        (e.source === child.id &&
          (parent.children.some((c) => c.id === e.target) ||
            parent.id === e.target)) ||
        (e.target === child.id &&
          (parent.children.some((c) => c.id === e.source) ||
            parent.id === e.source))
      ) {
        parent.edges.push(e);
        return false;
      }
      return true;
    });

    parent.hwMeta.renderer.prepare(parent);
    return child;
  }
}

function toggleHideChildren(node) {
  let nextFocusTarget;
  if (node.children && node.children.length > 0) {
    // children are visible, will collapse
    // put children to _children
    while (node.children.length > 0) {
      let child = node.children.pop();
      node._children.push(child);
    }
    // put edges to _edges
    while (node.edges.length > 0) {
      let edge = node.edges.pop();
      node._edges.push(edge);
    }
    nextFocusTarget = node.hwMeta.parent;
  } else if (node._children && node._children.length > 0) {
    while (node._children.length > 0) {
      let child = node._children.pop();
      node.children.push(child);
    }
    while (node._edges.length > 0) {
      let edge = node._edges.pop();
      node.edges.push(edge);
    }
    // children are hidden, will expand
    children = node._children;
    nextFocusTarget = node;
  }
  node.hwMeta.renderer.prepare(node);
  return nextFocusTarget;
}

/**
 * HwScheme builds scheme diagrams after bindData(data) is called
 *
 * @param svg: root svg element where scheme will be rendered
 * @attention zoom is not applied it is only used for focusing on objects
 * @note do specify size of svg to have optimal result
 */
export default class HwSchematic {
  constructor(svg) {
    // flag for performance debug
    this._PERF = false;
    // main svg element
    this.svg = svg;
    // default sizes of elements
    this.PORT_PIN_SIZE = [7.55, 13];
    this.PORT_HEIGHT = this.PORT_PIN_SIZE[1] + 1;
    this.PORT_WIDTH = this.PORT_PIN_SIZE[0];
    this.CHAR_HEIGHT = this.PORT_PIN_SIZE[1];
    this.CHAR_WIDTH = this.PORT_PIN_SIZE[0];
    this.NODE_MIDDLE_PORT_SPACING = 50;
    this.MAX_NODE_BODY_TEXT_SIZE = [400, 400];
    // top, right, bottom, left
    this.BODY_TEXT_PADDING = [15, 10, 0, 10];
    svg.classed("d3-hwschematic", true);
    this.defs = svg.append("defs");
    this.root = svg.append("g");
    this.errorText = null;
    this._nodes = null;
    this._edges = null;

    // graph layouter to resolve positions of elements
    this.layouter = new d3elk();
    this.layouter
      .options({
        edgeRouting: "ORTHOGONAL",
      })
      .transformGroup(this.root);

    // shared tooltip object
    this.tooltip = new Tooltip(document.getElementsByTagName("body")[0]);

    // renderer instances responsible for rendering of component nodes
    this.nodeRenderers = new NodeRendererContainer();
    addMarkers(this.defs, this.PORT_PIN_SIZE);
    let rs = this.nodeRenderers;
    rs.registerRenderer(new GenericNodeRenderer(this));
  }

  widthOfText(text) {
    if (text) {
      return text.length * this.CHAR_WIDTH;
    } else {
      return 0;
    }
  }

  removeGraph() {
    this.root.selectAll("*").remove();
  }

  updateGlobalSize() {
    let width = parseInt(this.svg.style("width") || this.svg.attr("width"), 10);
    let height = parseInt(
      this.svg.style("height") || this.svg.attr("height"),
      10
    );

    this.layouter.size([width, height]);
  }

  /**
   * Set bind graph data to graph rendering engine
   *
   * @return promise for this job
   */
  bindData(graph) {
    this.removeGraph();
    // let postCompaction = "layered.compaction.postCompaction.strategy";
    // if (!graph.properties[postCompaction]) {
    //     graph.properties[postCompaction] = "NONE";
    // }
    hyperEdgesToEdges(graph, graph.hwMeta.maxId);
    initNodeParents(graph, null);
    expandPorts(graph);

    if (this._PERF) {
      let t0 = new Date().getTime();
      this.nodeRenderers.prepare(graph);
      let t1 = new Date().getTime();
      console.log("> nodeRenderers.prepare() : " + (t1 - t0) + " ms");
    } else {
      // nodes are ordered, children at the end
      this.nodeRenderers.prepare(graph);
    }
    this.layouter.kgraph(graph);
    return this._draw();
  }
  /*
   * @returns subnode selected by path wrapped in a new root
   * */
  static selectGraphRootByPath(graph, path) {
    return selectGraphRootByPath(graph, path);
  }
  /*
   * Resolve layout and draw a component graph from layout data
   */
  _draw() {
    this.updateGlobalSize();

    let layouter = this.layouter;
    this._nodes = layouter.getNodes().slice(1); // skip root node
    this._edges = layouter.getEdges();
    let t0;
    if (this._PERF) {
      t0 = new Date().getTime();
    }
    let _this = this;
    return layouter.start().then(
      function (g) {
        if (_this._PERF) {
          let t1 = new Date().getTime();
          console.log("> layouter.start() : " + (t1 - t0) + " ms");
          t0 = t1;
        }
        _this._applyLayout(g);
        if (_this._PERF) {
          let t1 = new Date().getTime();
          console.log("> HwSchematic._applyLayout() : " + (t1 - t0) + " ms");
        }
      },
      function (e) {
        // Error while running d3-elkjs layouter
        throw e;
      }
    );
  }

  /**
   * Draw a component graph from layout data
   */
  _applyLayout() {
    let root = this.root;

    let node = root.selectAll(".node").data(this._nodes).enter().append("g");
    this.nodeRenderers.render(root, node);

    let _this = this;

    root.selectAll(".port").on("mouseover", function (ev, d) {
      _this.tooltip.show(ev, getDetailsOfPort(d));
    });
    root.selectAll(".port").on("mouseout", function (ev, d) {
      _this.tooltip.hide();
    });

    root.selectAll("rect").on("mouseover", function (ev, d) {
      _this.tooltip.show(ev, getDetailsOfNode(d));
    });
    root.selectAll("rect").on("mouseout", function (ev, d) {
      _this.tooltip.hide();
    });

    const handleClick = (ev, d) => {
      const selected = d.children || [];
      const unselected = d._children || [];

      if (selected.length > 0) {
        selected.forEach(toggleChild);
      } else if (unselected.length > 0) {
        unselected.forEach(toggleChild);
      }

      _this.removeGraph();
      _this._draw().then(
        () => _this.layouter.zoomToFit(d),
        (e) => {
          throw e;
        }
      );
    };

    const handleContextMenu = (ev, d) => {
      ev.preventDefault();

      const selected = d.children || [];
      const unselected = d._children || [];
      const menu = d3
        .select("body")
        .append("div")
        .attr("class", "context-menu")
        .style("left", `${ev.pageX}px`)
        .style("top", `${ev.pageY}px`);

      const createMenuItem = (prefix, items) => {
        menu
          .append("div")
          .attr("class", "context-menu-item")
          .style("font-weight", "bold")
          .style("font-size", "16px")
          .style("color", "black")
          .text(prefix + " All")
          .on("click", () => {
            items.forEach(toggleChild);
            _this.removeGraph();
            _this._draw().then(
              () => _this.layouter.zoomToFit(d),
              (e) => {
                throw e;
              }
            );
            menu.remove();
          });
        items.forEach((item) => {
            menu
                .append("div")
                .attr("class", "context-menu-item")
                .text(getNameOfEdge(item))
                .on("click", () => {
                toggleChild(item);
                _this.removeGraph();
                _this._draw().then(
                    () => _this.layouter.zoomToFit(d),
                    (e) => {
                    throw e;
                    }
                );
                menu.remove();
                });
            });
      };

      if (selected.length === 0) {
        menu
          .append("div")
          .attr("class", "context-menu-item disabled")
          .text("No children to hide");
      } else {
        createMenuItem("Hide", selected);
      }

      if (unselected.length === 0) {
        menu
          .append("div")
          .attr("class", "context-menu-item disabled")
          .text("No children to show");
      } else {
        createMenuItem("Show", unselected);
      }

      menu.on("mouseleave", () => menu.remove());
    };

    node.on("click", handleClick);
    node.on("contextmenu", handleContextMenu);

    this._applyLayoutLinks();
  }

  _applyLayoutLinks() {
    let _this = this;
    let edges = this._edges;

    let [link, linkWrap, _] = renderLinks(this.root, edges);
    // build netToLink
    let netToLink = {};
    edges.forEach(function (e) {
      netToLink[getNet(e).id] = {
        core: [],
        wrap: [],
      };
    });
    linkWrap._groups.forEach(function (lg) {
      lg.forEach(function (l) {
        let e = d3.select(l).data()[0];
        netToLink[getNet(e).id]["wrap"].push(l);
      });
    });
    link._groups.forEach(function (lg) {
      lg.forEach(function (l) {
        let e = d3.select(l).data()[0];
        netToLink[getNet(e).id]["core"].push(l);
      });
    });

    // set highlingt and tooltip on mouser over over the net
    linkWrap.on("mouseover", function (ev, d) {
      let netWrap = netToLink[getNet(d).id]["wrap"];
      d3.selectAll(netWrap).classed("link-wrap-activated", true);

      _this.tooltip.show(ev, getNameOfEdge(d));
    });
    linkWrap.on("mouseout", function (ev, d) {
      let netWrap = netToLink[getNet(d).id]["wrap"];
      d3.selectAll(netWrap).classed("link-wrap-activated", false);

      _this.tooltip.hide();
    });

    // set link highlight on net click
    function onLinkClick(ev, d) {
      let net = getNet(d);
      let doSelect = (net.selected = !net.selected);
      // propagate click on all nets with same source

      let netCore = netToLink[net.id]["wrap"];
      d3.selectAll(netCore).classed("link-selected", doSelect);
      ev.stopPropagation();
    }

    // Select net on click
    link.on("click", onLinkClick);
    linkWrap.on("click", onLinkClick);
  }

  terminate() {
    if (this.layouter) {
      this.layouter.terminate();
    }
  }

  setErrorText(msg) {
    this.root.selectAll("*").remove();
    let errText = this.errorText;
    if (!errText) {
      errText = this.errorText = this.root
        .append("text")
        .attr("x", "50%")
        .attr("y", "50%")
        .attr("dominant-baseline", "middle")
        .attr("text-anchor", "middle")
        .style("font-size", "34px");
    }
    errText.text(msg);
    let t = d3.zoomTransform(this.root.node());
    t.k = 1;
    t.x = 0;
    t.y = 0;
    this.root.attr("transform", t);
  }
}
