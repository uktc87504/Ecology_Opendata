(function() {

var dateFormat = d3.time.format("%d%m%y");
var dateFormatP = d3.time.format("%d.%m.%Y");
var axisFormat = d3.format("d");
var axisFormatF = d3.format(".1f");
var geoFormatF = d3.format(".3f");
var axisFormatPerc = d3.format("%");
var axisFormatPercF = d3.format(".2%");
var amountFormat = function (d) {
	if (d<3)
		return axisFormatF(d)+" кг.";
	else if (d<1000)
		return axisFormat(d)+" кг.";
	else if (d<1000000)
		return (Math.round(d/100)/10)+" т.";
	else if (d<1000000000)
		return (Math.round(d/100000)/10)+" хил.т.";
	else if (d<1000000000000)
		return (Math.round(d/100000000)/10)+" млн.т.";
}

mNames={'C':'Изчислено','M':'Измерено','E':'Преценено'};
tNames={'air':'Емисии на замърсители във въздуха','water':'Емисии на замърсители във води','soil':'Емисии на замърсители в почвата','waste-water-transfer':'Пренос на замърсители в отпадъчни води','waste-transfer':'Пренос на отпадъци'};
tNamesShort={'air':'Във въздуха','water':'Във води','soil':'В почвата','waste-water-transfer':'Отпадъчни води','waste-transfer':'Отпадъци'};
pNames=null;
fD=null;
cD=null;
leafletC=null; 
hashBlock=false;

if (console) console.log("Loading...");

d3.json("data/reports.json", function (D) {
	fD=D;
	init();
});

d3.json("data/pollutants.json", function (D) {
	sorter = crossfilter.quicksort.by(function(d) {return d.id;});
	pNames=sorter(D,0,D.length);
	init();
});


function init() {
	if (!fD || !pNames)
		return;
		
	if (console) console.log("Parsing...");
	
	cD=new Array();
	fD.features.forEach(function(d,i) {
		d.i=i;
		d.pollutionAir=0;
		d.properties.reports.forEach(function(r,i) {
			if (r.amount==0)
				return;
			cD[cD.length]=r;
			r.facillityI=d.i;
			if (r.type=="air")
				d.pollutionAir+=r.amount;
		});
	});

	var maxsize=Math.pow(d3.max(fD.features,function(d,i) {return d.pollutionAir;}),1/3)/40;
	fD.features.forEach(function(d,i) {
		d.marker = new L.Marker(new L.LatLng(d.geometry.coordinates[0],d.geometry.coordinates[1]),{
	  		title: d.properties.name,
			icon: new L.D3GraphIcon({title:d.properties.name, size:Math.pow(d.pollutionAir,1/3)/maxsize}),
			clickable: true,
	 		draggable: false
		});
		d.marker.bindPopup("<i>Компания:</i> "+d.properties.legalentity+"<br/>"+
			"<i>Площадка:</i> "+d.properties.name+", "+d.properties.city+"<br/>"+
			"<i>Дейност:</i> "+d.properties.mainactivity+"<br/>"+
			"<a href='http://pdbase.government.bg/forms/public_eprtr.jsp?a=2&id="+d.properties.id+"&year=2012' target='_blank'>Подробни данни</a>");
		d.marker.data=d;
	});

	if (console) console.log("Building...");

	var xf = crossfilter(cD);

// Chart 0

	var facilities = xf.dimension(function(d) { return d.facillityI; });
	var facilitiesGroup = facilities.group().reduce(
		function (p, v) {
			if (!p.indeses[v.facillityI] || p.indeses[v.facillityI]==0) {
				p.markers[p.markers.length]=fD.features[v.facillityI].marker;
				p.indeses[v.facillityI]=1;
			} else
				p.indeses[v.facillityI]++;
			return p;
		},
		function (p, v) {
			if (p.indeses[v.facillityI] && p.indeses[v.facillityI]>0 ) {
				p.indeses[v.facillityI]--;
				if (p.indeses[v.facillityI]==0) {
					var i = p.markers.indexOf(fD.features[v.facillityI].marker);
					if (i!=-1)
						p.markers.splice(i,1);
				}
			}
			return p;
		},
		function () {
		  return {markers:[], indeses:[]};
		});
	leafletC = dc.leafletChart()
		.dimension(facilities) 
		.group(facilitiesGroup);

// Chart 1

	var byYears = xf.dimension(function(d) { return d.year; });
    	var byYearsGroup = byYears.group().reduceSum(function(d) { return Math.round(d.amount); });
	dc.lineChart("#chart-byYear")
		.width(400)
		.height(200)
		.margins({top: 10, right: 20, bottom: 20, left: 60})
		.dimension(byYears)
		.group(byYearsGroup)
		.x(d3.scale.linear().domain([2007,2012]))
		.xAxis(d3.svg.axis().tickValues([2007,2008,2009,2010,2011,2012]).tickFormat(axisFormat))
		.yAxis(d3.svg.axis().tickFormat(amountFormat))
		.yAxisPadding("10%")
		.renderHorizontalGridLines(true)
		.elasticY(true)
		.title(function(d) { return "Емисии и пренос на замърсители през "+d.data.key+": "+amountFormat(d.data.value); })
		.renderTitle(true)
		.brushOn(false);

// Chart 2

	var byPollutant = xf.dimension(function(d) { return d.pollutantid+"_"+d.type; });
    	var byPollutantGroup = byPollutant.group().reduce(
		function (p, v) {
			p.amount+=v.amount;
			p.years[v.year-2007]+=v.amount;
			if (v.measure_type=="M") p.measured+=v.amount;
			if (v.measure_type=="C") p.calculated+=v.amount;
			return p;
		},
		function (p, v) {
			p.amount-=v.amount;
			p.years[v.year-2007]-=v.amount;
			if (v.measure_type=="M") p.measured-=v.amount;
			if (v.measure_type=="C") p.calculated-=v.amount;
			return p;
		},
		function () {
		  return {amount:0, measured:0, calculated:0, years:[0,0,0,0,0,0]};
		});
        dc.dataGroupedTable("#chart-pollutants")
            .dimension(byPollutant)
            .group(byPollutantGroup)
	    .nestedGroup(function(d) {
                return tNames[d.key.split("_")[1]];
            })
            .size(Infinity)
            .columns([
                function(d) { return amountFormat(d.value.amount); },
                function(d) { return pNames[+(d.key.split("_")[0])-1].name; },
                function(d) {
			var countY=0;
			for (i=0;i<5;i++) 
				if (d.value.years[i]>0) countY++;
			var amount12=d.value.years[5];
			if (countY==0 || (d.value.amount-amount12)==0) 
				return d.value.amount12==0 ? "<span style='color:gray'>=</span>" : "<span style='color:red'>↗</span>";
			var average=(d.value.amount-amount12)/countY;
			var change=amount12/average-1;
			return (change>-0.05 && change<0.05) ? "<span style='color:gray'>=</span>" : 
				(change>0 ? "<span style='color:red'>↗</span>" : "<span style='color:green'>↘</span>");
		}
            ])
            .titles([
                false,
                function(d) { 
			var res=[];
			var vM = d.value.measured/d.value.amount;
			var vC = d.value.calculated/d.value.amount;
			var vE = 1-(d.value.measured+d.value.calculated)/d.value.amount;
			if (vM>0.01) res.push(axisFormatPerc(vM)+" - измервания");
			if (vC>0.01) res.push(axisFormatPerc(vC)+" - изчисления");
			if (vE>0.01) res.push(axisFormatPerc(vE)+" - преценка");
			return "Количеството замърсител се базира на: "+res.join("; ");
		},
                function(d) {
			var countY=0;
			for (i=0;i<5;i++) 
				if (d.value.years[i]>0) countY++;
			var amount12=d.value.years[5];
			if (countY==0 || (d.value.amount-amount12)==0) return "Няма емисии преди 2012.";
			var average=(d.value.amount-amount12)/countY;
			var change=amount12/average-1;
			if (change==-1) return "Пълно спиране на емисиите";
			return (change>0?"Покачване":"Понижение")+" през 2012 с "+axisFormatPercF(Math.abs(change))+" спрямо предходните 5 години.";
		}
            ])
            .sortBy(function(d){ return d.value.amount; })
            .order(d3.ascending);

// Chart 3

	var byPolluter = xf.dimension(function(d) { return fD.features[d.facillityI].properties.legalentity; });
    	var byPolluterGroup = byPolluter.group().reduce(
		function (p, v) {
			p.amount+=v.amount;
			p.years[v.year-2007]+=v.amount;
			return p;
		},
		function (p, v) {
			p.amount-=v.amount;
			p.years[v.year-2007]-=v.amount;
			return p;
		},
		function () {
		  return {amount:0, years:[0,0,0,0,0,0]};
		});
	dc.dataGroupedTable("#chart-polluters")
            .dimension(byPolluter)
            .group(byPolluterGroup)
            .size(10)
            .columns([
                function(d) { return amountFormat(d.value.amount); },
                function(d) { return d.key; },
                function(d) {
			var countY=0;
			for (i=0;i<5;i++) 
				if (d.value.years[i]>0) countY++;
			var amount12=d.value.years[5];
			if (countY==0 || (d.value.amount-amount12)==0) 
				return d.value.amount12==0 ? "<span style='color:gray'>=</span>" : "<span style='color:red'>↗</span>";
			var average=(d.value.amount-amount12)/countY;
			var change=amount12/average-1;
			return (change>-0.08 && change<0.08) ? "<span style='color:gray'>=</span>" : 
				(change>0 ? "<span style='color:red'>↗</span>" : "<span style='color:green'>↘</span>");
		}
            ])
            .titles([
                false,
		false,
                function(d) {
			var countY=0;
			for (i=0;i<5;i++) 
				if (d.value.years[i]>0) countY++;
			var amount12=d.value.years[5];
			if (countY==0 || (d.value.amount-amount12)==0) return "Няма емисии през предишните 5 години.";
			var average=(d.value.amount-amount12)/countY;
			var change=amount12/average-1;
			if (change==-1) return "Пълно спиране на емисиите";
			return (change>0?"Покачване":"Понижение")+" от "+axisFormatPercF(change)+" през 2012 спрямо предишните 5 години.";
		}
            ])
            .sortBy(function(d){ return d.value.amount; })
            .order(d3.ascending);

// Chart 4

	var byMeasurement = xf.dimension(function(d) { return d.measure_type; });
    	var byMeasurementGroup = byMeasurement.group().reduceSum(function (d) { return Math.round(d.amount)});
        dc.pieChart("#chart-measurement")
            .dimension(byMeasurement)
            .group(byMeasurementGroup)
            .width(220)
	    .height(200)
	    .label(function(d) { return mNames[d.data.key]; })
	    .renderLabel(true)
	    .title(function(d) { return mNames[d.data.key]+" количество замърсители: "+amountFormat(d.data.value); })
	    .renderTitle(true);

// Chart 5

	var byType = xf.dimension(function(d) { return d.type; });
    	var byTypeGroup = byType.group().reduce(
		function (p, v) {
			if (!p.facillities[v.facillityI]) {
				p.facillities[v.facillityI]=0;
				p.count++;
			}
			p.facillities[v.facillityI]+=v.amount;
			return p;
		},
		function (p, v) {
			if (p.facillities[v.facillityI]) {
				p.facillities[v.facillityI]-=v.amount;
				if (p.facillities[v.facillityI]<=0) {
					p.facillities[v.facillityI]=0;
					p.count--;
				}
			}
			return p;
		},
		function () {
		  return {count:0, facillities:[]};
		});

        dc.pieChart("#chart-type")
            .dimension(byType)
            .group(byTypeGroup)
            .width(200)
	    .height(200)
	    .valueAccessor(function(d) { return d.value.count; })
	    .label(function(d) { return tNamesShort[d.data.key]; })
	    .renderLabel(true)
	    .title(function(d) { return tNames[d.data.key]+": "+d.data.value.count+" замърсяващи предприятия"; })
	    .renderTitle(true);


	if (console) console.log("Rendering...");
	dc.renderAll();

	if (console) console.log("Filtering...");
	filter(window.location.hash);

	if (console) console.log("Start filter hashing...");
	dc.chartRegistry.list().forEach(function(d, i) { d.on("filtered", hashFilters); });

	if (console) console.log("Done. Go play.");
};

window.quickfilter0Reset = function() {
	dc.chartRegistry.list()[0].filterAll(); 
	dc.redrawAll();
}

window.quickfilter0City = function(coords) {
	dc.chartRegistry.list()[0].filter(coords); 
	dc.redrawAll();
}

window.quickfilter2Reset = function() {
	dc.chartRegistry.list()[2].filterAll(); 
	dc.redrawAll();
}

window.quickfilter2NoCO2 = function() {
	dc.chartRegistry.list()[2].exclusiveFilter(["20_air","33_air"]);
	dc.redrawAll();
}

window.quickfilter2CO2 = function() {
	dc.chartRegistry.list()[2].batchFilter(["20_air","33_air"]);
	dc.redrawAll();
}

window.quickfilter3Reset = function() {
	dc.chartRegistry.list()[3].filterAll();
	dc.redrawAll();
}


window.reset = function() {
	filter();
};

var hashFilters = function(chart, filter) {
	if (hashBlock) return;
	window.location.hash=encodeFiltersURL(getFilters());
	var langL = document.getElementById("lang_link").href;
	if (langL.indexOf("#")!=-1)
		langL=langL.substring(0,langL.indexOf("#"));
	document.getElementById("lang_link").href=langL+window.location.hash;
}

var getFilters = function() {
	var filters=[];
	dc.chartRegistry.list().forEach(function(d, i) { 
		filters[i]=d.filters().slice(0); 
		if (d.batchFilter) {
			var allEntries = d.dimension().group().top(Infinity);
			if (allEntries.length/2-2<filters[i].length) {
				filters[i]=["excl"];
				allEntries.forEach(function(e) {
					if (d.filters().indexOf(e.key)==-1)
						filters[i].push(e.key);
				});
			}
		}
		if (i==3)
			for (k=0;k<filters[i].length;k++)
			if ("excl"!=filters[i][k])
			for (j=0;j<fD.features.length;j++)
			if (fD.features[j].properties.legalentity==filters[i][k]) {
				filters[i][k]=fD.features[j].properties.id;
				break;
			}
	});
	return filters;
};

window.encodeFiltersURL = function(filters) {
	filters.forEach(function(f, i) {
		if (!f || f.length==0)
			filters[i]='';
		else if (f[0] instanceof L.LatLngBounds)
			filters[i]=geoFormatF(f[0].getSouth())+","+geoFormatF(f[0].getWest())+","+geoFormatF(f[0].getNorth())+","+geoFormatF(f[0].getEast());
		else  
			filters[i]=f.join(",");
	});
	var f = filters.join("&").replace(/&+$/,"");
	if (f=="") f="&";
	return f;
};

window.decodeFiltersURL = function(hash) {
	if (hash==null || hash=="" || hash=="#" || hash=="#&")
		return null;
	if (hash[0]=="#")
		hash=hash.substr(1);
	hash=hash.split("&");
	var filters = [];
	hash.forEach(function(h, i) {
		if (h=="")
			filters[i]=null;
		else if (i==0)
			filters[i]=[h.split(",")];
		else 
			filters[i]=h.split(",");
	});
	return filters;
};

window.filter = function(filters) {
	if (filters!=null && typeof filters =='string')
		filters = decodeFiltersURL(decodeURIComponent(filters));
	hashBlock=true;
	if (filters==null)
		dc.filterAll();
	else {
		dc.filterAll();
		dc.chartRegistry.list().forEach(function(d, i) { 
			if (i<filters.length) {
				if (filters[i] instanceof Array) {
					if (i==3)
						for (k=0;k<filters[i].length;k++)
						for (j=0;j<fD.features.length;j++)
						if (fD.features[j].properties.id==filters[i][k]) {
							filters[i][k]=fD.features[j].properties.legalentity;
							break;
						}

					if (d.batchFilter) {
						if (filters[i][0]=="excl")
							d.exclusiveFilter(filters[i].slice(1));
						else
							d.batchFilter(filters[i])
					} else {
						var lastFilter=filters[i].pop();
						var allFilters = d.filters();
						allFilters.splice(d.filters()).push.apply(allFilters,filters[i]);
						d.filter(lastFilter); 
					}
				} else
					d.filter(filters[i]); 
			} else
				d.filter(null); 
		});
	}
	hashBlock=false;
	hashFilters();
	dc.redrawAll();
};

})();
