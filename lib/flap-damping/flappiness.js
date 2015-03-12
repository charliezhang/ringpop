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

var Member = require('../member.js');

// TODO Be stricter with our definition of flappiness?
// Allow leave operation to prevent a member from being
// damped?
module.exports = function evaluateFlappiness(history, update) {
    // TODO Eventually expire last update?
    var lastUpdates = history[update.address];

    // First update for this member. Couldn't have flapped yet.
    if (!Array.isArray(lastUpdates) || lastUpdates.length === 0) {
        return false;
    }

    var lastUpdate = lastUpdates[lastUpdates.length - 1];

    // This transition is a natural progression of the SWIM
    // protocol and should not be deemed a flap.
    if (lastUpdate.status === Member.Status.suspect &&
        update.status === Member.Status.faulty) {
        return false;
    }

    // TODO Different types of flap should be penalized differently?
    return lastUpdate.status !== update.status ||
        lastUpdate.incarnationNumber !== update.incarnationNumber;
};
