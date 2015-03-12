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

var TypedError = require('error/typed');

var DampPendingMemberNotFoundError = TypedError({
    type: 'ringpop.damp-req-handler.member-not-found',
    message: 'damp-req member not found: {address}',
    address: null
});

module.exports = function createDampReqHandler(ringpop) {
    return function protocolDampReq(head, body, hostInfo, cb) {
        var jsonBody = safeParse(body);

        if (!jsonBody) {
            cb(new Error('JSON body is required'));
            return;
        }

        if (!jsonBody.dampPendingAddr) {
            cb(new Error('dampPendingAddr property is required'));
            return;
        }

        var dampPendingAddr = jsonBody.dampPendingAddr;
        var changes = jsonBody.changes;

        ringpop.membership.update(changes);

        var member = ringpop.membership.findMemberByAddress(dampPendingAddr);

        if (!member) {
            callback(DampPendingMemberNotFoundError({
                address: dampPendingAddr
            }));
            return;
        }

        callback(null, null, JSON.stringify({
            dampScore: member.dampScore
        }));
    };
};
