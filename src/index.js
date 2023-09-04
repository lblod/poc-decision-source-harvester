import { ProxyHandlerStatic } from "@comunica/actor-http-proxy";
import zipcelx from "zipcelx";
import * as XLSX from 'xlsx/xlsx.mjs';

// import { ProxyHandlerStatic } from "https://cdn.skypack.dev/@comunica/actor-http-proxy@2.6.9";
// import zipcelx from "https://cdn.skypack.dev/zipcelx@1.6.2";
//const proxy = "https://proxy.linkeddatafragments.org/";
const proxy = "http://localhost:8085/";

const engine = new Comunica.QueryEngine();

const NUMBER_OF_PUBLICATIONS_FOR_BLUEPRINT = 100;
const NUMBER_OF_PUBLICATIONS_FOR_MANDATARIS = 100;
const NUMBER_OF_MUNICIPALITIES_PER_BATCH = 1;
const NUMBER_OF_RETRY_COUNTS = 2;

let data = [];
let mandatarissenList = [];
let voorzittersList = [];
let functionarissenList = [];
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
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
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
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpRetryDelay: 10000,
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

            FILTER (?taskIndex = "7")
            FILTER (regex(str(?url), "${linkToPublication}"))
          }

          LIMIT 1
          `, {
        sources: ['https://qa.harvesting-self-service.lblod.info/sparql'],
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpRetryDelay: 10000,
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

            FILTER (?taskIndex = "1")
            BIND (uri(REPLACE(str(?url), ";jsessionid=[a-zA-Z;0-9]*", "", "i")) as ?cleanUrl)
          }
          `, {
        sources: ['https://qa.harvesting-self-service.lblod.info/sparql'],
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpRetryDelay: 10000,
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
      const blueprint = [];
      if (publications.length === 0) resolve(blueprint);
     // for (let p of publications) {
        console.log("check publication for blueprint of municipality " + publications.length);
        engine.queryBindings(`
        select DISTINCT *
        where {
  {
          SELECT ?classUri (str(COUNT(DISTINCT ?classInstance)) AS ?count)
    WHERE {
                ?classInstance a ?classUri .
          }
GROUP BY ?classUri
  }
          UNION 
  {
    select ?classUri ?propertyUri (str(count(DISTINCT ?classInstance)) as ?count)
    where {

      ?classInstance a ?classUri ;
                     ?propertyUri ?value .
      FILTER (?propertyUri != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
    }
    GROUP BY ?classUri ?propertyUri
   }
        }
            `, {
          // sources: [p],
          sources: publications,
          lenient: true,
          httpProxyHandler: new ProxyHandlerStatic(proxy),
          httpRetryCount: NUMBER_OF_RETRY_COUNTS,
          httpRetryDelay: 2000,
          httpRetryOnServerError: false
        }).then(function (bindingsStream) {
          bindingsStream.on('data', function (data) {
            const tmp = {};
            tmp["classUri"] = data.get('classUri').value;
            tmp["propertyUri"] = data.get('propertyUri') ? data.get('propertyUri').value : "";
            tmp["count"] = parseInt(data.get('count').value);
            blueprint.push(tmp);
          });
          bindingsStream.on('end', function() {
            resolve(blueprint);
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
}

function getBlueprintOfApplicationProfile() {
  const AP = "https://raw.githubusercontent.com/brechtvdv/demo-data/master/besluit-publicatie-SHACL.ttl";
  return new Promise((resolve, reject) => {
    try {
      const blueprint = [];
      engine.queryBindings(`
      PREFIX sh: <http://www.w3.org/ns/shacl#>
      PREFIX lblodBesluit: <http://lblod.data.gift/vocabularies/besluit/>
      SELECT DISTINCT ?classUri ?propertyUri ?className ?propertyName ?name ?niveau
      WHERE {
        {
          ?s sh:targetClass ?classUri .
          OPTIONAL {
            ?s sh:name ?name .
          }
          OPTIONAL {
            ?s lblodBesluit:maturiteitsniveau ?niveau .
          }
        }
        UNION
        {
          ?node sh:targetClass ?classUri ;
                sh:property ?s ;
                sh:name ?className .
          ?s sh:path ?propertyUri .
          OPTIONAL {
            ?s sh:name ?propertyName .
          }
          OPTIONAL {
            ?s lblodBesluit:maturiteitsniveau ?niveau .
          }
          BIND (concat(?className, ' - ', ?propertyName) AS ?name)
        }
      }
          `, {
        sources: [ AP ],
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
          const v = {};
          v["propertyUri"] = data.get('propertyUri') ? data.get('propertyUri').value : "";
          v["classUri"] = data.get('classUri') ? data.get('classUri').value : "";
          v["propertyName"] = data.get('propertyName') ? data.get('propertyName').value : "";
          v["className"] = data.get('className') ? data.get('className').value : "";
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

function fetchMandatarissenThatAreNotVoorzitter(){
  return new Promise((resolve, reject) => {
    try {
      const mandatarissen = [];
      engine.queryBindings(`
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

      SELECT DISTINCT ?a {
        ?a a mandaat:Mandataris ;
        <http://www.w3.org/ns/org#holds> [ <http://www.w3.org/ns/org#role> ?rol ] .
        {
        select ?rol
          where {
            ?rol a skos:Concept ;
                skos:prefLabel ?rollabel .
            FILTER (!regex(lcase(?rollabel), "voorzitter"))
          }
        }
      }
      `, {
        sources: ['https://qa.centrale-vindplaats.lblod.info/sparql'],
        lenient: true,
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpRetryDelay: 10000,
        httpTimeout: 60_000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           mandatarissen.push(data.get('a').value);
        });
        bindingsStream.on('end', function() {
          resolve(mandatarissen);
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

function fetchMandatarissenWithRole(roleLabel){
  return new Promise((resolve, reject) => {
    try {
      const mandatarissen = [];
      engine.queryBindings(`
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

      SELECT DISTINCT ?a {
        ?a a mandaat:Mandataris ;
        <http://www.w3.org/ns/org#holds> [ <http://www.w3.org/ns/org#role> ?rol ] .
        {
        select ?rol
          where {
            ?rol a skos:Concept ;
                skos:prefLabel ?rollabel .
            FILTER (regex(lcase(?rollabel), "${roleLabel}"))
          }
        }
      }
      `, {
        sources: ['https://qa.centrale-vindplaats.lblod.info/sparql'],
        lenient: true,
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpTimeout: 60_000,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           mandatarissen.push(data.get('a').value);
        });
        bindingsStream.on('end', function() {
          resolve(mandatarissen);
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

function fetchFunctionarissen(){
  return new Promise((resolve, reject) => {
    try {
      const mandatarissen = [];
      engine.queryBindings(`
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

      SELECT DISTINCT ?a {
        ?a a <http://data.lblod.info/vocabularies/leidinggevenden/Functionaris> .
      }
      `, {
        sources: ['https://qa.centrale-vindplaats.lblod.info/sparql'],
        lenient: true,
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpTimeout: 60_000,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           mandatarissen.push(data.get('a').value);
        });
        bindingsStream.on('end', function() {
          resolve(mandatarissen);
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

function getMandatarisOfVoorzitter(voorzitters){
  return new Promise((resolve, reject) => {
    try {
      const mandatarissen = [];
      let voorzitterString = "";
      voorzitters.map(v => voorzitterString += ` <${v}>`);
      engine.queryBindings(`
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?mandataris {
 ?voorzitter a mandaat:Mandataris ;
              mandaat:isBestuurlijkeAliasVan ?persoon .
  ?mandataris a mandaat:Mandataris ;
              mandaat:isBestuurlijkeAliasVan ?persoon .
  FILTER (?mandataris != ?voorzitter)
  
  VALUES ?voorzitter { 
  	${voorzitterString}
  }
}
      `, {
        sources: ['https://qa.centrale-vindplaats.lblod.info/sparql'],
        lenient: true,
        httpRetryCount: NUMBER_OF_RETRY_COUNTS,
        httpTimeout: 60_000,
        httpRetryDelay: 2000,
        httpRetryOnServerError: true
      }).then(function (bindingsStream) {
        bindingsStream.on('data', function (data) {
           mandatarissen.push(data.get('mandataris').value);
        });
        bindingsStream.on('end', function() {
          resolve(mandatarissen);
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
      const stemmersInPublications = []; // does not contain voorzitter and secretaris
      const aanwezigenInPublications = [];
      const voorzittersInPublications = [];
      const secretarissenInPublications = [];
      // for (let p of publications) {
        let bindingsStream = await engine.queryBindings(`
        PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

        SELECT DISTINCT ?stemmer ?aanwezige ?voorzitter ?secretaris { 
          {
          ?a besluit:heeftVoorstander ?stemmer . 
          } 
          UNION 
          {
          ?b besluit:heeftTegenstander ?stemmer . 
          }
          UNION 
          {
          ?c besluit:heeftOnthouder ?stemmer . 
          }
          UNION 
          {
          ?d besluit:heeftStemmer ?stemmer . 
          }
          UNION
          {
          ?e besluit:heeftAanwezigeBijStart ?aanwezige . 
          } 
          UNION 
          {
          ?f besluit:heeftAanwezige ?aanwezige . 
          }
          UNION 
            {
          ?g besluit:heeftVoorzitter ?voorzitter .
          }
          UNION 
            {
          ?h besluit:heeftSecretaris ?secretaris . 
          }
        }
            `, {
          // sources: [p],
          sources: publications,
          lenient: true,
          httpProxyHandler: new ProxyHandlerStatic(proxy),
          httpRetryCount: NUMBER_OF_RETRY_COUNTS,
          httpRetryDelay: 5000,
          httpRetryOnServerError: false
        });
        let bindings = await bindingsStream.toArray();
        for (let data of bindings) {
          // Build list of mandatarissen in publications
          if (data.get('stemmer') && !stemmersInPublications.includes(data.get('stemmer').value)) stemmersInPublications.push(data.get('stemmer').value);
          if (data.get('aanwezige') && !aanwezigenInPublications.includes(data.get('aanwezige').value)) aanwezigenInPublications.push(data.get('aanwezige').value);
          if (data.get('voorzitter') && !voorzittersInPublications.includes(data.get('voorzitter').value)) voorzittersInPublications.push(data.get('voorzitter').value);
          if (data.get('secretaris') && !secretarissenInPublications.includes(data.get('secretaris').value)) secretarissenInPublications.push(data.get('secretaris').value);
        }
        
      // aanwezige can be mandataris, voorzitter or secretaris
      const matchedAanwezige = aanwezigenInPublications.filter(element => mandatarissenList.includes(element) || voorzittersList.includes(element) || functionarissenList.includes(element));
      const notMatchedAanwezige = aanwezigenInPublications.filter(element => !matchedAanwezige.includes(element));
      const percentageReuseAanwezige = aanwezigenInPublications.length > 0 ? matchedAanwezige.length / aanwezigenInPublications.length * 100 : 0;
      
      // stemmer can be mandataris, but not voorzitter or secretaris
      const matchedStemmer = stemmersInPublications.filter(element => mandatarissenList.includes(element) && !voorzittersList.includes(element) && !functionarissenList.includes(element));
      const notMatchedStemmer = stemmersInPublications.filter(element => !matchedStemmer.includes(element));
      const percentageReuseStemmer = stemmersInPublications.length > 0 ? matchedStemmer.length / stemmersInPublications.length * 100 : 0;
      
      const matchedVoorzitters = voorzittersInPublications.filter(element => voorzittersList.includes(element));
      const notMatchedVoorzitters = voorzittersInPublications.filter(element => !matchedVoorzitters.includes(element));
      const percentageReuseVoorzitters = voorzittersInPublications > 0 ? matchedVoorzitters.length / voorzittersInPublications.length * 100 : 0;

      // Secretaris must be functionaris from leidinggevendendatabank
      const matchedSecretarissen = secretarissenInPublications.filter(element => functionarissenList.includes(element));
      const notMatchedSecretarissen = secretarissenInPublications.filter(element => !matchedSecretarissen.includes(element));
      const percentageReuseSecretarissen = secretarissenInPublications > 0 ? matchedSecretarissen.length / secretarissenInPublications.length * 100 : 0;

      // At least one voorzitter must be in the list of aanwezigen
      const foundVoorzitterInAanwezigen = aanwezigenInPublications.filter(element => voorzittersInPublications.includes(element)).length > 0;
      // At least one secretaris must be in the list of aanwezigen
      const foundSecretarisInAanwezigen = aanwezigenInPublications.filter(element => secretarissenInPublications.includes(element)).length > 0;
      // The voorzitter must also be attending in its role as mandataris
      console.log("VOorzitter - mandataris: " + await getMandatarisOfVoorzitter(matchedVoorzitters));
      const foundVoorzitterThatIsAlsoAanwezigAsMandataris = (await getMandatarisOfVoorzitter(matchedVoorzitters)).filter(element => aanwezigenInPublications.includes(element)).length > 0;
      console.log(foundVoorzitterThatIsAlsoAanwezigAsMandataris);

      resolve({
        "percentageReuseAanwezigen": percentageReuseAanwezige,
        "aanwezigenFoundInPublications": aanwezigenInPublications,
        "aanwezigenFoundInPublicationsThatAreLinked": matchedAanwezige,
        "aanwezigenFoundInPublicationsThatAreNotLinked": notMatchedAanwezige,
        "percentageReuseStemmers": percentageReuseStemmer,
        "stemmersFoundInPublications": stemmersInPublications,
        "stemmersFoundInPublicationsThatAreLinked": matchedStemmer,
        "stemmersFoundInPublicationsThatAreNotLinked": notMatchedStemmer,
        "percentageReuseVoorzitters": percentageReuseVoorzitters,
        "voorzittersFoundInPublications": voorzittersInPublications,
        "voorzittersFoundInPublicationsThatAreLinked": matchedVoorzitters,
        "voorzittersFoundInPublicationsThatAreNotLinked": notMatchedVoorzitters,
        "percentageReuseSecretarissen": percentageReuseSecretarissen,
        "secretarissenFoundInPublications": secretarissenInPublications,
        "secretarissenFoundInPublicationsThatAreLinked": matchedSecretarissen,
        "secretarissenFoundInPublicationsThatAreNotLinked": notMatchedSecretarissen,
        "foundVoorzitterInAanwezigen": foundVoorzitterInAanwezigen,
        "foundSecretarisInAanwezigen": foundSecretarisInAanwezigen,
        "foundVoorzitterThatIsAlsoAanwezigAsMandataris": foundVoorzitterThatIsAlsoAanwezigAsMandataris
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

      const relevantPublications = {};
      for (let p of publications) {
        console.log("Checking for publication " + p + " whether in time interval");
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
    # Get start of Zitting
    ?a2 prov:startedAtTime ?startZitting .

    # Get bestuursclassificatie (gemeenteraad, college...)
    OPTIONAL {
      ?a1 besluit:isGehoudenDoor ?bestuursorgaanInTijd .
      OPTIONAL {
          ?bestuursorgaanInTijd skos:prefLabel ?bestuursorgaanInTijdClassificatie.
      }
    
      OPTIONAL {
        ?bestuursorgaanInTijd mandaat:isTijdspecialisatieVan ?bestuursorgaan .
        ?bestuursorgaan skos:prefLabel ?bestuursorgaanClassificatie .
      }
    }
    BIND(if(bound(?bestuursorgaanInTijdClassificatie) = "true"^^xsd:boolean, lcase(str(?bestuursorgaanInTijdClassificatie)), if(bound(?bestuursorgaanClassificatie) = "true"^^xsd:boolean, lcase(str(?bestuursorgaanClassificatie)),  "onbekend")) AS ?bestuursclassificatielabel)

    BIND (if(?startZitting > "${start}"^^xsd:dateTime && ?startZitting < "${eind}"^^xsd:dateTime, "true"^^xsd:boolean, "false"^^xsd:boolean) AS ?withinTimeInterval)

    FILTER (?withinTimeInterval = "true"^^xsd:boolean)
    }
  `, {
          lenient: true,
          httpProxyHandler: new ProxyHandlerStatic(proxy),
          sources: [ p ],
          httpRetryCount: NUMBER_OF_RETRY_COUNTS,
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
      if (Object.keys(relevantPublications).length === 0) resolve({
        "onbekend": []
      })
      else resolve(relevantPublications);
    } catch (e) {
      reject(e);
    }
  });
}

$(document).ready(async () => {
  // Upload previous export to start from
  const prevExportElement = document.getElementById("prevExport");
  prevExportElement.addEventListener("change", handleFiles, false);

  const link = document.getElementById('export').addEventListener('click', handleExportToExcel);
  let interestedMunicipalityLabel;

  mandatarissenList = await fetchMandatarissenThatAreNotVoorzitter();
  voorzittersList = await fetchMandatarissenWithRole("voorzitter");
  functionarissenList = await fetchFunctionarissen();
  const districtburgemeesters = await fetchMandatarissenWithRole("districtsburgemeester");
  voorzittersList = [...voorzittersList, ...districtburgemeesters];
  
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

function handleFiles(e) {
  console.log("handle file")
  const selectedFile = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function(event) {
    let result = event.target.result;
    let workbook = XLSX.read(result, {
      type: "binary"
    });
    workbook.SheetNames.forEach(sheet => {
      let rowObject = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheet]);
      data = rowObject;
    });
  };
  reader.readAsBinaryString(selectedFile);
}

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
    await processMunicipality([m], m, blueprintOfAP, startZitting, eindZitting);
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
    if (data.length > 0) {
      municipalities_sliced = [];
      for (let m of municipalities) {
        let alreadyProcessed = false;
        for (let p of data) {
          // The last municipality must be refetched
          if (m.municipalityLabel != data[data.length -1].Gemeente) {
            if (m.municipalityLabel === p.Gemeente) alreadyProcessed = true;
          }
        }
        if (!alreadyProcessed) municipalities_sliced.push(m);
      }
    }

    for (let start = 0; start < municipalities_sliced.length; start+= NUMBER_OF_MUNICIPALITIES_PER_BATCH) {
      //document.getElementById('processing_now').innerHTML = "Publications found for" + m.municipalityLabel + ": ";
      const end = start + NUMBER_OF_MUNICIPALITIES_PER_BATCH > municipalities_sliced.length ? municipalities_sliced.length : start + NUMBER_OF_MUNICIPALITIES_PER_BATCH;
      console.log(end);
      await Promise.all(municipalities_sliced.slice(start, end).map((m) => processMunicipality(municipalities_sliced, m, blueprintOfAP, startZitting, eindZitting)));

      //await processMunicipality(municipalities_sliced, m, blueprintOfAP, startZitting, eindZitting);

      //document.getElementById("progressbar").value += (100/municipalities_sliced.length);
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
    // publicationsPerBestuursorgaan = await getRelevantPublicationsWithinTimeInterval(publicationsFromSourceWithoutSessionId, proxyForMunicipality, startZitting, eindZitting);
    publicationsPerBestuursorgaan = await getRelevantPublicationsWithinTimeInterval(publicationsFromSource, proxyForMunicipality, startZitting, eindZitting);
  } else {
    publicationsPerBestuursorgaan = {
      "onbekend": publicationsFromSource
      // "onbekend": publicationsFromSourceWithoutSessionId
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
      "Example publication": publicationsFromSourceWithoutSessionId.length ? publicationsFromSourceWithoutSessionId.toString() : "",
      "Startdatum": startZitting,
      "Einddatum": eindZitting,
      "URL LBLOD-omgeving": m.entrypoint,
      "Broken link to publications": brokenLinksToPublications,
      "Number of publications at the source: ": publicationsFromSourceWithoutSessionId.length,
      "Number of publications not yet harvested": publicationsNotYetCollected.length,
      //"Number of publications that have been archived (harvested but not found at source)": publicationsHarvestedButNotFoundAtSource.length,
      "Publications not yet harvested": publicationsNotYetCollected,
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
      let match = blueprintOfMunicipality.filter((a) => a.classUri === b.classUri && a.propertyUri === b.propertyUri);
      console.log(match);
      report[label] = match.length ? match[0]["count"] : "";
    }
    // for (const b of blueprintOfAP) {
    //   let label = b.name;
    //   if (b.niveau != "") label += " (" + b.niveau + ")";
    //   if (Object.keys(blueprintOfMunicipality).includes(b.uri)) report[label] = blueprintOfMunicipality[b.uri]; // count
    //   else report[label] = "";
    // }

    // Check level-2 score. Re-use of mandataris url from mandatadatabank.
    const numberForMandaten = publicationsFromSourceWithoutSessionId.length < NUMBER_OF_PUBLICATIONS_FOR_MANDATARIS ? publicationsFromSourceWithoutSessionId.length : NUMBER_OF_PUBLICATIONS_FOR_MANDATARIS;
    const level2result = await validateLevel2(publicationsFromSourceWithoutSessionId, proxyForMunicipality);
    console.log("Result level 2");
    console.log(level2result);

    // Add the score to the report

    report["Re-use aanwezigen %"] = level2result.aanwezigenFoundInPublicationsThatAreLinked.length != 0 ? level2result.aanwezigenFoundInPublicationsThatAreLinked.length / level2result.aanwezigenFoundInPublications.length * 100 : 0;
    report["Number of found aanwezigen"] = level2result.aanwezigenFoundInPublications.length;
    //report["aanwezigen found"] = level2result.aanwezigenFoundInPublications;
    report["Number of aanwezigen not linked"] = level2result.aanwezigenFoundInPublicationsThatAreNotLinked.length;

    report["Re-use stemmers %"] = level2result.stemmersFoundInPublicationsThatAreLinked.length != 0 ? level2result.stemmersFoundInPublicationsThatAreLinked.length / level2result.stemmersFoundInPublications.length * 100 : 0;
    report["Number of found stemmers"] = level2result.stemmersFoundInPublications.length;
    //report["aanwezigen found"] = level2result.stemmersFoundInPublications;
    report["Number of stemmers not linked"] = level2result.stemmersFoundInPublicationsThatAreNotLinked.length;
    
    report["Re-use voorzitters %"] =  level2result.voorzittersFoundInPublicationsThatAreLinked.length != 0 ? level2result.voorzittersFoundInPublicationsThatAreLinked.length / level2result.voorzittersFoundInPublications.length * 100 : 0;
    report["Number of found voorzitters"] = level2result.voorzittersFoundInPublications.length;
    report["Number of voorzitters not linked"] = level2result.voorzittersFoundInPublicationsThatAreNotLinked.length;
    
    report["Re-use secretarissen %"] = level2result.secretarissenFoundInPublicationsThatAreLinked.length != 0 ? level2result.secretarissenFoundInPublicationsThatAreLinked.length / level2result.secretarissenFoundInPublications.length * 100 : 0;
    report["Number of found secretarissen"] = level2result.secretarissenFoundInPublications.length;
    report["Number of secretarissen not linked"] = level2result.secretarissenFoundInPublicationsThatAreNotLinked.length;
    
    report["foundVoorzitterInAanwezigen"] = level2result.foundVoorzitterInAanwezigen;
    report["foundSecretarisInAanwezigen"] = level2result.foundSecretarisInAanwezigen;
    report["foundVoorzitterThatIsAlsoAanwezigAsMandataris"] = level2result.foundVoorzitterThatIsAlsoAanwezigAsMandataris;
        
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