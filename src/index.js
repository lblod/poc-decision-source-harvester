import { ProxyHandlerStatic } from "@comunica/actor-http-proxy";
import zipcelx from "zipcelx";
// import { ProxyHandlerStatic } from "https://cdn.skypack.dev/@comunica/actor-http-proxy@2.6.9";
// import zipcelx from "https://cdn.skypack.dev/zipcelx@1.6.2";
const proxy = "https://proxy.linkeddatafragments.org/";
//const proxy = "http://localhost:8080/";

const NUMBER_OF_PUBLICATIONS_FOR_BLUEPRINT = 30;
const data = [];
// const start_at =193;

// Put in comment when you do not want to harvest a specific municipality
// You can remove the entrypoint when you want to use the default scheduled entry point
//  const interestedMunicipality = {
//    "municipalityLabel": "Mesen Gemeente",
//    "entrypoint": "https://kalmthout.bestuurlijkeinformatie.nl/OpenLinkedData/Index/9aa60dcb-0539-4b5d-9cfd-139c31a834c7"
//  };

function getLinkToPublications(municipalities) {
  return new Promise((resolve, reject) => {
    try {
      let publications = [];
      // Add entrypoint to publications when interestedMunicipality has been set
      if (typeof interestedMunicipality !== "undefined" && interestedMunicipality.entrypoint) {
         publications = municipalities.map((m) => { return m.entrypoint });
      }
      // By default add entrypoint as publication too
      const sources = municipalities.map((m) => { return m.entrypoint });
      new ComunicaLinkTraversal.QueryEngine().queryBindings(`
          select DISTINCT ?o
        where {
          ?s <http://lblod.data.gift/vocabularies/besluit/linkToPublication> ?o .
          }
          `, {
        sources: sources,
        lenient: true,
        httpProxyHandler: new ProxyHandlerStatic(proxy),
        httpRetryCount: 5,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
          // Each variable binding is an RDFJS term
          publications.push(data.get('o').value);
          document.getElementById("publication_count").innerHTML = "" + publications.length;
        });
        bindingsStream.on('end', function() {
          resolve(publications);
        });
        bindingsStream.on('error', function() {
          console.log(error);
        });
      });
    } catch (e) {
      console.log("jap")
      reject(e);
    }
  });
}

function getMunicipalities() {
  return new Promise((resolve, reject) => {
    try {
      const municipalities = [];
      new Comunica.QueryEngine().queryBindings(`
          PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX dcterms: <http://purl.org/dc/terms/>
select DISTINCT ?municipalityLabel ?url
where {
  ?scheduledJob dcterms:title ?municipalityLabel .  
  ?scheduledTask dcterms:isPartOf ?scheduledJob ;
  		<http://redpencil.data.gift/vocabularies/tasks/index> ?taskIndex ;
    	<http://redpencil.data.gift/vocabularies/tasks/inputContainer> [
     	<http://redpencil.data.gift/vocabularies/tasks/hasHarvestingCollection> [
    		dcterms:hasPart [
          		nie:url ?url
      		]
    	]
  		]
}
          `, {
        sources: ['https://qa.harvesting-self-service.lblod.info/sparql'],
        httpRetryCount: 5,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           // Each variable binding is an RDFJS term
           municipalities.push({
              "municipalityLabel": data.get('municipalityLabel').value,
              "entrypoint": data.get('url').value
           });
        });
        bindingsStream.on('end', function() {
          resolve(municipalities);
        });
        bindingsStream.on('error', function() {
          console.log(error);
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function isPublicationRetrieved(linkToPublication, municipalityLabel) {
  return new Promise((resolve, reject) => {
    try {
      new Comunica.QueryEngine().queryBindings(`
        PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
          PREFIX dcterms: <http://purl.org/dc/terms/>
          select *
          where {
              ?job dcterms:creator ?scheduledJob .
              ?scheduledJob dcterms:title "${municipalityLabel}" .
              
              ?task dcterms:isPartOf ?job ;
                    <http://redpencil.data.gift/vocabularies/tasks/index> ?taskIndex ;
                    <http://redpencil.data.gift/vocabularies/tasks/inputContainer> [
                    <http://redpencil.data.gift/vocabularies/tasks/hasHarvestingCollection> [
                        dcterms:hasPart [
                            nie:url ?url
                        ]
                    ]
                    ]

            FILTER (?taskIndex = "0")
            FILTER (regex(str(?url), "${linkToPublication}"))
          }

          LIMIT 1
          `, {
        sources: ['https://qa.harvesting-self-service.lblod.info/sparql'],
        httpRetryCount: 5,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           // Each variable binding is an RDFJS term
           resolve(true);
        });
        bindingsStream.on('end', function() {
          resolve(false);
        });
        bindingsStream.on('error', function() {
          console.log(error);
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function getCollectedPublications(municipalityLabel) {
   return new Promise((resolve, reject) => {
    try {
      const collectedPublications = [];
      new Comunica.QueryEngine().queryBindings(`
        PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
          PREFIX dcterms: <http://purl.org/dc/terms/>
          select DISTINCT ?cleanUrl
          where {
              ?job dcterms:creator ?scheduledJob .
              ?scheduledJob dcterms:title "${municipalityLabel}" .
              
              ?task dcterms:isPartOf ?job ;
                    <http://redpencil.data.gift/vocabularies/tasks/index> ?taskIndex ;
                    <http://redpencil.data.gift/vocabularies/tasks/inputContainer> [
                    <http://redpencil.data.gift/vocabularies/tasks/hasHarvestingCollection> [
                        dcterms:hasPart [
                            nie:url ?url
                        ]
                    ]
                    ]

            FILTER (?taskIndex = "0")
            BIND (uri(REPLACE(str(?url), ";jsessionid=[a-zA-Z;0-9]*", "", "i")) as ?cleanUrl)
          }
          `, {
        sources: ['https://qa.harvesting-self-service.lblod.info/sparql'],
        httpRetryCount: 5,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           // Each variable binding is an RDFJS term
            collectedPublications.push(data.get('cleanUrl').value);
        });
        bindingsStream.on('end', function() {
          resolve(collectedPublications);
        });
        bindingsStream.on('error', function() {
          console.log(error);
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function getBlueprintOfMunicipality(publications) {
  return new Promise((resolve, reject) => {
    try {
      const blueprint = [];
      new Comunica.QueryEngine().queryBindings(`
          select DISTINCT ?classOrProperty
where {
  {
  ?s a ?classOrProperty .
  }
  UNION {
  	?s ?classOrProperty ?o .
  }
}
          `, {
        sources: publications,
        lenient: true,
        httpProxyHandler: new ProxyHandlerStatic(proxy),
        httpRetryCount: 5,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           // Each variable binding is an RDFJS term
           blueprint.push(data.get('classOrProperty').value);
        });
        bindingsStream.on('end', function() {
          resolve(blueprint);
        });
        bindingsStream.on('error', function() {
          console.log(error);
        });
      });
    } catch (e) {
      console.log("jup")
      reject(e);
    }
  });
}

function getBlueprintOfApplicationProfile() {
  const AP = "https://raw.githubusercontent.com/brechtvdv/demo-data/master/besluit-publicatie-SHACL.ttl";
  return new Promise((resolve, reject) => {
    try {
      const blueprint = [];
      new Comunica.QueryEngine().queryBindings(`
          PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX lblodBesluit: <http://lblod.data.gift/vocabularies/besluit/>
SELECT DISTINCT ?uri ?name ?niveau
WHERE {
  {
  	?s sh:targetClass ?uri .
    OPTIONAL {
      ?s sh:name ?name .
    }
    OPTIONAL {
      ?s lblodBesluit:maturiteitsniveau ?niveau .
    }
  }
  UNION
  {
    ?s sh:path ?uri .
    OPTIONAL {
      ?s sh:name ?name .
    }
    OPTIONAL {
      ?s lblodBesluit:maturiteitsniveau ?niveau .
    }
  }
}
          `, {
        sources: [ AP ],
        httpRetryCount: 5,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
          const v = {};
          v["uri"] = data.get('uri') ? data.get('uri').value : "";
          v["name"] = data.get('name') ? data.get('name').value : "";
          v["niveau"] = data.get('niveau') ? data.get('niveau').value : "";

          blueprint.push(v);
        });
        bindingsStream.on('end', function() {
          resolve(blueprint);
        });
        bindingsStream.on('error', function() {
          console.log(error);
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function removeSessionId(url) {
  try {
    const uri = new URL(url);
    uri.hash = '';
    return uri.toString().replace(/;jsessionid=[a-zA-Z;0-9]*/i, "");
  } catch (e) {
    console.log("ERROR IN LINK TO PUBLICATION: " + url);
  }
}

// Function to populate the dropdown
function populateDropdown(dropdown, records) {    
  const option = document.createElement("option");
  option.value = "--ALL--";
  option.text = "--ALL--";
  dropdown.appendChild(option);

  // Iterate over the records and create options
  records.forEach((record) => {
    const option = document.createElement("option");
    option.value = record.municipalityLabel;
    option.text = record.municipalityLabel;
    dropdown.appendChild(option);
  });
};


$(document).ready(async () => {
  const link = document.getElementById('export').addEventListener('click', handleExportToExcel);
  let interestedMunicipalityLabel = "";
  
  const drp_municipalitiesList = document.getElementById("municipalitiesList");
  drp_municipalitiesList.onchange = function() {
    interestedMunicipalityLabel = this.value;

    if(interestedMunicipalityLabel === "--ALL--"){
      document.getElementById('action_text').innerHTML = "Genereer overzicht voor elke gemeente"
    } else {
      document.getElementById('action_text').innerHTML = "Genereer overzicht voor gemeente " + interestedMunicipalityLabel
    }
  };
    
  // 1. Get municipalities and their entry points
  const municipalities = await getMunicipalities();
  populateDropdown(drp_municipalitiesList, municipalities);
  
  // 2. Get blueprint of application profile
  const blueprintOfAP = await getBlueprintOfApplicationProfile();

  // 3. Button to get publications for one specific municipality or for every municipality
  const btn_start_processing = document.getElementById('btn_start_processing').addEventListener('click', () => start_loading(municipalities, interestedMunicipalityLabel, blueprintOfAP), false);
});

async function start_loading(municipalities, interestedMunicipalityLabel, blueprintOfAP) {
  document.getElementById("progressbar").value = 0;

  if (typeof interestedMunicipalityLabel !== "undefined" && interestedMunicipalityLabel !== "--ALL--") {
    // if (interestedMunicipality.municipalityLabel && interestedMunicipality.entrypoint) await processMunicipality(municipalities, interestedMunicipality, blueprintOfAP);
    // if (interestedMunicipalityLabel !== "--ALL--") {
      const m = municipalities.find(m => m.municipalityLabel === interestedMunicipalityLabel);
      const municipalities_sliced = municipalities.filter(m => m.municipalityLabel === interestedMunicipalityLabel);

      if (m) {
        document.getElementById('processing_now').innerHTML = "Publications found for " + m.municipalityLabel + ":";

        await processMunicipality(municipalities_sliced, m, blueprintOfAP);
        
        document.getElementById("progressbar").value += (100/municipalities_sliced.length);
      }; 
    // }
    // else console.log("Municipality not scheduled.");
  } 
  else {
    let municipalities_sliced = municipalities;

    if (typeof start_at !== "undefined") {
      municipalities_sliced = municipalities.slice(start_at-1);
    }

    for (const m of municipalities_sliced) {
      document.getElementById('processing_now').innerHTML = "Publications found for" + m.municipalityLabel + ": ";

      await processMunicipality(municipalities_sliced, m, blueprintOfAP);

      document.getElementById("progressbar").value += (100/municipalities_sliced.length);
    }     
  }
    
  handleExportToExcel(); 

  document.getElementById('processing_now').innerHTML = "Done processing. Export to excel is available.";
  console.log("done");
}

async function processMunicipality(municipalities, m, blueprintOfAP) {
  const position = municipalities.indexOf(m)+1;
  console.log("Retrieving publications of municipality " + m.municipalityLabel + " (" + position + "/" + municipalities.length + "): with entry point: " + m.entrypoint);
  const publicationsFromSource = await getLinkToPublications([m]);
  const publicationsFromSourceWithoutSessionId = [];
  for (let p of publicationsFromSource) {
    const cleanPub = removeSessionId(p);
    
    if (cleanPub != undefined) publicationsFromSourceWithoutSessionId.push(cleanPub);
  }
  let brokenLinksToPublications = false;
  if (publicationsFromSource.length != publicationsFromSourceWithoutSessionId.length) brokenLinksToPublications = true;
  console.log(publicationsFromSource.length + " publications found for municipality: " + m.municipalityLabel);
  
  const publicationsCollected = await getCollectedPublications(m.municipalityLabel);
  //console.log(publicationsCollected.length + " publications have been collected by harvester for municipality: " + m.municipalityLabel);

  const publicationsNotYetCollected = publicationsFromSourceWithoutSessionId.filter(x => !publicationsCollected.includes(x));
  //console.log("Net yet collected: " + publicationsFromSource);
  const publicationsHarvestedButNotFoundAtSource = publicationsCollected.filter(x => !publicationsFromSourceWithoutSessionId.includes(x));
  //console.log("Not found at source: " + publicationsHarvestedButNotFoundAtSource);
  
  const report = {
    "Gemeente": m.municipalityLabel,
    "URL LBLOD-omgeving": m.entrypoint,
    "Broken link to publications": brokenLinksToPublications,
    "Number of publications at the source: ": publicationsFromSource.length,
    "Number of publications not yet collected": publicationsNotYetCollected.length,
    "Number of publications that have been archived (harvested but not found at source)": publicationsHarvestedButNotFoundAtSource.length,
    "Publications not yet collected": publicationsNotYetCollected,
    "Publications not available anymore at source:": publicationsHarvestedButNotFoundAtSource
  };
  
  const numberForBlueprint = publicationsFromSourceWithoutSessionId.length < NUMBER_OF_PUBLICATIONS_FOR_BLUEPRINT ? publicationsFromSourceWithoutSessionId.length : NUMBER_OF_PUBLICATIONS_FOR_BLUEPRINT;
  // Blue print based on a number of publications
  const blueprintOfMunicipality = await getBlueprintOfMunicipality(getRandom(publicationsFromSourceWithoutSessionId, numberForBlueprint));
  // Add blueprint to report
  for (const b of blueprintOfAP) {
    let label = b.name;
    if (b.niveau != "") label += " (" + b.niveau + ")";
    if (blueprintOfMunicipality.includes(b.uri)) report[label] = "X";
    else report[label] = "";
  }
  
  data.push(report);
  // 3. Check if publication is already harvested
  //await sleep(10000);
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function handleExportToExcel() {
    if (data.length) {
      const headData = Object.keys(data[0]).map((col) => ({
        value: col,
        type: "string",
      }));
      const bodyData = data.map((item) =>
        Object.values(item).map((value) => {   
             if (typeof value === "object") return { 
                 "value": value.toString(), 
                 "type": "string"
               }
             else return { 
                "value": value, 
                "type": typeof value 
               }
        })
      );
      const config = {
        filename: "filename",
        sheet: { data: [headData, ...bodyData] },
      };
      zipcelx(config);  
    }
}

function getRandom(arr, n) {
  var result = new Array(n),
      len = arr.length,
      taken = new Array(len);
  if (n > len){
    n = len;
    console.log(`getRandom: more elements taken than available. Will use ${len} as the number of elements.`);
  }
      // throw new RangeError("getRandom: more elements taken than available");
  while (n--) {
      var x = Math.floor(Math.random() * len);
      result[n] = arr[x in taken ? taken[x] : x];
      taken[x] = --len in taken ? taken[len] : len;
  }
  return result;
}

// IGNORE WHAT IS BELOW HERE
// Updaten van de template
function updateTemplate(field, value) {
  template[field] = '<span style=color:LimeGreen!important;>' + value + '</span>';
  $("#snippet").html(JSON.stringify(template, undefined, 4));
}

function updateSnippet(sel) {
  let id = parseInt($(sel).parent().parent().attr('id'));
  let value = $(sel).val();
  let modality = $('option:selected', sel).attr('id');
  console.log(modality)
}

function addCriteriumVereiste() { 
  let id = $('[class="criterium"]').length + 1;
  console.log(id);
  console.log(id)
  let $div = $('<div/>', {
    'class': 'criterium',
    'id': id
  });
  
   let $select = $('<select/>', {
     'class':"selectpicker",
     'onchange': 'updateSnippet(this)'
    });
    $select.append(`<option data-content="<i class='fa fa-bicycle' aria-hidden='true'></i> Deelfiets">Deelfiets</option>`);
    $select.append(`<option data-content="<i class='fa fa-train' aria-hidden='true'></i> Trein">Trein</option>`);
    
    $select.appendTo($div).selectpicker('refresh');
    $div.appendTo('#criteriumvereisten');
    
   let $add = $(`<i onClick="addCriteriumVereiste()" class='fa fa-plus' aria-hidden='true'></i>`);
   $add.appendTo('#criteriumvereisten');
}
  
  // Listeners for change events
  $('#input-id').on("input", function(){
    let id = $("#input-id").val();
    updateTemplate("@id", id);
   });