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

var _  = require('underscore');
var safeParse = require('../util.js').safeParse;

module.exports = function sendDampReq(opts, callback) {
    var ringpop = opts.ringpop;
    var flappyMember = opts.flappyMember;
    var dampReqFanoutSize = opts.dampReqFanoutSize;
    var dampReqValue = opts.dampReqValue;
    var dampReqTimeout = opts.dampReqTimeout;
    var suppressLimit = opts.suppressLimit;

    var dampReqMembers = ringpop.membership.getRandomPingableMembers(
        dampReqFanoutSize, [flappyMember.address]);
    var dampReqAddrs = _.pluck(dampReqMembers, 'address');

    if (dampReqMembers.length === 0) {
        process.nextTick(function onTick() {
            // TODO Replace with TypedError
            callback(new Error('No selectable damp-req members'));
        });
        return;
    }

    // TODO If number of damp-req selected members is not enough
    // to satisfy dampReqFanoutSize, no purpose of sending damp
    // reqs.

    ringpop.logger.info('ringpop selected damp-req members', {
        local: ringpop.whoami(),
        flappyMember: flappyMember.address,
        dampReqMembers: dampReqAddrs,
        numDampReqMembers: dampReqAddrs.length,
        dampReqFanoutSize: dampReqFanoutSize,
        dampReqValue: dampReqValue
    });

    // TODO Retries if failed entire group?
    for (var i = 0; i < dampReqMembers.length; i++) {
        var dampReqMember = dampReqMembers[i];

        var tchannelOpts = {
            host: dampReqMember.address,
            timeout: dampReqTimeout
        };

        var tchannelBody = JSON.stringify({
            dampPendingAddr: flappyMember.address
        });

        ringpop.channel.send(tchannelOpts, '/protocol/damp-req', null, tchannelBody,
            sendCallback(dampReqMember));
    }

    var calledBack = false;
    var errors = [];
    var results = [];

    function onComplete() {
        if (calledBack) {
            return;
        }

        var numCompleted = errors.length + results.length;
        var numConfirmed = 0;

        for (var i = 0; i < results.length; i++) {
            var result = results[i];

            if (result.dampScore >= suppressLimit) {
                numConfirmed++;
            }
        }

        // TODO Log timing of all this shit
        if (numConfirmed >= dampReqValue) {
            ringpop.logger.info('ringpop damping subprotocol confirmations satisfied required amount', {
                local: ringpop.whoami(),
                dampReqFanoutSize: dampReqFanoutSize,
                dampReqValue: dampReqValue,
                errors: errors,
                results: results,
                numCompleted: numCompleted,
                numConfirmations: numConfirmed,
                numDampReqMembers: dampReqMembers.length,
                numErrors: errors.length
            });

            calledBack = true;
            callback(null, true);
            return;
        }

        if (numCompleted >= dampReqMembers.length) {
            ringpop.logger.info('ringpop damping subprotocol completed without enough confirmations', {
                local: ringpop.whoami(),
                dampReqFanoutSize: dampReqFanoutSize,
                dampReqValue: dampReqValue,
                errors: errors,
                results: results,
                numCompleted: numCompleted,
                numConfirmations: numConfirmed,
                numDampReqMembers: dampReqMembers.length,
                numErrors: errors.length
            });

            calledBack = true;
            callback(null, false);
            return;
        }

        // If no longer possible...
        if (dampReqValue - numConfirmed > dampReqMembers.length - numCompleted) {
            ringpop.logger.info('ringpop damping subprotocol completed prematurely', {
                local: ringpop.whoami(),
                dampReqFanoutSize: dampReqFanoutSize,
                dampReqValue: dampReqValue,
                errors: errors,
                results: results,
                numCompleted: numCompleted,
                numConfirmations: numConfirmed,
                numDampReqMembers: dampReqMembers.length,
                numErrors: errors.length
            });

            calledBack = true;
            callback(null, false);
            return;
        }

        // Continue waiting...
    }

    function sendCallback(dampReqMember) {
        var sendStartTime = Date.now();

        // onSend aggregates errors and results and
        // delegates rest of the work to onComplete.
        return function onSend(err, head, body) {
            if (err) {
                errors.push({
                    err: err,
                    dampReqMember: dampReqMember.address,
                    sendTime: Date.now() - sendStartTime
                });
                onComplete();
                return;
            }

            var jsonBody = safeParse(body);

            if (!jsonBody) {
                errors.push({
                    err: new Error('No valid JSON body'),
                    dampReqMember: dampReqMember.address,
                    sendTime: Date.now() - sendStartTime
                });
                onComplete();
                return;
            }

            results.push({
                dampReqMember: dampReqMember.address,
                dampScore: jsonBody.dampScore,
                suppressLimit: jsonBody.suppressLimit,
                sendTime: Date.now() - sendStartTime
            });

            onComplete();
        };
    }
};
