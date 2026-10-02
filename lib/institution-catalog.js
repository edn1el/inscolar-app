const catalog=require('./catalog/institutions.json');
// Upgrade only known demo names, retaining IDs and every operational relationship.
// Versioned rows let later administrator edits survive reloads.
function applyCatalog(db){
 if(!Array.isArray(db.institutions))return;
 for(const row of catalog){const existing=db.institutions.find(i=>i.id===row.id);
  if(existing&&(existing.catalogVersion>=row.catalogVersion||existing.nombre!==row.replacesName))continue;
  const {replacesName,...fields}=row;
  if(existing){delete existing.lat;delete existing.lng;delete existing.foto;delete existing.fondo;delete existing.logo;Object.assign(existing,fields);}
  else if(!replacesName)db.institutions.push({...fields,estado:'Activo',createdAt:'2026-10-02T00:00:00Z'});
 }
}
module.exports={catalog,applyCatalog};
