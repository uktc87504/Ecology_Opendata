(function() {

var dateFormat = d3.time.format("%d%m%y");
var dateFormatP = d3.time.format("%d.%m.%Y");
var axisFormat = d3.format("d");
var axisFormatF = d3.format(".1f");
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
filterBlock=true;

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
		
	if (console) console.log("Loaded");
	
	cD=new Array();
	fD.features.forEach(function(d,i) {
		d.i=i;
		d.pollutionAir=0;
		d.properties.reports.forEach(function(r,i) {
			if (r.amount==0)
				return;
			cD[cD.length]=r;
			r.facillityI=d.i;
			if (r.type="air")
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
		d.marker.bindPopup(d.properties.name+", "+d.properties.city+"<br/>"+
			"<i>"+d.properties.mainactivity+"</i><br/>"+
			"<a href='http://pdbase.government.bg/forms/public_eprtr.jsp?a=2&id="+d.properties.id+"&year=2012' target='_blank'>Подробни данни</a>");
		d.marker.data=d;
	});

	if (console) console.log(fD);

	if (console) console.log("Parsed");

	var xf = crossfilter(cD);

// Chart 1

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

// Chart 2

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

// Chart 3

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
			return (change>0?"Покачване":"Понижение")+" от "+axisFormatPercF(change)+" през 2012 спрямо предходните 5 години.";
		}
            ])
            .sortBy(function(d){ return d.value.amount; })
            .order(d3.ascending);

// Chart 4

	var byPolluter = xf.dimension(function(d) { return d.facillityI; });
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
                function(d) { return fD.features[d.key].properties.name; },
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

// Chart 5

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

// Chart 6

	var byType = xf.dimension(function(d) { return d.type; });
    	var byTypeGroup = byType.group().reduce(
		function (p, v) {
			if (p.facillities.indexOf(v.facillityI)==-1)
				p.facillities.push(v.facillityI);
			return p;
		},
		function (p, v) {
			if (p.facillities.indexOf(v.facillityI)!=-1)
				p.facillities.splice(p.facillities.indexOf(v.facillityI), 1);
			return p;
		},
		function () {
		  return {facillities:[]};
		});

        dc.pieChart("#chart-type")
            .dimension(byType)
            .group(byTypeGroup)
            .width(200)
	    .height(200)
	    .valueAccessor(function(d) { return d.value.facillities.length; })
	    .label(function(d) { return tNamesShort[d.data.key]; })
	    .renderLabel(true)
	    .title(function(d) { return tNames[d.data.key]+": "+d.data.value.facillities.length+" замърсяващи предприятия"; })
	    .renderTitle(true);

	if (console) console.log("Rendering...");
	dc.renderAll();

	if (console) console.log("Filtering...");
//	filterBlock=false;
//	filter(decodeFiltersURL(decodeURIComponent(window.location.hash)), true);
};

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

var hashFilters = function() {
	window.location.hash=encodeFiltersURL(getFilters());
	var langL = document.getElementById("lang_link").href;
	if (langL.indexOf("#")!=-1)
		langL=langL.substring(0,langL.indexOf("#"));
	document.getElementById("lang_link").href=langL+window.location.hash;
}

var getFilters = function() {
	var filters=[];
	dc.chartRegistry.list().forEach(function(d, i) { filters[i]=d.filter(); });
	return filters;
};

window.encodeFiltersURL = function(filters) {
	filters.forEach(function(f, i) {
		if (f==null || f==false)
			filters[i]='';
		else if (f instanceof Array || f instanceof Object) {
			if (f[0] instanceof Date && f[1] instanceof Date)
				filters[i]="d"+Math.round(f[0].getTime()/86400000)+"_"+Math.round(f[1].getTime()/86400000);
			else if (!isNaN(parseFloat(f[0])) && !isNaN(parseFloat(f[1])))
				filters[i]=Math.round(parseFloat(f[0])*100)/100+"_"+Math.round(parseFloat(f[1])*100)/100;
		} else if (!isNaN(parseFloat(f)))
			filters[i]=Math.round(parseFloat(f)*100)/100;
		else
			filters[i]=(""+f).replace(/\_/g,"\\_");
	});
	var f = filters.join("|");
	if (f.replace(/\|/g,"")=="")
		f="|";
	return f;
};

window.decodeFiltersURL = function(hash) {
	if (hash==null || hash=="" || hash=="#")
		return null;
	if (hash[0]=="#")
		hash=hash.substr(1);
	hash=hash.split("|");
	var filters = [];
	hash.forEach(function(h, i) {
		if (h=="")
			filters[i]=null;
		else if (h.indexOf("_")!=-1 && h.indexOf("\\_")==-1) {
			h=h.split("_");
			if (h[0][0]=="d") {
				filters[i]=[new Date((parseInt(h[0].substr(1)))*86400000), new Date((parseInt(h[1]))*86400000) ];
				filters[i][0].setHours(0); filters[i][1].setHours(0);
			}
			else if (!isNaN(parseFloat(h[0])))
				filters[i]=[parseFloat(h[0]), parseFloat(h[1])];
		} else if (!isNaN(parseFloat(h)))
			filters[i]=parseFloat(h);
		else 
			filters[i]=(""+h).replace(/\\\_/g,"_");
	});
	return filters;
};

window.filter = function(filters,nohash) {
	var relocatemap=true;
	if (filters==null)
		dc.filterAll();
	else
		dc.chartRegistry.list().forEach(function(d, i) { 
			if (i<filters.length) 
				d.filter(filters[i]); 
			else
				d.filter(null); 
			if (i==4 && filters[i]!=null && filters[i]!=false && cD[filters[i]]) {
				leafletC.getMap().setView(cD[filters[i]].marker.getLatLng(),10); 
				cD[filters[i]].marker.popup.openOn(leafletC.getMap());
				relocatemap=false;
			}
		});
	if (!nohash)
		hashFilters();
	dc.redrawAll();
	if (relocatemap) {
		leafletC.getMap().closePopup();
		leafletC.getMap().setView([42.69,25.15], 7);
	}
};

})();
