var CDEX;
if (!CDEX) {
    CDEX = {};
}

(function () {
    CDEX.client = null;
    CDEX.communicationRequests = null;
    CDEX.communicationRequest = null;

    CDEX.resources = {
        "queries": [],
        "docRef": []
    }

    CDEX.now = () => {
        let date = new Date();
        return date.toISOString();
    };

    CDEX.getGUID = () => {
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        };
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    CDEX.formatDate = (date) => {
        // TODO: implement a more sensible screen date formatter that uses an ISO date parser and translates to local time
        const d = date.split('T');
        return d[0] + ' ' + d[1].substring(0,5);
    }

    CDEX.displayPatient = (pt, screen) => {
        $('#' + screen).html(CDEX.getPatientName(pt));
    };

    CDEX.displayOrganization = (org, screen) => {
        $('#' + screen).append("<table><tbody><tr><td>" + org.identifier[0].system + "</td><td>" +
            org.identifier[0].value + "</td></tr></tbody></table>");
    };

    CDEX.displayScreen = (screenID) => {
        $('#intro-screen').hide();
        $('#data-request-screen').hide();
        $('#review-screen').hide();
        $('#confirm-screen').hide();
        $('#communication-request-screen').hide();
        $('#preview-screen').hide();
        $('#'+screenID).show();
    };

    CDEX.displayIntroScreen = () => {
        CDEX.displayScreen('intro-screen');
    };

    CDEX.displayPreviewScreen = () => {
        $("#preview-list").empty();
        CDEX.displayScreen('preview-screen');
    };

    CDEX.displayCommunicationRequestScreen = () => {
        CDEX.displayScreen('communication-request-screen');
    };

    CDEX.displayDataRequestScreen = () => {
       CDEX.displayScreen('data-request-screen');
    };

    CDEX.displayConfirmScreen = () => {
        CDEX.displayScreen('confirm-screen');
    };

    CDEX.displayReviewScreen = () => {
        $("#card").empty();
        $("#final-list").empty();
        let sender = CDEX.communicationRequest.sender.reference.split("/");
        CDEX.client.api.fetchAll(
            {
                type: "Organization",
                query: {
                    _id: sender[1]
                }
            }
        ).then(function (organization) {
            CDEX.displayOrganization(organization[0], "card");
        });
        CDEX.client.api.fetchAll(
            {
                type: "Patient",
                query: {
                    _id: CDEX.communicationRequest.subject.reference
                }
            },
            ["Patient.patientReference"]
        ).then(function (patients) {
            CDEX.displayPatient(patients[0], "review-name");
        });
        if (CDEX.communicationRequest.payload) {
            CDEX.communicationRequest.payload.forEach(function (content, index) {
                $('#final-list').append(
                    "<tr> <td class='medtd'>" + content.contentString +
                    "</td></tr><tr><td><table><thead id='reviewHead" + index  + "'></thead><tbody id='finalPayload" + index + "'></tbody></table></td></tr>");
                if (CDEX.communicationRequest.payload[index].extension) {
                    if (CDEX.communicationRequest.payload[index].extension[0].valueString) {
                        let promise;
                        let config = {
                            type: 'GET',
                            url: CDEX.providerEndpoint.url + "/" + CDEX.communicationRequest.payload[index].extension[0].valueString
                        };

                        promise = $.ajax(config);
                        promise.then((results) => {
                            if (results) {
                                if(results.total == 0){
                                    $('#finalPayload' + index).append("<tr><td>No matching data</td></tr>");
                                }else {
                                    if(results.entry) {
                                        results.entry.forEach(function (result) {
                                            if(result.resource.text){
                                                $('#finalPayload' + index).append("<tr><td>" + result.resource.text.div + "</td></tr>");
                                            }else {
                                                $('#finalPayload' + index).append("<tr><td><pre>" + JSON.stringify(result.resource, null, '\t') + "</pre></td></tr>");
                                            }
                                        });
                                    }else{
                                        if(results.text){
                                            $('#finalPayload' + index).append("<tr><td>" + results.text.div + "</td></tr>");
                                        }else{
                                            $('#finalPayload' + index).append("<tr><td><pre>" + JSON.stringify(results, null, '\t') + "</pre></td></tr>");
                                        }
                                    }
                                }
                            }
                        });
                    } else if (CDEX.communicationRequest.payload[index].extension[0].valueCodeableConcept) {
                        CDEX.client.api.fetchAllWithReferences(
                            {
                                type: "DocumentReference",
                                query: {
                                    type: CDEX.communicationRequest.payload[index].extension[0].valueCodeableConcept.coding[0].code
                                }
                            }
                        ).then(function (documentReferences) {
                            if(documentReferences.data.entry){
                                let d = documentReferences.data.entry;
                               $('#reviewHead' + index).append("<th>Id</th><th>Author</th><th>Category</th>");
                                d.forEach(function (docRef, docRefIndex) {
                                    $('#finalPayload' + index).append("<tr><td>" + docRef.resource.id +
                                        "</td><td>" + docRef.resource.author[0].display + "</td><td>" +
                                        docRef.resource.category[0].text +
                                        "</td><td>" + CDEX.formatDate(docRef.resource.date) + "</td></tr>");
                                });
                            }else{
                                $('#finalPayload' + index).append("<tr><td>No " + content.contentString + " available</td></tr>");
                            }
                        });
                    }
                }
            });
        }
        CDEX.resources.docRef.forEach(function (docRef, index){
            let attachment = docRef.docRefResource.content[0].attachment;
                CDEX.resources.docRef[index].results.push({"url": attachment.url, "contentType": attachment.contentType});
            if (attachment.contentType === "application/pdf") {
                if (attachment.url) {
                    let promiseBundle;
                    let config = {
                        type: 'GET',
                        url: CDEX.providerEndpoint.url + attachment.url
                    };
                    promiseBundle = $.ajax(config);
                    promiseBundle.then((pdf) => {
                        CDEX.resources.docRef[index].results[CDEX.resources.docRef[index].results.length - 1].data = pdf;
                    });
                } else if (attachment.data) {
                    CDEX.resources.docRef[index].results[CDEX.resources.docRef[index].results.length - 1].data = attachment.data;
                }
            }
            else if(attachment.contentType === "application/hl7-v3+xml"){
                let promiseBinary;
                let config = {
                    type: 'GET',
                    url: CDEX.providerEndpoint.url + attachment.url
                };
                promiseBinary = $.ajax(config);
                promiseBinary.then((binary) => {
                    let i = CDEX.resources.docRef[index].results.length - 1;
                    CDEX.resources.docRef[index].results[i].data = btoa(binary);
                });
            }else if(attachment.contentType === "application/fhir+xml"){
                let promiseBundle;
                let config = {
                    type: 'GET',
                    url: CDEX.providerEndpoint.url + attachment.url
                };

                promiseBundle = $.ajax(config);
                promiseBundle.then((bundles) => {
                    CDEX.resources.docRef[index].results[CDEX.resources.docRef[index].results.length - 1].data = btoa(JSON.stringify(bundles));
                });
            }
        });
        CDEX.displayScreen('review-screen');
    };

    CDEX.displayErrorScreen = (title, message) => {
        $('#error-title').html(title);
        $('#error-message').html(message);
        CDEX.displayScreen('error-screen');
    }

    CDEX.disable = (id) => {
        $("#"+id).prop("disabled",true);
    };

    CDEX.getPatientName = (pt) => {
        if (pt.name) {
            let names = pt.name.map((n) => n.given.join(" ") + " " + n.family);
            return names.join(" / ");
        } else {
            return "anonymous";
        }
    };

    CDEX.openCommunicationRequest = (commRequestId) => {
        CDEX.displayDataRequestScreen();
        CDEX.communicationRequests.forEach(function(communicationRequest) {
            if(communicationRequest.id === commRequestId) {
                CDEX.communicationRequest = communicationRequest;
                 CDEX.client.api.fetchAll(
                    {type: "Patient",
                        query: {
                            _id: communicationRequest.subject.reference
                        }
                    },
                    [ "Patient.patientReference" ]
                ).then(function(patients) {
                    CDEX.displayPatient(patients[0], "patient-name");
                });
                if(communicationRequest.payload){
                    communicationRequest.payload.forEach(function (content, index) {
                        $('#selection-list').append(
                            "<tr> <td class='medtd'>" + content.contentString +
                            "</td></tr>" + "<tr><td><table><thead id='head" + index  + "'></thead><tbody id='payload" + index + "'></tbody></table></td></tr>");
                        if(communicationRequest.payload[index].extension) {
                            if (communicationRequest.payload[index].extension[0].valueString) {
                                let promise;
                                let config = {
                                    type: 'GET',
                                    url: CDEX.providerEndpoint.url + "/" + communicationRequest.payload[index].extension[0].valueString
                                };
                                CDEX.resources.queries.push({
                                    "question": content.contentString,
                                    "valueString": communicationRequest.payload[index].extension[0].valueString,
                                    "index": index
                                });
                                promise = $.ajax(config);
                                promise.then((results) => {
                                    if (results) {
                                        if(results.total == 0){
                                            $('#payload' + index).append("<tr><td>No matching data</td></tr>");
                                        }else {
                                            if(results.entry) {
                                                CDEX.resources.queries.forEach(function (r, idx) {
                                                    if(r.index === index){
                                                        CDEX.resources.queries[idx].answers = results.entry;
                                                    }
                                                });
                                                results.entry.forEach(function (result) {
                                                    if(result.resource.text){
                                                        $('#payload' + index).append("<tr><td>" + result.resource.text.div + "</td></tr>");
                                                    }else {
                                                        $('#payload' + index).append("<tr><td><pre>" + JSON.stringify(result.resource, null, '\t') + "</pre></td></tr>");
                                                    }
                                                });
                                            }else{
                                                if(results.text){
                                                    CDEX.resources.queries.forEach(function (r, idx) {
                                                        if(r.index === index){
                                                            CDEX.resources.queries[idx].answers = results;
                                                        }
                                                    });
                                                    $('#payload' + index).append("<tr><td>" + results.text.div + "</td></tr>");
                                                }else{
                                                $('#payload' + index).append("<tr><td><pre>" + JSON.stringify(results, null, '\t') + "</pre></td></tr>");
                                                }
                                            }
                                        }
                                    }
                                });
                            }else if(communicationRequest.payload[index].extension[0].valueCodeableConcept){

                                CDEX.client.api.fetchAllWithReferences(
                                    {type: "DocumentReference",
                                        query: {
                                            type: communicationRequest.payload[index].extension[0].valueCodeableConcept.coding[0].code
                                        }
                                    }
                                ).then(function(documentReferences) {

                                    if(documentReferences.data.entry){
                                        let d = documentReferences.data.entry;

                                        $('#head' + index).append("<th>Id</th><th>Author</th><th>Category</th><th>Created Date</th><th>Preview</th>");
                                        d.forEach(function (docRef, docRefIndex) {
                                            CDEX.resources.docRef.push({
                                                "id": docRef.resource.id,
                                                "code": communicationRequest.payload[index].extension[0].valueCodeableConcept.coding[0].code,
                                                "docRefResource": docRef.resource,
                                                "results": []
                                            });
                                            let idButton = "previewId" + docRefIndex;
                                            $('#payload' + index).append("<tr><td>" + docRef.resource.id +
                                                "</td><td>" + docRef.resource.author[0].display + "</td><td>" +
                                                docRef.resource.category[0].text + "</td><td>" +
                                                CDEX.formatDate(docRef.resource.date) +
                                                "</td><td><button type='button' class='btn btn-secondary' id='" + idButton +
                                                "'>Preview</button></td></tr>");
                                            $('#' + idButton).click(() => {
                                                CDEX.openPreview(docRef.resource);
                                            });
                                        });
                                    }else{
                                        $('#payload' + index).append("<tr><td>No " + content.contentString + " available</td></tr>");
                                    }
                                });
                            }
                        }
                    });
                }
            }
        });
    };

    CDEX.openPreview = (docRef) => {
        let attachment = docRef.content[0].attachment;
        CDEX.displayPreviewScreen();

        const displayBlob = (blob) => {
            const blobUrl = URL.createObjectURL(blob);
            const blobType = blob.type;
            $('#preview-list').append("<p><object data='" + blobUrl + "' type='" + blobType + "' width='100%' height='600px' /></p>");
        }

        // based on https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript
        const b64toBlob = (b64Data, contentType='', sliceSize=512) => {
            const byteCharacters = atob(b64Data);
            const byteArrays = [];

            for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                const slice = byteCharacters.slice(offset, offset + sliceSize);

                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
                }

                const byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
            }

            const blob = new Blob(byteArrays, {type: contentType});
            return blob;
        }

        if (attachment.contentType === "application/pdf") {

            if (attachment.url) {
                CDEX.client.fetchBinary(attachment.url).then(displayBlob);
            } else if (attachment.data) {
                const blob = b64toBlob(attachment.data, "application/pdf");
                displayBlob(blob);
            }
        }
        else if(attachment.contentType === "application/hl7-v3+xml"){
            let promiseBinary;
            let config = {
                type: 'GET',
                url: CDEX.providerEndpoint.url + attachment.url
            };

            promiseBinary = $.ajax(config);
            promiseBinary.then((binary) => {
                console.log(binary);
            });
        }else if(attachment.contentType === "application/fhir+xml"){
            let promiseBundle;
            let config = {
                type: 'GET',
                url: CDEX.providerEndpoint.url + attachment.url
            };

            promiseBundle = $.ajax(config);
            promiseBundle.then((bundles) => {
                let bundle = bundles.entry;
                bundle.forEach(function (content) {
                    if (content.resource.text) {
                        $('#preview-list').append("<tr><td>" + content.resource.text.div + "</td></tr>");
                    }
                });
            });
        }
    };

    CDEX.addToPayload = () => {
        console.log(CDEX.resources);
        let timestamp = CDEX.now();
        let communication = CDEX.operationPayload;
        communication.authoredOn = timestamp;
        communication.basedOn[0].reference = "CommunicationRequest/" + "cdex-example-resource-request"//CDEX.communicationRequest.id;
        communication.id = CDEX.getGUID();
        communication.sent = timestamp;
        let payload = [];
        let idx = 0;
        CDEX.resources.queries.forEach(function(query){
            payload[idx] = {
                "extension": [
                    {
                        "url": "http://hl7.org/fhir/us/davinci-cdex/StructureDefinition/cdex-payload-query-string",
                        "valueString": "VALUESTRING"
                    }
                ],
                "contentAttachment": {
                    "contentType": "application/fhir+xml",
                    "data": "DATA"
                }
            }
            payload[idx].extension[0].valueString = query.valueString;
            payload[idx].contentAttachment.data = btoa(JSON.stringify(query.answers));
            idx ++;
        });
        CDEX.resources.docRef.forEach(function(docRef, index){
            payload[idx] = {
                "extension": [{
                    "url": "http://hl7.org/fhir/us/davinci-cdex/StructureDefinition/cdex-payload-clinical-note-type",
                    "valueCodeableConcept": {
                        "coding": [{
                            "system": "http://loinc.org",
                            "code": "CODE"}]}}],
                "contentAttachment":{
                    "contentType": "CONTENTTYPE", //application/pdf
                    "data": "DATA",
                    "title": "TITLE"}
            };
            payload[idx].extension[0].valueCodeableConcept.coding[0].code = CDEX.resources.docRef[index].code;
            payload[idx].contentAttachment.contentType = CDEX.resources.docRef[index].docRefResource.content[0].attachment.contentType;
            payload[idx].contentAttachment.title = CDEX.resources.docRef[index].docRefResource.content[0].attachment.title;
            payload[idx].contentAttachment.data = CDEX.resources.docRef[index].results[0].data;
            idx++;
        });

        communication.payload = payload;
        CDEX.operationPayload = communication;
    };

    CDEX.loadData = (client) => {
        CDEX.displayIntroScreen();
        $('#scenario-intro').html(CDEX.scenarioDescription.description);
        try {
            CDEX.client = client;
            CDEX.client.api.fetchAll(
                {type: "CommunicationRequest"
                }
            ).then(function(communicationRequests) {
                CDEX.communicationRequests = communicationRequests;
                if(communicationRequests.length) {
                    CDEX.communicationRequests.forEach(function(commReq, index){
                        if(commReq.sender) {
                            let organization = commReq.sender.reference.split("/");
                            CDEX.client.api.fetchAll(
                                {
                                    type: "Organization",
                                    query: {
                                        _id: organization[1]
                                    }
                                },
                                ["Patient.patientReference"]
                            ).then(function (org) {
                                $( ".requester" + org[0].id).html("<div>" + org[0].identifier[0].value + "</div>");
                            });
                            let idName = "btnCommReq" + index;
                            let description = "";

                            if (commReq.text) {
                                if (commReq.text.div) {
                                    description = commReq.text.div;
                                }
                            }
                            let senderClass = "";
                            if(commReq.sender){
                                let organization = commReq.sender.reference.split("/");
                                senderClass = organization[organization.length - 1];
                            }
                            $('#communication-request-selection-list').append(
                                "<tr><td class='medtd'>" + commReq.id + "</td><td class='medtd'>" + description +
                                "</td><td class='medtd requester" + senderClass + "'></td><td class='medtd'>" +
                                CDEX.formatDate(commReq.authoredOn) + "</td><td class='medtd'><button type='button' class='btn btn-secondary' id='" +
                                idName + "' >Respond</button></td></tr>");

                            $('#' + idName).click(() => {
                                CDEX.openCommunicationRequest(commReq.id)
                            });
                        }
                    });
                }
            });
        } catch (err) {
            CDEX.displayErrorScreen("Failed to initialize communication requests menu", "Please make sure that everything is OK with request configuration");
        }
    };

    CDEX.reconcile = () => {

        CDEX.disable('btn-submit');
        CDEX.disable('btn-edit');
        $('#btn-submit').html("<i class='fa fa-circle-o-notch fa-spin'></i> Submit Communication");

        CDEX.addToPayload();
        CDEX.finalize();
    };

    CDEX.initialize = (client) => {
        if (sessionStorage.operationPayload) {
            if (JSON.parse(sessionStorage.tokenResponse).refresh_token) {
                // save state in localStorage
                let state = JSON.parse(sessionStorage.tokenResponse).state;
                localStorage.tokenResponse = sessionStorage.tokenResponse;
                localStorage[state] = sessionStorage[state];
            }
            CDEX.operationPayload = JSON.parse(sessionStorage.operationPayload);
            CDEX.providerEndpoint.accessToken = JSON.parse(sessionStorage.tokenResponse).access_token;
            CDEX.finalize();
        } else {
            CDEX.loadData(client);
        }
    };

    CDEX.finalize = () => {
        let promise;
        let config = {
            type: 'PUT',
            url: CDEX.payerEndpoint.url + CDEX.submitEndpoint + CDEX.operationPayload.id + "$submit-data",
            data: JSON.stringify(CDEX.operationPayload),
            contentType: "application/fhir+json"
        };

       promise = $.ajax(config);
        console.log(JSON.stringify(CDEX.operationPayload, null, 2));
        promise.then(() => {
            CDEX.displayConfirmScreen();
        }, () => CDEX.displayErrorScreen("Communication submission failed", "Please check the submit endpoint configuration.  You can close this window now."));
    };

    $('#btn-start').click(function (){
        CDEX.displayCommunicationRequestScreen();
    });

    $('#btn-back-comm-list').click(function (){
        $('#selection-list').empty();
        CDEX.displayCommunicationRequestScreen();
    });
    $('#btn-review').click(CDEX.displayReviewScreen);
    $('#btn-edit').click(CDEX.displayDataRequestScreen);
    $('#btn-back').click(CDEX.displayDataRequestScreen);
    $('#btn-submit').click(CDEX.reconcile);

    FHIR.oauth2.ready(CDEX.initialize);

}());
