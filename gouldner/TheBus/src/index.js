/**
    Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

    Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

        http://aws.amazon.com/apache2.0/

    or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

/**
 * This skill uses the Honolulu Bus "TheBus" api (http://api.thebus.org/) to get arrival times for a provided bus stop number
 * - Stop slot: The number of the bus stop you wish to get bus stop information for.
 * - Dialog and Session state: Handles two models, both a one-shot ask and tell model, and a multi-turn dialog model.
 *   If the user provides an incorrect slot in a one-shot model, it will direct to the dialog model. See the
 *   examples section for sample interactions of these models.
 *
 *
 * Examples:
 * One-shot model:
 *  User:  "Alexa, ask The Bus Honolulu arrivals for stop 214"
 *  Alexa: "Here are the arrivals for bus stop 214...."
 * Dialog model:
 *  User:  "Alexa, open The Bus Honolulu"
 *  Alexa: "Welcome to The Bus Honolulu. Which stop would you like bus information for?"
 *  User:  "214"
 *  Alexa: "Here are the arrivals for bus stop 214...."
 */

/**
 * App ID for the skill
 */
//var APP_ID = undefined;//replace with 'amzn1.echo-sdk-ams.app.[your-unique-value-here]';
var APP_ID = undefined;//replace with 'amzn1.echo-sdk-ams.app.d9ad7478-d8b3-4d06-bbe5-06e72c3037b3';

var http = require('http'),
    alexaDateUtil = require('./alexaDateUtil'),
    fs = require('fs'),
    xml = require('xml2js');

var configFile = 'config.json';
var configuration = JSON.parse(
    fs.readFileSync(configFile)
);

var key = configuration.key;

/**
 * The AlexaSkill prototype and helper functions
 */
var AlexaSkill = require('./AlexaSkill');

/**
 * TheBus is a child of AlexaSkill.
 * To read more about inheritance in JavaScript, see the link below.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript#Inheritance
 */
var TheBus = function () {
    AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
TheBus.prototype = Object.create(AlexaSkill.prototype);
TheBus.prototype.constructor = TheBus;

// ----------------------- Override AlexaSkill request and intent handlers -----------------------

TheBus.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    console.log("onSessionStarted requestId: " + sessionStartedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any initialization logic goes here
};

TheBus.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    handleWelcomeRequest(response);
};

TheBus.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("onSessionEnded requestId: " + sessionEndedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any cleanup logic goes here
};

/**
 * override intentHandlers to map intent handling functions.
 */
TheBus.prototype.intentHandlers = {
    "OneshotBusIntent": function (intent, session, response) {
        handleOneshotBusRequest(intent, session, response);
    },

    "DialogBusIntent": function (intent, session, response) {
        // Determine if this turn is for Stop or an error.
        // We could be passed slots with values, no slots, slots with no value.
        var stopSlot = intent.slots.Stop;
        handleStopDialogRequest(intent, session, response);
    },

    "AMAZON.HelpIntent": function (intent, session, response) {
        handleHelpRequest(response);
    },

    "AMAZON.StopIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    },

    "AMAZON.CancelIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    }
};

// -------------------------- TheBus Domain Specific Business Logic --------------------------
function handleWelcomeRequest(response) {
    var whichStopPrompt = "For which Bus Stop would you like to request bus information ?",
        speechOutput = {
            speech: "<speak>Welcome to The Bus Honolulu Arrival Service. "
                + whichStopPrompt
                + "</speak>",
            type: AlexaSkill.speechOutputType.SSML
        },
        repromptOutput = {
            speech: "I can lead you through providing a stop "
                + "to get bus information, "
                + "or you can simply open The Bus Honolulu and ask a question like, "
                + "when will bus arrive at stop 255. "
                + whichStopPrompt,
            type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };

    response.ask(speechOutput, repromptOutput);
}

function handleHelpRequest(response) {
    var repromptText = "Which stop would you like bus information for?";
    var speechOutput = "I can lead you through providing a stop "
        + "to get bus information, "
        + "or you can simply open The Bus Honolulu and ask a question like, "
        + "when will bus arrive at stop 255. "
        + "Or you can say exit. "
        + repromptText;

    response.ask(speechOutput, repromptText);
}

/**
 * Handles the dialog step where the user provides a city
 */
function handleStopDialogRequest(intent, session, response) {
    // Determine stop, using default if none provided
    var stop = intent.slots.Stop;
    if (!stop || stop.value == null) {
        response.ask('sorry, I did not hear the stop, please say that again', 'please say the stop again');
        return;
    }
    var stopValue = parseInt(stop.value);
    if (isNaN(stopValue)) {
        console.log('Invalid stop value = ' + stop.value);
        response.ask('sorry, I did not hear the stop, please say that again', 'please say the stop again');
        return;
    }
    // all slots filled, either from the user or by default values. Move to final request
    getFinalBusResponse(stopValue, response);
}

/**
 * This handles the one-shot interaction, where the user utters a phrase like:
 * 'Alexa, open Tide Pooler and get tide information for Seattle on Saturday'.
 * If there is an error in a slot, this will guide the user to the dialog approach.
 */
function handleOneshotBusRequest(intent, session, response) {
    // Determine stop, using default if none provided
    var stopSlot = intent.slots.Stop;
    var stopValue = parseInt(stopSlot.value);
    if (isNaN(stopValue)) {
        console.log('Invalid stop value = ' + stopSlot.value);
        response.ask('sorry, I did not hear the bus stop, please say that again', 'please say the bus stop again');
        return;
    }
    // all slots filled, either from the user or by default values. Move to final request
    getFinalBusResponse(stopValue, response);
}


/**
 * Both the one-shot and dialog based paths lead to this method to issue the request, and
 * respond to the user with the final answer.
 */
function getFinalBusResponse(stopValue, response) {
    // Issue the request, and respond to the user
    makeTheBusCall(stopValue, function responseCallback(speechOutput) { 
        response.tellWithCard(speechOutput, "TheBusHonolulu", speechOutput)
    });
}

function makeTheBusCall(stopValue, callback) {
    var url = "http://api.thebus.org/arrivals/?key=" + key + "&stop=" + stopValue;


    http.get(url, function (res) {
      res.setEncoding('utf8');
      var body = '';
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function() {
        routes = {};
        var speechOutput = processXml(body);
        callback(speechOutput);
      });
    }).on('error', function (e) {
        console.log("Communications error: " + e.message);
        callback("Sorry there was an error contacting the bus service");
    });

}

/**   **/
var processXml = function(data) {
  var parser = new xml.Parser();

  var speechOutput = "Here are the arrivals for ";

  parser.parseString(data, function (err, result) {
    if (typeof(result.stopTimes.arrival) == 'undefined') {
        speechOutput = "Sorry, no arrivals found for stop" + result.stopTimes.stop + ".  Are you sure this is a valid stop?";
        return speechOutput;
    }
    console.log(result.stopTimes.stop + " - " + result.stopTimes.timestamp );
    speechOutput = speechOutput + " bus stop " + result.stopTimes.stop + ".\n";
    var foundCanceled=0;
    var foundArrival=0;
    result.stopTimes.arrival.forEach(function(arrival,i) {
      if (routes[arrival.route]) {
        if (routes[arrival.route].length <= 4) {
          routes[arrival.route].push(arrival.stopTime[0]);
        }
      } else {
          routes[arrival.route] = arrival.stopTime;
      }

      console.log(arrival.route + " - "
                  + arrival.headsign + " at "
                  + arrival.stopTime + "("
                  + arrival.estimated + ")"
                  );
      var improvedHeadsign = arrival.headsign.toString();
      improvedHeadsign = improvedHeadsign.replace("UH","University of Hawaii");
      // canceled 0=not canceled 1=canceled -1=was canceled not anymore
      if (arrival.canceled <= 0) {
          foundArrival=1;
          speechOutput = speechOutput + " Route " + arrival.route + " heading to "
                         + improvedHeadsign + " arriving at " + arrival.stopTime;
          // estimated 0=scheduled time no GPS, 1=estimated time based on GPS
        
          if (arrival.estimated) {
             speechOutput = speechOutput + " estimated by GPS"; 
          } else {
             speechOutput = speechOutput + " scheduled time no GPS"; 
          }
          if (arrival.canceled == -1) {
             speechOutput = speechOutput + " was canceled not canceled anymore";
          }
      } else {
          foundCanceled=1;
      }
      if (!foundArrival) {
          if (foundCanceled) {
             speechOutput = speechOutput + " Sorry, only canceled arrivals were found.";
          } else {
             speechOutput = speechOutput + " Sorry, no arrivals were returned.";
          }
      }
      // Add newline so card is more readable
      speechOutput = speechOutput + ".\n"
    });
  });
  return speechOutput;
};

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    var theBus = new TheBus();
    theBus.execute(event, context);
};

