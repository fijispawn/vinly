import {geoCentroid} from 'd3-geo';
import {mapCountryName} from './world-map.js';

export const normalizeRegion=value=>String(value||'').trim().toLowerCase().replaceAll('ё','е').replace(/[.’']/g,'').replace(/\s+/g,' ');

const italianAreas={
  'пьемонт':'Piemonte','piemonte':'Piemonte','piedmont':'Piemonte',
  'тоскана':'Toscana','toscana':'Toscana','tuscany':'Toscana',
  'венето':'Veneto','veneto':'Veneto','сицилия':'Sicilia','sicilia':'Sicilia','sicily':'Sicilia',
  'сардиния':'Sardegna','sardegna':'Sardegna','ломбардия':'Lombardia','lombardia':'Lombardia',
  'лигурия':'Liguria','liguria':'Liguria','умбрия':'Umbria','umbria':'Umbria',
  'лацио':'Lazio','lazio':'Lazio','абруццо':'Abruzzo','abruzzo':'Abruzzo',
  'кампания':'Campania','campania':'Campania','апулия':'Puglia','пулья':'Puglia','puglia':'Puglia',
  'калабрия':'Calabria','calabria':'Calabria','базиликата':'Basilicata','basilicata':'Basilicata',
  'молизе':'Molise','molise':'Molise','марке':'Marche','marche':'Marche',
  'эмилия-романья':'Emilia-Romagna','emilia-romagna':'Emilia-Romagna',
  'фриули-венеция-джулия':'Friuli Venezia Giulia','friuli venezia giulia':'Friuli Venezia Giulia',
  'трентино-альто-адидже':'Trentino-Alto Adige','trentino-alto adige':'Trentino-Alto Adige',
  'валле-даоста':"Valle d'Aosta",'valle daosta':"Valle d'Aosta"
};

// Coordinates locate wine regions; area is an administrative contour when a useful match exists.
const locations={
  Italy:[
    [['кьянти','chianti'],11.25,43.45,'Toscana'],[['монтальчино','montalcino'],11.49,43.06,'Toscana'],
    [['болгери','bolgheri'],10.62,43.23,'Toscana'],[['бароло','barolo'],7.94,44.61,'Piemonte'],
    [['барбареско','barbaresco'],8.08,44.72,'Piemonte'],[['просекко','prosecco'],12.16,45.94,'Veneto'],
    [['вальполичелла','valpolicella'],10.95,45.53,'Veneto'],[['соаве','soave'],11.25,45.42,'Veneto'],
    [['этна','etna'],15.0,37.75,'Sicilia']
  ],
  France:[
    [['бордо','bordeaux'],-0.58,44.84], [['шампань','champagne'],4.0,49.0],
    [['бургундия','bourgogne','burgundy'],4.8,47.1], [['долина луары','луара','loire'],0.7,47.4],
    [['долина роны','рона','rhone','rhône'],4.8,45.3], [['эльзас','alsace'],7.4,48.1],
    [['прованс','provence'],5.4,43.5], [['лангедок','languedoc'],3.9,43.6]
  ],
  Spain:[
    [['риоха','rioja','la rioja'],-2.45,42.45,'La Rioja'], [['рибера дель дуэро','ribera del duero'],-3.8,41.6],
    [['приорат','priorat'],0.8,41.2], [['пенедес','penedes','penedès'],1.7,41.4],
    [['руэда','rueda'],-4.9,41.4], [['херес','jerez'],-6.1,36.7]
  ],
  Portugal:[
    [['дору','douro'],-7.7,41.2], [['алентежу','alentejo'],-7.9,38.4],
    [['винью верде','vinho verde'],-8.4,41.6], [['дау','dao','dão'],-7.9,40.5]
  ],
  Argentina:[
    [['мендоса','mendoza'],-68.8,-32.9,'Mendoza'], [['сальта','salta'],-65.4,-24.8,'Salta'],
    [['сан-хуан','san juan'],-68.5,-31.5,'San Juan'], [['патагония','patagonia'],-68,-39]
  ],
  Chile:[
    [['майпо','maipo'],-70.6,-33.6], [['касабланка','casablanca'],-71.4,-33.3],
    [['кольчагуа','colchagua'],-71,-34.6], [['мауле','maule'],-71.5,-35.4,'Maule']
  ],
  'New Zealand':[
    [['мальборо','marlborough'],173.9,-41.5], [['центральный отаго','central otago'],169,-45],
    [['хокс-бей','хокс бей','hawkes bay',"hawke's bay"],176.8,-39.6],
    [['нельсон','nelson'],173.3,-41.3,'Nelson Region']
  ],
  Russia:[
    [['кубань','краснодарский край','krasnodar'],38.7,44.9,'Krasnodar Krai'],
    [['крым','crimea'],34.1,44.9], [['дагестан','dagestan'],47,42.8,'Dagestan'],
    [['ростовская область','rostov'],40,47.2,'Rostov Oblast']
  ],
  'United States of America':[
    [['напа','долина напа','napa','napa valley'],-122.3,38.5],
    [['сонома','sonoma'],-122.8,38.3], [['орегон','oregon'],-123.2,44.9,'Oregon'],
    [['вашингтон','washington'],-120.7,46.7,'Washington']
  ],
  'South Africa':[
    [['стелленбош','stellenbosch'],18.9,-33.9], [['паарль','paarl'],18.96,-33.75],
    [['свартланд','swartland'],18.7,-33.4], [['западный кейп','western cape'],19,-33.2,'Western Cape']
  ],
  Australia:[
    [['баросса','barossa','barossa valley'],138.9,-34.5],
    [['маргарет-ривер','margaret river'],115.05,-33.95],
    [['ярра','yarra valley'],145.5,-37.7], [['хантер вэлли','hunter valley'],151.4,-32.8]
  ],
  Germany:[
    [['мозель','mosel'],6.9,49.9], [['рейнгау','rheingau'],8,50],
    [['пфальц','pfalz'],8,49.3], [['баден','baden'],7.8,48.3]
  ],
  Austria:[
    [['вахау','wachau'],15.4,48.4], [['бургенланд','burgenland'],16.5,47.7,'Burgenland'],
    [['кампталь','kamptal'],15.7,48.5]
  ],
  Georgia:[[['кахетия','kakheti'],45.7,41.7,'Kakheti']]
};

export function locateWineRegion(wine,areaFeatures=[]){
  const country=mapCountryName(wine.country),region=normalizeRegion(wine.region);
  if(!region)return null;
  if(country==='Italy'){
    const area=italianAreas[region];
    const feature=area&&areaFeatures.find(item=>item.properties.name===area);
    if(feature)return {coordinates:geoCentroid(feature),area,exactArea:true};
  }
  const place=locations[country]?.find(([names])=>names.some(name=>region===normalizeRegion(name)||region.startsWith(normalizeRegion(name)+' ')));
  if(!place)return null;
  const area=place[3]||null;
  const exactArea=Boolean(country!=='Italy'&&area&&areaFeatures.some(item=>item.properties.name===area));
  return {coordinates:[place[1],place[2]],area,exactArea};
}
