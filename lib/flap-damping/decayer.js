// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
'use strict';

var scoring = require('./scoring.js');

var decayTimeout;
var isStarted = false;

function onRingpopDestroyed() {
    clearTimeout(decayTimeout);
}

// TODO Every 1s, iterate over all members
// in membership and decay their damp score
// If any members decay across reuse limit
// then start holding period. 
//  - Before holding period, set damp score
//  to suppress limit
//  - Start pinging/ping-reqing all members
//  in holding period
//  - Do not allow any joins for members in holding period
//  - Any failed ping/ping-req penalizes member score
//  - Any success decays member score
//  - If score goes above suppres limit, goes back into reuse poll
//  - If score goes below reuse again, undamp!
// All the while, damped member will be looking to readmit self
// Once readmitted, damped member will become active member again
module.exports = function startDecayer(opts) {
    if (isStarted) {
        return;
    }

    var ringpop = opts.ringpop;

    // Assumes startDecayer will only be called once
    // and thus only a single `destroyed` listener.
    ringpop.on('destroyed', onRingpopDestroyed);

    var decayInterval = opts.decayInterval;
    var history = opts.history;
    var scoringConfig = opts.scoringConfig;

    schedule();

    isStarted = true;

    function onTimeout() {
        // TODO Replace with `getAllMembers()` to encapsulate/hide
        // the members collection.
        var members = ringpop.membership.members;

        for (var i = 0; i < members.length; i++) {
            var member = members[i];

            if (typeof member.dampScore !== 'undefined') {
                scoring.applyDecay(scoringConfig, history, member);
            }
        }

        schedule();
    }

    function schedule() {
        decayTimeout = setTimeout(onTimeout, decayInterval);
    }
};
