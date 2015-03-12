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

function onMemberAlive(ringpop, change) {
    ringpop.stat('increment', 'membership-update.alive');
    ringpop.logger.debug('member is alive', {
        local: ringpop.whoami(),
        alive: change.address
    });

    ringpop.dissemination.recordChange(change);
    ringpop.ring.addServer(change.address);
    ringpop.suspicion.stop(change);
}

function onMemberDamped() {
//    // TODO Do things
//    ringpop.stat('increment', 'membership-update.damped');
//    ringpop.logger.debug('member is damped', {
//        local: ringpop.membership.localMember.address,
//        damped: change.address
//    });
//
//    if (change.address === ringpop.whoami()) {
//        ringpop.gossip.stop();
//        ringpop.suspicion.stopAll();
//        gainAdmittanceAfterDamped({
//            ringpop: ringpop
//        });
//        return;
//    }
//
//    ringpop.dissemination.recordChange(change);
//    ringpop.ring.removeServer(change.address);
//    ringpop.suspicion.stop(change);
}

function onMemberFaulty(ringpop, change) {
    ringpop.stat('increment', 'membership-update.faulty');
    ringpop.logger.debug('member is faulty', {
        local: ringpop.whoami(),
        faulty: change.address,
    });

    ringpop.dissemination.recordChange(change);
    ringpop.ring.removeServer(change.address);
    ringpop.suspicion.stop(change);
}

function onMemberLeave(ringpop, change) {
    ringpop.stat('increment', 'membership-update.leave');
    ringpop.logger.debug('member has left', {
        local: ringpop.whoami(),
        left: change.address
    });

    ringpop.dissemination.recordChange(change);
    ringpop.ring.removeServer(change.address);
    ringpop.suspicion.stop(change);
}

function onMemberSuspect(ringpop, change) {
    ringpop.stat('increment', 'membership-update.suspect');
    ringpop.logger.debug('member is suspect', {
        local: ringpop.whoami(),
        suspect: change.address
    });

    ringpop.suspicion.start(change);
    ringpop.dissemination.recordChange(change);
}

module.exports = function handleMembershipUpdates(opts) {
    var ringpop = opts.ringpop;

    return function onMembershipUpdates(updates) {
        var membershipChanged = false;
        var ringChanged = false;

        updates.forEach(function(update) {
            if (update.status === 'alive') {
                onMemberAlive(ringpop, update);
                ringChanged = membershipChanged = true;
            } else if (update.status === 'damped') {
                onMemberDamped(ringpop, update);
                ringChanged = membershipChanged = true;
            } else if (update.status === 'faulty') {
                onMemberFaulty(ringpop, update);
                ringChanged = membershipChanged = true;
            } else if (update.status === 'leave') {
                onMemberLeave(ringpop, update);
                ringChanged = membershipChanged = true;
            } else if (update.status === 'suspect') {
                onMemberSuspect(ringpop, update);
                membershipChanged = true;
            }
        });

        if (!!membershipChanged) {
            ringpop.emit('membershipChanged');
            ringpop.emit('changed'); // Deprecated
        }

        if (!!ringChanged) {
            ringpop.emit('ringChanged');
        }

        ringpop.membershipUpdateRollup.trackUpdates(updates);

        ringpop.stat('gauge', 'num-members', ringpop.membership.members.length);
        ringpop.stat('timing', 'updates', updates.length);
    };
};
