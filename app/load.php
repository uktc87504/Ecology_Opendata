<?php


ini_set('user_agent','Mozilla/5.0 (compatible; email=yurukov@gmail.com; reason=otvarqm dannite');  
ini_set('default_socket_timeout', 300); 
mb_internal_encoding("UTF-8");

$maxyear=2012;

$link = mysqli_connect('localhost', 'username', 'password', "database") or die("0");
$link->set_charset("utf8");

$facilityId=getFacilityIds();
foreach ($facilityId as $id)
	loadFacility($id);

function loadFacility($facilityId) {
	global $maxyear, $link;

	echo "\n> Loading facility data for $facilityId:";

	$res = $link->query("SELECT distinct year FROM `reports` where facilityId=$facilityId") or die("\n\nError accessing DB: ". $link->error);
	if ($res->num_rows==$maxyear-2006) {
		echo "skip";
		return;
	}	

	for ($year=$maxyear;$year>=2007;$year--) {
		echo " $year";
//		usleep(100000);
		$page = file_get_contents("http://pdbase.government.bg/forms/public_eprtr.jsp?a=2&id=$facilityId&year=$year") or die("error in loading");
		$page = str_replace("&quot;","\"",mb_convert_encoding($page, "utf8", "cp1251"));
		if ($year==$maxyear)
			processFacilityData($facilityId, $page);
		processFacilityNumbers($facilityId, $year, $page);
		echo "done";
	}	
}

function processFacilityData($facilityId, $page) {
	global $link;

	$fields = array($facilityId);
	mb_ereg_search_init($page,"<h1>(.*?)</h1>") or die("no data");
	mb_ereg_search();
	$r = mb_ereg_search_getregs();
	$fields[1] = $r[1];
	mb_ereg_search_init($page,"<tr><td class=\"label\">(.*?)</td><td width=\"100%\">(.*?)</td></tr>") or die("no data");
	while (mb_ereg_search()) {
		$r = mb_ereg_search_getregs();
		if (count($r)!=3) continue;
		$r[2]=$link->real_escape_string(trim($r[2]));
		if ($r[1]=="Адрес:")
			$fields[2]=$r[2];
		elseif ($r[1]=="Населено място:")
			$fields[3]=$r[2];
		elseif ($r[1]=="Пощенски код:")
			$fields[4]=$r[2];
		elseif ($r[1]=="Координати:")
			$fields[5]=cleanCoords($r[2]);
		elseif ($r[1]=="Основна икономическа дейност:")
			$fields[6]=$r[2];
		elseif ($r[1]=="Управляваща компания:")
			$fields[7]=$r[2];

	}

	if ($fields[7])
		$link->query("UPDATE facility set legalentity='".$fields[7]."' where id=$facilityId") or die("die:\n\nError executing query: ". $link->error);

	mb_ereg_search_init($page,"<tr><td style=\"white-space:nowrap;\">(.*?)</td><td>(.*?)</td></tr>") or die("no data");
	while (mb_ereg_search()) {
		$r = mb_ereg_search_getregs();
		if (count($r)!=3) continue;
		$r[1]=substr($r[1],0,1).substr($r[1],3,1);
		$r[2]=$link->real_escape_string(trim($r[2]));
		$link->query("INSERT ignore INTO activity VALUE ('".$r[1]."','".$r[2]."')") or die("die:\n\nError executing query: ". $link->error);
		$link->query("INSERT ignore INTO facility_activity VALUE ($facilityId,'".$r[1]."')") or die("die:\n\nError executing query: ". $link->error);
	}
	$link->query("INSERT ignore INTO facility VALUE ('".implode("','",$fields)."')") or die("die:\n\nError executing query: ". $link->error);
	echo ".";
}

function processFacilityNumbers($facilityId, $year, $page) {
	global $link;
	$pages = explode("<tr><th colspan=\"2\">",$page);
	foreach ($pages as $page) {
		if (mb_substr($page,0,6)!="Пренос" && mb_substr($page,0,6)!="Емисии")
			continue;
		if (mb_strpos($page,"Емисии на замърсители във въздуха")!==false)
			$type='air';
		elseif (mb_strpos($page,"Емисии на замърсители във води")!==false)
			$type='water';
		elseif (mb_strpos($page,"Емисии на замърсители в почвата")!==false)
			$type='soil';
		elseif (mb_strpos($page,"Пренос на замърсители в отпадъчни води")!==false)
			$type='waste-water-transfer';
		elseif (mb_strpos($page,"Пренос на отпадъци")!==false)
			$type='waste-transfer';
		else
			die("unknown section: $page");

		mb_ereg_search_init($page,"<tr><td>(.*?)</td><td align=\"right\">(.*?)</td><td align=\"center\">(.*?)</td>(<td>(.*?)</td>)?</tr>") or die("no data");
		while (mb_ereg_search()) {
			$r = mb_ereg_search_getregs();
			if (count($r)<4) continue;
			$pollutantId=insertPollutant($r[1]);
			$amount=doubleval($r[2]);
			$m_type=$r[3]=="M" || $r[3]=="C" || $r[3]=="E" ? "'".$r[3]."'" : "null";
			$m_method=trim($r[5])==""? "null" : "'".$link->real_escape_string(trim($r[5]))."'";
			$link->query("INSERT ignore into reports VALUES ($facilityId,$pollutantId,$year,'$type',$amount,$m_type,$m_method)") or die("\n\nError accessing DB: ". $link->error);
			echo ".";
		}
	}
}

function insertPollutant($name) {
	global $link;
	$id=false;
	$name=$link->real_escape_string(trim($name));
	$res = $link->query("SELECT id FROM pollutant WHERE name='$name'") or die("\n\nError accessing DB: ". $link->error);
	if ($res->num_rows>0) {
		$ids = $res->fetch_array(MYSQLI_NUM);
		$id=$ids[0];
	} else {
		$link->query("INSERT into pollutant VALUES (null, '$name')") or die("\n\nError accessing DB: ". $link->error);
		$id=$link->insert_id;
	}
	$res->free();
	return $id;
}

function cleanCoords($coords) {
	$coords = explode(",",$coords);
	if (count($coords)!=2) 
		return '';
	$lat=str_replace(array("E","N"),"",substr(trim($coords[1]),0,9));
	$lng=str_replace(array("E","N"),"",substr(trim($coords[0]),0,9));
	return "$lat,$lng";
}

function getFacilityIds() {
	global $maxyear;

	$facilityIds=array();

	echo "\n> Loading facility ids until $maxyear:";

	for ($i=2007;$i<=$maxyear;$i++) {
		echo " $i...";
		usleep(100000);
		$page = file_get_contents("http://pdbase.government.bg/forms/public_eprtr.jsp?basin=0&riew=0&teritory=0&district=0&popular=0&year=$i&release_air=1&release_water=1&release_soil=1&transfer_water=1&transfer_waste=1&pollutant=0&activity=0&ewc=&search_text=&RuchFind=%D2%FA%F0%F1%E5%ED%E5&a=1&t=1&capture=1") or die("error in loading");
		$page = mb_convert_encoding($page, "utf8", "cp1251");
		if (mb_strpos($page,"Не са намерени площадки")!==false)
			continue;

		mb_ereg_search_init($page,"public_eprtr.jsp\?a=2\&id=([^&\"]+)") or die("no data");
		while (mb_ereg_search()) {
			$r = mb_ereg_search_getregs();
			if (count($r)!=2)
				continue;
			$r=intval($r[1]);
			if (!in_array($r,$facilityIds))
				$facilityIds[]=$r;
		}
		echo "done";
	}
	sort($facilityIds);

	echo "\n> Found ".count($facilityIds)." facility ids.";

	return $facilityIds;
}

?>
