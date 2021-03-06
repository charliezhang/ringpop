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
var _ = require('underscore');
var handleAdminJoin = require('../server/admin-join-handler.js');
var handleAdminLeave = require('../server/admin-leave-handler.js');
var handleJoin = require('../server/join-handler.js');
var mock = require('./mock');
var Ringpop = require('../index.js');
var test = require('tape');
var testRingpop = require('./lib/test-ringpop.js');

function createRingpop(opts) {
    var ringpop = new Ringpop(_.extend({
        app: 'test',
        hostPort: '127.0.0.1:3000'
    }), opts);

    ringpop.isReady = true;

    return ringpop;
}

function createRemoteRingpop() {
    return createRingpop({
        hostPort: '127.0.0.1:3001'
    });
}

test('does not throw when calling lookup with 0 servers', function t(assert) {
    var ringpop = createRingpop();
    ringpop.lookup('deadbeef');
    ringpop.destroy();
    assert.end();
});

test('does not throw when calling lookup with an integer', function t(assert) {
    var ringpop = createRingpop();
    ringpop.ring.addServer('127.0.0.1:3000');
    ringpop.lookup(12345);
    ringpop.destroy();
    assert.end();
});

test('key hashes to only server', function t(assert) {
    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), Date.now());
    assert.equals(ringpop.lookup(12345), ringpop.hostPort, 'hashes to only server');
    ringpop.destroy();
    assert.end();
});

test('admin join rejoins if member has previously left', function t(assert) {
    assert.plan(3);

    var ringpop = createRingpop();

    ringpop.membership.makeAlive(ringpop.whoami(), 1);

    handleAdminLeave({
        ringpop: ringpop
    }, function(err, res1, res2) {
        assert.equals(res2, 'ok', 'node left cluster');

        ringpop.membership.localMember.incarnationNumber = 2;

        handleAdminJoin({
            ringpop: ringpop
        }, function onAdminJoin(err, res1, res2) {
            assert.equals(res2, 'rejoined', 'node rejoined cluster');
            assert.equals(ringpop.membership.localMember.status, 'alive', 'local member is alive');

            ringpop.destroy();
            assert.end();
        });
    });
});

test('admin join cannot be performed before local member is added to membership', function t(assert) {
    assert.plan(2);

    var ringpop = createRingpop();

    handleAdminJoin({
        ringpop: ringpop
    }, function onAdminJoin(err) {
        assert.ok(err, 'an error occurred');
        assert.equals(err.type, 'ringpop.invalid-local-member', 'invalid local member error');
        ringpop.destroy();
        assert.end();
    });
});

test('admin leave prevents redundant leave', function t(assert) {
    assert.plan(2);

    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), 1);
    ringpop.membership.makeLeave(ringpop.whoami(), 1);
    handleAdminLeave({
        ringpop: ringpop
    }, function(err) {
        assert.ok(err, 'an error occurred');
        assert.equals(err.type, 'ringpop.invalid-leave.redundant', 'cannot leave cluster twice');
        ringpop.destroy();
        assert.end();
    });
});

test('admin leave makes local member leave', function t(assert) {
    assert.plan(3);

    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), 1);
    handleAdminLeave({
        ringpop: ringpop
    }, function(err, _, res2) {
        assert.notok(err, 'an error did not occur');
        assert.ok('leave', ringpop.membership.localMember.status, 'local member has correct status');
        assert.equals('ok', res2, 'admin leave was successful');
        ringpop.destroy();
        assert.end();
    });
});

test('admin leave stops gossip', function t(assert) {
    assert.plan(2);

    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), 1);
    ringpop.gossip.start();
    handleAdminLeave({
        ringpop: ringpop
    }, function(err) {
        assert.notok(err, 'an error did not occur');
        assert.equals(true, ringpop.gossip.isStopped, 'gossip is stopped');
        ringpop.destroy();
        assert.end();
    });
});

test('admin leave stops suspicion subprotocol', function t(assert) {
    assert.plan(2);

    var ringpopRemote = createRemoteRingpop();
    ringpopRemote.membership.makeAlive(ringpopRemote.whoami(), Date.now());

    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), 1);
    ringpop.membership.makeAlive(ringpopRemote.whoami(), Date.now());
    ringpop.suspicion.start(ringpopRemote.hostPort);

    handleAdminLeave({
        ringpop: ringpop
    }, function(err) {
        assert.notok(err, 'an error did not occur');
        assert.equals(true, ringpop.suspicion.isStoppedAll, 'suspicion subprotocol is stopped');
        ringpop.destroy();
        ringpopRemote.destroy();
        assert.end();
    });
});

test('admin leave cannot be attempted before local member is added', function t(assert) {
    assert.plan(2);

    var ringpop = createRingpop();
    handleAdminLeave({
        ringpop: ringpop
    }, function(err) {
        assert.ok(err, 'an error occurred');
        assert.equals(err.type, 'ringpop.invalid-local-member', 'an invalid leave occurred');
        ringpop.destroy();
        assert.end();
    });
});

test('protocol join disallows joining itself', function t(assert) {
    assert.plan(2);

    var ringpop = createRingpop();
    handleJoin({
        ringpop: ringpop,
        source: ringpop.hostPort
    }, function(err) {
        assert.ok(err, 'an error occurred');
        assert.equals(err.type, 'ringpop.invalid-join.source', 'a node cannot join itself');
        ringpop.destroy();
        assert.end();
    });
});

test('protocol join disallows joining different app clusters', function t(assert) {
    assert.plan(2);

    var ringpop = new Ringpop({
        app: 'mars',
        hostPort: '127.0.0.1:3000'
    });

    handleJoin({
        ringpop: ringpop,
        app: 'jupiter',
        source: '127.0.0.1:3001'
    }, function(err) {
        assert.ok(err, 'an error occurred');
        assert.equals(err.type, 'ringpop.invalid-join.app', 'a node cannot join a different app cluster');
        ringpop.destroy();
        assert.end();
    });
});

test('no opts does not break handleOrProxy', function t(assert) {
    var ringpop = createRingpop();
    ringpop.lookup = function() { return '127.0.0.1:3001'; };
    ringpop.requestProxy = mock.requestProxy;

    var key = 'KEY0';
    var req = {};
    var res = {};
    var opts = null;
    var handleOrProxy = ringpop.handleOrProxy.bind(ringpop, key, req, res, opts);
    assert.doesNotThrow(handleOrProxy, null, 'handleOrProxy does not throw');
    ringpop.destroy();
    assert.end();
});

test('registers stats hook', function t(assert) {
    var ringpop = createRingpop();
    ringpop.registerStatsHook({
        name: 'myhook',
        getStats: function getIt() {
            return {
                numQueues: 10
            };
        }
    });

    assert.ok(ringpop.isStatsHookRegistered('myhook'), 'hook has been registered');
    ringpop.destroy();
    assert.end();
});

test('stats include stat hooks', function t(assert) {
    var ringpop = createRingpop();

    assert.notok(ringpop.getStats().hooks, 'no stats for no stat hooks');

    var stats = { numQueues: 10 };
    ringpop.registerStatsHook({
        name: 'myhook',
        getStats: function getIt() {
            return stats;
        }
    });

    assert.deepEqual(ringpop.getStats().hooks.myhook, stats, 'returns hook stats');
    ringpop.destroy();
    assert.end();
});

test('fails all hook registration preconditions', function t(assert) {
    var ringpop = createRingpop();

    function throwsType(fn) {
        try {
            fn();
        } catch (e) {
            return e.type;
        }

        return null;
    }

    assert.equals(throwsType(function throwIt() {
        ringpop.registerStatsHook();
    }), 'ringpop.argument-required', 'missing hook argument');

    assert.equals(throwsType(function throwIt() {
        ringpop.registerStatsHook({
            getStats: function getIt() { return {}; }
        });
    }), 'ringpop.field-required', 'missing name field');

    assert.equals(throwsType(function throwIt() {
        ringpop.registerStatsHook({
            name: 'myhook'
        });
    }), 'ringpop.method-required', 'missing getStats method');

    assert.equals(throwsType(function throwIt() {
        ringpop.registerStatsHook({
            name: 'myhook',
            getStats: function getIt() { return {}; }
        });
        ringpop.registerStatsHook({
            name: 'myhook',
            getStats: function getIt() { return {}; }
        });
    }), 'ringpop.duplicate-hook', 'registered hook twice');

    ringpop.destroy();
    assert.end();
});

test('stat host/port should properly format IPs and hostnames', function t(assert) {
    function createRingpop(host) {
        return new Ringpop({
            app: 'test',
            hostPort: host + ':3000'
        });
    }

    var ringpopByHostname = createRingpop('myhostname');
    assert.equal(ringpopByHostname.statHostPort,
        'myhostname_3000', 'properly formatted with hostname');

    var ringpopByIP= createRingpop('127.0.0.1');
    assert.equal(ringpopByIP.statHostPort,
        '127_0_0_1_3000', 'properly formatted with hostname');

    ringpopByHostname.destroy();
    ringpopByIP.destroy();
    assert.end();
});

test('emits membership changed event', function t(assert) {
    assert.plan(1);

    var node1Addr = '127.0.0.1:3001';

    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), Date.now());
    ringpop.membership.makeAlive(node1Addr, Date.now());

    assertChanged();

    var node1Member = ringpop.membership.findMemberByAddress(node1Addr);
    ringpop.membership.makeSuspect(node1Addr, node1Member.incarnationNumber);

    ringpop.destroy();
    assert.end();

    function assertChanged() {
        ringpop.once('membershipChanged', function onMembershipChanged() {
            assert.pass('membership changed');
        });

        ringpop.once('ringChanged', function onRingChanged() {
            assert.fail('no ring changed');
        });
    }
});

test('emits ring changed event', function t(assert) {
    assert.plan(8);

    var node1Addr = '127.0.0.1:3001';
    var node2Addr = '127.0.0.1:3002';
    var magicIncNo = Date.now() +  123456;

    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), Date.now());
    ringpop.membership.makeAlive(node1Addr, Date.now());

    function assertChanged(changer) {
        ringpop.once('membershipChanged', function onMembershipChanged() {
            assert.pass('membership changed');
        });

        ringpop.once('ringChanged', function onRingChanged() {
            assert.pass('ring changed');
        });

        changer();
    }

    assertChanged(function assertIt() {
        ringpop.membership.makeFaulty(node1Addr);
    });

    assertChanged(function assertIt() {
        ringpop.membership.makeAlive(node1Addr, magicIncNo);
    });

    assertChanged(function assertIt() {
        ringpop.membership.makeLeave(node1Addr, magicIncNo);
    });

    assertChanged(function assertIt() {
        ringpop.membership.makeAlive(node2Addr, Date.now());
    });

    ringpop.destroy();
    assert.end();
});

testRingpop('max piggyback not adjusted on membership update', function t(deps, assert) {
    assert.plan(0);

    var dissemination = deps.dissemination;
    var membership = deps.membership;

    dissemination.on('maxPiggybackCountAdjusted', function onAdjusted() {
        assert.fail('max piggyback count was adjusted');
    });

    // Reset count to prove that it goes unmodified.
    dissemination.resetMaxPiggybackCount();

    var address = '127.0.0.1:3002';
    var incarnationNumber = Date.now();
    membership.makeSuspect(address, incarnationNumber);
});

testRingpop('max piggyback adjusted on new members', function t(deps, assert) {
    assert.plan(1);

    var dissemination = deps.dissemination;
    var membership = deps.membership;

    dissemination.on('maxPiggybackCountAdjusted', function onAdjusted() {
        assert.pass('max piggyback count was adjusted');
    });

    // Reset count to prove that it is modified.
    dissemination.resetMaxPiggybackCount();

    var address = '127.0.0.1:3002';
    var incarnationNumber = Date.now();
    membership.makeAlive(address, incarnationNumber);
});

test('first time member, not alive', function t(assert) {
    var ringpop = createRingpop();
    ringpop.membership.makeAlive(ringpop.whoami(), Date.now());

    var faultyAddr = '127.0.0.1:3001';
    ringpop.membership.makeFaulty(faultyAddr, Date.now());

    assert.notok(ringpop.ring.hasServer(faultyAddr),
        'new faulty server should not be in ring');

    ringpop.destroy();
    assert.end();
});
