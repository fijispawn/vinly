import {geoGraticule,geoMercator,geoPath} from 'd3-geo';
import {feature} from 'topojson-client';

const aliases={
  'австралия':'Australia','австрия':'Austria','азербайджан':'Azerbaijan','алжир':'Algeria','аргентина':'Argentina',
  'армения':'Armenia','беларусь':'Belarus','бельгия':'Belgium','болгария':'Bulgaria',
  'бразилия':'Brazil','великобритания':'United Kingdom','венгрия':'Hungary','германия':'Germany',
  'греция':'Greece','грузия':'Georgia','дания':'Denmark','израиль':'Israel','казахстан':'Kazakhstan',
  'индия':'India','испания':'Spain','италия':'Italy','канада':'Canada',
  'кипр':'Cyprus','китай':'China','ливан':'Lebanon','марокко':'Morocco','мексика':'Mexico','молдова':'Moldova',
  'нидерланды':'Netherlands','новая зеландия':'New Zealand','польша':'Poland',
  'португалия':'Portugal','перу':'Peru','россия':'Russia','румыния':'Romania','сербия':'Serbia',
  'сша':'United States of America','соединенные штаты':'United States of America',
  'словакия':'Slovakia','словения':'Slovenia','северная македония':'Macedonia',
  'тунис':'Tunisia','турция':'Turkey','узбекистан':'Uzbekistan','украина':'Ukraine','уругвай':'Uruguay','франция':'France',
  'хорватия':'Croatia','черногория':'Montenegro','чили':'Chile','чехия':'Czechia',
  'швейцария':'Switzerland','швеция':'Sweden','юар':'South Africa',
  'южная африка':'South Africa','япония':'Japan',
  'australia':'Australia','austria':'Austria','czech republic':'Czechia',
  'england':'United Kingdom','moldova':'Moldova','russian federation':'Russia',
  'south africa':'South Africa','uk':'United Kingdom','united states':'United States of America',
  'usa':'United States of America','us':'United States of America'
};

export const normalizeCountry=value=>String(value||'').trim().toLowerCase().replaceAll('ё','е').replace(/[.]/g,'').replace(/\s+/g,' ');
export const mapCountryName=value=>aliases[normalizeCountry(value)]||String(value||'').trim();
export const worldFeatures=topology=>feature(topology,topology.objects.countries).features.filter(country=>country.id!=='010');

export function regionMapBounds(markers){
  const coordinates=markers.map(marker=>marker.coordinates).filter(Boolean);
  if(!coordinates.length)return null;
  const xs=coordinates.map(point=>point[0]),ys=coordinates.map(point=>point[1]);
  const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
  const lonPad=Math.max(2.4,(right-left)*.3),latPad=Math.max(1.8,(top-bottom)*.3);
  return [[left-lonPad,Math.max(-82,bottom-latPad)],[right+lonPad,Math.min(82,top+latPad)]];
}

const escapeXml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const pin=(x,y,number)=>`<g transform="translate(${x} ${y})"><path d="M0 0C-3-5-12-14-12-22a12 12 0 1 1 24 0C12-14 3-5 0 0Z" fill="#9e342e" stroke="#fffaf3" stroke-width="2"/><text x="0" y="-22" fill="#fff" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(number)}</text></g>`;

export function renderRegionMapSvg(topology,countryName,markers,areaFeatures=[],zoom=1,focusMarker=null){
  const width=1100,height=680;
  const features=worldFeatures(topology),canonical=mapCountryName(countryName);
  const country=features.find(item=>normalizeCountry(item.properties?.name)===normalizeCountry(canonical));
  const bounds=regionMapBounds(focusMarker?.coordinates?[focusMarker]:markers);
  const frame=bounds?{type:'MultiPoint',coordinates:bounds}:country||{type:'Sphere'};
  const projection=geoMercator().fitExtent([[52,48],[width-52,height-76]],frame);
  const baseTranslate=projection.translate();
  projection.scale(projection.scale()*zoom).translate([width/2+(baseTranslate[0]-width/2)*zoom,height/2+(baseTranslate[1]-height/2)*zoom]);
  const path=geoPath(projection);
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`,
    '<defs><clipPath id="frame"><rect width="1100" height="680"/></clipPath></defs>',
    '<rect width="1100" height="680" fill="#fffaf3"/><g clip-path="url(#frame)">',
    `<path d="${path(geoGraticule().step(bounds&&bounds[1][0]-bounds[0][0]<18?[2,2]:[10,10])())}" fill="none" stroke="#eadfd3" stroke-width="1"/>`];
  for(const shape of features){
    const selected=shape===country;
    parts.push(`<path d="${path(shape)}" fill="#f6eee5" stroke="${selected?'#9e342e':'#c18b7e'}" stroke-width="${selected?2.2:1.15}" fill-rule="evenodd"/>`);
  }
  const selectedAreas=new Set(markers.filter(marker=>marker.exactArea).map(marker=>marker.area).filter(Boolean));
  for(const area of areaFeatures){
    const selected=selectedAreas.has(area.properties.name);
    if(canonical!=='Italy'&&!selected)continue;
    parts.push(`<path d="${path(area)}" fill="${selected?'#9e342e':'#f6eee5'}" stroke="${selected?'#792621':'#bf8b7c'}" stroke-width="${selected?2:1.15}" fill-rule="evenodd"/>`);
  }
  const groups=new Map();
  for(const marker of markers){
    if(!marker.coordinates)continue;
    const key=marker.wine.region?.trim()||'__country__';
    const group=groups.get(key)||{coordinates:marker.coordinates,markers:[]};
    group.markers.push(marker);groups.set(key,group);
  }
  for(const [label,group] of groups){
    const [x,y]=projection(group.coordinates);
    const count=group.markers.length;
    group.markers.forEach((marker,index)=>{
      const angle=-Math.PI/2+2*Math.PI*index/count;
      const radius=count>1?Math.max(24,13*count):0;
      const bx=x+Math.cos(angle)*radius,by=y+Math.sin(angle)*radius;
      parts.push(pin(bx,by,marker.wine.number));
    });
    const text=label==='__country__'?countryName:label;
    const labelY=y+(count>1?Math.max(24,13*count):0)+34;
    const labelWidth=Math.min(width-20,Array.from(text).length*9+22);
    const labelX=Math.max(labelWidth/2+8,Math.min(width-labelWidth/2-8,x));
    parts.push(`<rect x="${labelX-labelWidth/2}" y="${labelY-14}" width="${labelWidth}" height="28" fill="#fffaf3" fill-opacity=".92"/>`,
      `<text x="${labelX}" y="${labelY}" fill="#692c29" font-family="Arial,sans-serif" font-size="15" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`);
  }
  parts.push('</g></svg>');
  return parts.join('');
}
