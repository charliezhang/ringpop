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

function adjustDampScore(ringpop, config, history, member) {
    applyDecay(config, history, member);

    member.dampScore += config.dampPenalty;

    // Adjust damp score to upper-bound, if necessary.
    if (member.dampScore > config.dampScoreMax) {
        member.dampScore = config.dampScoreMax;
    }

    // Adjust damp score to lower-bound, if necessary.
    if (member.dampScore < config.dampScoreMin) {
        delete member.dampScore;
    }
}

function applyDecay(config, history, member) {
    if (member.dampScore === null || typeof member.dampScore === 'undefined') {
        member.dampScore = config.dampScoreInitial;
        return;
    }

    var lastUpdates = history[member.address];

    // This should never evaluate to true.
    if (!Array.isArray(lastUpdates) || lastUpdates.length === 0) {
        // TODO Log
        return;
    }

    var lastUpdate = lastUpdates[lastUpdates.length - 1];
    var timeSince = (Date.now() - lastUpdate.ts) / 1000;
    var decay = Math.pow(Math.E, -1 * timeSince * Math.LN2 / config.halfLife);

    member.dampScore = lastUpdate.dampScore * decay;
}

module.exports = {
    adjustDampScore: adjustDampScore,
    applyDecay: applyDecay
};
