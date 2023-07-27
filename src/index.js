import { ProxyHandlerStatic } from "@comunica/actor-http-proxy";
import zipcelx from "zipcelx";
// import { ProxyHandlerStatic } from "https://cdn.skypack.dev/@comunica/actor-http-proxy@2.6.9";
// import zipcelx from "https://cdn.skypack.dev/zipcelx@1.6.2";
//const proxy = "https://proxy.linkeddatafragments.org/";
const proxy = "http://localhost:8080/";

const engine = new Comunica.QueryEngine();

const NUMBER_OF_PUBLICATIONS_FOR_BLUEPRINT = 100;
const NUMBER_OF_PUBLICATIONS_FOR_MANDATARIS = 100;
const data = [];
let mandatendatabankList = [];
// const start_at =193;

// Put in comment when you do not want to harvest a specific municipality
// You can remove the entrypoint when you want to use the default scheduled entry point
 const interestedMunicipality = {
   "municipalityLabel": "Provincie Antwerpen",
   "entrypoint": "https://www.provincieantwerpen.be/content/dam/publicaties/open-data/provincieraad/2023/2023-05-25/pr_2023-05-25.html"
 };

function getLinkToPublications(municipalities, proxy) {
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
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
      select DISTINCT ?o
      where {
        {
          ?s <http://lblod.data.gift/vocabularies/besluit/linkToPublication> ?o .
        }
        UNION {
          ?s besluit:heeftAgenda ?o .
        }
        UNION {
          ?s besluit:heeftBesluitenlijst ?o .
        }
        UNION {
          ?s besluit:heeftAgenda ?o .
        }
        UNION {
          ?s besluit:heeftUittreksel ?o .
        }
        UNION {
          ?s besluit:heeftNotulen ?o .
        }
      }
          `, {
        sources: sources,
        lenient: true,
        httpProxyHandler: new ProxyHandlerStatic(proxy),
        httpRetryCount: 1,
        httpRetryDelay: 2000,
        httpRetryOnServerError: false
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
      engine.queryBindings(`
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
        httpRetryCount: 1,
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
      engine.queryBindings(`
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
      engine.queryBindings(`
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

function getBlueprintOfMunicipality(publications, proxy) {
  return new Promise(async (resolve, reject) => {
    try {
      const checkedBindings = [];
      const blueprint = {};
      for (let p of publications) {
        console.log("check publication for blueprint of municipality");
        const bindingsStream = await engine.queryBindings(`
        select DISTINCT *
        where {
          {
          ?classInstance a ?classOrProperty .
          }
          UNION {
            ?classInstance ?classOrProperty ?value .
          }
        }
            `, {
          sources: [p],
          lenient: true,
          httpProxyHandler: new ProxyHandlerStatic(proxy),
          httpRetryCount: 2,
          httpRetryDelay: 2000,
          httpRetryOnServerError: false
        });
        
        let bindings = await bindingsStream.toArray();
        bindings = bindings.filter((b) => !checkedBindings.includes(b));
        for (let data of bindings) {
          const classOrProperty = data.get('classOrProperty').value;
          // Save count per classOrProperty
          if(!blueprint[classOrProperty]) blueprint[classOrProperty] = 1;
          else blueprint[classOrProperty]++;
          checkedBindings.push(data);
        }
      }
      resolve(blueprint);
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
      engine.queryBindings(`
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


function fetchMandatenbank(){
  // query mandatenbank to retrieve all the mandatarissen. Should only run once. 
  return new Promise((resolve, reject) => {
    try {
      const allMandatarissen = [];
      engine.queryBindings(`
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

      SELECT DISTINCT ?a {
        ?a a mandaat:Mandataris ;
          mandaat:isBestuurlijkeAliasVan ?p .
      }
      `, {
        sources: ['https://qa.centrale-vindplaats.lblod.info/sparql'],
        lenient: true,
        httpRetryCount: 5,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           // Each variable binding is an RDFJS term
           allMandatarissen.push(data.get('a').value);
        });
        bindingsStream.on('end', function() {
          resolve(allMandatarissen);
        });
        bindingsStream.on('error', function() {
          console.log(error);
          reject(e);
        });
      });
    } catch (e) {
      console.log("jup")
      reject(e);
    }
  });
};


function validateLevel2(publications, proxy) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("start validate level 2");
      const mandatarissenInPublications = [];
      for (let p of publications) {
        console.log("check publication for level 2")
        const bindingsStream = await engine.queryBindings(`
        PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

        SELECT DISTINCT ?mandataris {
          {
          ?a besluit:heeftVoorzitter ?mandataris .
          }
          UNION 
          {
          ?b besluit:heeftSecretaris ?mandataris . 
          } 
          UNION 
          {
          ?c besluit:heeftAanwezigeBijStart ?mandataris . 
          } 
          UNION 
          {
          ?d besluit:heeftAanwezige ?mandataris . 
          }
          UNION 
          {
          ?e besluit:heeftVoorstander ?mandataris . 
          } 
          UNION 
          {
          ?f besluit:heeftTegenstander ?mandataris . 
          }
          UNION 
          {
          ?g besluit:heeftOnthouder ?mandataris . 
          }
          UNION 
          {
          ?h besluit:heeftStemmer ?mandataris . 
          }
        }
            `, {
          sources: [p],
          lenient: true,
          httpProxyHandler: new ProxyHandlerStatic(proxy),
          httpRetryCount: 2,
          httpRetryDelay: 5000,
          httpRetryOnServerError: false
        });
        const bindings = await bindingsStream.toArray();
        for (let data of bindings) {
          // Build list of mandatarissen in publications
          const mandataris = data.get('mandataris').value;
          if (!mandatarissenInPublications.includes(mandataris)) mandatarissenInPublications.push(mandataris);
        }
      }
      
      const matchedMandataris = mandatendatabankList.filter(element => mandatarissenInPublications.includes(element));
      console.log("MatchedMandatarissen: " + matchedMandataris);
      const notMatchedMandataris = mandatarissenInPublications.filter(element => !mandatendatabankList.includes(element));
      console.log("Not matched: " + notMatchedMandataris);

      const numberReusedMandatarissen = matchedMandataris.length;
      const numberMandatarissenInPub = mandatarissenInPublications.length;

      let percentageReuse = 0
      if(numberMandatarissenInPub > 0){
        percentageReuse = numberReusedMandatarissen / numberMandatarissenInPub * 100;
      }

      console.log("Aantal gematchet met mandatendatabank", matchedMandataris.length);
      console.log("Aantal gevonden in publicaties", mandatarissenInPublications.length);

      resolve({
        "percentage": percentageReuse,
        "mandatarissenFoundInPublications": mandatarissenInPublications,
        "mandatarissenFoundInPublicationsThatAreNotLinked": notMatchedMandataris
      });
    } catch (e) {
      console.log("jup")
      reject(e);
    }
  });
}

function getRelevantPublicationsWithinTimeInterval(publications, proxy, start, eind) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Filtering on relevant publications");

      const relevantPublications = [];
      for (let p of publications) {
        console.log("Checking for publication whether in time interval");
        const bindingsStream = await engine.queryBindings(`
        PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX ns1: <http://www.w3.org/1999/xhtml/vocab#>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX terms: <http://purl.org/dc/terms/>
  PREFIX title: <http://purl.org/dc/terms/title>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

  SELECT DISTINCT ?bestuursclassificatielabel
  WHERE {
      # Get bestuursclassificatie (gemeenteraad, college...)
      OPTIONAL {
        ?a1 besluit:isGehoudenDoor ?bestuursorgaanInTijd .
        ?bestuursorgaanInTijd skos:prefLabel ?bestuursclassificatie.
      }
      BIND(if(bound(?bestuursclassificatie) = "true"^^xsd:boolean, lcase(str(?bestuursclassificatie)), "onbekend") AS ?bestuursclassificatielabel)
    
      # Get start of Zitting
      ?a2 prov:startedAtTime ?startZitting .

    BIND (if(?startZitting > "${start}"^^xsd:dateTime && ?startZitting < "${eind}"^^xsd:dateTime, "true"^^xsd:boolean, "false"^^xsd:boolean) AS ?withinTimeInterval)

    FILTER (?withinTimeInterval = "true"^^xsd:boolean)
    }
  `, {
          lenient: true,
          httpProxyHandler: new ProxyHandlerStatic(proxy),
          sources: [ p ],
          httpRetryCount: 2,
          httpRetryDelay: 2000,
          httpRetryOnServerError: false
        });
        const bindings = await bindingsStream.toArray();
        for (let data of bindings) {
          //const v = {};
          const bestuursclassificatielabel = data.get('bestuursclassificatielabel').value;
          //v["bestuursclassificatielabel"] = bestuursclassificatielabel;
          //v["startZitting"] = data.get('startZitting').value;
          //v["linkToPublication"] = p;
          if (!relevantPublications[bestuursclassificatielabel]) relevantPublications[bestuursclassificatielabel] = [];
          relevantPublications[bestuursclassificatielabel].push(p);
        }
      }
      resolve(relevantPublications);
    } catch (e) {
      reject(e);
    }
  });
}

$(document).ready(async () => {
  const link = document.getElementById('export').addEventListener('click', handleExportToExcel);
  let interestedMunicipalityLabel;

  mandatendatabankList = await fetchMandatenbank();
  console.log("MasterList count: ", mandatendatabankList.length);
  
  const drp_municipalitiesList = document.getElementById("municipalitiesList");
  drp_municipalitiesList.onchange = function() {
    interestedMunicipalityLabel = this.value;
  };
    
  // 1. Get municipalities and their entry points
  let municipalities = await getMunicipalities();
  populateDropdown(drp_municipalitiesList, municipalities);
  // 1b. Set all entrypoints to HTTPS
  municipalities = municipalities.map((m) => {
    if (m.entrypoint.indexOf('http://') != -1) {
      m.entrypoint = m.entrypoint.replace('http://', 'https://');
    }
    return m;
  });
  // 2. Get blueprint of application profile
  const blueprintOfAP = await getBlueprintOfApplicationProfile();

  // 3. Button to get publications for one specific municipality or for every municipality
  const btn_start_processing = document.getElementById('btn_start_processing').addEventListener('click', () => start_loading(municipalities, interestedMunicipalityLabel, blueprintOfAP), false);
});



async function start_loading(municipalities, interestedMunicipalityLabel, blueprintOfAP) {
  document.getElementById("progressbar").value = 0;
  const specificPublication = document.getElementById("specificPublication").value;
  let startZitting = document.getElementById("startZitting").value;
  let eindZitting = document.getElementById("eindZitting").value;
  if (startZitting != "") startZitting = new Date(startZitting).toISOString();
  if (eindZitting != "") eindZitting = new Date(eindZitting).toISOString();

  // Specific publication
  console.log(specificPublication)
  if (specificPublication != "") {
    const m = {
      "municipalityLabel": "test",
      "entrypoint": specificPublication
    }
    document.getElementById('processing_now').innerHTML = "Fetching this specific publication...";
    await processMunicipality([m], m, blueprintOfAP);
    document.getElementById("progressbar").value += (100/[m].length);
  }
  // Specific municipality
  else if (typeof interestedMunicipalityLabel !== "undefined" && interestedMunicipalityLabel !== "--ALL--") {
      const m = municipalities.find(m => m.municipalityLabel === interestedMunicipalityLabel);
      const municipalities_sliced = municipalities.filter(m => m.municipalityLabel === interestedMunicipalityLabel);

      if (m) {
        document.getElementById('processing_now').innerHTML = "Publications found for " + m.municipalityLabel + ":";

        await processMunicipality(municipalities_sliced, m, blueprintOfAP, startZitting, eindZitting);
        
        document.getElementById("progressbar").value += (100/municipalities_sliced.length);
      }; 
  } 
  // Fetch all municipalities
  else {
    let municipalities_sliced = municipalities;

    if (typeof start_at !== "undefined") {
      municipalities_sliced = municipalities.slice(start_at-1);
    }

    for (const m of municipalities_sliced) {
      document.getElementById('processing_now').innerHTML = "Publications found for" + m.municipalityLabel + ": ";

      await processMunicipality(municipalities_sliced, m, blueprintOfAP, startZitting, eindZitting);

      document.getElementById("progressbar").value += (100/municipalities_sliced.length);
    }     
  }
    
  handleExportToExcel(); 

  document.getElementById('processing_now').innerHTML = "Done processing. Export to excel is available.";
  console.log("done");
}

async function processMunicipality(municipalities, m, blueprintOfAP, startZitting, eindZitting) {
  // There is probably a certificate error when the entrypoint exists without using a proxy
  const certificateProblem = !urlExists(proxy + m.entrypoint) && urlExists(m.entrypoint);
  let proxyForMunicipality = certificateProblem ? "" : proxy;

  const position = municipalities.indexOf(m)+1;
  console.log("Retrieving publications of municipality " + m.municipalityLabel + " (" + position + "/" + municipalities.length + "): with entry point: " + m.entrypoint);
  const publicationsFromSource = await getLinkToPublications([m], proxyForMunicipality);
  let publicationsFromSourceWithoutSessionId = [];
  for (let p of publicationsFromSource) {
    const cleanPub = removeSessionId(p);
    
    if (cleanPub != undefined) publicationsFromSourceWithoutSessionId.push(cleanPub);
  }
  let brokenLinksToPublications = false;
  if (publicationsFromSource.length != publicationsFromSourceWithoutSessionId.length) brokenLinksToPublications = true;
  console.log(publicationsFromSource.length + " publications found for municipality: " + m.municipalityLabel);
  
  let publicationsPerBestuursorgaan;
  // Filter publications on start and end time of Zitting
  if (startZitting != "" && eindZitting != "") {
    publicationsPerBestuursorgaan = await getRelevantPublicationsWithinTimeInterval(publicationsFromSourceWithoutSessionId, proxyForMunicipality, startZitting, eindZitting);
  } else {
    publicationsPerBestuursorgaan = {
      "onbekend": publicationsFromSourceWithoutSessionId
    };
  }
  
  for (const bestuursorgaan in publicationsPerBestuursorgaan) {
    console.log("Checking publications of bestuursorgaan: " + bestuursorgaan);
    publicationsFromSourceWithoutSessionId = publicationsPerBestuursorgaan[bestuursorgaan];
    const publicationsCollected = await getCollectedPublications(m.municipalityLabel);
    //console.log(publicationsCollected.length + " publications have been collected by harvester for municipality: " + m.municipalityLabel);

    const publicationsNotYetCollected = publicationsFromSourceWithoutSessionId.filter(x => !publicationsCollected.includes(x));
    //console.log("Net yet collected: " + publicationsFromSource);
    const publicationsHarvestedButNotFoundAtSource = publicationsCollected.filter(x => !publicationsFromSourceWithoutSessionId.includes(x));
    //console.log("Not found at source: " + publicationsHarvestedButNotFoundAtSource);
    
    const report = {
      "Gemeente": m.municipalityLabel,
      "Bestuursorgaan": bestuursorgaan,
      "Startdatum": startZitting,
      "Einddatum": eindZitting,
      "URL LBLOD-omgeving": m.entrypoint,
      "Broken link to publications": brokenLinksToPublications,
      "Number of publications at the source: ": publicationsFromSourceWithoutSessionId.length,
      "Number of publications not yet collected": publicationsNotYetCollected.length,
      //"Number of publications that have been archived (harvested but not found at source)": publicationsHarvestedButNotFoundAtSource.length,
      "Publications not yet collected": publicationsNotYetCollected,
      //"Publications not available anymore at source:": publicationsHarvestedButNotFoundAtSource
    };
    
    const numberForBlueprint = publicationsFromSourceWithoutSessionId.length < NUMBER_OF_PUBLICATIONS_FOR_BLUEPRINT ? publicationsFromSourceWithoutSessionId.length : NUMBER_OF_PUBLICATIONS_FOR_BLUEPRINT;
    // Blue print based on a number of publications
    const blueprintOfMunicipality = await getBlueprintOfMunicipality(getRandom(publicationsFromSourceWithoutSessionId, numberForBlueprint), proxyForMunicipality);
    
    console.log("Blue print of municipality generated");
    // Add blueprint to report
    for (const b of blueprintOfAP) {
      let label = b.name;
      if (b.niveau != "") label += " (" + b.niveau + ")";
      if (Object.keys(blueprintOfMunicipality).includes(b.uri)) report[label] = blueprintOfMunicipality[b.uri]; // count
      else report[label] = "";
    }

    // Check level-2 score. Re-use of mandataris url from mandatadatabank.
    const numberForMandaten = publicationsFromSourceWithoutSessionId.length < NUMBER_OF_PUBLICATIONS_FOR_MANDATARIS ? publicationsFromSourceWithoutSessionId.length : NUMBER_OF_PUBLICATIONS_FOR_MANDATARIS;
    const level2result = await validateLevel2(publicationsFromSourceWithoutSessionId, proxyForMunicipality);
    console.log("Result level 2");
    console.log(level2result);

    // Add the score to the report

    report["Re-use mandatarissen %"] = level2result.percentage;
    report["Number of found mandatarissen"] = level2result.mandatarissenFoundInPublications.length;
    //report["Mandatarissen found"] = level2result.mandatarissenFoundInPublications;
    report["Number of mandatarissen not linked"] = level2result.mandatarissenFoundInPublicationsThatAreNotLinked.length;
    
    data.push(report);
    // 3. Check if publication is already harvested
    //await sleep(10000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function urlExists(url) {
  var http = new XMLHttpRequest();
  http.open('GET', url, false);
  http.send();
  if (http.status != 404)
      return true;
  else
      return false;
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