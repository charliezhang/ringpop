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

module.exports = function createAdminMemberHandler(ringpop) {
    return function adminMemberState(arg1, arg2, hostInfo, callback) {
        var body = safeParse(arg2);

        if (!body) {
            callback(new Error('Invalid JSON body'));
            return;
        }

        if (body.changes) {
            var modChanges = body.changes.map(function mapChange(change) {
                // Helper mutations: set source, use current incarnation number
                // if none is provided.
                change.source = ringpop.whoami();

                if (!change.incarnationNumber) {
                    var member = ringpop.membership.findMemberByAddress(change.address);

                    if (member) {
                        change.incarnationNumber = member.incarnationNumber;
                    }
                }

                return change;
            });

            this.ringpop.membership.update(modChanges);
        }

        if (!body.member) {
            var members = ringpop.membership.members.map(function mapMember(member) {
                return member;
            });

            callback(null, null, JSON.stringify(members));
            return;
        }

        var member = ringpop.membership.findMemberByAddress(body.member);

        if (!member) {
            callback(new Error('No member found with address: ' + body.member));
            return;
        }

        callback(null, null, JSON.stringify([member]));
    };
};