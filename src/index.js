var React = require('react'),
    ReactDOM = require('react-dom'),
    $ = require('jquery'),
    ReceiveInterface = require('./receive-interface'),
    ExamplesEditor = require('./examples-editor'),
    _ = require('underscore');

global.jQuery = $; // for form validation library

function pollute(names) {
  _.each(names, function(name) {
    global[name] = eval(name);
  })
}


function bound(obj) {
  _.each(_.methods(obj), function(name) {
    var method = obj[name];
    obj[name] = _.bind(method, obj);
  })
  return obj;
}

function showSlide(id) {
  var current = '#' + id;
  var others = '.slide:not(' + current + ')';
  $(others).removeClass('show');
  $(current).addClass('show');
}

// example sequences for receiving
var curriculaDf = _.filter(require('./curricula'),
                           // d06c: don't do delimiters
                           function(x) { return x['rule.id'] != 'delimiters'});
// curricula is an array of response rows (fields are: example.num, polarity, rule.id, string, trial.num, worker.id)
// munge into a dictionary form:
// keys are ruleIds, values are arrays
var ruleIds = _.chain(curriculaDf).map('rule.id').uniq().value();

var curricula = _.chain(ruleIds)
    .map(function(ruleId) {
      var responses = _.filter(curriculaDf, {'rule.id': ruleId});
      return [ruleId, _.groupBy(responses, 'teacher.id')]
    })
    .object()
    .value();
global.curricula = curricula;
// d08a pilot: as a sanity check, restrict attention to three sequences
curricula['suffix-s'] = _.pick(curricula['suffix-s'], '51be3ed', '13ab615', '66584c1');
curricula['zip-code'] = _.pick(curricula['zip-code'], 'ecba21d','51be3ed', 'ec8b199');
curricula['3a'] = _.pick(curricula['3a'], '6f2ca8f', 'f29e6ff','db12c41');


var AFCGlossItems = {
  '3a': [{glossId: 'a{1,}',     gloss: 'The sequence must be all <code>a</code>\'s and they must be lower case'},
         {glossId: 'a{3,}',     gloss: 'The sequence must be all <code>a</code>\'s, they must be lower case, and there need to be at least 3', correct: true},
         {glossId: '(a|A){1,}', gloss: 'The sequence must be all <code>a</code>\'s and they can be either lower case or upper case'},
         {glossId: '(a|A){3,}', gloss: 'The sequence must be all <code>a</code>\'s, they can be either lower case or upper case, and there at need to be at least 3'}
        ],
  'zip-code': [{glossId: '\\d+',     gloss: 'The sequence must be all numbers'},
               {glossId: '.{5}',     gloss: 'The sequence must be exactly 5 characters long'},
               {glossId: '\\d{5}',   gloss: 'The sequence must be all numbers and be exactly 5 characters long', correct: true},
               {glossId: '\\d{1,5}', gloss: 'The sequence must be all numbers and must be between 1 and 5 characters long'}
              ],
  'suffix-s': [{glossId: '.*[a-z].*', gloss: 'The sequence must contain at least one letter (<code>a</code>, <code>b</code>, <code>c</code>, ...)'},
               {glossId: '.*[sS].*',  gloss: 'The sequence must contain at least one <code>s</code>, either upper or lower case'},
               {glossId: '.*s',       gloss: 'The sequence must end in an <code>s</code> and it must be lower case', correct: true},
               {glossId: '.*[s|S]',   gloss: 'The sequence must end in an <code>s</code> and can be either upper or lower case'}
              ]
};

var generalizationQuestions = {
  '3a': ['aaaa',
         'bbb',
         'a',
         'b93kgw;_mfo',
         'alpaca',
         'AAA',
         'aaabc',
         'DASASA',
         'aaaaaaaaaaaaaa',
         'AAAAA'],
  'zip-code': ['31708',
               '56789',
               '236778',
               '-12541',
               '9076.2',
               'nfas10583vns',
               '238',
               'erqew',
               'abcde',
               'dskfjlmxF'
              ],
  'delimiters': ['xyzsf',
                 '[mna_8%234]',
                 '(fdfm3t)',
                 '{0thg1!@}',
                 'gnro[34r3]',
                 '[4939k4k3',
                 '[]',
                 'xccg3]',
                 '[fbndofb]]',
                 '[[qoo_w3]',
                 '[[223768]]'
                ],
  'suffix-s': ['ring',
               'breaks',
               'store',
               'past',
               '12berba32',
               'yr321a',
               'psss7',
               '35r6u'
              ]
};

global.generalizationQuestions = generalizationQuestions;

// get randomization information from server for learning
if (false) {
  var numRules = _.size(curricula);
  var receivingExamples = [];
  global.receivingExamples = receivingExamples;
  global.gotRandom = false;
  function setRandomize(ruleId, seqNumber) {
    //console.log('setRandomize', ruleId, seqNumber);



    if (_.filter(receivingExamples, {id: ruleId}).length > 0) {
      // console.log('ignored second attempt to set randomization for ' + ruleId );
      return;
    }

    var seqs = global.curricula[ruleId], // NB: global is necessary
    generalizationQuestions = global.generalizationQuestions[ruleId],
    seqIds = _.keys(seqs);

    var randomization, seqId;

    if (!_.isUndefined(seqNumber) && seqNumber > -1) {
      randomization = 'server';
      seqId = seqIds[seqNumber % seqIds.length];
    } else {
      randomization = 'client';
      seqId = _.sample(seqIds);
    }

    var examples = seqs[seqId];

    var sampledRule = {id: ruleId,
                       seqId: seqId,
                       examples: examples,
                       questions: _.shuffle(generalizationQuestions),
                       randomization: randomization
                      };

    receivingExamples.push(sampledRule);

    if (receivingExamples.length == numRules) {
      global.gotRandom = true
      clearInterval(global.loadingTimer)
      receivingExamples = _.shuffle(receivingExamples);

      $('#intro button.next')
        .text('Next')
        .removeAttr('disabled')
        .one('click', receive.next)
    }
  }
  global.setRandomize = setRandomize;

  var afterDo = function(ms, f) {
    return setTimeout(f, ms);
  }

  _.each(curricula,
         function(entry, k) {
           // if we don't get a response from the server within 15 seconds, just randomize on client side
           var secondsLeft = 15;
           afterDo(0, function() { setRandomize(k) });

           // var jsonpUrl = "https://web.stanford.edu/~louyang/cgi-bin/counter.php?callback=setRandomize&key=" + k;
           // var $script = $("<script>").attr("src", jsonpUrl);
           // $(global.document.body).append($script);
         }
        )
}

var distractors = {
  'zip-code': [
    {id: 'zip-code-1',
     description: 'The sequence is exactly 5 characters long'
    },
    {id: 'zip-code-2',
     description: 'The sequence contains only numeric digits (<code>0</code>, <code>1</code>, <code>2</code>, <code>3</code>, <code>4</code>, <code>5</code>, <code>6</code>, <code>7</code>, <code>8</code>, or <code>9</code>)'
    }
  ],
  '3a': [
    {id: '3a-1',
     description: "The sequence must be at least 6 characters long and contain <i>only</i> lowercase <code>a</code>'s (no other characters are allowed) "
    },
    {id: '3a-2',
     description: "The sequence contains <i>only</i> <code>a</code>'s, which can be either upper or lower case"
    }
  ],
  'suffix-s': [
    {id: 'suffix-s-1',
     description: 'The sequence must contain at least one lower case <code>s</code>'},
    {id: 'suffix-s-2',
     description: 'The sequence must contain at least one lower case letter'}
  ],
  'delimiters': [
    {id: 'delimiters-1',
     description: 'The first character of the sequence must be <code>[</code> '},
    {id: 'delimiters-2',
     description: 'The last character of the sequence must be <code>]</code>'}]
}

var sendingRules = _.shuffle([
  _.sample(distractors['3a']),
  _.sample(distractors['zip-code']),
  _.sample(distractors['suffix-s']),
  _.sample(distractors['delimiters'])
]);

var send = bound({
  inputs: sendingRules,
  outputs: [],
  trial: function(input) {
    var comp = React.createElement(
      ExamplesEditor,
      {rule: input,
       after: function(output) {
         send.outputs.push(output);
         ReactDOM.unmountComponentAtNode($('.examples-editor-container')[0]);
         send.next();
       }});

    ReactDOM.render(comp, $('.examples-editor-container')[0], function() {
      showSlide('give-examples')
    })

  },
  next: function() {
    var i = this.outputs.length;
    var n = this.inputs.length;

    if (i == send.inputs.length) {
      this.after(this)
    } else {
      // advance progress indicator
      $('#give-examples .progress span').text('Completed: ' + i + '/' + n)

      $('#give-examples .progress .completed').css({
        width: Math.round(100 * i / n) + '%'
      })

      this.trial(this.inputs[i]);
    }
  },
  start: function() {
    this.next()
  }
});

var receive = bound({
  inputs: receivingExamples,
  outputs: [],
  trial: function(input) {
    var comp = React.createElement(
      ReceiveInterface,
      {examples: input.examples,
       AFCGlossItems: AFCGlossItems[input.id],
       after: function(output) {
         var trialNum = receive.outputs.length;
         receive.outputs.push(_.extend({},
                                       receive.inputs[trialNum],
                                       output
                                      ));
         ReactDOM.unmountComponentAtNode($('.examples-editor-container')[0]);

         if (receive.outputs.length == receive.inputs.length) {
           $('#interstitial p').text('Now, just fill out a brief questionnaire and the task will be finished.')
         }

         $('#interstitial button').one('click', receive.next)
         showSlide('interstitial');

       }});

    ReactDOM.render(comp, $('.examples-editor-container')[0], function() {
      showSlide('give-examples')
    })

  },
  next: function() {
    var i = this.outputs.length;
    var n = this.inputs.length;

    if (i == receive.inputs.length) {
      this.after(this)
    } else {
      // advance progress indicator
      $('#give-examples .progress span').text('Rules completed: ' + i + '/' + n)

      $('#give-examples .progress .completed').css({
        width: Math.round(100 * i / n) + '%'
      })

      this.trial(this.inputs[i]);
    }
  },
  start: function() {
    this.next()
  }
});


var questionnaire = {
  start: function() {
    showSlide('questionnaire')
  },
  outputs: {},
  submit: function() {
    $('#q textarea, #q :checked').each(function(i,x) {
      var key = x.name.replace("q_",""), val = $(x).val();
      questionnaire.outputs[key] = val
    });

    questionnaire.after()
  }
}

$(global.document).ready(function() {
  questionnaire.validator = $("#q").validate({submitHandler: questionnaire.submit});

})

function submitter(results) {
  var opener = global.opener;
  (opener ? opener : window).turk.submit(results, true);

  if (opener) {
    setTimeout(window.close, 250);
  }
}

function finishExperiment() {
  showSlide('submitting-results')


  var results = {
    fingerprint: window.fingerprint,
    questionnaire: _.pick(questionnaire, 'outputs')
  };

  // clean up send results
  results.send = _.map(
    send.outputs,
    function(x,i) {
      return _.extend({},
                      // add rule info
                      send.inputs[i],
                      // ditch reveal info, munge into data frame
                      {examples: _.values(_.omit(x, 'revealRule', 'revealInterface'))}) });

  // results.receive = receive.outputs;

  global.results = results;

  setTimeout(function() { submitter(results) }, 2000);
}

// flow of experiment

$('#intro button.next').one('click', send.next)
//$('#intro button.next').one('click', receive.next)

send.after = questionnaire.start;
//receive.after = questionnaire.start;

questionnaire.after = finishExperiment;

// debugging (example URL: index.html?debug#questionnaire)

if (/localhost/.test(global.location.host) || /\?debug/.test(global.location.href)) {
  pollute(['React', 'ReactDOM', '$', '_', 'showSlide',
           'receive','questionnaire','send',
           'finishExperiment'])

  function handleHash(e) {
    var key = global.location.hash.replace("#","");
    var obj = eval(key);
    if (obj && _.has(obj, 'start')) {
      obj.start()
    }
  }

  global.onhashchange = handleHash;

  if (global.location.hash) {
    handleHash();
  }
}

// fingerprinting
// ------------------------------

window.fingerprint = {};

// conservatively, just get the IP (should always work, as long as web.stanford.edu doesn't go down)
function setIp(ip) {
  //console.log('set ip');
  window.fingerprint.ip = ip;

  // now, try to get more detailed geolocation info (will work if freegeoip is up and we haven't hit their limit)
  var isLocal = /file/.test(location.protocol);
  var protocol = isLocal ? "http://" : "//";

  var scriptEl = document.createElement('script');
  var src = protocol + "web.stanford.edu/~louyang/cgi-bin/locate.php?callback=setGeo";
  scriptEl.src = src;

  document.body.appendChild(scriptEl);
}

window.setIp = setIp;

// try to get geo-located data
function setGeo(data) {
  //console.log('set geo');
  window.fingerprint.ip = data.ip;
  window.fingerprint.geo = data;
}

window.setGeo = setGeo;


(function() {

  var ua = navigator.userAgent,
      browser = typeof bowser !== 'undefined' ? bowser._detect(ua) : ua;

  var plugins = Array.prototype.slice.call(navigator.plugins).map(
    function(x) {
      return {filename: x.filename, description: x.description}
    });

  window.fingerprint = {
    browser: browser,
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
    ip: "",
    geo: "",
    timezone: new Date().getTimezoneOffset(),
    plugins: plugins
  }

  var isLocal = /file/.test(location.protocol);

  // inject a call to a json service that will give us geolocation information
  var scriptEl = document.createElement('script');
  var protocol = isLocal ? "http://" : "//";
  var src = protocol + "web.stanford.edu/~louyang/cgi-bin/locate2.php?callback=setIp";
  scriptEl.src = src;


  document.body.appendChild(scriptEl);

})()
