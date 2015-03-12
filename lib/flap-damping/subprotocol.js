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
var sendDampReq = require('./damp-req-sender.js');

/*
 * Required opts include:
 *   - ringpop: the sole ringpop instance
 *   - dampPending: a map of pending subprotocols
 *   - flappyMember: the flappy member on which the subprotocol has been
 *   initiated
 *   - scoringConfig: scoring config parameters
 *   - subprotocolConfig: subprotocol config parameters
 */
module.exports = function initiateSubprotocol(opts) {
    var ringpop = opts.ringpop;
    var dampPending = opts.dampPending;
    var flappyMember = opts.flappyMember;
    var scoringConfig = opts.scoringConfig;
    var subprotocolConfig = opts.subprotocolConfig;

    // TODO Log this
    if (dampPending[flappyMember.address]) {
        return;
    }

    if (flappyMember.status === Member.Status.damped) {
        ringpop.logger.info('ringpop will not start damping subprotocol for already damped member', {
            local: ringpop.whoami(),
            dampedMember: flappyMember.address
        });
        return;
    }

    dampPending[flappyMember.address] = true;

    ringpop.logger.info('ringpop starting damping subprotocol', {
        local: ringpop.whoami(),
        member: flappyMember.address,
        dampScore: flappyMember.dampScore,
        suppressLimit: scoringConfig.suppressLimit
    });

    sendDampReq({
        ringpop: ringpop,
        flappyMember: flappyMember,
        dampReqFanoutSize: subprotocolConfig.dampReqFanoutSize,
        dampReqValue: subprotocolConfig.dampReqValue,
        dampReqTimeout: subprotocolConfig.dampReqTimeout,
        suppressLimit: scoringConfig.suppressLimit
    }, dampReqHandler(flappyMember));

    function dampReqHandler(member) {
        return function onDampReq(err, isConfirmed) {
            // For now, `err` is always falsey.
            if (err) {
                // do something interesting
                return;
            }

            if (isConfirmed) {
                ringpop.logger.info('ringpop damping subprotocol confirmed member is damped', {
                    local: ringpop.whoami(),
                    member: member.address
                });

                ringpop.membership.makeDamped(member.address,
                    member.incarnationNumber, member.dampScore);
            } else {
                ringpop.logger.info('ringpop damping subprotocol unable to confirm member is damped', {
                    local: ringpop.whoami(),
                    member: member.address
                });
            }

            delete dampPending[member.address];
        };
    }
};
