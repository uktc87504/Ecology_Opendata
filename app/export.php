<?php


$link = mysqli_connect('localhost', 'username', 'password', "database") or die("0");
$link->set_charset("utf8");


$data=array("type"=>"FeatureCollection", 
	"features"=>array());

$res = $link->query("SELECT f.id, name, address, city, postcode, geoloc, mainactivity, legalentity, group_concat(a.code order by a.code separator ',') activity FROM facility f left outer join facility_activity a on f.id=a.facilityid group by f.id order by f.id") or die("\n\nError accessing DB: ". $link->error);
while ($row = $res->fetch_array(MYSQLI_ASSOC)) {
	$geoloc=explode(",",$row["geoloc"]);
	unset($row["geoloc"]);
	$row["activity"]=explode(",",$row["activity"]);
	$row["id"]=intval($row["id"]);
	$data["features"][]=array(
		"type" => "Feature",
		"geometry" => array("type" => "Point", "coordinates" => $geoloc),
		"properties" => $row);	
}
$res->free();

for ($i=0;$i<count($data["features"]);$i++) {
	$id=$data["features"][$i]["properties"]["id"];
	$data["features"][$i]["properties"]["reports"]=array();
	$res = $link->query("SELECT pollutantid, year, type, amount, measure_type, measure_method from reports where facilityid=$id") or die("\n\nError accessing DB: ". $link->error);
	while ($row = $res->fetch_array(MYSQLI_ASSOC)) {
		$row["pollutantid"]=intval($row["pollutantid"]);
		$row["year"]=intval($row["year"]);
		$row["amount"]=intval($row["amount"]);
		if (!$row["measure_method"])
			unset($row["measure_method"]);
		$data["features"][$i]["properties"]["reports"][]=$row;
	}
	$res->free();	
}

$pollutants = array();
$res = $link->query("SELECT * from pollutant order by id") or die("\n\nError accessing DB: ". $link->error);
while ($row = $res->fetch_array(MYSQLI_ASSOC)) {
	$row["id"]=intval($row["id"]);
	$pollutants[]=$row;	
}
$res->free();

$activities = array();
$res = $link->query("SELECT * from activity order by code") or die("\n\nError accessing DB: ". $link->error);
while ($row = $res->fetch_array(MYSQLI_ASSOC)) {
	$activities[]=$row;	
}
$res->free();

//write

function replace_unicode_escape_sequence($match) {
    return mb_convert_encoding(pack('H*', $match[1]), 'UTF-8', 'UCS-2BE');
}
function myjson_encode($data) {
    return preg_replace_callback('/\\\\u([0-9a-f]{4})/i', 'replace_unicode_escape_sequence', json_encode($data));
}
function dump($name,$data) {
	file_put_contents("../data/$name.json",$data);
	$f = fopen ( "../data/.$name.json.gz", 'w' );
	fwrite ( $f,  gzencode ($data , 9 ));
	fclose ( $f );
}

dump("reports",myjson_encode($data));
dump("pollutants",myjson_encode($pollutants));
dump("activities",myjson_encode($activities));

?>
