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

var _ = require('underscore');
var evaluateFlappiness = require('./flappiness.js');
var initiateSubprotocol = require('./subprotocol.js');
var scoring = require('./scoring.js');
var startDecayer = require('./decayer.js');

function optsToScoringConfig(opts) {
    return {
        dampPenalty: opts.dampPenalty || 500,
        dampScoreInitial: opts.dampScoreInitial || 0,
        dampScoreMax: opts.dampScoreMax || 10000,
        dampScoreMin: opts.dampScoreMin || 0,
        halfLife: opts.halfLife || 1800,
        reuseLimit: opts.reuseLimit || 2500,
        suppressDuration: opts.suppressDuration || 60 * 60 * 1000, // 1hr in ms
        suppressLimit: opts.suppressLimit || 5000
    };
}

function optsToSubprotocolConfig(opts) {
    return {
        dampReqFanoutSize: opts.dampReqFanoutSize || 3,
        dampReqTimeout: opts.dampReqTimeout || 1000,
        dampReqValue: opts.dampReqValue || 1
    };
}

function trackMembershipUpdateHistory(history, update) {
    history[update.address] = history[update.address] || [];

    // TODO Timestamp should be introduced by Membership
    var lastUpdate = _.extend({ ts: Date.now() }, update);
    history[update.address].push(lastUpdate);

    // Keep last two updates
    history[update.address] = history[update.address].slice(-2);
}

module.exports = function flapDamping(opts) {
    var ringpop = opts.ringpop;
    var scoringConfig = optsToScoringConfig(opts);
    var subprotocolConfig = optsToSubprotocolConfig(opts);

    // TODO Store damped members here
    var dampPending = {};

    // TODO Some expiration for previously held updates
    var history = {};

    // This is the lazy man's way out. In theory, we can only start
    // the decayer when a member has had a damp score applied. But it's
    // harmless enough to start now too.
    startDecayer({
        ringpop: opts.ringpop,
        decayInterval: opts.decayInterval,
        history: history,
        scoringConfig: scoringConfig
    });

    // TODO We need to start a reuse timer here to update
    // the dampScore for all members (apply decay)
    // and detect when member's are no longer flapping

    // Flap damping is orchestrated through membership updates.
    return function onMembershipUpdated(updates) {
        // Check for all members whose damp score is above or at suppress limit.
        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];

            // Bypass damp scoring itself.
            if (update.address === ringpop.whoami()) {
                continue;
            }

            // Treat updates sourced by local instance
            // or member itself.
            if (update.source !== ringpop.whoami() &&
                update.source !== update.address) {
                continue;
            }

            var updatedMember = ringpop.membership.findMemberByAddress(update.address);

            // Weird, but ok.
            if (!updatedMember) {
                continue;
            }

            onMemberUpdated(update, updatedMember);

            trackMembershipUpdateHistory(history, _.extend({
                dampScore: updatedMember.dampScore
            }, update));
        }
    };

    function onMemberUpdated(update, updatedMember) {
        if (!evaluateFlappiness(history, update)) {
            return;
        }

        // This has side-effects on `updatedMember`
        scoring.adjustDampScore(ringpop, scoringConfig, history, updatedMember);

        if (updatedMember.dampScore < scoringConfig.suppressLimit) {
            return;
        }

        initiateSubprotocol({
            ringpop: ringpop,
            flappyMember: updatedMember,
            scoringConfig: scoringConfig,
            subprotocolConfig: subprotocolConfig,
            dampPending: dampPending
        });

        ringpop.logger.info('ringpop member damp score exceeded suppress limit', {
            local: ringpop.whoami(),
            member: updatedMember.address,
            dampScore: updatedMember.dampScore,
            suppressLimit: scoringConfig.suppressLimit
        });
    }
};
