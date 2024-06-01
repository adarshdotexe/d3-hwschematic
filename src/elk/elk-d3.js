import * as d3 from "d3";
import { default as ELK } from "elkjs";
import {
	NO_LAYOUT, toAbsolutePositionsEdges, toAbsolutePositions, cleanLayout, copyElkProps, zoomToFit
} from "./elk-d3-utils.js"


export default class d3elk {
	constructor() {
		// containers
		this.graph = {}; // internal (hierarchical graph)
		this._options = {};
		// dimensions
		this.width = 0;
		this.height = 0;
		this._transformGroup = undefined;

		// the layouter instance
		this.layouter = new ELK({
			algorithms: ['layered'],
			defaultLayoutOptions: {
				'elk.padding': '[left=50, top=50, right=50, bottom=100]',
				'elk.spacing.nodeNode': '75.0',
				'layered.spacing.baseValue' : 200.0,
				'elk.layered.spacing.nodeNodeBetweenLayers': 100.0,
				'algorithm': 'layered',
				'elk.port.side': 'WEST',
				'elk.layered.layering.strategy': 'INTERACTIVE',
				'elk.direction': 'DOWN',
				'elk.aspectRatio': '2',
				'org.eclipse.elk.layered.nodePlacement.favorStraightEdges': 'true',
				'elk.layered.nodePlacement.strategy': 'SIMPLE',
			  },
			workerUrl: '/elk-worker.min.js',
			
		});
	}

	/**
	  * Set or get the available area, the positions of the layouted graph are
	  * currently scaled down.
	  */
	size(size) {
		if (!arguments.length)
			return [this.width, this.height];
		this.width = size[0];
		this.height = size[1];

		if (this.graph != null) {
			this.graph.width = this.width;
			this.graph.height = this.height;
		}
		return this;
	};

	/**
	  * Sets the group used to perform 'zoomToFit'.
	  */
	transformGroup(g) {
		if (!arguments.length)
			return this._transformGroup;
		this._transformGroup = g;
		return this;
	}

	options(opts) {
		if (!arguments.length)
			return this._options;
		this._options = opts;
		return this;
	}

	/**
	  * Start the layout process.
	  */
	start() {
		this._cleanLayout();
		return this.layouter.layout(
			this.graph,
			{ layoutOptions: this._options }
		).then(
			this._applyLayout.bind(this),
			function(e) {
				// Error while running elkjs layouter
				throw e;
			}
		);
	}

	// get currently visible nodes
	getNodes() {
		var queue = [this.graph],
			nodes = [],
			parent;

		// note that svg z-index is document order, literally
		while ((parent = queue.pop()) != null) {
			if (!parent.properties[NO_LAYOUT]) {
				nodes.push(parent);
				(parent.children || []).forEach(function(c) {
					queue.push(c);
				});
			}
		}
		return nodes;
	}


	// get currently visible ports
	getPorts() {

		var ports = d3.merge(this.getNodes().map(function(n) {
			return n.ports || [];
		}));

		return ports;
	}


	// get currently visible edges
	getEdges() {

		var edgesOfChildren = d3.merge(
			this.getNodes()
				.filter(function(n) {
					return n.children;
				})
				.map(function(n) {
					return n.edges || [];
				})
        );

		return edgesOfChildren;
	}

	// bind graph data
	kgraph(root) {
		if (!arguments.length)
			return this.graph;

		var g = this.graph = root;

		if (!g.id)
			g.id = "root";
		if (!g.properties)
			g.properties = { 'algorithm': 'layered' };
		if (!g.properties.algorithm)
			g.properties.algorithm = 'layered';
		if (!g.width)
			g.width = this.width;
		if (!g.height)
			g.height = this.height;

		return this;
	};
	/**
	  * If a top level transform group is specified, we set the scale to value so
  	  * the available space is used to it's maximum.
	  */
	zoomToFit(node) {
		if (!this._transformGroup) {
			return;
		}
		if (node === null) {
			node = this.graph;
		}
		zoomToFit(node, this.width, this.height, this._transformGroup);
	}

	terminate() {
		if (this.layouter)
			this.layouter.terminateWorker();
	}

	/**
     * Clean all layout possitions from nodes, nets and ports
     */
	_cleanLayout(n) {
		if (!arguments.length)
			var n = this.graph;
		cleanLayout(n);
		this._d3ObjMap = {};
		return this;
	}
	/**
	  * Apply layout for the kgraph style. Converts relative positions to
	  * absolute positions.
	  */
	_applyLayout(kgraph) {
		this.zoomToFit(kgraph);
		var nodeMap = {};
		// convert to absolute positions
		toAbsolutePositions(kgraph, { x: 0, y: 0 }, nodeMap);
		toAbsolutePositionsEdges(kgraph, nodeMap);
		copyElkProps(kgraph, this.graph, this._d3ObjMap);
		return this.graph;
	}
};
