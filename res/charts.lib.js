dc.dataGroupedTable = function(parent, chartGroup) {
    var LABEL_CSS_CLASS = "dc-table-label";
    var ROW_CSS_CLASS = "dc-table-row";
    var COLUMN_CSS_CLASS = "dc-table-column";
    var GROUP_CSS_CLASS = "dc-table-group";
    var SELECT_CSS_CLASS = "dc-table-select";

    var _chart = dc.baseChart({});

    var _size = 25;
    var _columns = [];
    var _titles = [];
    var _sortBy = function(d) {
        return d;
    };
    var _order = d3.ascending;
    var _sort;
    var _nestedGroup;

    _chart.doRender = function() {
	_chart.selectAll("tbody").remove();
	renderRows(renderGroups());

        return _chart;
    };

    function renderGroups() {
        var groups = _chart.root().selectAll("tbody")
            .data(nestEntries(), function(d) {
                return _chart.keyAccessor()(d);
            });

        var rowGroup = groups
            .enter()
            .append("tbody");

	if (_chart.nestedGroup())
        rowGroup
            .append("tr")
            .attr("class", GROUP_CSS_CLASS)
                .append("td")
                .attr("class", LABEL_CSS_CLASS)
                .attr("colspan", _columns.length)
                .html(function(d) {
                    return _chart.keyAccessor()(d);
                })
		.on("click", innerFilter);

        groups.exit().remove();

        return rowGroup;
    }

    function nestEntries() {
        if (!_sort)
            _sort = crossfilter.quicksort.by(_sortBy);

        var entriesAll = _chart.group().top(Infinity);
	entriesAll=entriesAll.filter(_sortBy);
	entriesAll=_sort(entriesAll, 0, entriesAll.length);
	entriesAll.reverse();
	var entries = entriesAll;

	if (_size!=Infinity) {
		entries = entriesAll.slice(0,_size);
		if (_chart.filters().length>0) 
			_chart.filters().forEach(function(d) {
				for (i=0;i<entries.length;i++)
					if (entries[i].key==d)
						return;
				for (i=0;i<entriesAll.length;i++)
					if (entriesAll[i].key==d) {
						entries.push(entriesAll[i]);
						return;
					}
			});
	}
		

	return d3.nest()
            .key(_chart.nestedGroup()?_chart.nestedGroup():function() {return false;})
            .sortKeys(_order)
            .entries(entries);
	}

    function renderRows(groups) {

        var rows = groups.order()
            .selectAll("tr." + ROW_CSS_CLASS)
            .data(function(d) {
		return d.values;
            });

        var rowEnter = rows.enter()
            .append("tr")
            .attr("class", ROW_CSS_CLASS);
	rowEnter.each(function(d) {d3.select(this).classed(SELECT_CSS_CLASS,_chart.hasFilter(d.key))});

        for (var i = 0; i < _columns.length; ++i) {
            var f = _columns[i];
            var t = _titles && _titles[i] ? _titles[i] : function() {};
            rowEnter.append("td")
		.attr("class", COLUMN_CSS_CLASS + " _" + i)
		.attr("title", t)
		.html(f)
		.on("mouseover", function() {
			d3.select(this.parentNode).classed(SELECT_CSS_CLASS,true);
		})
		.on("mouseout", function(d) {
			d3.select(this.parentNode).classed(SELECT_CSS_CLASS,_chart.hasFilter(d.key));
		})
		.on("click", innerFilter);
        }

        rows.exit().remove();

        return rows;
    }

    function innerFilter(sel) {
	var newsel;
	if (sel.values && sel.values instanceof Array) {
		newsel=[];
		sel.values.forEach(function(d) {
			newsel.push(d.key);
		});
	} else {
		newsel=sel.key;
	}
 	_chart.batchFilter(newsel);	

	dc.redrawAll();
    }
 
    _chart.batchFilter = function(_) {
	if (!arguments.length) return _chart.filter();

	if (_ instanceof Array) {
		var unselected=[];
		_.forEach(function(d) {
			if (!_chart.hasFilter(d))
				unselected.push(d);
		});
		if (unselected.length==0) {
			_chart.filter(null);
		} else {
			var last=unselected.pop();
			var _filters=_chart.filters();
			if (unselected.length>0)
				_filters.push.apply(_filters,unselected);
			_chart.filter(last);
		}
	} else {
		_chart.filter(_);
	}

	return _chart;
    }

    _chart.exclusiveFilter = function(_) {
	if (!arguments.length) return _chart.filter();
	
	if (!(_ instanceof Array))
		_=[_];
	var all = _chart.group().top(Infinity);
	var newfilter=[];
	all.forEach(function(d) { 
		if (_.indexOf(d.key)==-1) 
			newfilter.push(d.key); 
	});
	_chart.batchFilter(newfilter);
		
	return _chart;
    }

    _chart.nestedGroup = function(_) {
	if (!arguments.length) return _nestedGroup;
        _nestedGroup = _;
        return _chart;
    };

    _chart.doRedraw = function() {
        return _chart.doRender();
    };

    _chart.size = function(s) {
        if (!arguments.length) return _size;
        _size = s;
        return _chart;
    };

    _chart.columns = function(_) {
        if (!arguments.length) return _columns;
        _columns = _;
        return _chart;
    };

    _chart.titles = function(_) {
        if (!arguments.length) return _titles;
        _titles = _;
        return _chart;
    };

    _chart.sortBy = function(_) {
        if (!arguments.length) return _sortBy;
        _sortBy = _;
        return _chart;
    };

    _chart.order = function(_) {
        if (!arguments.length) return _order;
        _order = _;
        return _chart;
    };

    return _chart.anchor(parent, chartGroup);
};

dc.leafletChart = function(parent, chartGroup) {
    var _chart = dc.baseChart({});
    var _filter;
    var _map;
    var _mc; 
    var _blockpopup=false;
    var _redrawblock=false;
    var _defaultCenter=[42.69,25.42];
    var _defaultZoom=7;

    var _oldBounds=false;

    _chart.doRender = function() {
	_map = L.map('chart-map',{zoomAnimation:false, maxBounds:[[40,19],[46,32]]}).setView(_defaultCenter, _defaultZoom);

	setSafeTileLayer(_map, {style:998, minZoom:7, maxZoom:14} );

	_map.on('zoomstart movestart', _saveBounds, this );
	_map.on('zoomend moveend', _zoomFilter, this );

        return _chart.doRedraw();
    };

    _chart.doRedraw = function(){
	if (_redrawblock)
		return;
	var markersList=[];
	
	_map.closePopup();
	if (_mc) {
		_mc.eachLayer(function(l) {
			l.options.icon.setMap(false);
		});
		_mc.clearLayers();
	
		_map.removeLayer(_mc);
	}
	_chart.group().all().forEach(function(v,i) {
		markersList=markersList.concat(v.value.markers);
	});

	_mc = L.layerGroup(markersList);
	_mc.eachLayer(function(l) {
		l.options.icon.setMap(_map);
	});
	_map.addLayer(_mc);

        return _chart;
    };

    _saveBounds = function(e) {
	if (e.type=="moveend" && e.hard)
		return;
	_oldBounds=_map.getBounds();
    }

    _zoomFilter = function(e) {
	if (e.type=="moveend" && e.hard)
		return;

	if (_map.getCenter().equals(_defaultCenter) && _map.getZoom()==_defaultZoom)
		_filter=null;
	else
		_filter = _map.getBounds();
	if (!_filter)
		_chart.dimension().filterAll();
	else
		_chart.dimension().filterFunction(function(d) {
			return _filter.contains(fD.features[d].marker.getLatLng());
		});
	if (_chart.dimension().top(1).length==0) {
		if (_oldBounds)
			_map.fitBounds(_oldBounds);
		else
			_map.setView(_defaultCenter, _defaultZoom);
		_oldBounds=false;
		return;
	}
	_chart._invokeFilteredListener(_filter);
	_redrawblock=true;
	dc.redrawAll();
	_redrawblock=false;
	_oldBounds=false;
    }

    _chart.filter = function(_) {
	if (!arguments.length) return _filter; 

	if (_) {
		if (!(_ instanceof L.LatLngBounds)) {
			var l;
			if (typeof _ == 'string')
				l=_.split(",");
			else if (_ instanceof Array && _.length==2)
				l=[_[0][0],_[0][1],_[1][0],_[1][1]];
			else
				l=_;

			_=new L.LatLngBounds(new L.LatLng(+l[0],+l[1]),new L.LatLng(+l[2],+l[3]));
		}
		_map.fitBounds(_);
	} else {
		_filter=null;
		_map.setView(_defaultCenter, _defaultZoom);
		_map.closePopup();
	}

        return _chart;
    };

    _chart.filters = function () {
        return [_filter];
    };

    _chart.getMap = function() {
	return _map;
    }

    _chart.blockpopup = function(_) {
	_blockpopup=  _==null;
    }

    return _chart.anchor(parent, chartGroup);
};


L.D3GraphIcon = L.Icon.extend({
	options: {
	},

	size:0,
	title: "",
	zoom:7,
	map:false,

	_div:null,
	simpleO: null,
	_width:0,

	initialize: function (options) {
		this.size=options["size"];
		this.title=options["title"];		
	},

	setMap: function(map) {
		if (!map) 
			this.map=false;
		else if (!this.map) {
			this.map=map;
			map.on('zoomend', this._changeZoom, this );
			this._changeZoom();			
		}
	},

	createIcon: function () {
		this._div = document.createElement('div');
		this._div.title = this.title;
		this._updateGraph();
		return this._div;
	},
	createShadow: function () {
		return null;
	},

	_changeZoom: function() {
		if (!this.map || !this._div) return;
		this.zoom=this.map.getZoom();
		this._updateGraph();
	},

	_updateGraph: function () {
		if (this.zoom<10) {
			var radius=this.size*Math.pow(2,this.zoom-7);
			var width=radius*2+6;
			if (width<10) width=10;
			this._width=width;

			if (this._div.childNodes.length>0)
				this._div.removeChild(this._div.childNodes[0]);
			this._div.className = 'leaflet-marker-icon';
			this._div.style.marginLeft=(-width/2)+"px";
			this._div.style.marginTop=(-width/2)+"px";

			var svgSimple = d3.select(this._div).append("svg")
			svgSimple.attr("width", width)
				.attr("height", width)
				.append("g")
				.attr("transform", "translate(" + width / 2 + "," + width / 2 + ")");
			if (radius>7)
				svgSimple.select("g").append("circle")
					.attr("r", radius)
					.style("fill", "#ff8c00")
					.style("opacity", ".6");
			svgSimple.select("g").append("circle")
				.attr("r", 5)
				.style("fill", "#6f3d00")
				.style("opacity", ".5");
		} else {
			if (this._div.childNodes.length>0 && this._div.childNodes[0].nodeName=="svg")
				this._div.removeChild(this._div.childNodes[0]);
			this._div.className = 'leaflet-marker-icon industry-icon';
			this._div.style.marginLeft=null;
			this._div.style.marginTop=null;
		}
	}

});
